import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { billableLineSchema } from '../classification';
import { pricedLineSchema } from './schema';
import { priceLineStep } from './price-line';

/** How many pricer calls run concurrently. An internal throughput knob. */
const PRICING_CONCURRENCY = 3;

/**
 * Internal fan-out workflow: prices every line concurrently. NOT exported
 * outside this folder — pricing/index.ts is the only caller. Output
 * shape matches `priceLineStep`'s own merged `pricedLineSchema` output
 * directly, not the old `{ line, price }` pair
 * (specs/007-pipeline-schema-cleanup FR-011 — caught during whiteboard
 * review as a file missing from the original plan's scope, since this
 * workflow's own declared `outputSchema` is built directly on
 * `priceLineStep`'s output type).
 */
export const pricingFanoutWorkflow = createWorkflow({
  id: 'pricing-fanout',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    lines: z.array(billableLineSchema),
  }),
  outputSchema: z.array(pricedLineSchema),
})
  .map(async ({ inputData }) =>
    inputData.lines.map((line) => ({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      line,
    })),
  )
  .foreach(priceLineStep, { concurrency: PRICING_CONCURRENCY })
  .commit();
