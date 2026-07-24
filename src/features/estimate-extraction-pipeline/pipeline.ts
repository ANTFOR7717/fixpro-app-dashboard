import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractionFanoutWorkflow } from './extraction';
import { classificationFanoutWorkflow } from './classification';
import { enrichmentFanoutWorkflow } from './enrichment';
import { presentationWorkflow } from './presentation';
import { parsePdfFromUrl, parsedDocumentSchema } from './document';
import {
  collectTimeframeStep,
  confirmIdentityStep,
  estimateIntakeOutputSchema,
  identityExtractionStep,
  identityPromptStep,
} from './intake';

/**
 * The composition root. All four stages — `extractionFanoutWorkflow`,
 * `classificationFanoutWorkflow`, `enrichmentFanoutWorkflow`,
 * `presentationWorkflow` — are composed directly as steps, via Mastra's
 * own documented "workflows as steps" pattern (`docs/workflows/overview`:
 * a `Workflow` implements `Step`, so it can be passed straight to
 * `.then()`). This is what makes each stage's own internal step graph
 * show up as a nested, expandable graph in Studio — a workflow only
 * wrapped inside a hand-rolled step's `execute()` is invisible to
 * Studio's static graph view, since it only exists inside a function
 * body at runtime, never in the declared step chain. No stage's own
 * workflow ever composes a sibling stage internally — that's this
 * file's job alone, which is also why `presentationWorkflow` is chained
 * here rather than inside `enrichment/workflow.ts`.
 *
 * Classification's and enrichment's own agents (via `documentLookupTool`)
 * need `parsedDocument` on `RequestContext`. Rather than each stage
 * opening its own `.createRun()` boundary to inject a fresh
 * `RequestContext` (which would hide that stage's own workflow from
 * Studio's graph), `mapToExtractionInputStep` sets it once, directly on
 * the ambient `RequestContext` Mastra already threads through every step
 * of this run (`docs/server/request-context.md`: `.set()` in one step is
 * visible via `.get()` in any later step of the same run) — so every
 * later step, including nested workflow-as-step compositions, sees it
 * with no wrapper required.
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
 * their own agents on demand, via `documentLookupTool`, reading it off
 * the shared `RequestContext` — never injected into a prompt, never
 * duplicated per item.
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
  id: 'Document Parse',
  inputSchema: summarizeEstimateInputSchema,
  outputSchema: z.object({ parsedDocument: parsedDocumentSchema }),
  retries: 2,
  execute: async ({ inputData }) => ({
    parsedDocument: await parsePdfFromUrl(inputData.fileUrl),
  }),
});

/**
 * Named handoff step between `parseDocumentStep` and
 * `extractionFanoutWorkflow` — both already declare the identical
 * `{ parsedDocument }` shape, so the schema side is a pass-through, not
 * a reshape. Also sets `parsedDocument` on the run's shared
 * `RequestContext`, once, here — this is what lets classification's and
 * enrichment's `documentLookupTool` reach it later in the SAME run
 * without either stage needing its own `.createRun()` boundary. Named
 * instead of a bare `.map()` so it shows up as its own step in Mastra
 * Studio's trace/graph instead of a generic, unnamed "Map Config" node.
 */
const mapToExtractionInputStep = createStep({
  id: 'map-to-extraction-input',
  inputSchema: parseDocumentStep.outputSchema,
  outputSchema: z.object({ parsedDocument: parsedDocumentSchema }),
  execute: async ({ inputData, requestContext }) => {
    requestContext.set('parsedDocument', inputData.parsedDocument);
    return { parsedDocument: inputData.parsedDocument };
  },
});

const restoreDocumentContextStep = createStep({
  id: 'Restore Parsed Document Context',
  inputSchema: estimateIntakeOutputSchema,
  outputSchema: z.object({ parsedDocument: parsedDocumentSchema }),
  execute: async ({ getStepResult, requestContext }) => {
    const parsed = getStepResult(parseDocumentStep);
    requestContext.set('parsedDocument', parsed.parsedDocument);
    return parsed;
  },
});

export const summarizeEstimateWorkflow = createWorkflow({
  id: 'Generate Estimate',
  inputSchema: summarizeEstimateInputSchema,
  outputSchema: presentationWorkflow.outputSchema,
})
  .then(parseDocumentStep)
  // Fan out extraction across every page concurrently — one agent call
  // per page (extraction/steps.ts's `extractionFanoutWorkflow`), not one
  // giant whole-document prompt. This is the ONLY step in the pipeline
  // that receives the parsed document.
  .then(mapToExtractionInputStep)
  .then(identityPromptStep)
  .then(identityExtractionStep)
  .then(confirmIdentityStep)
  .then(collectTimeframeStep)
  .then(restoreDocumentContextStep)
  .then(extractionFanoutWorkflow)
  .then(classificationFanoutWorkflow)
  .then(enrichmentFanoutWorkflow)
  .then(presentationWorkflow)
  .commit();
