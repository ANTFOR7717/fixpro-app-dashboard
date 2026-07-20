import { Agent } from '@mastra/core/agent';
import { pioneerGateway } from '../shared/gateway';

/**
 * The agent has exactly one job: read ONE PAGE of an inspection report
 * and emit every grounded FINDING the inspector explicitly identifies on
 * THAT page, so classification can turn each one into a properly-typed
 * billable line. It does not assign a trade, a unit, or a material/labor
 * split — those require domain-taxonomy judgment classification owns,
 * not text extraction. It does not summarize, advise, prioritize, price,
 * or estimate hours.
 *
 * Called once per page, concurrently, by `extraction/steps.ts`'s
 * `extractionFanoutWorkflow` (`.foreach()` over every page) — not once
 * for the whole document. Internal to the extraction module — only
 * `extraction/index.ts` re-exports this; the framework itself calls
 * `.stream()` internally when this agent is composed via
 * `createStep(agent, { structuredOutput })` in steps.ts.
 */
export const findingExtractorAgent = new Agent({
  id: 'finding-extractor',
  name: 'Inspection Finding Extractor',
  instructions: `
You read ONE PAGE of a home inspection report (called again per page)
and emit every BILLABLE FINDING it supports: a repair, replacement,
install, removal, service, or specialist evaluation the inspector
explicitly recommends or calls defective. Descriptions and commentary
with no called-for action are NOT findings.

RULES
1. GROUNDED ONLY. sourceQuote must be verbatim, name the defect and
   action itself, never invented, paraphrased, or merged from separate
   sentences.
2. ONE FINDING PER DISTINCT FIX ("replace X AND re-secure Y" = two).
   "Or"-worded material uncertainty ("trim or siding") = ONE finding —
   material ID is classification's job.
3. NO prose, advice, severity, price, trade, unit, or material/labor
   split.
4. WHEN UNSURE (descriptive, not actionable), OMIT.

FIELDS PER FINDING
- id: locally-unique this call ("finding-1") — reassigned globally
  after.
- action: the report's own verb if stated, else the most accurate verb
  it supports.
- scope: a specific noun phrase, never a bare trade word — "loose
  siding panel", not "siding". Too vague: omit.
- location: verbatim location language ("Kitchen", "Roof — north
  slope").
- sourceQuote: the exact verbatim defect+action sentence or clause.
- page: the page number at the top of this prompt, same for every
  finding this call.

Return JSON matching the schema exactly. "findings" may be empty. No
text outside the JSON.
`,
  model: () => pioneerGateway().chat('deepseek-ai/DeepSeek-V4-Flash'),
  // Was passed as a per-call `modelSettings` option to `.stream()`.
  // `createStep(agent, { structuredOutput })` (see steps.ts) has no
  // documented way to pass modelSettings at the call site — this is the
  // one place it can be set with real documented backing
  // (reference/agents/agent's `defaultOptions` field). Still
  // load-bearing: live-verified this session that the default output
  // budget truncates mid-response on a real 40+ page report.
  defaultOptions: {
    modelSettings: { maxOutputTokens: 16000 },
  },
});
