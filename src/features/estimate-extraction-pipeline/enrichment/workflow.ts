import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { enrichedLineSchema, presentedGroupSchema, presentationSummarySchema } from './schema';
import {
  tradeGroupInputSchema,
  flattenGroupsStep,
  enrichMaterialLineStep,
  buildLaborInputsStep,
  enrichLaborLineStep,
  combineEnrichedLinesStep,
} from './domain/wrapper';
import { presentationWorkflow } from './domain/presentation';

/** How many material/labor lines enrich concurrently, per phase. */
const ENRICHMENT_CONCURRENCY = 5;

/**
 * Enriches every finding's billable lines: all materials first
 * (concurrently, via `.foreach()` so Mastra's own concurrency limiting
 * and per-item trace spans apply), then all labor lines, each scoped to
 * only its own finding's resolved materials (`buildLaborInputsStep`).
 * Trade grouping from classification is flattened away for processing
 * (`flattenGroupsStep`) and never needed again — it was only ever a
 * display grouping, not a processing boundary. Finally runs
 * `presentationWorkflow` (workflow-as-step, its own nested Studio graph)
 * to produce client-facing category/name/tags/markup data. Output is
 * additive — `lines` is unchanged from before the presentation stage
 * existed, so `estimate/lib/workflow.ts`/`envelope.ts` keep working.
 */
export const enrichmentFanoutWorkflow = createWorkflow({
  id: 'enrichment-fanout',
  inputSchema: z.object({ groups: z.array(tradeGroupInputSchema) }),
  outputSchema: z.object({
    lines: z.array(enrichedLineSchema),
    presentation: z.object({ groups: z.array(presentedGroupSchema), summary: presentationSummarySchema }),
  }),
})
  .then(flattenGroupsStep)
  .map(async ({ inputData }) => inputData.Material.map((line) => ({ line })))
  .foreach(enrichMaterialLineStep, { concurrency: ENRICHMENT_CONCURRENCY })
  .then(buildLaborInputsStep)
  .map(async ({ inputData }) => inputData.laborItems)
  .foreach(enrichLaborLineStep, { concurrency: ENRICHMENT_CONCURRENCY })
  .then(combineEnrichedLinesStep)
  .then(presentationWorkflow)
  .map(async ({ inputData, getStepResult }) => {
    const { lines } = getStepResult(combineEnrichedLinesStep);
    return { lines, presentation: inputData };
  })
  .commit();
