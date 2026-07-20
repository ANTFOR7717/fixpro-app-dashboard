import { Agent } from '@mastra/core/agent';
import { pioneerGateway } from '../shared/gateway';
import { documentLookupTool } from '../shared/document-lookup-tool';

/**
 * Determines which material(s), if any, a finding involves. Quantity/
 * unit/amount is a later determination, not classification's job — this
 * agent identifies WHAT, never HOW MUCH.
 *
 * Internal to the classification module — only `classification/index.ts`
 * re-exports this, for Studio registration only. Composed as a bare
 * `createStep(agent, { structuredOutput })` in `finding-workflow.ts`.
 */
export const materialsAgent = new Agent({
  id: 'classification-materials',
  name: 'Classification — Material Determination',
  tools: { documentLookupTool },
  instructions: `
You determine a finding's MATERIAL(s) involved.

INPUT: one finding (action, scope, location, sourceQuote). Call
document-lookup if the material isn't clear from the finding alone.

A material is a physical, purchasable part (board, fixture, pipe,
shingles). Labor-only work = empty array, never invented.

RULES
1. Never invent an unsupported material.
2. Empty array is valid.
3. Do not determine labor, trade, quantity, or hours.

Return { "materials": ["<name>", ...] }. No text outside the JSON.
`,
  model: () => pioneerGateway().chat('deepseek-ai/DeepSeek-V4-Flash'),
});

/**
 * Determines a finding's labor type. Hours are a later determination,
 * not classification's job — this agent identifies WHAT, never HOW MUCH.
 *
 * Internal to the classification module — see `materialsAgent`'s own
 * comment for the module-boundary and composition-form reasoning, which
 * applies identically here.
 */
export const laborAgent = new Agent({
  id: 'classification-labor',
  name: 'Classification — Labor Determination',
  tools: { documentLookupTool },
  instructions: `
You determine a finding's LABOR type.

INPUT: one finding (action, scope, location, sourceQuote). Call
document-lookup if the labor type isn't clear from the finding alone.

RULES
1. laborType: a short, specific description ("siding repair labor").
2. Do not determine materials, trade, quantity, or hours.

Return { "laborType": "<description>" }. No text outside the JSON.
`,
  model: () => pioneerGateway().chat('deepseek-ai/DeepSeek-V4-Flash'),
});

/**
 * Determines the trade associated with a finding, derived from the
 * combination of its materials and labor determinations — never an
 * independent first fact. Selected from the closed, sourced 23-value
 * taxonomy in `schema.ts`'s `TRADE`; always a real value from that list
 * — grounding via `documentLookupTool` when materials/labor context
 * alone doesn't make the fit obvious.
 *
 * Internal to the classification module — see `materialsAgent`'s own
 * comment for the module-boundary and composition-form reasoning, which
 * applies identically here.
 */
export const tradeAgent = new Agent({
  id: 'classification-trade',
  name: 'Classification — Trade Determination',
  tools: { documentLookupTool },
  instructions: `
You determine the contractor TRADE from a finding's materials/labor.

INPUT: a finding, plus materials (may be empty) and labor determined.
Call document-lookup for confirming detail.

TRADES (choose exactly one)
electrical, plumbing, hvac, fire_protection, roofing, siding, carpentry,
drywall, flooring, glazing, masonry, painting, insulation, concrete,
waterproofing, tile, foundation, excavation_grading, landscaping,
fencing, mold_remediation, pest_control, general_contractor.

Pick the trade materials/labor genuinely support; "general_contractor"
only for genuinely multi-trade repairs, never a default when unsure.

RULES
1. Trade must be CONSISTENT with materials/labor.
2. Never invent a 24th value.
3. Do not determine materials or hours.

Return { "trade": "<trade>" }. No text outside the JSON.
`,
  model: () => pioneerGateway().chat('deepseek-ai/DeepSeek-V4-Flash'),
});
