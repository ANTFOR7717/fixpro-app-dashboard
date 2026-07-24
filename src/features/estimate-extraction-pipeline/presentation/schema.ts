import { z } from 'zod';
import { enrichedMaterialLineSchema, enrichedLaborLineSchema } from '../enrichment';

const presentedMaterialLineSchema = enrichedMaterialLineSchema.extend({
  itemName: z.string().min(1),
  category: z.string().min(1),
});

const presentedLaborLineSchema = enrichedLaborLineSchema.extend({
  itemName: z.string().min(1),
  category: z.string().min(1),
});

/**
 * ONE billable line prepared for client-facing presentation — the same
 * line as `EnrichedLine`, plus a clean item name and a category (a finer
 * taxonomy than `TRADE`, used only for display grouping).
 */
export const presentedLineSchema = z.discriminatedUnion('costType', [
  presentedMaterialLineSchema,
  presentedLaborLineSchema,
]);
export type PresentedLine = z.infer<typeof presentedLineSchema>;

/**
 * Fixed 35% markup on builder cost — a hardcoded business policy, not
 * agent-determined (same principle as the labor-hours floor in
 * `enrichment/domain/logic.ts`).
 */
export const MARKUP_PERCENT = 0.35;

/**
 * ONE presented line with pricing applied: `builderCost` (quantity ×
 * rate), the markup rate/amount, and the resulting `clientTotal`. Pure
 * arithmetic, computed by `pricingStep` — no agent involved.
 */
export const pricedLineSchema = z.discriminatedUnion('costType', [
  presentedMaterialLineSchema.extend({
    builderCost: z.number(),
    markupPercent: z.number(),
    markupAmount: z.number(),
    clientTotal: z.number(),
  }),
  presentedLaborLineSchema.extend({
    builderCost: z.number(),
    markupPercent: z.number(),
    markupAmount: z.number(),
    clientTotal: z.number(),
  }),
]);
export type PricedLine = z.infer<typeof pricedLineSchema>;
