import { createStep, createWorkflow } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { extractedFindingSchema, extractionFanoutWorkflow } from './extraction';
import { classificationFanoutWorkflow } from './classification';
import { enrichmentFanoutWorkflow } from './enrichment';
import { parsePdfFromUrl, parsedDocumentSchema } from './document';

/**
 * The composition root. `extractionFanoutWorkflow` is composed directly
 * as a step, via Mastra's own documented "workflows as steps" pattern
 * (`docs/workflows/overview`: a `Workflow` implements `Step`, so it can
 * be passed straight to `.then()`). `classificationFanoutWorkflow` and
 * `enrichmentFanoutWorkflow` are each instead wrapped by this file's own
 * step (`classificationStep`/`enrichmentStep`), which gives each an
 * explicit `.createRun()` boundary so `RequestContext` can be set once
 * per pass, from `parsedDocument` — both classification's and
 * enrichment's agents read it on demand via `documentLookupTool`. All
 * three stages fan out their own agent calls internally via `.foreach()`
 * — see `extraction/steps.ts`, `classification/workflow.ts`,
 * `enrichment/workflow.ts`.
 *
 * No module hand-rolls `.generate()`/`.stream()` anywhere in its own
 * internals: every agent call in extraction, classification, and
 * enrichment is a bare `createStep(agent, { structuredOutput })`. See
 * plans/MASTRA-AGENT-WORKFLOW-STANDARD.md.
 *
 * The parsed document is read directly (as page text) ONLY by
 * `extractionFanoutWorkflow`. Classification and enrichment never
 * receive it as typed data — no finding, no line, no workflow input
 * anywhere in either module carries `parsedDocument`. Both CAN reach
 * their own agents on demand, via `documentLookupTool`, reading it off a
 * `RequestContext` this file's own wrapping steps set once per pass —
 * never injected into a prompt, never duplicated per item.
 */

/**
 * Named, shared — NOT redeclared inline at both `parseDocumentStep` and
 * `summarizeEstimateWorkflow` itself. Mastra's own stated core principle
 * (docs/workflows/control-flow: "The first step's inputSchema must
 * match the workflow's inputSchema") means these two HAVE to stay
 * identical.
 */
const summarizeEstimateInputSchema = z.object({
  estimateRequestId: z.string(),
  fileUrl: z.string().url(),
  zipCode: z.string(),
});

const parseDocumentStep = createStep({
  id: 'parse-document',
  inputSchema: summarizeEstimateInputSchema,
  outputSchema: z.object({ parsedDocument: parsedDocumentSchema }),
  retries: 2,
  execute: async ({ inputData }) => ({
    parsedDocument: await parsePdfFromUrl(inputData.fileUrl),
  }),
});

/**
 * Gives classification its own explicit `.createRun()` boundary so
 * `RequestContext` can be set ONCE for the whole classification pass,
 * here, from `parsedDocument` (fetched via `getStepResult(parseDocumentStep)`,
 * not carried in this step's own typed `inputSchema`). Mastra threads that
 * one `RequestContext` to every nested step/agent/tool inside this run
 * automatically (docs/server/request-context.md) — including every
 * per-finding nested workflow `.foreach()` fans out
 * (`classification/finding-workflow.ts` explicitly forwards it one level
 * further in). `documentLookupTool` (classification/agents.ts) reads
 * `parsedDocument` back off it, on demand, only when an agent actually
 * calls the tool — never injected into any prompt directly.
 */
const classificationStep = createStep({
  id: 'classification',
  inputSchema: z.object({ findings: z.array(extractedFindingSchema) }),
  outputSchema: classificationFanoutWorkflow.outputSchema,
  execute: async ({ inputData, getStepResult }) => {
    const { parsedDocument } = getStepResult(parseDocumentStep);
    const requestContext = new RequestContext();
    requestContext.set('parsedDocument', parsedDocument);
    const run = await classificationFanoutWorkflow.createRun();
    const result = await run.start({ inputData, requestContext });
    if (result.status === 'success') {
      return result.result;
    }
    const errorMessage = 'error' in result ? result.error.message : `workflow ended with status: ${result.status}`;
    throw new Error(`classification-fanout run did not succeed: ${errorMessage}`);
  },
});

/**
 * Same reasoning as `classificationStep` — enrichment's own agent also
 * has `documentLookupTool`, so it needs the same explicit
 * `RequestContext`-setting `.createRun()` boundary.
 */
const enrichmentStep = createStep({
  id: 'enrichment',
  inputSchema: classificationFanoutWorkflow.outputSchema,
  outputSchema: enrichmentFanoutWorkflow.outputSchema,
  execute: async ({ inputData, getStepResult }) => {
    const { parsedDocument } = getStepResult(parseDocumentStep);
    const requestContext = new RequestContext();
    requestContext.set('parsedDocument', parsedDocument);
    const run = await enrichmentFanoutWorkflow.createRun();
    const result = await run.start({ inputData, requestContext });
    if (result.status === 'success') {
      return result.result;
    }
    const errorMessage = 'error' in result ? result.error.message : `workflow ended with status: ${result.status}`;
    throw new Error(`enrichment-fanout run did not succeed: ${errorMessage}`);
  },
});

export const summarizeEstimateWorkflow = createWorkflow({
  id: 'summarize-estimate',
  inputSchema: summarizeEstimateInputSchema,
  outputSchema: enrichmentStep.outputSchema,
})
  .then(parseDocumentStep)
  // Fan out extraction across every page concurrently — one agent call
  // per page (extraction/steps.ts's `extractionFanoutWorkflow`), not one
  // giant whole-document prompt. This is the ONLY step in the pipeline
  // that receives the parsed document.
  .map(async ({ inputData }) => ({ parsedDocument: inputData.parsedDocument }))
  .then(extractionFanoutWorkflow)
  .then(classificationStep)
  .then(enrichmentStep)
  .commit();
