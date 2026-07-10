import { z } from 'zod';
import { TRADE, ACTION, EXTENT_UNIT } from '../extraction';

export const COST_TYPE = ['labor', 'material'] as const;
export type CostType = (typeof COST_TYPE)[number];

const itemIdentityFields = {
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  sourceQuote: z.string().min(8).max(500),
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
} as const;

export const materialLineSchema = z.object({
  ...itemIdentityFields,
  costType: z.literal('material'),
  quantity: z.number().int().min(1),
  unit: z.enum(EXTENT_UNIT),
});

export const laborLineSchema = z.object({
  ...itemIdentityFields,
  costType: z.literal('labor'),
  /** Hours, in quarter-hour increments — the v3 mock's 0.25 / 1.5 / 3.5 / 4.5. */
  quantity: z.number().multipleOf(0.25).min(0.25),
  unit: z.literal('hrs'),
  hoursSource: z.enum(['inspector', 'estimated', 'fallback']),
});

/**
 * A v3 billable line. Discriminated union = the v3 prototype's unit
 * discipline as a TYPE: "every Labor row uses HRS ... HRS never appears
 * on a Material row; EA/SF/LF/CY never appear on a Labor row." A violating
 * line is unrepresentable, not merely invalid.
 */
export const billableLineSchema = z.discriminatedUnion('costType', [
  materialLineSchema,
  laborLineSchema,
]);

export type MaterialLine = z.infer<typeof materialLineSchema>;
export type LaborLine = z.infer<typeof laborLineSchema>;
export type BillableLine = z.infer<typeof billableLineSchema>;

/**
 * A labor line whose hours are not yet resolved (null = pricing must
 * resolve them). Material lines are always complete leaving classification.
 * This is classification's OUTPUT to pricing — pricing's input type.
 */
export const pendingLaborLineSchema = laborLineSchema.extend({
  quantity: z.number().multipleOf(0.25).min(0.25).nullable(),
  hoursSource: z.enum(['inspector', 'estimated', 'fallback']).nullable(),
});

export const pendingLineSchema = z.discriminatedUnion('costType', [
  materialLineSchema,
  pendingLaborLineSchema,
]);

export type PendingLaborLine = z.infer<typeof pendingLaborLineSchema>;
export type PendingLine = z.infer<typeof pendingLineSchema>;
