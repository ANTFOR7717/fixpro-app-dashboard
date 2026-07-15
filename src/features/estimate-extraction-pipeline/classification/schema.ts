import { z } from 'zod';
import { ACTION } from '../extraction';

/**
 * What trade would actually do this work. Assigned HERE, not by
 * extraction — this is a domain-taxonomy judgment, not a fact stated in
 * the report's text.
 */
export const TRADE = [
  'electrical',
  'plumbing',
  'hvac',
  'roofing',
  'structural',
  'carpentry',
  'masonry',
  'appliance',
  'exterior',
  'interior',
  'other',
] as const;
export type Trade = (typeof TRADE)[number];

/**
 * Physical units a MATERIAL extent can be measured in. `hrs` is
 * deliberately absent — hours are not a physical extent. Assigned HERE
 * for the same reason as TRADE above. NOT a category->unit lookup table —
 * the agent determines the unit per material name it itself names (see
 * agent.ts); this is just the closed set of valid values.
 */
export const EXTENT_UNIT = ['ea', 'lf', 'sf', 'cy'] as const;
export type ExtentUnit = (typeof EXTENT_UNIT)[number];

export const COST_TYPE = ['labor', 'material'] as const;
export type CostType = (typeof COST_TYPE)[number];

/**
 * What the pricer's number must cover for one line — computed ONCE, here,
 * at the same moment classification decides a finding's material/labor
 * lines, since that decision is exactly what determines this:
 *
 *   - 'material-part-only'   — a material line with at least one labor sibling.
 *   - 'labor-install-hourly' — the labor line when at least one material sibling exists.
 *     HOURLY RATE for installing the material(s); excludes part cost.
 *   - 'labor-all-in-hourly'  — labor with NO material sibling. The hourly
 *     rate must be the all-in rate a contractor quotes.
 *
 * A plain data field on each line, not a function pricing calls with
 * (action, costType) — pricing already has the line; it just reads this.
 */
export const PRICING_BASIS = [
  'material-part-only',
  'labor-install-hourly',
  'labor-all-in-hourly',
] as const;
export type PricingBasis = (typeof PRICING_BASIS)[number];

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

/**
 * ONE material billable line. A single finding can produce MULTIPLE of
 * these — e.g. "trim or wood siding" names two materials with two
 * DIFFERENT units (lf vs sf); collapsing them into one line would mean
 * silently picking a unit and hiding the other. `quantity` is NEVER
 * null — classification always resolves a real number (see agent.ts);
 * there is no "pending" state left for pricing to fill in.
 */
export const materialLineSchema = z.object({
  ...itemIdentityFields,
  costType: z.literal('material'),
  /** What the material actually is, e.g. "wood siding board", "exterior trim board". */
  material: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.enum(EXTENT_UNIT),
  /** Grounding for this number: a document citation, or a web-search citation. Never absent. */
  amountSource: z.string().min(1),
  pricingBasis: z.literal('material-part-only'),
});

/**
 * ONE labor billable line. `quantity` (hours) is NEVER null — same
 * reasoning as `materialLineSchema.quantity`. `hoursSource` replaced the
 * old closed enum (`'inspector' | 'estimated' | 'fallback'`) with a free
 * text citation, because "estimated" used to mean an ungrounded LLM guess
 * (`pricing/agent.ts`'s `itemPricerAgent`, confirmed zero tools) — this
 * field must always name where the number actually came from (a stated
 * inspector hour count, a specific web-search result), not a vague label.
 */
export const laborLineSchema = z.object({
  ...itemIdentityFields,
  costType: z.literal('labor'),
  /** What the labor actually is, e.g. "siding/trim repair labor". */
  laborType: z.string().min(1),
  /** Hours, in quarter-hour increments — the v3 mock's 0.25 / 1.5 / 3.5 / 4.5. */
  quantity: z.number().multipleOf(0.25).min(0.25),
  unit: z.literal('hrs'),
  hoursSource: z.string().min(1),
  pricingBasis: z.enum(['labor-install-hourly', 'labor-all-in-hourly']),
});

export const billableLineSchema = z.discriminatedUnion('costType', [
  materialLineSchema,
  laborLineSchema,
]);

export type MaterialLine = z.infer<typeof materialLineSchema>;
export type LaborLine = z.infer<typeof laborLineSchema>;
export type BillableLine = z.infer<typeof billableLineSchema>;

/**
 * One finding's classification, as the agent returns it. `materials` is
 * an ARRAY, not a single nullable object — 0, 1, or many entries, each
 * with its own unit, because one finding can genuinely span multiple
 * differently-unit-typed materials (see agent.ts). Empty array is a
 * valid, honest "no material" state; there is no null anywhere in this
 * schema — every number the agent emits is a real, grounded value.
 */
export const lineClassificationSchema = z.object({
  findingId: z.string(),
  trade: z.enum(TRADE),
  materials: z.array(
    z.object({
      material: z.string().min(1),
      quantity: z.number().positive(),
      unit: z.enum(EXTENT_UNIT),
      amountSource: z.string().min(1),
    }),
  ),
  laborType: z.string().min(1),
  laborHours: z.number().positive(),
  laborHoursSource: z.string().min(1),
  reasoning: z.string().min(1),
});

export type LineClassification = z.infer<typeof lineClassificationSchema>;

export const classificationOutputSchema = z.object({
  lines: z.array(lineClassificationSchema),
});

export type ClassificationOutput = z.infer<typeof classificationOutputSchema>;
