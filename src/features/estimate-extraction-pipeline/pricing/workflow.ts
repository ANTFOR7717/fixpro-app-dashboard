import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { billableLineSchema } from '../classification';
import { pricedLineItemSchema } from './schema';
import { priceLineStep } from './price-line';

/** How many pricer calls run concurrently. An internal throughput knob. */
const PRICING_CONCURRENCY = 3;

/**
 * Internal fan-out workflow: prices every line concurrently. NOT exported
 * outside this folder — pricing/index.ts is the only caller.
 */
export const pricingFanoutWorkflow = createWorkflow({
  id: 'pricing-fanout',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    lines: z.array(billableLineSchema),
  }),
  outputSchema: z.array(
    z.object({ line: billableLineSchema, price: pricedLineItemSchema }),
  ),
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
