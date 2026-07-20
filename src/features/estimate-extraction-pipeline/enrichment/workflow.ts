import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { billableLineSchema } from '../classification';
import { enrichedLineSchema } from './schema';
import { enrichLineStep } from './domain/wrapper';

/** How many enrichment calls run concurrently. An internal throughput knob. */
const ENRICHMENT_CONCURRENCY = 3;

/**
 * Internal fan-out workflow: enriches every billable line concurrently
 * via `domain/wrapper.ts`'s `enrichLineStep`. NOT exported outside this
 * folder — `enrichment/index.ts` is the only caller.
 */
export const enrichmentFanoutWorkflow = createWorkflow({
  id: 'enrichment-fanout',
  inputSchema: z.object({ lines: z.array(billableLineSchema) }),
  outputSchema: z.object({ lines: z.array(enrichedLineSchema) }),
})
  .map(async ({ inputData }) => inputData.lines.map((line) => ({ line })))
  .foreach(enrichLineStep, { concurrency: ENRICHMENT_CONCURRENCY })
  .map(async ({ inputData }) => ({ lines: inputData.filter((line) => line !== null) }))
  .commit();
