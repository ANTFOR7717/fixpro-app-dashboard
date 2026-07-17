import { z } from 'zod';
import { ACTION, extractedFindingSchema } from '../extraction';

/**
 * Trades a residential home-inspection finding can plausibly implicate.
 * Sourced from the Tennessee Board for Licensing Contractors'
 * "Classification Outline with Trade Exam Requirements" (Rev. 5/2019),
 * scoped to the residential-repair-relevant subset and cross-referenced
 * against Maryland's/Virginia's separate licensing-board structures —
 * see specs/003-classification-rebuild/spec.md Clarification Q3 for full
 * sourcing and per-value rationale. Closed set, no `other` value — a
 * trade that cannot be derived from this list produces a
 * `WebSearchFlag` (below) instead, never a 24th catch-all value.
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
 * Physical units a MATERIAL quantity can be measured in. `hrs` is
 * deliberately absent — hours are not a physical extent; they belong
 * only to the labor determination below.
 */
export const EXTENT_UNIT = ['ea', 'lf', 'sf', 'cy'] as const;
export type ExtentUnit = (typeof EXTENT_UNIT)[number];

/**
 * The shared "couldn't determine" representation used in the FINAL,
 * assembled per-finding result (`classificationResultSchema`, and the
 * `flaggedForWebSearch` array `pricing`/`envelope.ts` consume). Never a
 * bare null, never a fabricated plausible-sounding value. Carries
 * everything a future (out-of-scope-for-this-pass) web-search
 * resolution step would need without re-deriving anything: the full
 * originating finding, the surrounding parsed-document excerpt, a short
 * machine-readable reason, and whatever else this pass DID determine for
 * the same finding.
 *
 * This full shape is assembled by `finding-workflow.ts`'s own
 * `combineResultStep` (via `getInitData()`/`getStepResult()`,
 * mechanisms already used in that same file) — never produced by the
 * model itself. The agent-facing analog is `agentUndeterminedSchema`
 * below, which is all an agent's own structured output is ever required
 * to produce: a live eval run confirmed every agent asked to reproduce
 * this full shape verbatim failed schema validation on the ECHOED
 * fields (`searchContext`), never on its own actual judgment
 * (specs/004-fix-classification-output).
 */
export const webSearchFlagSchema = z.object({
  status: z.literal('flagged_for_web_search'),
  reason: z.string().min(1),
  searchContext: z.object({
    finding: extractedFindingSchema,
    documentExcerpt: z.string(),
    partialFindings: z.object({
      materials: z
        .array(
          z.object({
            material: z.string(),
            quantity: z.number().positive(),
            unit: z.enum(EXTENT_UNIT),
          }),
        )
        .optional(),
      labor: z
        .object({
          laborType: z.string(),
          hours: z.number().positive(),
        })
        .optional(),
    }),
  }),
});
export type WebSearchFlag = z.infer<typeof webSearchFlagSchema>;

/**
 * The MINIMAL "couldn't determine" shape an agent's own structured
 * output is ever required to produce — its own judgment only, nothing
 * echoed back. Built by omitting `webSearchFlagSchema`'s own
 * `searchContext` field rather than independently retyping
 * `status`/`reason` (specs/007-pipeline-schema-cleanup finding #10).
 * `finding-workflow.ts`'s `combineResultStep` upgrades a value of this
 * shape into a full `WebSearchFlag` (above) by attaching context it
 * already possesses via `getInitData()`/`getStepResult()` — the same
 * mechanism this codebase already uses to build each agent's own
 * PROMPT, applied symmetrically on the output side
 * (specs/004-fix-classification-output).
 */
export const agentUndeterminedSchema = webSearchFlagSchema.omit({
  searchContext: true,
});
export type AgentUndetermined = z.infer<typeof agentUndeterminedSchema>;

/**
 * Builds the discriminated "determined OR flagged" union used for every
 * value in this module that can either be resolved or handed off
 * unresolved. One reusable shape — not three separate ad hoc
 * undetermined-handling schemes. `flagSchema` defaults to the full
 * `webSearchFlagSchema`, used by `classificationResultSchema`'s own
 * fields (the FINAL assembled shape). `finding-workflow.ts`'s three
 * per-finding agent step output schemas pass `agentUndeterminedSchema`
 * explicitly instead — an agent's own output must never be asked to
 * reproduce the full shape (specs/004-fix-classification-output).
 *
 * `F`'s constraint is `z.core.$ZodTypeDiscriminable` — the exact type
 * `z.discriminatedUnion()` itself requires each member to satisfy — not
 * the looser `z.ZodTypeAny`, which does not statically carry the
 * "has a computed literal discriminant" guarantee a generic parameter
 * needs here (confirmed via `tsc`: a first attempt using `z.ZodTypeAny`
 * failed to compile).
 */
export function determinedOr<T extends z.ZodTypeAny, F extends z.core.$ZodTypeDiscriminable = typeof webSearchFlagSchema>(
  valueSchema: T,
  flagSchema: F = webSearchFlagSchema as unknown as F,
) {
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('determined'), value: valueSchema }),
    flagSchema,
  ]);
}

/**
 * The determined VALUE shape for a material's quantity — exported
 * separately (not inlined) so `finding-workflow.ts`'s
 * `materialsStepOutputSchema` can pass this exact same value schema into
 * its own `determinedOr()` call (with `agentUndeterminedSchema` as the
 * flag branch, instead of this schema's own default) rather than
 * independently retyping `amount`/`unit`/`amountSource`
 * (specs/007-pipeline-schema-cleanup FR-006).
 */
export const materialQuantityValueSchema = z.object({
  amount: z.number().positive(),
  unit: z.enum(EXTENT_UNIT),
  amountSource: z.string().min(1),
});

/**
 * One physical material identified for a finding, before flattening.
 * `amountSource` (the grounding citation) lives inside the determined
 * branch's own value — not a dangling optional sibling — so "a
 * determined quantity always has a source" is structurally guaranteed,
 * not a runtime check `flatten.ts` has to enforce
 * (specs/007-pipeline-schema-cleanup FR-004).
 */
export const materialDeterminationSchema = z.object({
  material: z.string().min(1),
  quantity: determinedOr(materialQuantityValueSchema),
});
export type MaterialDetermination = z.infer<typeof materialDeterminationSchema>;

/**
 * The determined VALUE shape for labor hours — exported separately for
 * the same reason as `materialQuantityValueSchema` above
 * (specs/007-pipeline-schema-cleanup FR-006). No quarter-hour rounding
 * rule — an unconfirmed assumption pattern-matched from mock sample
 * data, never an actual product requirement (finding #13).
 */
export const laborHoursValueSchema = z.object({
  amount: z.number().positive(),
  hoursSource: z.string().min(1),
});

/**
 * The labor identified for a finding, before flattening. `hoursSource`
 * lives inside the determined branch's own value for the same reason as
 * `materialDeterminationSchema.amountSource` above.
 */
export const laborDeterminationSchema = z.object({
  laborType: z.string().min(1),
  hours: determinedOr(laborHoursValueSchema),
});
export type LaborDetermination = z.infer<typeof laborDeterminationSchema>;

/**
 * A finding's identity fields that a billable line must carry through to
 * pricing/rendering — factored out so both `classificationResultSchema`
 * and the two line schemas below share one definition instead of two
 * independently-maintained copies. A real `ZodObject`, composed via
 * `.extend()` below rather than object-spread
 * (specs/007-pipeline-schema-cleanup FR-007).
 */
const itemIdentitySchema = z.object({
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  sourceQuote: z.string().min(1),
});

/**
 * One finding's complete classification, as the per-finding nested
 * workflow's own combine step (finding-workflow.ts) produces it. Derived
 * from `extractedFindingSchema` via `.omit()`/`.extend()` rather than
 * independently retyping `action`/`scope`/`location`/`sourceQuote`
 * (specs/007-pipeline-schema-cleanup FR-008) — `id`/`statedQuantity`/
 * `inspectorHours` don't carry forward (renamed to `findingId`, or
 * consumed already during extraction/classification prompting), and
 * `materials`/`labor`/`trade` are this schema's own additions. Carries
 * the originating finding's own identity fields (from `getInitData()`)
 * alongside the three agents' own determinations, so `flatten.ts` is
 * fully self-contained — no separate "merge findings back in by id" step
 * like the scrapped module's `buildLinesStep` needed. `materials` is an
 * ARRAY — zero, one, or many entries, each with its own unit — because
 * one finding can genuinely span multiple differently-unit-typed
 * materials. Zero materials is a valid, honest "labor-only" state, never
 * an error (spec.md User Story 2).
 */
export const classificationResultSchema = extractedFindingSchema
  .omit({ id: true, statedQuantity: true, inspectorHours: true })
  .extend({
    findingId: z.string(),
    materials: z.array(materialDeterminationSchema),
    labor: laborDeterminationSchema,
    trade: determinedOr(z.enum(TRADE)),
  });
export type ClassificationResult = z.infer<typeof classificationResultSchema>;

/**
 * ONE material billable line — the flattened handoff shape pricing
 * consumes. Field contract preserved exactly as
 * `pricing/price-line.ts` already reads it (`trade`, `action`, `scope`,
 * `location`, `costType`, `pricingBasis`, `quantity`, `unit`,
 * `sourceQuote`) — only `trade`'s value set changes in this rebuild.
 * `quantity` is never null here — a flagged (undetermined) material
 * never reaches this schema; it is surfaced via `webSearchFlagSchema`
 * instead (see flatten.ts). Built via `.extend()` off `itemIdentitySchema`
 * (specs/007-pipeline-schema-cleanup FR-007).
 */
export const materialLineSchema = itemIdentitySchema.extend({
  costType: z.literal('material'),
  /** What the material actually is, e.g. "wood siding board". */
  material: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.enum(EXTENT_UNIT),
  amountSource: z.string().min(1),
  pricingBasis: z.literal('material-part-only'),
});

/**
 * ONE labor billable line. Same "never null, never flagged" reasoning
 * as `materialLineSchema.quantity` — a flagged labor-hours value never
 * reaches this schema. Built via `.extend()` off `itemIdentitySchema`
 * (specs/007-pipeline-schema-cleanup FR-007).
 */
export const laborLineSchema = itemIdentitySchema.extend({
  costType: z.literal('labor'),
  /** What the labor actually is, e.g. "siding repair labor". */
  laborType: z.string().min(1),
  /** Hours. No quarter-hour rounding rule (finding #13 — never requested). */
  quantity: z.number().positive(),
  unit: z.literal('hrs'),
  hoursSource: z.string().min(1),
  /**
   * What the pricer's number must cover for this line:
   *   - 'material-part-only'   — a material line with a labor sibling.
   *   - 'labor-install-hourly' — labor with 1+ material siblings; the
   *     hourly rate covers INSTALLING the material(s), excludes part cost.
   *   - 'labor-all-in-hourly'  — labor with NO material sibling; the
   *     all-in rate a contractor would quote.
   * Computed once, in flatten.ts, from whether any material line was
   * emitted for the same finding — pricing/price-line.ts already reads
   * this field directly and is unchanged by this rebuild.
   */
  pricingBasis: z.enum(['labor-install-hourly', 'labor-all-in-hourly']),
});

export const billableLineSchema = z.discriminatedUnion('costType', [
  materialLineSchema,
  laborLineSchema,
]);

export type MaterialLine = z.infer<typeof materialLineSchema>;
export type LaborLine = z.infer<typeof laborLineSchema>;
export type BillableLine = z.infer<typeof billableLineSchema>;
