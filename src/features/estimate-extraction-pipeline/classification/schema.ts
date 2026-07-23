import { z } from 'zod';

/**
 * Trades a residential home-inspection finding can plausibly implicate.
 * `trade`'s only consumer is the estimate report's section grouping
 * (`estimate/components/items-section.tsx`, `estimate/lib/format.ts`) —
 * a display label, not a licensing/dispatch classification. The
 * taxonomy is scoped to trades a homeowner would actually shop for a
 * dedicated specialist to do, even for a small repair (`electrical`,
 * `plumbing`, `hvac`, `fire_protection`, `roofing`, `foundation`,
 * `excavation_grading`, `landscaping`, `fencing`, `mold_remediation`,
 * `pest_control`). Routine repair scope a general contractor handles
 * directly or subs out without the homeowner shopping for a specialist
 * — masonry, carpentry, drywall, painting, flooring, tile, insulation,
 * siding, glazing, waterproofing, concrete — is not split out; it
 * reports as `general_contractor`. Closed set, no `other` value.
 *
 * (This replaces a prior 23-value, licensing-board-derived taxonomy
 * whose "read directly from the published PDF" sourcing claim could not
 * be substantiated anywhere in the repo — see
 * specs/003-classification-rebuild/spec.md Clarification Q3, now stale.)
 */
export const TRADE = [
  'electrical',
  'plumbing',
  'hvac',
  'fire_protection',
  'roofing',
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
  scope: z.string().min(1),
  location: z.string().min(1),
  descriptionQuote: z.string().min(1),
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
