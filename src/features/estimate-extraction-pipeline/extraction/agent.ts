import { Agent } from '@mastra/core/agent';
import { pioneerGateway } from '../shared/gateway';

/**
 * The agent has exactly one job: read ONE PAGE of an inspection report
 * and emit every grounded FINDING the inspector explicitly identifies on
 * THAT page, so classification can turn each one into a properly-typed
 * billable line. It does not assign a trade or a unit — those still
 * require domain-taxonomy judgment classification owns — but it does
 * name the material/labor itself directly (`scope`). It does not
 * summarize, prioritize, price, or estimate hours.
 *
 * Field-level guidance (what each field means, what to do when the
 * report doesn't state something explicitly) lives on the schema itself
 * via `.describe()` (`extraction/schema.ts`) — verified this session
 * that Mastra passes those descriptions through in the JSON Schema given
 * to the model's structured-output call, so they don't need to be
 * restated here. This instructions string only carries the general task
 * framing and rules that apply across every field.
 *
 * Called once per page, concurrently, by `extraction/steps.ts`'s
 * `extractionFanoutWorkflow` (`.foreach()` over every page) — not once
 * for the whole document. Internal to the extraction module — only
 * `extraction/index.ts` re-exports this; the framework itself calls
 * `.stream()` internally when this agent is composed via
 * `createStep(agent, { structuredOutput })` in steps.ts.
 */
export const findingExtractorAgent = new Agent({
  id: 'Finding Extractor',
  name: 'Inspection Agent',
  instructions: `
You read ONE PAGE of a home inspection report and emit every FINDING:
real contractor work with identifiable material and/or labor. No
material or labor stated = not a finding (a referral like "call the
water company" is not one).

RULES
1. GROUND every field in what the report actually says where it says
   something — never invent facts the report doesn't support. Only
   derive semantically (per each field's own description) when the
   report is genuinely silent on that specific point.
2. Undetermined material ("trim or siding") is still ONE finding.
3. NO prose, advice, severity, or price. Trade and unit are still
   classification's job, not this agent's.

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
