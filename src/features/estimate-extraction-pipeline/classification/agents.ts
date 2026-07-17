import { Agent } from '@mastra/core/agent';
import { pioneerGateway } from '../shared/gateway';

/**
 * Determines material presence and, for each distinct material
 * involved, a real quantity + unit — or, when no real basis exists,
 * flags that material for future web-search resolution. Zero materials
 * is a valid, honest answer (a labor-only finding); this agent must
 * never invent a material to have something to return.
 *
 * Internal to the classification module — only `classification/index.ts`
 * re-exports this, for Studio registration only. Composed as a step via
 * bare `createStep(materialsAgent, { structuredOutput })` in
 * `finding-workflow.ts` — no hand-rolled `.generate()`/`.stream()` call
 * anywhere (MASTRA-AGENT-WORKFLOW-STANDARD.md Rule 1).
 */
export const materialsAgent = new Agent({
  id: 'classification-materials',
  name: 'Classification — Material Determination',
  instructions: `
You determine whether a home-inspection finding involves physical
MATERIAL, and if so, exactly which materials and how much of each.

INPUT
You receive one finding (action, scope, location, statedQuantity,
inspectorHours, sourceQuote) plus a document excerpt: the text of the
source report's page(s) surrounding where this finding's sourceQuote
appears. Use the excerpt only to ground details about THIS finding —
never borrow a fact that only supports a different finding elsewhere on
the same page.

DEFINITION
A "material" is a physical, purchasable part or component the repair
requires (a board, a panel, a fixture, a length of pipe, a bundle of
shingles). Labor-only work (tightening, adjusting, cleaning, a service
call) involves NO material — return an empty materials array. Do not
invent a material just to have something to return.

FOR EACH MATERIAL YOU IDENTIFY
- material: a short, specific name for the physical item (e.g. "wood
  siding board", "exterior trim board", "GFCI receptacle").
- quantity: a real amount + a real unit (ea, lf, sf, or cy) PLUS
  amountSource, all three grouped INSIDE quantity's own "value" object
  (see HARD RULE 5's exact shape below) — grounded either in the
  finding's own statedQuantity/sourceQuote or in a nearby stated
  measurement in the document excerpt. amountSource names exactly where
  the number came from (e.g. "sourceQuote states '20 shingles'", "p. 14
  states siding section is 12 linear feet") — never a vague label like
  "estimated". If the finding or excerpt genuinely gives no real basis
  for a quantity, return a flagged quantity instead of guessing:
  { "status": "flagged_for_web_search", "reason": "<specific reason>" }
  — a short, specific reason, nothing else on that object, and no
  amountSource anywhere on it.

HARD RULES
1. NEVER invent a quantity or unit with no real grounding. Flag instead.
2. NEVER invent a material that the finding's action/scope doesn't
   actually support.
3. An empty materials array is a valid, complete, honest answer — not a
   failure, not something to avoid.
4. Do not determine labor, hours, or trade — those are separate steps.
5. A determined quantity is exactly
   { "status": "determined", "value": { "amount": <number>, "unit": "<ea|lf|sf|cy>", "amountSource": "<where this came from>" } } —
   amountSource is REQUIRED and lives INSIDE "value", never as a sibling
   of "quantity" and never omitted when status is "determined"; a
   flagged quantity is exactly
   { "status": "flagged_for_web_search", "reason": "<reason>" }.
   Never mix the two shapes, never add other fields, never change the
   literal "status" value.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly. No
commentary, no preamble, no text outside the JSON.
`,
  model: pioneerGateway.chat('pioneer/auto'),
});

/**
 * Determines labor type and hours for a finding. Every finding produces
 * exactly one labor determination (spec.md Assumptions — no "zero
 * labor" case is anticipated). May read the materials step's own result
 * as OPTIONAL additional context when present, but its own correctness
 * never depends on materials having produced anything (spec.md FR-005 —
 * a labor-only finding must classify correctly with no material data
 * present).
 *
 * Internal to the classification module — see `materialsAgent`'s own
 * comment for the module-boundary and composition-form reasoning, which
 * applies identically here.
 */
export const laborAgent = new Agent({
  id: 'classification-labor',
  name: 'Classification — Labor Determination',
  instructions: `
You determine the labor a home-inspection finding requires: what type of
labor, and how many hours.

INPUT
You receive one finding (action, scope, location, statedQuantity,
inspectorHours, sourceQuote), a document excerpt (the source report's
page(s) surrounding this finding), and — WHEN AVAILABLE — the materials
already determined for this same finding. The materials context is
informational only: if it is absent or empty, that is a completely
normal labor-only finding, not a degraded or partial case. Never treat a
missing/empty materials list as a reason to lower quality or invent a
placeholder.

FOR THE LABOR YOU DETERMINE
- laborType: a short, specific description (e.g. "siding repair labor",
  "GFCI receptacle replacement labor", "roof leak diagnostic labor").
  ALWAYS a real, specific string — even when hours cannot be determined,
  you must still describe what kind of labor this is; never omit
  laborType.
- hours: a real positive number of hours PLUS hoursSource, grouped
  INSIDE hours' own "value" object (see HARD RULE 4's exact shape
  below) — grounded either in the finding's own inspectorHours (if the
  inspector explicitly stated one) or a reasonable, explicitly-cited
  basis from the document excerpt. No required rounding — use whatever
  real number the grounding actually supports. hoursSource names
  exactly where the number came from (e.g. "inspectorHours states 1.5",
  "p. 9 estimates a half-day for this scope") — never a vague label
  like "estimated". If neither the finding nor the excerpt gives a real
  basis for an hour count, return a flagged hours value instead of
  guessing: { "status": "flagged_for_web_search", "reason": "<specific
  reason>" } — a short, specific reason, nothing else on that object,
  and no hoursSource anywhere on it.

HARD RULES
1. NEVER invent an hour count with no real grounding. Flag instead.
2. NEVER let an absent/empty materials context degrade or block your own
   determination — labor-only findings are common and must classify
   exactly as completely as material-and-labor findings.
3. Do not determine materials or trade — those are separate steps.
4. A determined hours value is exactly
   { "status": "determined", "value": { "amount": <number>, "hoursSource": "<where this came from>" } } —
   hoursSource is REQUIRED and lives INSIDE "value", never as a sibling
   of "hours" and never omitted when status is "determined"; a flagged
   hours value is exactly
   { "status": "flagged_for_web_search", "reason": "<reason>" }.
   The top-level response is always a "labor" object wrapping
   laborType/hours — never a bare object without that wrapper, even
   when hours is flagged.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly. No
commentary, no preamble, no text outside the JSON.
`,
  model: pioneerGateway.chat('pioneer/auto'),
});

/**
 * Determines the trade associated with a finding, derived from the
 * combination of its materials and labor determinations — never an
 * independent first fact (spec.md FR-004). Selected from the closed,
 * sourced 23-value taxonomy in `schema.ts`'s `TRADE`; a finding whose
 * trade cannot be derived from that taxonomy even with full context
 * flags instead of picking a generic/closest-guess value.
 *
 * Internal to the classification module — see `materialsAgent`'s own
 * comment for the module-boundary and composition-form reasoning, which
 * applies identically here.
 */
export const tradeAgent = new Agent({
  id: 'classification-trade',
  name: 'Classification — Trade Determination',
  instructions: `
You determine which contractor TRADE would actually perform a home-
inspection finding's repair, given what materials and labor were
already determined for it.

INPUT
You receive one finding (action, scope, location, sourceQuote), a
document excerpt, and the materials and labor already determined for
this same finding (materials may be an empty array — a labor-only
finding is normal).

VALID TRADES (choose exactly one, or flag — see below)
electrical, plumbing, hvac, fire_protection, roofing, siding, carpentry,
drywall, flooring, glazing, masonry, painting, insulation, concrete,
waterproofing, tile, foundation, excavation_grading, landscaping,
fencing, mold_remediation, pest_control, general_contractor.

HOW TO CHOOSE
Reason from the actual materials and labor determined for this finding
— e.g. a wood siding board + siding repair labor is "siding", not
"carpentry" or "exterior"; a GFCI receptacle + electrical labor is
"electrical"; a finding whose repair is small and genuinely spans
multiple ordinary trades with no single dominant one is
"general_contractor" (a real, licensed category — not a vague
catch-all; use it deliberately, only when it is genuinely the most
accurate answer, not as a default when unsure).

IF NO TRADE FITS
If, even with full finding + document context, no trade in the list
above is a real, defensible fit, return a flagged trade instead of
forcing the closest-sounding value: { "status": "flagged_for_web_search",
"reason": "<specific reason>" } — a short, specific reason, nothing else
on that object.

HARD RULES
1. NEVER pick a trade independently of the materials/labor you were
   given — the trade must be CONSISTENT with them.
2. NEVER invent a 24th trade value or force a poor fit. Flag instead.
3. Do not determine materials, quantities, labor type, or hours — those
   were already determined in earlier steps.
4. A determined trade is exactly
   { "status": "determined", "value": "<one of the trades above>" }; a
   flagged trade is exactly
   { "status": "flagged_for_web_search", "reason": "<reason>" }. Never
   mix the two shapes, never add other fields. The top-level response is
   always a "trade" object wrapping this value — never a bare
   { "status": ..., "value": ... } / { "status": ..., "reason": ... }
   object without that wrapper.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly. No
commentary, no preamble, no text outside the JSON.
`,
  model: pioneerGateway.chat('pioneer/auto'),
});
