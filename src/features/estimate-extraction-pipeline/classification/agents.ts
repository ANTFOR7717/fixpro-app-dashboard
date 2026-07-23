import { Agent } from '@mastra/core/agent';
import { pioneerGateway } from '../shared/gateway';
import { documentLookupTool } from '../shared/document-lookup-tool';

/**
 * Determines MATERIAL(s), LABOR type, and TRADE for a whole batch of
 * findings in one call — replaces the prior three separate agents
 * (materials/labor/trade), which cost up to 4 LLM round trips per
 * finding for a determination this single call now makes in 1-2 round
 * trips per BATCH of findings (see finding-workflow.ts's `BATCH_SIZE`).
 *
 * Internal to the classification module — only `classification/index.ts`
 * re-exports this, for Studio registration only. Composed via a
 * hand-rolled `execute()` in `finding-workflow.ts` (the documented Rule 1
 * exception for `structuredOutput.model` — a separate, tools-free model
 * that turns this agent's already-completed tool-calling turn into
 * schema-conformant JSON).
 */
export const classifyFindingsBatchAgent = new Agent({
  id: 'Classify Findings Batch',
  name: 'Classification Agent',
  tools: { documentLookupTool },
  instructions: `
You determine MATERIAL(s), LABOR type, and TRADE for MULTIPLE findings at
once.

INPUT: a list of findings, each with its own id, scope, location,
descriptionQuote, recommendation, status. Call document-lookup for any
finding where these aren't clear on their own — it works the same for
every finding in the batch.

For EACH finding independently, determine:

MATERIALS: physical, purchasable parts (board, fixture, pipe, shingles).
Labor-only work = empty array, never invented.

LABOR: a short, specific description ("siding repair labor").

TRADE: choose exactly one — electrical, plumbing, hvac, fire_protection,
roofing, foundation, excavation_grading, landscaping, fencing,
mold_remediation, pest_control, general_contractor. Everything
general/multi-trade (masonry, carpentry, drywall, painting, flooring,
tile, insulation, siding, glazing, waterproofing, concrete work) is
general_contractor — the expected, common case. Trade must be
CONSISTENT with the materials/labor you determined FOR THAT SAME
FINDING — never cross-reference a different finding's materials/labor.

RULES
1. Never invent an unsupported material.
2. Empty materials array is valid.
3. Never invent a 13th trade value.
4. Return EXACTLY one classification per finding given, in the same
   order, tagged with its own findingId — never merge, skip, or reorder
   findings.

Return { "classifications": [{ "findingId": "<id>", "materials":
["<name>", ...], "laborType": "<description>", "trade": "<trade>" },
...] }. No text outside the JSON.
`,
  model: () => pioneerGateway().chat('deepseek-ai/DeepSeek-V4-Flash'),
});
