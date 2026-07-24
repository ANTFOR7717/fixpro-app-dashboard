import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractedFindingSchema, type ExtractedFinding } from '../extraction';
import { classifyFindingsBatchAgent } from './agents';
import { pioneerGateway } from '../shared/gateway';
import { resolveTracingOptions } from '../shared/tracing';
import { TRADE, billableLineSchema } from './schema';

/**
 * How many findings go into one classification call. Unverified starting
 * point, not measured against real accuracy/reliability data — larger
 * batches are a known risk for structured-output tasks (more items for
 * the model to track correctly per call). Lower this further if batches
 * start failing the id-match validation below more than rarely.
 */
export const BATCH_SIZE = 5;

const findingBatchInputSchema = z.object({ findings: z.array(extractedFindingSchema) });

function describeFindingForBatch(finding: ExtractedFinding) {
  return {
    id: finding.id,
    scope: finding.scope,
    location: finding.location,
    descriptionQuote: finding.descriptionQuote,
    recommendation: finding.recommendation,
    status: finding.status,
  };
}

const classificationEntrySchema = z.object({
  findingId: z.string(),
  materials: z.array(z.string().min(1)),
  laborType: z.string().min(1),
  trade: z.enum(TRADE),
});

/** Static shape — used as the step's declared `outputSchema`. */
const batchClassificationResponseSchema = z.object({
  classifications: z.array(classificationEntrySchema),
});

/**
 * Per-call schema, built from the actual input findings' ids. The
 * `.refine()` requires the model's returned `findingId`s to be an exact,
 * duplicate-free match of the batch's real input ids — not just the
 * right COUNT (a count-only check would silently accept a response with
 * a hallucinated/mistyped id, quietly losing one finding's data while
 * gaining a bogus one). Mastra's own `structuredOutput` validates the
 * resolved response against this full schema (including the refinement)
 * before `stream.object` resolves; the default `errorStrategy: 'strict'`
 * (docs/agents/structured-output.md) throws on failure, which is what
 * lets `retries: 2` below retry a mismatched batch — no hand-rolled
 * `if (...) throw` needed.
 */
function buildBatchResponseSchema(findingIds: string[]) {
  return batchClassificationResponseSchema.refine(
    (data) => {
      const returned = data.classifications.map((c) => c.findingId);
      return (
        returned.length === findingIds.length &&
        new Set(returned).size === findingIds.length &&
        returned.every((id) => findingIds.includes(id))
      );
    },
    { message: 'classification findingIds must be an exact, duplicate-free match of the batch input finding ids' },
  );
}

/**
 * Hand-rolled `execute()` — the documented exception to Rule 1
 * (MASTRA-AGENT-WORKFLOW-STANDARD.md), needed here for
 * `structuredOutput.model`: a separate, tools-free model that only turns
 * the main agent's already-completed tool-calling turn into
 * schema-conformant JSON (Mastra's own "Structuring agent" pattern,
 * docs/agents/structured-output). Still `.stream()`, not `.generate()`
 * (Rule 5 — `.generate()` previously reproduced a 504 Gateway Timeout
 * from pioneerGateway on a long-running, tool-calling agent call in this
 * exact codebase); still no textStream draining (Rule 4) — only
 * `.object` is read off the resolved stream.
 *
 * Deliberately allowed to throw (no try/catch here) — that's what lets
 * `retries: 2` actually function (Mastra's own retry loop only retries a
 * thrown error; a step that catches its own errors internally never
 * gives it anything to retry). Per-batch resilience against a
 * persistently-failing call lives one layer out, in
 * `classifyFindingsBatchStep` below.
 */
const classifyBatchAgentStep = createStep({
  id: 'Classify Findings Batch Determination',
  inputSchema: findingBatchInputSchema,
  outputSchema: batchClassificationResponseSchema,
  retries: 2,
  execute: async ({ inputData, tracingContext }) => {
    const stream = await classifyFindingsBatchAgent.stream(
      `FINDINGS\n${JSON.stringify(inputData.findings.map(describeFindingForBatch))}`,
      {
        structuredOutput: {
          schema: buildBatchResponseSchema(inputData.findings.map((f) => f.id)),
          model: pioneerGateway().chat('gpt-5.5'),
        },
        tracingOptions: resolveTracingOptions(tracingContext),
      },
    );
    return await stream.object;
  },
});

/**
 * Trivial single-step nested workflow — exists only to give
 * `classifyFindingsBatchStep` a `.createRun()` boundary to wrap in
 * try/catch, the same shape extraction's `perPageExtractionWorkflow` and
 * enrichment's `enrichLineWorkflow` already use for the identical reason.
 */
const classifyBatchWorkflow = createWorkflow({
  id: 'Classify Findings Batch',
  inputSchema: findingBatchInputSchema,
  outputSchema: batchClassificationResponseSchema,
})
  .then(classifyBatchAgentStep)
  .commit();

/**
 * Catches a per-batch failure so one bad batch can't cancel the whole
 * `.foreach()` fanout (Mastra docs: "Handle Errors Inside the Step" —
 * wrap step logic in try/catch, always return a typed result instead of
 * throwing). A failed batch (after `classifyBatchAgentStep`'s own 2
 * retries are exhausted) contributes zero billable lines for every
 * finding in that batch — a bigger blast radius than the old
 * one-finding-per-call design, traded for far fewer LLM round trips
 * overall. Logged via `loggerVNext` (the trace-correlated logger Mastra
 * provides on every step's execute params) rather than swallowed
 * silently, since losing a whole batch's worth of findings needs
 * visibility.
 */
export const classifyFindingsBatchStep = createStep({
  id: 'Classify Batch',
  inputSchema: findingBatchInputSchema,
  outputSchema: z.array(billableLineSchema),
  execute: async ({ inputData, requestContext, tracingContext, loggerVNext }) => {
    try {
      const run = await classifyBatchWorkflow.createRun();
      const result = await run.start({
        inputData,
        requestContext,
        tracingOptions: resolveTracingOptions(tracingContext),
      });
      if (result.status !== 'success') {
        loggerVNext?.error('classify-batch: nested run did not succeed', {
          findingIds: inputData.findings.map((f) => f.id),
          status: result.status,
        });
        return [];
      }

      const byId = new Map(result.result.classifications.map((c) => [c.findingId, c] as const));
      return inputData.findings.flatMap((finding) => {
        const c = byId.get(finding.id);
        if (!c || !Array.isArray(c.materials) || !c.laborType || !c.trade) return [];
        const identity = {
          trade: c.trade,
          scope: finding.scope,
          location: finding.location,
          descriptionQuote: finding.descriptionQuote,
          page: finding.page,
        };
        return [
          ...c.materials.map((material, i) => ({
            id: `${finding.id}:material:${i}`,
            ...identity,
            costType: 'material' as const,
            material,
          })),
          {
            id: `${finding.id}:labor`,
            ...identity,
            costType: 'labor' as const,
            laborType: c.laborType,
          },
        ];
      });
    } catch (error) {
      loggerVNext?.error('classify-batch: batch failed after retries exhausted, dropping findings', {
        findingIds: inputData.findings.map((f) => f.id),
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  },
});
