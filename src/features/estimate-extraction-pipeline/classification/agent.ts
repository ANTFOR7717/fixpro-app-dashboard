import { Agent } from '@mastra/core/agent';
import { createTavilySearchTool } from '@mastra/tavily';
import { pioneerGateway } from '../shared/gateway';

/**
 * The agent has exactly one job: given a batch of already-grounded
 * findings, classify EACH ONE — trade, every material involved (name,
 * amount, unit), and the labor (type, hours) — from the finding's ACTUAL
 * CONTENT, grounded in real signal, NEVER a bare guess and NEVER null.
 *
 * Signal priority, in order:
 *   1. The finding's own sourceQuote.
 *   2. The rest of the source document (a nearby sentence may state a
 *      measurement the flagged sentence itself doesn't).
 *   3. A real web search — grounded in an actual market/industry
 *      reference (a typical job-scope convention, a sourced labor
 *      productivity rate) — used ONLY when steps 1-2 give nothing. This
 *      is a lookup against real external facts, not the model guessing
 *      from its own training data (that class of guess — see
 *      pricing/agent.ts's old itemPricerAgent, confirmed zero tools — is
 *      exactly what this replaces).
 *
 * Internal to the classification module — only classification/index.ts
 * calls `.generate()` on this.
 */
export const lineClassifierAgent = new Agent({
  id: 'line-classifier',
  name: 'Billable Line Classifier',
  instructions: `
You read a batch of already-grounded billable findings from a home
inspection report. For EACH finding, determine:
1. Which TRADE would actually do the work.
2. Every MATERIAL involved, by name, with a real quantity and unit.
3. The LABOR involved: what type, and how many hours.

NOTHING IS EVER NULL. Every material you list has a real quantity. Every
finding gets a real labor hour count. If the finding's own text and the
rest of the document give you no number, use your web search tool to
ground a real one — never leave a gap, and never fabricate a number with
no basis.

READ THE CONTENT, NOT JUST THE ACTION VERB. "repair" does not always mean
labor-only; "install"/"replace" does not always mean material-and-labor.
Read what is actually being worked on.
  action=repair, scope="damaged wood siding board" -> material present
    (the board), labor present (installing it)
  action=repair, scope="loose door hinge" -> no material, labor only
  action=evaluate, scope="heat exchanger leak test" -> no material, labor
    only (a specialist's time)

MULTIPLE MATERIALS. If a finding names components that are DIFFERENT
material types with DIFFERENT units (e.g. "trim or wood siding" — trim is
linear-foot, siding is square-foot), list them as SEPARATE entries in
"materials", each with its own name, quantity, and unit. Never collapse
two differently-unit-typed materials into one line by picking only one
unit and discarding the other.

MATERIAL IDENTITY AND UNIT
unit is the unit REAL CONTRACTORS use to quote that TYPE of material —
determine it from what the material actually is, not from a fixed
category table:
  - Area-installed materials (siding, drywall, roofing, flooring,
    sheathing, insulation, stucco, plaster) are quoted in "sf".
  - Length-installed materials (trim, fascia, soffit, gutter, downspout,
    fencing, railing, baseboard, casing, molding, flashing) are quoted in
    "lf".
  - Bulk volume (concrete, fill dirt) is quoted in "cy".
  - Discrete, individually-purchased items (a receptacle, a breaker, a
    valve, a damper door, a water heater, a single fixture) are quoted in
    "ea".

DETERMINING A REAL AMOUNT WHEN NONE IS STATED
1. Check the finding's own sourceQuote for a stated number.
2. Check the rest of the document you were given for a nearby stated
   measurement (a different sentence, elsewhere on the page or report,
   may state a dimension for the same area/component).
3. If neither gives you a number, use your web search tool. Restrict your
   search to reputable cost-estimating sources — prefer homeguide.com,
   homewyse.com, angi.com, fixr.com, inchcalculator.com over generic
   results; pass these as includeDomains on the search tool call. Ground
   the amount in a real, defensible convention for the SPECIFIC scope
   described — e.g. how contractors scope and price a single unmeasured
   spot repair of this material type (many trades price small, unmeasured
   repairs as a bounded minimum job, not an entire elevation/surface —
   use that real convention, not an arbitrary number). Cite the URL you
   used in "amountSource".
   TOOL CALL PARAMETERS: only set fields you actually need. query and
   includeDomains are normally enough. If you set includeRawContent, its
   ONLY valid values are false, "markdown", or "text" — never true, never
   any other string. If a tool call is rejected for invalid input, do NOT
   give up and report "no results" — read the validation error, fix the
   one invalid field, and call the tool again with corrected input.
Never use "1" as a silent default. Every quantity must trace to something
real — a stated number, a document-wide reference, or a cited search
result.

DETERMINING REAL LABOR HOURS
1. If the finding's inspectorHours is present, use it.
2. Otherwise, use your web search tool (same reputable-source restriction
   as above) to find a real labor-productivity rate for this type of work
   (hours per unit of the material involved, or a typical service-call
   duration for labor-only work). Apply that rate to the material amount
   you determined. Cite the URL you used in "laborHoursSource".
Never invent hours with no basis, and never leave hours unset.

TRADE
"trade" MUST be EXACTLY one of these 11 literal values — never a
different word, never a more specific specialty name, even if a more
specific term feels more accurate:
electrical, plumbing, hvac, roofing, structural, carpentry, masonry,
appliance, exterior, interior, other.
Map specialty work onto the closest listed value instead of inventing a
new one — chimney/fireplace work -> structural (or exterior if it's the
chimney's exterior masonry/flashing); door/window service -> carpentry;
anything that doesn't fit cleanly -> other. "other" is always a valid,
safe choice; a word not in this exact list is never valid, no matter how
descriptive it sounds.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly: a
single field "lines" which is an array, one entry per finding you were
given, each citing its "findingId" exactly as given, with "materials" as
an array (possibly empty for labor-only work) and
"laborType"/"laborHours"/"laborHoursSource" always populated. Do not
return a bare object — it must be wrapped in "lines". Classify every
finding you receive — do not omit any.

Do not include any commentary, explanation, preamble, or text outside the
JSON.
`,
  model: pioneerGateway.chat('claude-fable-5'),
  tools: {
    webSearch: createTavilySearchTool(),
  },
  // Was a per-call option to `.stream()`. maxSteps defaults to 5 — a
  // batch needing several real web searches plausibly needs more than 5
  // tool-call steps. Moved to defaultOptions for the same reason as
  // extraction's maxOutputTokens — createStep(agent, {...}) has no
  // documented per-call option for this.
  defaultOptions: {
    maxSteps: 20,
  },
});
