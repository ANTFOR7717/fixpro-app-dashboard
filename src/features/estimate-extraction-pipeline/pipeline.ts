import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { buildExtractionPrompt, findingExtractorAgentStep } from './extraction';
import { classificationFanoutWorkflow, billableLineSchema, webSearchFlagSchema } from './classification';
import { priceLines, pricedLineItemSchema } from './pricing';
import { parsePdfFromUrl, parsedDocumentSchema } from './document';

/**
 * The composition root. `findingExtractorAgentStep` and
 * `classificationFanoutWorkflow` are both composed directly as steps —
 * the latter via Mastra's own documented "workflows as steps" pattern
 * (`docs/workflows/overview`: a `Workflow` implements `Step`, so it can
 * be passed straight to `.then()`), not wrapped in an intermediate
 * function. `priceStep` is the one named step whose `execute()` calls
 * out to its own module's public door function (`priceLines()`) —
 * pricing's own `pricingFanoutWorkflow` deliberately stays an
 * unregistered, standalone-`.createRun()` sub-workflow because its own
 * steps need `mastra.getLogger()` and a standalone run was confirmed
 * (pricing/price-line.ts's own comment) to leave that undefined;
 * classification's fan-out has no such need (its one per-finding
 * failure-log line uses a plain module-scoped logger — see
 * finding-workflow.ts — not `execute.mastra`), so composing it directly
 * is both simpler and avoids reproducing a workaround for a constraint
 * that doesn't apply here. Neither module hand-rolls `.generate()`/
 * `.stream()` anywhere in its own internals: inside classification,
 * every agent call is a bare `createStep(agent, { structuredOutput })`
 * composed inside its own per-finding nested workflow (see
 * classification/finding-workflow.ts); inside pricing, `price-line.ts`'s
 * own per-line step is the one documented exception (it needs per-call
 * conditional schema selection). See plans/MASTRA-AGENT-WORKFLOW-STANDARD.md.
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

const priceStep = createStep({
  id: 'price',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    lines: z.array(billableLineSchema),
    parsedDocument: parsedDocumentSchema,
    flaggedForWebSearch: z.array(webSearchFlagSchema),
  }),
  outputSchema: z.object({
    lines: z.array(billableLineSchema),
    prices: z.array(pricedLineItemSchema),
    parsedDocument: parsedDocumentSchema,
    flaggedForWebSearch: z.array(webSearchFlagSchema),
  }),
  execute: async ({ inputData }) => {
    const priced = await priceLines({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines: inputData.lines,
    });
    return {
      ...priced,
      parsedDocument: inputData.parsedDocument,
      flaggedForWebSearch: inputData.flaggedForWebSearch,
    };
  },
});

export const summarizeEstimateWorkflow = createWorkflow({
  id: 'summarize-estimate',
  inputSchema: summarizeEstimateInputSchema,
  outputSchema: priceStep.outputSchema,
})
  .then(parseDocumentStep)
  // Build the extraction prompt. A bare `.map()`, not a named step —
  // matches Mastra's own canonical "prompt right before an agent step"
  // pattern (docs/workflows/agents-and-tools) exactly. The actual
  // formatting logic lives in `buildExtractionPrompt`
  // (extraction/steps.ts); this file only calls it.
  .map(async ({ inputData }) => ({
    prompt: buildExtractionPrompt(inputData.parsedDocument),
  }))
  .then(findingExtractorAgentStep)
  // Recombine the extractor's findings with the parsed document
  // classification needs for per-finding document-context grounding
  // (spec.md FR-007) — the document fell out of the agent-step data
  // flow several steps back, so it is re-attached here via
  // `getStepResult()`, the same mechanism already used below.
  .map(async ({ inputData, getStepResult }) => ({
    findings: inputData.findings,
    parsedDocument: getStepResult(parseDocumentStep).parsedDocument,
  }))
  .then(classificationFanoutWorkflow)
  // Recombine classification's output with everything priceStep needs
  // that fell out of the agent-step data flow: the workflow's own init
  // data (estimateRequestId, zipCode) and the parsed document from
  // several steps back.
  //
  // getInitData<...> uses an explicit inline type matching this
  // workflow's own declared inputSchema, NOT `typeof summarizeEstimateWorkflow`
  // — self-referencing the workflow's own type from inside a callback
  // defined within that same workflow's own initializer chain is a real
  // TS circular-inference trap. Mastra's own shipped example sidesteps
  // this the same way (using `<any>` where its prose says
  // `getInitData<typeof workflow>()`); an explicit inline type here
  // avoids both the circularity and the loss of type safety from `any`.
  .map(async ({ inputData, getInitData, getStepResult }) => {
    const init = getInitData<{ estimateRequestId: string; zipCode: string; fileUrl: string }>();
    const { parsedDocument } = getStepResult(parseDocumentStep);
    return {
      estimateRequestId: init.estimateRequestId,
      zipCode: init.zipCode,
      lines: inputData.lines,
      parsedDocument,
      flaggedForWebSearch: inputData.flaggedForWebSearch,
    };
  })
  .then(priceStep)
  .commit();
