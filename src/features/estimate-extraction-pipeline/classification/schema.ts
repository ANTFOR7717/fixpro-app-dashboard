import { z } from 'zod';

/**
 * Trades a residential home-inspection finding can plausibly implicate.
 * Sourced from the Tennessee Board for Licensing Contractors'
 * "Classification Outline with Trade Exam Requirements" (Rev. 5/2019),
 * scoped to the residential-repair-relevant subset and cross-referenced
 * against Maryland's/Virginia's separate licensing-board structures —
 * see specs/003-classification-rebuild/spec.md Clarification Q3 for full
 * sourcing and per-value rationale. Closed set, no `other` value.
 */
export const TRADE = [
  'electrical',
  'plumbing',
  'hvac',
  'fire_protection',
  'roofing',
  'siding',
  'carpentry',
  'drywall',
  'flooring',
  'glazing',
  'masonry',
  'painting',
  'insulation',
  'concrete',
  'waterproofing',
  'tile',
  'foundation',
  'excavation_grading',
  'landscaping',
  'fencing',
  'mold_remediation',
  'pest_control',
  'general_contractor',
] as const;
export type Trade = (typeof TRADE)[number];

/**
 * A finding's identity fields that a billable line must carry through to
 * pricing/rendering — factored out so both billable line schemas below
 * share one definition via `.extend()` instead of two independently-
 * maintained copies.
 */
const itemIdentitySchema = z.object({
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.string().min(1),
  scope: z.string().min(1),
  location: z.string().min(1),
  sourceQuote: z.string().min(1),
  page: z.number().int().min(1),
});

/**
 * ONE material billable line. Classification determines WHAT material is
 * involved only — quantity/unit/amount are a later determination, not
 * classification's job.
 */
export const materialLineSchema = itemIdentitySchema.extend({
  costType: z.literal('material'),
  material: z.string().min(1),
});

/** ONE labor billable line — same "WHAT, not HOW MUCH" scoping as materials. */
export const laborLineSchema = itemIdentitySchema.extend({
  costType: z.literal('labor'),
  laborType: z.string().min(1),
});

export const billableLineSchema = z.discriminatedUnion('costType', [materialLineSchema, laborLineSchema]);

export type MaterialLine = z.infer<typeof materialLineSchema>;
export type LaborLine = z.infer<typeof laborLineSchema>;
export type BillableLine = z.infer<typeof billableLineSchema>;
