import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { enrichedLineSchema } from './schema';
import {
  tradeGroupInputSchema,
  flattenGroupsStep,
  enrichMaterialLineStep,
  buildLaborInputsStep,
  enrichLaborLineStep,
  combineEnrichedLinesStep,
} from './domain/wrapper';

/** How many material/labor lines enrich concurrently, per phase. */
const ENRICHMENT_CONCURRENCY = 5;

/**
 * Enriches every finding's billable lines: all materials first
 * (concurrently, via `.foreach()` so Mastra's own concurrency limiting
 * and per-item trace spans apply), then all labor lines, each scoped to
 * only its own finding's resolved materials (`buildLaborInputsStep`).
 * Trade grouping from classification is flattened away for processing
 * (`flattenGroupsStep`) and never needed again — it was only ever a
 * display grouping, not a processing boundary.
 *
 * Presentation is a separate, later pipeline stage (`presentation/`) —
 * composed by `pipeline.ts` directly after this workflow, the same way
 * `pipeline.ts` chains extraction → classification → enrichment, not
 * nested inside any one stage's own workflow. Keeping it out of here
 * also avoids a circular import: `presentation/workflow.ts` needs
 * `EnrichedLine` from this module, so this module cannot also depend on
 * `presentation`.
 */
export const enrichmentFanoutWorkflow = createWorkflow({
  id: 'enrichment-fanout',
  inputSchema: z.object({ groups: z.array(tradeGroupInputSchema) }),
  outputSchema: z.object({ lines: z.array(enrichedLineSchema) }),
})
  .then(flattenGroupsStep)
  .map(async ({ inputData }) => inputData.Material.map((line) => ({ line })))
  .foreach(enrichMaterialLineStep, { concurrency: ENRICHMENT_CONCURRENCY })
  .then(buildLaborInputsStep)
  .map(async ({ inputData }) => inputData.laborItems)
  .foreach(enrichLaborLineStep, { concurrency: ENRICHMENT_CONCURRENCY })
  .then(combineEnrichedLinesStep)
  .commit();
