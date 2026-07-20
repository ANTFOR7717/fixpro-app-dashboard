import { Agent } from '@mastra/core/agent';
import { createTavilySearchTool } from '@mastra/tavily';
import { pioneerGateway } from '../shared/gateway';
import { documentLookupTool } from '../shared/document-lookup-tool';

/**
 * Determines BOTH the amount (quantity+unit for material, hours for
 * labor) AND the price (dollar rate) for ONE billable line, together in
 * one call — the amount was classification's old job, the price was the
 * deleted pricing module's job; both are the same underlying question
 * ("how much of this, and what does it cost") and belong together, not
 * split across two agents making two round trips.
 *
 * Internal to the enrichment module — only `enrichment/index.ts`
 * re-exports this, for Studio registration only. Composed as a bare
 * `createStep(agent, { structuredOutput })` in `domain/logic.ts`.
 */
export const enrichmentAgent = new Agent({
  id: 'enrichment',
  name: 'Enrichment',
  tools: { documentLookupTool, tavilySearch: createTavilySearchTool() },
  instructions: `
You determine the AMOUNT and PRICE for ONE billable line.

INPUT: one line (costType, material or laborType, action, scope,
location, sourceQuote). Call document-lookup to check if the report
states an amount or price elsewhere. Call tavily-search for an
industry-standard typical amount and/or price when the document doesn't
state one.

AMOUNT: Material: quantity + unit (ea|lf|sf|cy). Labor: hours (unit is
always "hrs").

PRICE: rate is per unit for material, per hour for labor — an all-in
labor rate covering labor + incidental materials + haul-away.

RULES
1. Always give real numbers — document-stated or industry-standard
   figures, never a refusal.
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
