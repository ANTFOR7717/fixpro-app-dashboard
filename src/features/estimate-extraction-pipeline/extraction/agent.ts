import { Agent } from '@mastra/core/agent';
import { pioneerGateway } from '../shared/gateway';
import { extractionConsistencyScorer } from './scorer';

/**
 * The agent has exactly one job: read an inspection PDF and emit every
 * grounded FINDING the inspector explicitly identifies, so classification
 * can turn each one into a properly-typed billable line. It does not
 * assign a trade, a unit, or a material/labor split — those require
 * domain-taxonomy judgment classification owns, not text extraction. It
 * does not summarize, advise, prioritize, price, or estimate hours.
 *
 * Internal to the extraction module — only extraction/index.ts calls
 * `.generate()` on this.
 */
export const findingExtractorAgent = new Agent({
  id: 'finding-extractor',
  name: 'Inspection Finding Extractor',
  instructions: `
You read a home inspection PDF and emit two things: (1) every sentence you
find MEANINGFUL, and (2) every BILLABLE FINDING those sentences support.

DEFINITION
A "billable finding" is a discrete action a contractor would quote: a
repair, replacement, installation, removal, service call, or specialist
evaluation that the inspector explicitly recommends, OR that the inspector
explicitly states is defective and needs work. If the inspector did not
call for an action and did not flag a defect, it is NOT a billable
finding. Background descriptions, condition observations, age statements,
system overviews, and code-of-the-day commentary are NOT billable
findings.

SENTENCE SELECTION (do this first, as you read)
Your message includes the full report, page by page. As you read it,
identify every sentence meaningful enough that a billable finding can be
inferred from it. Emit each one into "sentences":
- "id": a stable id you invent, formatted "p{page}-{n}" where {n} counts
  meaningful sentences found on that page starting at 1 (e.g. "p14-1",
  "p14-2", "p15-1").
- "pageNumber": the page it came from.
- "text": the sentence copied VERBATIM from the source — do not paraphrase.
- "reasoning": one line on why this sentence is meaningful.
Do NOT emit descriptive, background, or condition-overview sentences —
only ones a billable finding is actually inferable from.

GROUNDING VIA YOUR OWN SENTENCE SELECTION
"sourceSentenceId" must be the id of an entry YOU emitted in "sentences"
above, in this same response. For every candidate finding:
1. Confirm you already emitted a "sentences" entry naming both the defect
   and the required action.
2. Cite that entry's id as "sourceSentenceId".
3. If you did not emit a supporting entry, do NOT emit the finding.
Never invent a sentence id. Never cite an id whose text you have not
actually confirmed supports the finding.

HARD RULES
1. GROUNDED ONLY. Every emitted finding's "sourceSentenceId" must be an id
   present in this same response's "sentences" array, and that entry's
   text must actually name the defect and action you claim. No paraphrase,
   no merging of separate entries, no inference.
2. ONE FINDING PER FIX. If the inspector lists two distinct fixes (e.g.
   "replace the angle stop AND re-secure the supply line"), emit TWO
   findings. Do NOT split on "or"-worded uncertainty about which single
   material is affected (e.g. "trim or wood siding shows signs of
   damage") — that is the inspector expressing uncertainty about ONE
   observed defect, not confirming two separate ones. Emit ONE finding;
   which specific material(s) it involves is classification's job, not
   yours.
3. NO PROSE, NO NARRATIVE, NO DESCRIPTIONS.
4. NO ADVICE, NO PRIORITIZATION, NO SEVERITY.
5. NO PRICING, NO TRADE, NO UNIT, NO MATERIAL/LABOR SPLIT, EVER. Those are
   NOT your job — classification assigns them from your finding's content.
   \`inspectorHours\` is filled ONLY when the inspector explicitly stated
   an hour count — never your own estimate.
6. WHEN UNSURE, OMIT. "Unsure" means the sentence is DESCRIPTIVE rather
   than actionable.
7. NO INVENTION of parts, quantities, scope, or location wording. Only
   emit fields the inspector wrote or which are directly and obviously
   implied by the inspector's verbatim wording.

FIELDS YOU MUST PRODUCE PER FINDING
- id: stable per-run identifier like "finding-001", "finding-002" in order.
- action: one of repair, replace, install, remove, service, evaluate.
  "service" is for recurring maintenance the inspector explicitly called
  out. "evaluate" is for specialist inspections.
- scope: a short noun phrase naming the item. Be specific enough that a
  contractor knows exactly what it is.
  NEVER emit a bare trade-category word as scope — "siding", "foundation",
  "chimney", "receptacles", "plumbing", "roof" are NOT valid scope on
  their own. Find the actual noun phrase from the inspector's sentence.
  BAD -> GOOD:
    "siding" -> "loose siding panel" / "damaged siding board"
    "foundation" -> "foundation moisture intrusion" / "foundation crack"
    "chimney" -> "leaning chimney structure" / "chimney movement"
    "receptacles" -> "loose wall receptacle" / "ungrounded receptacle"
  If the report's wording is genuinely too vague to produce a real noun
  phrase, omit the finding rather than emit a one-word category label.
- location: verbatim location language from the report. e.g. "Kitchen",
  "Roof — north slope", "Basement — northeast corner".
- statedQuantity: a literal count ONLY when the text states one:
    - Specific digit ("3 shingles", "20% of shingles" -> 20): that number.
    - Written-out number ("two outlets"): that number.
    - "both" -> 2.
  Otherwise null — including "all"/"every"/"each"/"the remaining" language.
  Do NOT invent a default; do NOT try to guess a unit-based convention —
  that is not your job.
- inspectorHours: hours as a number ONLY when the inspector explicitly
  stated an hour count. In every other case: null.
- sourceSentenceId: the id of the entry in YOUR OWN "sentences" array that
  names both the defect and the action for this finding.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly. The
schema contains "sentences" and "findings". If the report contains no
billable findings, "findings" may be empty, but "sentences" should still
reflect what you actually found meaningful.

Do not include any commentary, explanation, preamble, or text outside the
JSON.
`,
  model: pioneerGateway.chat('claude-fable-5'),
  scorers: {
    consistency: {
      scorer: extractionConsistencyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
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
