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

/** Response for a LABOR line: an HOURLY RATE plus the hours the job takes. */
export const laborPriceResponseSchema = z
  .object({
    hourlyRate: z.number().int().min(0).nullable(),
    estimatedHours: z.number().positive().max(160).nullable(),
    ...priceEvidenceFields,
  })
  .superRefine((r, ctx) => {
    xorUnavailable(r.hourlyRate, r.unavailableReason, ctx);
    if (r.hourlyRate !== null && r.estimatedHours === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['estimatedHours'],
        message: 'estimatedHours is required when hourlyRate is returned',
      });
    }
  });

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
