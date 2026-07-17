import { z } from 'zod';
import { materialLineSchema, laborLineSchema, determinedOr } from '../classification';

/**
 * The determined branch's own shared evidence fields — spread once into
 * each response schema's determined value, not retyped independently
 * (specs/007-pipeline-schema-cleanup FR-009). `unavailableReason` is no
 * longer part of this set — the unavailable case is now its own flag
 * branch (`priceFlagSchema` below), not a nullable sibling field.
 */
const priceEvidenceFields = {
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1),
} as const;

/**
 * The minimal "couldn't price this" flag branch, mirroring
 * `classification/schema.ts`'s own `agentUndeterminedSchema` shape.
 * Reusing `determinedOr()` (already proven in production by three
 * classification agents) makes "priced XOR unavailable-with-reason"
 * structurally impossible to violate — no hand-written `superRefine`
 * check needed (specs/007-pipeline-schema-cleanup FR-017; a
 * discriminated union with an explicit literal tag is NOT the same
 * fragile pattern as an untagged `z.union([...])` — see research.md R2).
 */
const priceFlagSchema = z.object({
  status: z.literal('unavailable'),
  reason: z.string().min(1),
});

/** Response for a MATERIAL line: price of the part per physical unit. */
export const materialPriceResponseSchema = z.object({
  price: determinedOr(
    z.object({ unitPrice: z.number().int().min(0), ...priceEvidenceFields }),
    priceFlagSchema,
  ),
});

export type MaterialPriceResponse = z.infer<typeof materialPriceResponseSchema>;

/** Response for a LABOR line: an HOURLY RATE. Hours are classification's job now — every line pricing receives already has a real, resolved hour count. */
export const laborPriceResponseSchema = z.object({
  price: determinedOr(
    z.object({ hourlyRate: z.number().int().min(0), ...priceEvidenceFields }),
    priceFlagSchema,
  ),
});

export type LaborPriceResponse = z.infer<typeof laborPriceResponseSchema>;

/**
 * ONE priced billable line — a `BillableLine` merged with its own price,
 * built by extending each branch (`materialLineSchema`/`laborLineSchema`,
 * both real `ZodObject`s) individually and rebuilding the discriminated
 * union. NOT `billableLineSchema.extend({ price })` directly —
 * `billableLineSchema` is itself a `z.discriminatedUnion(...)`, which has
 * no `.extend()` method (verified against the installed Zod package;
 * see research.md R4). Replaces the separate `lines`/`prices` array
 * split — the natural, paired shape already existed at
 * `pricing/price-line.ts`'s own step output and no code path ever needed
 * the two arrays independently recomputable
 * (specs/007-pipeline-schema-cleanup FR-011).
 */
const pricedMaterialLineSchema = materialLineSchema.extend({
  price: materialPriceResponseSchema.shape.price,
});
const pricedLaborLineSchema = laborLineSchema.extend({
  price: laborPriceResponseSchema.shape.price,
});
export const pricedLineSchema = z.discriminatedUnion('costType', [
  pricedMaterialLineSchema,
  pricedLaborLineSchema,
]);

export type PricedLine = z.infer<typeof pricedLineSchema>;

/**
 * The determined price amount for one line, or `null` when unavailable —
 * the one place any consumer narrows `PricedLine.price`'s `determinedOr()`
 * union (reading its own `status` tag, the documented, unavoidable way to
 * consume a discriminated union — spec.md's Governing Rule). Exported here
 * so `items-section.tsx` and the eval pricing scorer share one definition
 * instead of two independently-maintained copies of the same
 * material/labor branch check (specs/007-pipeline-schema-cleanup, found
 * once the eval scorer's own `PricedLineItem` breakage surfaced the same
 * need in a second consumer).
 */
export function priceAmount(line: PricedLine): number | null {
  if (line.price.status !== 'determined') return null;
  return line.costType === 'material' ? line.price.value.unitPrice : line.price.value.hourlyRate;
}
