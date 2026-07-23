import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { findingExtractorAgent } from './agent';
import { extractionOutputSchema } from './schema';
import { parsedDocumentSchema, type DocumentPage } from '../document';
import { resolveTracingOptions } from '../shared/tracing';

/** How many pages extract concurrently. Mirrors CLASSIFICATION_CONCURRENCY/ENRICHMENT_CONCURRENCY. */
const EXTRACTION_CONCURRENCY = 3;

/**
 * Deliberately minimal — every rule this used to restate ("verbatim",
 * "when in doubt omit", "JSON matching schema") already lives once, in
 * `findingExtractorAgent`'s own system instructions (agent.ts), sent on
 * every call regardless. This just hands over the page.
 */
function buildPagePrompt(page: DocumentPage): string {
  return `PAGE ${page.pageNumber}:\n"""\n${page.content}\n"""`;
}

/**
 * The agent itself, composed AS a step — no `.stream()`, no `.object`,
 * no drain loop anywhere in this codebase. Mastra owns the transport
 * entirely. Per the Standard's Rule 1 / `docs/workflows/agents-and-tools`.
 */
const findingExtractorAgentStep = createStep(findingExtractorAgent, {
  structuredOutput: { schema: extractionOutputSchema },
  retries: 2,
});

const pageInputSchema = z.object({ prompt: z.string() });

/**
 * Trivial single-step nested workflow — exists only to give
 * `extractOnePageStep` a `.createRun()` boundary to wrap in try/catch, the
 * same shape classification's `perFindingClassificationWorkflow` and
 * enrichment's `enrichLineWorkflow` already use for the identical reason.
 */
const perPageExtractionWorkflow = createWorkflow({
  id: 'Page To Findings',
  inputSchema: pageInputSchema,
  outputSchema: extractionOutputSchema,
})
  .then(findingExtractorAgentStep)
  .commit();

/**
 * Catches a per-page failure (structured-output validation exhausting
 * retries, an upstream gateway timeout) so one bad page can't cancel the
 * whole `.foreach()` batch — the same "Handle Errors Inside the Step"
 * pattern already used by classification's `perFindingClassificationStep`
 * and enrichment's `enrichLineStep`. Before this, `extractionFanoutWorkflow`
 * ran `findingExtractorAgentStep` bare inside `.foreach()`: per Mastra's
 * own docs ("If any parallel step throws an error, the entire parallel
 * block fails" — docs/workflows/control-flow), a single page failing
 * anywhere in a large document killed the entire pipeline run, unlike
 * classification/enrichment which already degrade gracefully per item.
 * A failed page contributes zero findings.
 */
const extractOnePageStep = createStep({
  id: 'Extraction Attempt',
  inputSchema: pageInputSchema,
  outputSchema: extractionOutputSchema,
  execute: async ({ inputData, requestContext, tracingContext }) => {
    try {
      const run = await perPageExtractionWorkflow.createRun();
      const result = await run.start({
        inputData,
        requestContext,
        tracingOptions: resolveTracingOptions(tracingContext),
      });
      return result.status === 'success' ? result.result : { findings: [] };
    } catch {
      return { findings: [] };
    }
  },
});

/**
 * Aggregates every page's own findings into one globally-ordered,
 * globally-unique-id array — the documented `.foreach().then(aggregateStep)`
 * map-reduce shape (docs/workflows/control-flow). Each page's agent call
 * emits its own locally-scoped ids; this step is the one place that
 * assigns the final stable `finding-NNN` id, in page order.
 */
const aggregateExtractionResultsStep = createStep({
  id: 'Aggregate Findings',
  inputSchema: z.array(extractionOutputSchema),
  outputSchema: extractionOutputSchema,
  execute: async ({ inputData }) => {
    const findings = inputData.flatMap((pageResult) => pageResult.findings);
    return {
      findings: findings.map((finding, index) => ({
        ...finding,
        id: `finding-${String(index + 1).padStart(3, '0')}`,
      })),
    };
  },
});

const extractionFanoutInputSchema = z.object({ parsedDocument: parsedDocumentSchema });

/**
 * Internal fan-out workflow: one agent call PER PAGE, concurrently —
 * replaces the old single whole-document prompt (`buildExtractionPrompt`,
 * deleted), which sent every page in one message and needed
 * `maxOutputTokens: 16000` yet still truncated mid-response on a real
 * 40+ page report (see agent.ts's `defaultOptions` comment). Mirrors
 * `classification/workflow.ts`'s `classificationFanoutWorkflow` shape
 * exactly. NOT registered on the top-level `Mastra` instance and not
 * exported outside this file — `extraction/index.ts` is the one door.
 */
export const extractionFanoutWorkflow = createWorkflow({
  id: 'Extraction',
  inputSchema: extractionFanoutInputSchema,
  outputSchema: extractionOutputSchema,
})
  .map(async ({ inputData }) =>
    inputData.parsedDocument.pages.map((page) => ({ prompt: buildPagePrompt(page) })),
  )
  .foreach(extractOnePageStep, { concurrency: EXTRACTION_CONCURRENCY })
  .then(aggregateExtractionResultsStep)
  .commit();
