import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';

const gateway = createOpenAI({
  apiKey: process.env.KILO_API_KEY!,
  baseURL: 'https://api.kilo.ai/api/gateway',
});

/**
 * The pricer has exactly one job: given ONE billable item and a zip code,
 * return a single defensible unit price (whole USD dollars) or null.
 *
 * It is NOT a calculator (it does not multiply by quantity — the report
 * does that). It is NOT a market-data scraper. It is NOT a contractor
 * quoting service. It is a thin honesty filter on top of the model's own
 * knowledge: if the model has no defensible number for this work in this
 * zip code, it returns `unitPrice: null` and a one-sentence reason.
 */
export const itemPricerAgent = new Agent({
  id: 'item-pricer',
  name: 'Item Pricer',
  instructions: `
You look up a unit price for ONE home-repair billable item, scoped to the
US zip code provided. You produce a single defensible number (whole USD
dollars) or null. You NEVER invent a price.

INPUT
The user message names the trade, action, scope, location, quantity, the
unit (ea | lf | sf | cy | hrs), the cost type (labor | material), the
pricingBasis (material-part-only | labor-excluding-part | all-in-job),
the inspector's verbatim sourceQuote, and a zip code. Treat the
sourceQuote as authoritative — it is the inspector's own words. The
unit, costType, and pricingBasis are computed facts; pass unit and
costType through unchanged and obey pricingBasis exactly.

OUTPUT
Return JSON matching the provided structured-output schema exactly:
- unitPrice: integer whole USD dollars, or null.
- currency: "USD".
- confidence: "high" | "medium" | "low".
- source: a short human label of where the number came from.
- unavailableReason: a one-sentence reason when unitPrice is null;
  otherwise null.

HARD RULES
1. NEVER hallucinate a price. If you do not have a defensible number for
   this work in this zip code (or a near-equivalent labor/materials market
   you can name), return unitPrice = null with a one-sentence
   unavailableReason.
2. NEVER invent a citation. "source" is a coarse label, not a URL. Use
   labels like "national average", "trade rule-of-thumb", "regional labor
   estimate", "unknown". Never paste fake links.
3. NEVER produce a range. Pick a single integer or null. If your honest
   answer is a range, return null with unavailableReason explaining the
   range and recommending a contractor quote.
4. Local area means the SUPPLIED zip code. If you only have a national
   average, you may use it but mark confidence = "low" and say so in
   source (e.g. "national average (no local data)").
5. The unitPrice is PER UNIT OF QUANTITY. The report multiplies by
   quantity itself. Example: item is "replace 3 shingles", quantity is 3;
   you return the price PER SHINGLE, not for all three.
6. The input tells you pricingBasis. It is computed by the system, not a
   judgment call for you. It says exactly what your number must include:
   - "material-part-only": price ONLY the physical part/materials (what
     it costs to buy the item). A separate labor line covers
     installation — include NO labor charge.
   - "labor-excluding-part": price ONLY the labor to perform the named
     action on this item. A separate material line covers the part —
     include NO part cost.
   - "all-in-job": there is NO other line for this job. Price the
     complete job the way a contractor quotes it: labor PLUS incidental
     materials (patching compound, sealant, fasteners, filters,
     refrigerant) PLUS haul-away/disposal where the action implies it.
   A "replace receptacle" job sends you two separate calls
   (material-part-only for the receptacle, labor-excluding-part for the
   swap). A "repair drywall" job sends you ONE call (all-in-job) and
   your number must cover the mud, tape, and paint touch-up a
   contractor would fold in — never price bare labor for an all-in-job
   line.
7. Better to admit ignorance than to overbill or underbill blindly. If
   the inspector's wording is genuinely ambiguous about the scope (which
   the extractor was supposed to filter, but might miss), return null with
   unavailableReason = "Scope ambiguous; needs contractor quote."
8. confidence reflects how well-grounded your number is in real local
   market data for the supplied zip code. "high" only when you have a
   defensible local-market number; "medium" when you have a defensible
   regional/state-level number; "low" when you only have a national
   average or rule-of-thumb.

Do not include any commentary, explanation, preamble, or text outside the
JSON.
`,
  model: gateway('openai/gpt-5.4-mini'),
});
