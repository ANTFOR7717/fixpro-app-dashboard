import { z } from 'zod';

const priceEvidenceFields = {
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1).max(120),
  unavailableReason: z.string().min(1).max(280).nullable(),
} as const;

function xorUnavailable(
  priced: number | null,
  unavailableReason: string | null,
  ctx: z.RefinementCtx,
): void {
  if (priced === null && unavailableReason === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['unavailableReason'],
      message: 'unavailableReason is required when no price is returned',
    });
  }
  if (priced !== null && unavailableReason !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['unavailableReason'],
      message: 'unavailableReason must be null when a price is returned',
    });
  }
}

/** Response for a MATERIAL line: price of the part per physical unit. */
export const materialPriceResponseSchema = z
  .object({
    unitPrice: z.number().int().min(0).nullable(),
    ...priceEvidenceFields,
  })
  .superRefine((r, ctx) => xorUnavailable(r.unitPrice, r.unavailableReason, ctx));

export type MaterialPriceResponse = z.infer<typeof materialPriceResponseSchema>;

/** Response for a LABOR line: an HOURLY RATE. Hours are classification's job now — every line pricing receives already has a real, resolved hour count. */
export const laborPriceResponseSchema = z
  .object({
    hourlyRate: z.number().int().min(0).nullable(),
    ...priceEvidenceFields,
  })
  .superRefine((r, ctx) => xorUnavailable(r.hourlyRate, r.unavailableReason, ctx));

export type LaborPriceResponse = z.infer<typeof laborPriceResponseSchema>;

/** Pricing's module output per line — the persisted price record. */
export const pricedLineItemSchema = z.object({
  itemId: z.string().min(1),
  unitPrice: z.number().int().min(0).nullable(),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1).max(120),
  unavailableReason: z.string().min(1).max(280).nullable(),
});

export type PricedLineItem = z.infer<typeof pricedLineItemSchema>;
