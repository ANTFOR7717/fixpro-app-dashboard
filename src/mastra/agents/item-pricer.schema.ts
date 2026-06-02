import { z } from 'zod';
import {
  pricedLineItemSchema,
  type PricedLineItem,
} from './billable-item-extractor.schema';

/**
 * One call to the pricer agent prices ONE billable item. The agent receives
 * a compact description (trade, action, scope, location, quantity,
 * sourceQuote) and the row's zip code, and returns the per-item shape below.
 *
 * The agent NEVER hallucinates a price. If it has no defensible number from
 * its training/lookup sources for the zip code it is given, it returns
 * `unitPrice: null` and a one-sentence `unavailableReason`. The report
 * renders "Price unavailable — needs contractor quote" in that case.
 */
export const itemPricerResponseSchema = z.object({
  unitPrice: z.number().int().min(0).nullable(),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1).max(120),
  unavailableReason: z.string().min(1).max(280).nullable(),
});

export type ItemPricerResponse = z.infer<typeof itemPricerResponseSchema>;

// Re-export the batched-output shape used by `price-items.ts`. Keeping the
// re-export here so the step file imports both the per-call schema and the
// batched type from a single place.
export { pricedLineItemSchema };
export type { PricedLineItem };
