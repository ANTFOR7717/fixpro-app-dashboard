import { type BillableLine, type PendingLine } from '../classification';
import { pricedLineItemSchema, type PricedLineItem } from './schema';
import { pricingFanoutWorkflow } from './workflow';
import { itemPricerAgent } from './agent';

export type { PricedLineItem };
export { pricedLineItemSchema };
/** Re-exported for Studio registration ONLY — no module calls this directly. */
export { itemPricerAgent };

export interface PriceLinesInput {
  estimateRequestId: string;
  zipCode: string;
  lines: PendingLine[];
}

export interface PriceLinesOutput {
  lines: BillableLine[];
  prices: PricedLineItem[];
}

/**
 * THE PRICING API. Prices every pending line (concurrency is this module's
 * own concern — see workflow.ts). Per-line failures degrade gracefully
 * inside price-line.ts and never surface here as a throw; this function
 * throws only if the internal run cannot even start.
 */
export async function priceLines(input: PriceLinesInput): Promise<PriceLinesOutput> {
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
  return {
    lines: result.result.map((r) => r.line),
    prices: result.result.map((r) => r.price),
  };
}
