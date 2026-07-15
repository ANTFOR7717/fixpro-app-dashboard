import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { buildExtractionPrompt, findingExtractorAgentStep } from './extraction';
import {
  buildClassificationPrompt,
  lineClassifierAgentStep,
  buildLinesStep,
  billableLineSchema,
} from './classification';
import { priceLines, pricedLineItemSchema } from './pricing';
import { parsePdfFromUrl, parsedDocumentSchema } from './document';

/**
 * The composition root. Every agent call in this workflow is a native
 * `createStep(agent, { structuredOutput })` step (extraction, classification)
 * or an already-compliant `execute()`-based call for the one documented
 * exception (pricing, which needs per-line conditional schema selection).
 * No hand-rolled `.generate()`/`.stream()` orchestration anywhere in this
 * file or the modules it composes. See
 * plans/MASTRA-AGENT-WORKFLOW-STANDARD.md.
 */

/**
 * Named, shared — NOT redeclared inline at both `parseDocumentStep` and
 * `summarizeEstimateWorkflow` itself. Mastra's own stated core principle
 * (docs/workflows/control-flow: "The first step's inputSchema must match
 * the workflow's inputSchema") means these two HAVE to stay identical.
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
  }),
  outputSchema: z.object({
    lines: z.array(billableLineSchema),
    prices: z.array(pricedLineItemSchema),
    parsedDocument: parsedDocumentSchema,
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
  // Build the classification prompt — same reasoning as above.
  .map(async ({ inputData }) => ({
    prompt: buildClassificationPrompt(inputData.findings),
  }))
  .then(lineClassifierAgentStep)
  // Recombine the classifier's per-finding output with the findings it
  // was classifying (the classifier never re-echoes
  // action/scope/location/sourceQuote — buildLinesStep needs them).
  .map(async ({ inputData, getStepResult }) => ({
    findings: getStepResult(findingExtractorAgentStep).findings,
    classifications: inputData.lines,
  }))
  .then(buildLinesStep)
  // Recombine the built lines with everything priceStep needs that fell
  // out of the agent-step data flow: the workflow's own init data
  // (estimateRequestId, zipCode) and the parsed document from several
  // steps back.
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
    };
  })
  .then(priceStep)
  .commit();
