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
 */
const enrichedMaterialLineSchema = materialLineSchema.extend({
  quantity: z.number().positive(),
  unit: z.enum(EXTENT_UNIT),
  rate: z.number().int().min(0),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1),
});

/** ONE enriched labor line — same "amount + price together" reasoning as materials. */
const enrichedLaborLineSchema = laborLineSchema.extend({
  quantity: z.number().positive(),
  unit: z.literal('hrs'),
  rate: z.number().int().min(0),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1),
});

export const enrichedLineSchema = z.discriminatedUnion('costType', [enrichedMaterialLineSchema, enrichedLaborLineSchema]);
export type EnrichedLine = z.infer<typeof enrichedLineSchema>;

export function lineTotal(line: EnrichedLine): number {
  return line.quantity * line.rate;
}

/**
 * Home-inspection-relevant tags for the presentation stage — proposed,
 * not yet confirmed as a final business taxonomy. Inferred from language
 * already present in real finding data seen in this project ("shock
 * hazard", "fire risk", "collapse risk", "moisture intrusion",
 * "structural movement").
 */
export const PRESENTATION_TAG = [
  'safety_hazard',
  'moisture_water_damage',
  'structural',
  'code_violation',
  'deferred_maintenance',
  'immediate_repair',
  'permit_required',
] as const;
export type PresentationTag = (typeof PRESENTATION_TAG)[number];

/**
 * A `35%` markup on builder cost — matches the target reference format
 * exactly (`eval/target-output-format.md`), verified there against 50
 * real line items and a grand summary. A fixed constant, not
 * agent-determined — markup rate is a business policy, not a reasoning
 * task, same principle as the labor-hours floor in `domain/logic.ts`.
 */
export const MARKUP_PERCENT = 0.35;

/**
 * ONE billable line prepared for client-facing presentation — the same
 * line as `EnrichedLine`, plus a clean item name, a category (a finer
 * taxonomy than `TRADE` — see `eval/target-output-format.md`), tags, and
 * the markup math already computed (`builderCost` = `lineTotal(line)`,
 * `clientTotal` = `builderCost * (1 + MARKUP_PERCENT)`).
 */
export const presentedLineSchema = z.object({
  id: z.string(),
  itemName: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.enum(PRESENTATION_TAG)),
  costType: z.enum(['material', 'labor']),
  quantity: z.number().positive(),
  unit: z.string(),
  builderCost: z.number(),
  markupPercent: z.number(),
  markupAmount: z.number(),
  clientTotal: z.number(),
});
export type PresentedLine = z.infer<typeof presentedLineSchema>;

export const presentedGroupSchema = z.object({
  category: z.string(),
  itemCount: z.number().int().min(1),
  builderCostSubtotal: z.number(),
  clientTotalSubtotal: z.number(),
  items: z.array(presentedLineSchema),
});
export type PresentedGroup = z.infer<typeof presentedGroupSchema>;

export const presentationSummarySchema = z.object({
  totalCost: z.number(),
  totalMarkup: z.number(),
  estimateTotal: z.number(),
  profitMarginPercent: z.number(),
});
export type PresentationSummary = z.infer<typeof presentationSummarySchema>;
