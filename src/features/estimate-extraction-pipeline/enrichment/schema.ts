import { z } from 'zod';
import { materialLineSchema, laborLineSchema } from '../classification';

const EXTENT_UNIT = ['ea', 'lf', 'sf', 'cy'] as const;

/**
 * ONE enriched material line — classification's material identity plus
 * the amount (quantity/unit) and the price (rate/currency/confidence)
 * determined together in one enrichment call. `unitPrice`/`hourlyRate`
 * split was a pricing-module mistake already fixed once this session;
 * one shared field set (quantity/unit/rate/...) across both branches,
 * not two names for the same concept.
 *
 * Exported (not module-private) for the same reason classification
 * exports `materialLineSchema`/`laborLineSchema`: the next pipeline
 * stage — `presentation/schema.ts` — extends these directly to build
 * `presentedLineSchema`, rather than re-declaring the same fields.
 */
export const enrichedMaterialLineSchema = materialLineSchema.extend({
  quantity: z.number().positive(),
  unit: z.enum(EXTENT_UNIT),
  rate: z.number().min(0).multipleOf(0.01),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1),
});

/** ONE enriched labor line — same "amount + price together" reasoning as materials. */
export const enrichedLaborLineSchema = laborLineSchema.extend({
  quantity: z.number().positive(),
  unit: z.literal('hrs'),
  rate: z.number().min(0).multipleOf(0.01),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1),
});

export const enrichedLineSchema = z.discriminatedUnion('costType', [enrichedMaterialLineSchema, enrichedLaborLineSchema]);
export type EnrichedLine = z.infer<typeof enrichedLineSchema>;
