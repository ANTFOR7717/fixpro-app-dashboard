import { type BillableLine } from '../classification';
import { pricedLineSchema, priceAmount, type PricedLine } from './schema';
import { pricingFanoutWorkflow } from './workflow';
import { itemPricerAgent } from './agent';

export type { PricedLine };
export { pricedLineSchema, priceAmount };
/** Re-exported for Studio registration ONLY — no module calls this directly. */
export { itemPricerAgent };

export interface PriceLinesInput {
  estimateRequestId: string;
  zipCode: string;
  lines: BillableLine[];
}

/**
 * THE PRICING API. Prices every pending line (concurrency is this module's
 * own concern — see workflow.ts). Per-line failures degrade gracefully
 * inside price-line.ts and never surface here as a throw; this function
 * throws only if the internal run cannot even start. Returns one array
 * of merged priced lines, not a `{ lines, prices }` pair
 * (specs/007-pipeline-schema-cleanup FR-011) — the pair already existed
 * naturally at `price-line.ts`'s own step output; this function no
 * longer unzips it into two parallel arrays.
 */
export async function priceLines(input: PriceLinesInput): Promise<PricedLine[]> {
  const run = await pricingFanoutWorkflow.createRun();
  const result = await run.start({
    inputData: {
      estimateRequestId: input.estimateRequestId,
      zipCode: input.zipCode,
      lines: input.lines,
    },
  });
  if (result.status !== 'success') {
    throw new Error(`pricing-fanout workflow ended non-success: ${result.status}`);
  }
  return result.result;
}
