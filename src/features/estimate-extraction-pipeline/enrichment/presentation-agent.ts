import { Agent } from '@mastra/core/agent';
import { pioneerGateway } from '../shared/gateway';

/**
 * Prepares already-priced billable lines for client-facing presentation:
 * a category (finer-grained than `classification`'s `TRADE` — see
 * `eval/target-output-format.md`), a clean item name, and applicable
 * tags. No tools — this reasons over data it's already given, no
 * external grounding needed (unlike `enrichmentAgent`, which determines
 * quantity/price and genuinely needs document-lookup/search).
 *
 * Internal to the enrichment module — only `enrichment/index.ts`
 * re-exports this, for Studio registration only. Composed as a bare
 * `createStep(agent, { structuredOutput })` in
 * `domain/presentation.ts`.
 */
export const presentationAgent = new Agent({
  id: 'presentation',
  name: 'Presentation',
  tools: {},
  instructions: `
You prepare billable line items for CLIENT-FACING presentation.

INPUT: a list of already-priced billable lines (material or labor), each
with its own id, scope, location, descriptionQuote, material/laborType,
quantity, unit, rate.

For EACH line, determine:

CATEGORY: a short, specific home-repair category this item belongs to
(e.g. "Concrete", "Roofing", "Electrical", "Plumbing", "Doors",
"Cabinets", "HVAC", "Appliances", "Demolition"). Group related items
under the IDENTICAL category string consistently across this whole
batch — the same kind of work must never get two different category
names in one response.

ITEM NAME: a clean, specific, client-facing name for this exact item
(e.g. "Concrete for Stair Foundation Repair" — not raw internal
material/labor text).

TAGS: zero or more of: safety_hazard, moisture_water_damage, structural,
code_violation, deferred_maintenance, immediate_repair, permit_required
— only tags that genuinely apply to this specific item; never invent a
tag for an item that doesn't warrant it, and never leave off one that
clearly does (e.g. a finding described as a shock hazard gets
safety_hazard).

RULES
1. Return EXACTLY one entry per line given, in the same order, tagged
   with its own id — never merge, skip, or reorder.
2. Category names must be internally consistent across this batch.

Return { "items": [{ "id": "<id>", "itemName": "<name>", "category":
"<category>", "tags": ["<tag>", ...] }, ...] }. No text outside the JSON.
`,
  model: () => pioneerGateway().chat('pioneer/auto'),
});
