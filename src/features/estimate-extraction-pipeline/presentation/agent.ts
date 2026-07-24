import { Agent } from '@mastra/core/agent';
import { pioneerGateway } from '../shared/gateway';

/**
 * Prepares already-priced billable lines for client-facing presentation:
 * a category (finer-grained than `classification`'s `TRADE` — see
 * `eval/target-output-format.md`) and a clean item name. No tools — this
 * reasons over data it's already given, no external grounding needed
 * (unlike `enrichmentAgent`, which determines quantity/price and
 * genuinely needs document-lookup/search).
 *
 * Internal to the presentation module — only `presentation/index.ts`
 * re-exports this, for Studio registration only. Composed as a bare
 * `createStep(agent, { structuredOutput })` in `workflow.ts`.
 */
export const presentationAgent = new Agent({
  id: 'presentation',
  name: 'Presentation',
  tools: {},
  instructions: `
You prepare billable line items for CLIENT-FACING presentation.

INPUT: a list of already-priced billable lines (material or labor), each
with its own id, scope, location, descriptionQuote, costType,
material/laborType, quantity, unit, rate.

For EACH line, determine:

CATEGORY: a short, specific home-repair category this item belongs to
(e.g. "Concrete", "Roofing", "Chimney", "Fireplace", "Electrical",
"Plumbing", "Doors", "Cabinets", "HVAC", "Appliances", "Demolition").
Pick the SINGLE most specific real category — never invent a compound
category joining two distinct things (e.g. "Fireplace & Chimney") just
because both words appear nearby; a chimney-only line is "Chimney," a
fireplace-only line is "Fireplace," even in the same batch. Use the
IDENTICAL category string for every line that genuinely belongs to the
same one.

ITEM NAME: a short, specific NAME — not a description, not a sentence,
never the reasoning behind the finding (that's what descriptionQuote is
for, it is not repeated here). What counts as the name depends on
costType:
  - costType "material": name the physical material/product
    (e.g. "Wood Filler for Cabinet Repair").
  - costType "labor": name the labor/service being performed
    (e.g. "Chimney Structural Stabilization").
Use descriptionQuote only to make a vague material/laborType more
specific (e.g. "Fireplace and chimney inspection labor" +
descriptionQuote mentioning venting/fire safety becomes "Fireplace Flue
and Venting Inspection") — never to add risk, cause, or severity
commentary into the name itself.

RULES
1. Return EXACTLY one entry per line given, in the same order, tagged
   with its own id — never merge, skip, or reorder.
2. Category names must be internally consistent across this batch, but
   never merged across genuinely different categories.
3. itemName is a name. If you find yourself writing "may," "risk,"
   "could," or a comma-separated clause explaining why — stop, that
   belongs in descriptionQuote, not here.

EXAMPLES

name: "wood filler" (material), descriptionQuote: "Cabinet Damaged" →
itemName: "Wood Filler for Cabinet Repair", category: "Cabinets".

name: "Chimney structural evaluation and stabilization labor" (labor),
descriptionQuote: "...visibly leaning... risk of collapse..." →
correct: itemName "Chimney Structural Stabilization", category
"Chimney".
WRONG: itemName "Leaning Chimney — Structural Evaluation & Stabilization
(Collapse Risk)", category "Fireplace & Chimney" — the risk language
leaked from descriptionQuote into the name, and the category was
invented as a compound instead of the one real bucket.

Return { "items": [{ "id": "<id>", "itemName": "<name>", "category":
"<category>" }, ...] }. No text outside the JSON.
`,
  model: () => pioneerGateway().chat('pioneer/auto'),
});
