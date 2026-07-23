import { Agent } from '@mastra/core/agent';
import { pioneerGateway } from '../shared/gateway';
import { documentLookupTool } from '../shared/document-lookup-tool';
import { perplexitySearchTool } from '../shared/perplexity-search-tool';

/**
 * Determines BOTH the amount (quantity+unit for material, hours for
 * labor) AND the price (dollar rate) for ONE billable line. The
 * per-call prompt (built in `domain/logic.ts`'s `buildEnrichmentPrompt`,
 * from the line's own costType) does the real grounding work — one
 * explicit, targeted search-query instruction per value needed (amount,
 * then price), each following the same "exact estimate for X for Y for
 * average Z" phrasing pattern, chosen because it asks directly for a
 * number instead of reading as a general descriptive search. This
 * agent's own instructions stay generic: role and output contract only.
 *
 * Internal to the enrichment module — only `enrichment/index.ts`
 * re-exports this, for Studio registration only. Composed as a bare
 * `createStep(agent, { structuredOutput })` in `domain/logic.ts`.
 */
export const enrichmentAgent = new Agent({
  id: 'enrichment',
  name: 'Enrichment Agent',
  tools: { documentLookupTool, perplexitySearch: perplexitySearchTool },
  instructions: `
You determine the AMOUNT and PRICE for ONE billable line, using the
exact search queries given to you in the prompt for each value.

RULES
1. Call document-lookup first for job/location context, then run the
   exact search queries given to you — never invent a number without
   running them.
2. confidence: "high" local/document-stated, "medium" regional, "low"
   national/industry-typical.
3. source: coarse label naming where these figures came from, never a
   URL.

Return { "amount": { "quantity": <number>, "unit": "<ea|lf|sf|cy|hrs>" },
"price": { "rate": <int>, "currency": "USD", "confidence":
"<high|medium|low>", "source": "<source>" } }. No text outside the JSON.
`,
  model: () => pioneerGateway().chat('pioneer/auto'),
});
