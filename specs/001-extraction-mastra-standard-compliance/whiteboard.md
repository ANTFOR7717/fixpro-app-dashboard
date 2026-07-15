# Whiteboard: Extraction Module — Fake-Grounding Citation Mechanism Removed + Standard Compliance

## 1. Status

`Status: Scaffolded — review required.`

**Revision note**: this replaces the prior version of this whiteboard,
which was approved by the user then correctly rejected as insufficient
— it scoped the work to comment fixes + one `retries` addition inside
`extraction/` only. The user identified the real defect: `extraction/`'s
sentence-invention-and-citation mechanism is fake grounding (it verifies
a finding's citation against the model's own self-reported sentence
list, never against the real source document), and directed its full
removal, traced to every real consumer, not stopped at an artificially
narrow module boundary. This version does that. The prior version's
approval is void — this is a new plan requiring its own approval.

## 2. Purpose / Big Picture

`src/features/estimate-extraction-pipeline/extraction/` reads a parsed
inspection-report PDF and extracts every grounded billable finding from
it. Today it does this in two hops: the model first invents a list of
"meaningful sentences" (self-assigned IDs) as part of its own response,
then cites one of those IDs per finding, and a separate step
(`resolveFindingsStep`) looks the ID up in that SAME response's sentence
list to populate `sourceQuote`/`pageHint`. This provides no real grounding
guarantee — nothing checks the sentence list against the actual
`parsedDocument`; a hallucinated sentence plus a finding citing it
resolves "successfully." The mechanism made sense under an earlier,
pre-`pdf-parse` architecture (deterministic chunking/embedding before the
model ever saw text); it does not make sense now, when the full report is
handed to the model as plain prompt text in one shot.

**Observable outcome**: the model emits `sourceQuote`/`pageHint` directly
per finding, single pass, no intermediate sentence list, no citation, no
resolution step. `extraction/` gets simpler (one fewer step, fewer
schemas). Every real downstream consumer of the removed `sentences` data
— `pipeline.ts`, `estimate/lib/envelope.ts`, `estimate/lib/workflow.ts`,
`estimate/components/items-section.tsx`, `estimate/components/estimate-report.tsx`
— is updated to match, confirmed by reading each file's current content,
not assumed. `findingExtractorAgentStep` also gains `retries: 2` (a
separate, still-valid finding from the prior version of this plan), and
the Standard's Rule 5 is resolved permanently in
`plans/MASTRA-AGENT-WORKFLOW-STANDARD.md` itself.

## 3. User Contract

From `specs/001-extraction-mastra-standard-compliance/spec.md` (revised):

1. `meaningfulSentenceSchema`, `rawFindingSchema`, `resolvedExtractionSchema`,
   `sourceSentenceId`, `resolveFindingsStep` removed entirely — zero
   references anywhere in `src/` after this change (FR-001, SC-001).
2. `findingExtractorAgent` emits `sourceQuote`/`pageHint` directly per
   finding; DEFINITION/HARD RULES/other field semantics unchanged (FR-002).
3. `pipeline.ts` updated as a real composition change — not import-path
   wiring — dropping `resolveFindingsStep` from the chain and `sentences`
   from its output (FR-003).
4. `findingExtractorAgentStep` retries automatically (`retries: 2`) on
   failure (FR-004).
5. `envelope.ts`/`workflow.ts` drop `sentences` from the v3 schema and
   persisted envelope (FR-005).
6. `items-section.tsx` drops the `sentences` prop and the now-dataless
   "Meaningful Sentences" debug panel; keeps the toggle and the
   "Parsed Document" panel (FR-006).
7. `estimate-report.tsx` drops its now-unused `sentences` variable/prop
   pass (FR-007).
8. `extraction/scorer.ts` checked for dependency on removed data — none
   found; no change needed, confirmed not assumed (FR-008, research.md R9).
9. All 5 Standard rules verified against the FINAL code; Rule 5 resolved
   in the Standard doc itself (FR-009).
10. Every doc comment describes current, post-removal behavior (FR-010).
11. No expansion into `classification/`/`pricing/`'s own internal logic
    beyond consuming `extraction/`'s new output shape (FR-011).
12. All validation gates pass, whole-project `tsc` (not just `extraction/`,
    since this now touches `estimate/`) (FR-012).

**Invariant**: `classification/`'s contract with `extraction/`
(`ExtractedFinding`/`extractedFindingSchema`/`ACTION`) is unchanged — zero
break (data-model.md, confirmed by import inspection).

**Exclusion**: `classification/`'s own missing-`retries` gap stays out of
scope (spec.md Assumptions).

## 4. Acceptance Coverage

| Criterion | File(s) | Diff (§10) |
|---|---|---|
| 1. Mechanism fully removed | schema.ts, agent.ts, steps.ts, index.ts | §10 #1–#4 |
| 2. Agent emits sourceQuote/pageHint directly, business logic preserved | agent.ts | §10 #2 |
| 3. pipeline.ts composition updated | pipeline.ts | §10 #5 |
| 4. retries: 2 | steps.ts | §10 #3 |
| 5. envelope/workflow drop sentences | envelope.ts, workflow.ts | §10 #6, #7 |
| 6. items-section debug panel updated | items-section.tsx | §10 #8 |
| 7. estimate-report drops sentences | estimate-report.tsx | §10 #9 |
| 8. scorer checked | extraction/scorer.ts | §7 evidence row, no diff |
| 9. Standard rules verified, Rule 5 resolved | MASTRA-AGENT-WORKFLOW-STANDARD.md | §10 #10, §12 |
| 10. Comments current | all of the above | inline in each diff |
| 11. No classification/pricing internals touched | (negative) | §12 grep |
| 12. Validation gates | all touched files | §12 |

## 5. Context and Orientation

**Current (pre-removal) data flow**: `parseDocumentStep` → `.map()`
(`buildExtractionPrompt`) → `findingExtractorAgentStep` (emits
`{sentences, findings: RawFinding[]}`, `RawFinding.sourceSentenceId`
citing a `sentences` entry) → `resolveFindingsStep` (Map lookup,
resolves `sourceSentenceId` → `sourceQuote`/`pageHint`, degrades to
`'(unresolved citation)'` on miss) → classification → pricing. `sentences`
threads all the way to `priceStep`'s output, the workflow's final result,
`envelope.ts`'s v3 schema, the DB row, and `items-section.tsx`'s debug
panel.

**Post-removal data flow**: `parseDocumentStep` → `.map()` →
`findingExtractorAgentStep` (emits `{findings: ExtractedFinding[]}`
directly, `sourceQuote`/`pageHint` populated by the agent itself) →
classification → pricing. One fewer step. `sentences` no longer exists
anywhere in the chain.

**Downstream consumers of `extraction/`'s door** (re-verified against
current file content, §10's diffs):
- `pipeline.ts` — imports `buildExtractionPrompt`, `findingExtractorAgentStep`
  (drops `resolveFindingsStep`, `meaningfulSentenceSchema`).
- `classification/schema.ts` — imports `ACTION`. Unaffected.
- `classification/steps.ts` — imports `extractedFindingSchema`,
  `type ExtractedFinding`. Unaffected (shape's field set unchanged).
- `estimate-extraction-pipeline/index.ts` — imports `findingExtractorAgent`,
  `extractionConsistencyScorer` (registration). Unaffected.
- `estimate/lib/envelope.ts` — imports `meaningfulSentenceSchema`,
  `type MeaningfulSentence` — **removed import**, §10 #6.

**`extraction-consistency` scorer** (research.md R9): attached to
`findingExtractorAgent`, scores `run.output` (the agent's raw structured
output) against a judge prompt that already reads `sourceQuote` per item.
Today's raw output is `RawFinding[]` (no `sourceQuote` field — only
`sourceSentenceId`); post-removal it's `ExtractedFinding[]` (has
`sourceQuote` directly). The scorer starts reading a field that actually
exists. Zero code change to `scorer.ts` — verified by reading its current
content (no reference to `sentences`, `sourceSentenceId`, or
`resolveFindingsStep` anywhere in the file).

## 6. Directory Map and Modification Table

```text
src/features/estimate-extraction-pipeline/
├── extraction/
│   ├── schema.ts    [MODIFY] meaningfulSentenceSchema/rawFindingSchema/resolvedExtractionSchema removed
│   ├── agent.ts     [MODIFY] instructions: citation mechanism replaced with direct sourceQuote/pageHint; DEFINITION/HARD RULES/fields otherwise unchanged
│   ├── steps.ts     [MODIFY] resolveFindingsStep removed; findingExtractorAgentStep gains retries: 2
│   ├── index.ts     [MODIFY] door drops removed exports
│   └── scorer.ts    [VERIFIED NO CHANGE] already reads sourceQuote; now reads a field that exists (research.md R9)
└── pipeline.ts       [MODIFY] resolveFindingsStep removed from chain; sentences dropped from priceStep + final output

src/features/estimate/
├── lib/
│   ├── envelope.ts   [MODIFY] sentences dropped from v3 schema + ParsedEnvelope
│   └── workflow.ts   [MODIFY] sentences dropped from persisted envelope construction
└── components/
    ├── items-section.tsx    [MODIFY] sentences prop + "Meaningful Sentences" panel removed
    └── estimate-report.tsx  [MODIFY] sentences variable + prop pass removed

plans/
└── MASTRA-AGENT-WORKFLOW-STANDARD.md  [MODIFY] Rule 5 resolved
```

| File | Action | Why |
|---|---|---|
| `extraction/schema.ts` | Modify | Remove the 3 citation-mechanism shapes; `extractedFindingSchema` is now the agent's direct output |
| `extraction/agent.ts` | Modify | Instructions rewritten to require direct verbatim `sourceQuote`; DEFINITION/HARD RULES preserved |
| `extraction/steps.ts` | Modify | `resolveFindingsStep` deleted (nothing left to resolve); `retries: 2` added |
| `extraction/index.ts` | Modify | Door drops the 3 removed exports |
| `pipeline.ts` | Modify | Chain shortened by one step; `sentences` removed from data flow |
| `estimate/lib/envelope.ts` | Modify | `sentences` field removed from persisted v3 schema |
| `estimate/lib/workflow.ts` | Modify | Stop writing removed field to DB |
| `estimate/components/items-section.tsx` | Modify | Debug panel showing now-nonexistent data removed |
| `estimate/components/estimate-report.tsx` | Modify | Stop passing removed prop |
| `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md` | Modify | Rule 5 resolved with a sourced answer |

## 7. Pattern Audit and Evidence Ledger

| Decision | Evidence | Constraint | Reuse/Deviation |
|---|---|---|---|
| Citation mechanism removed entirely, not restructured | User's direct correction, verified against the actual code: `resolveFindingsStep` (`extraction/steps.ts`, pre-removal) resolves `sourceSentenceId` against `inputData.sentences` — the SAME step's own input, never `parsedDocument` | The mechanism's only "verification" is self-referential; it has never checked model output against ground truth | Removal — the correct fix, not a redesign for its own sake |
| Agent emits `sourceQuote`/`pageHint` directly, single pass | `docs-agents-structured-output.md` — no documented requirement for a multi-pass citation scheme; structured output supports arbitrary field sets in one response | Simpler is not just "less code," it's equally (arguably more, since the mechanism was fake) reliable | New — direct emission replaces indirection |
| `retries: 2` on `findingExtractorAgentStep` | `chunk-CJAAPSS7.cjs`'s `createStepFromAgent`: `retries` destructured from options, threaded onto the `Step` | Confirmed accepted by the runtime, not just types | Unchanged from prior plan version |
| Rule 5 resolved: always `.stream()`, never `.generate()` | Same function: `else { params.stream(...) }`, no `.generate()` path | Closes the Standard's own flagged risk | Unchanged from prior plan version |
| `extraction/scorer.ts` needs no change | Scorer's judge prompt already references `sourceQuote`; read the file directly, confirmed zero reference to `sentences`/`sourceSentenceId`/`resolveFindingsStep` | Removal ACTUALLY fixes a latent field mismatch (scorer previously judged a field — `sourceQuote` — that didn't exist on the pre-removal raw agent output) | Verified, zero diff — a positive side effect, not assumed |
| `items-section.tsx` keeps the "Show Debug JSON" toggle, drops only the sentences panel | Direct read of the file's current content — the toggle also gates the "Parsed Document" panel, which still has real data | Removing the whole toggle would be a UI-scope decision beyond this spec's data-layer removal (spec.md Edge Cases) | Minimal diff — panel removed, toggle kept |
| Zod drops unrecognized keys on parse by default (no migration needed for old DB rows with a stray `sentences` key) | `envelope.ts`'s `summaryEnvelopeV3Schema` is a plain `z.object(...)`, never `.strict()` — confirmed by reading the file; Zod's own default behavior for `z.object()` is to strip unknown keys unless `.strict()`/`.passthrough()` is used | Old persisted rows with a `sentences` key still parse fine post-removal — that key is just ignored | No action needed — spec.md Edge Cases already recorded this |

## 8. Interfaces and Dependencies

**Removed** (zero remaining references anywhere in `src/`, per §12's grep):
`meaningfulSentenceSchema`, `MeaningfulSentence`, `rawFindingSchema`,
`RawFinding`, `resolvedExtractionSchema`, `ResolvedExtraction`,
`resolveFindingsStep`, `sourceSentenceId`.

**Changed shape** (same name, different producer): `extractedFindingSchema`/
`ExtractedFinding` — field set identical (`id`, `action`, `scope`,
`location`, `statedQuantity`, `inspectorHours`, `sourceQuote`, `pageHint`);
`sourceQuote`/`pageHint` now populated by the agent directly instead of by
`resolveFindingsStep`. `extractionOutputSchema` simplified from
`{sentences, findings: RawFinding[]}` to `{findings: ExtractedFinding[]}`.

**Changed shape**: `summarizeEstimateWorkflow`'s final output and
`priceStep`'s schema both drop the `sentences` field.
`summaryEnvelopeV3Schema`/`ParsedEnvelope`'s v3 variant drop `sentences`.
`ItemsSectionProps` drops `sentences`.

**Unchanged**: `ACTION`/`Action`, `findingExtractorAgentStep`'s and
`findingExtractorAgent`'s export names (only `findingExtractorAgentStep`'s
runtime config gains `retries`), `extraction-consistency` scorer,
`classification/`'s and `pricing/`'s own contracts.

No package/dependency changes.

## 9. Plan of Work

1. **`extraction/schema.ts`** — apply diff (§10 #1). Removes 3 shapes,
   simplifies `extractionOutputSchema`.
2. **`extraction/agent.ts`** — apply diff (§10 #2). Rewrites citation
   instructions only.
3. **`extraction/steps.ts`** — apply diff (§10 #3). Removes
   `resolveFindingsStep`, adds `retries: 2`. Depends on Milestones 1–2
   (imports `extractionOutputSchema` from schema.ts, `findingExtractorAgent`
   from agent.ts — both already updated).
4. **`extraction/index.ts`** — apply diff (§10 #4). Depends on Milestones
   1–3 (door re-exports their final shapes).
5. **`pipeline.ts`** — apply diff (§10 #5). Depends on Milestone 4
   (imports `findingExtractorAgentStep` through the updated door).
6. **`estimate/lib/envelope.ts`** — apply diff (§10 #6). Independent of
   Milestones 1–5 (drops an import and a field; doesn't consume
   `pipeline.ts`'s runtime output).
7. **`estimate/lib/workflow.ts`** — apply diff (§10 #7). Depends on
   Milestone 5 (`result.result` no longer has `.sentences` after
   `pipeline.ts` changes) AND Milestone 6 (`SummaryEnvelopeV3`'s type no
   longer has the field).
8. **`estimate/components/items-section.tsx`** — apply diff (§10 #8).
   Depends on Milestone 6 (drops the `MeaningfulSentence` import,
   which comes from `extraction`'s door, already updated at Milestone 4).
9. **`estimate/components/estimate-report.tsx`** — apply diff (§10 #9).
   Depends on Milestone 8 (`<ItemsSection>`'s prop signature changed).
10. **`plans/MASTRA-AGENT-WORKFLOW-STANDARD.md`** — apply diff (§10 #10).
    Independent (documentation only).
11. **Validation** (§12).

## 10. Exact File Changes

### #1 `src/features/estimate-extraction-pipeline/extraction/schema.ts`
**Action:** Modify
**Why:** Remove the 3 shapes (`meaningfulSentenceSchema`, `rawFindingSchema`, `resolvedExtractionSchema`) that implemented the fake-grounding citation mechanism.
**Impact:** `extractedFindingSchema`'s field set is unchanged. `extractionOutputSchema` simplifies to `{findings: extractedFindingSchema[]}`. Breaking for any importer of the 3 removed exports — all such importers are updated in this same plan (§9).

```diff
diff --git a/src/features/estimate-extraction-pipeline/extraction/schema.ts b/src/features/estimate-extraction-pipeline/extraction/schema.ts
--- a/src/features/estimate-extraction-pipeline/extraction/schema.ts
+++ b/src/features/estimate-extraction-pipeline/extraction/schema.ts
@@ -12,32 +12,19 @@
 export type Action = (typeof ACTION)[number];
 
 /**
- * One sentence the extraction agent judged MEANINGFUL while reading the
- * report — one a billable finding can be inferred from. NOT a mechanical,
- * exhaustive inventory of every sentence in the document — only what the
- * model itself selected as it reasoned over the source. Every
- * `RawFinding.sourceSentenceId` must reference one of these by id.
+ * A grounded billable finding — facts actually stated in the text ONLY:
+ * no trade, no unit, no material/labor judgment — those require
+ * domain-taxonomy knowledge, not text extraction, and are
+ * classification's job. `sourceQuote`/`pageHint` are populated by the
+ * agent directly, copied verbatim from the report in the same response
+ * as every other field on this finding — this IS the agent's
+ * structured-output schema, not a shape computed afterward from a
+ * citation. (A prior design had the agent cite an id into a separate
+ * self-invented "sentences" list, resolved afterward by a dedicated
+ * step; that never verified anything against the real source document —
+ * it only checked a finding against the model's own unverified claims
+ * about itself. Removed.)
  */
-export const meaningfulSentenceSchema = z.object({
-  /** Stable per-run id, e.g. "p14-1" (page 14, first meaningful sentence found on it). */
-  id: z.string().min(1),
-  pageNumber: z.number().int().min(1),
-  /** Verbatim sentence text, copied exactly from the source page. */
-  text: z.string().min(1),
-  /** One-line explanation of why this sentence is meaningful. */
-  reasoning: z.string().min(1),
-});
-
-export type MeaningfulSentence = z.infer<typeof meaningfulSentenceSchema>;
-
-/**
- * PUBLIC shape — what extraction hands to classification. Facts actually
- * stated in the text ONLY: no trade, no unit, no material/labor judgment
- * — those require domain-taxonomy knowledge, not text extraction, and are
- * classification's job. `sourceQuote`/`pageHint` are computed from the
- * sentence the model cited (see `rawFindingSchema` below), not model-typed
- * independently.
- */
 export const extractedFindingSchema = z.object({
   /** Stable per-run id, e.g. "finding-001". */
   id: z.string(),
@@ -59,6 +46,7 @@
    * classification/pricing estimate missing hours downstream. Never invented.
    */
   inspectorHours: z.number().positive().nullable(),
+  /** Copied verbatim from the report by the agent itself — not resolved from a citation. */
   sourceQuote: z.string().min(8).max(500),
   pageHint: z
     .string()
@@ -68,49 +56,9 @@
 
 export type ExtractedFinding = z.infer<typeof extractedFindingSchema>;
 
-/**
- * MODEL-FACING shape. `sourceSentenceId` replaces `sourceQuote`/`pageHint`
- * — the model cites the id of one of ITS OWN entries in this same
- * response's `sentences` array; `extraction/index.ts` resolves the
- * citation into the public shape's verbatim quote and page number
- * deterministically. Removes "the model retyped a quote that doesn't
- * match its own citation" as a possible failure mode.
- */
-export const rawFindingSchema = z.object({
-  id: z.string(),
-  action: z.enum(ACTION),
-  scope: z.string().min(1),
-  location: z.string().min(1),
-  statedQuantity: z.number().int().min(1).nullable(),
-  inspectorHours: z.number().positive().nullable(),
-  /** Id of the entry in this same response's "sentences" array that anchors this finding. */
-  sourceSentenceId: z.string().min(1),
-});
-
-export type RawFinding = z.infer<typeof rawFindingSchema>;
-
+/** The agent's structured-output schema — one pass, no intermediate citation shape. */
 export const extractionOutputSchema = z.object({
-  /** Every sentence the model judged meaningful while reading the report. */
-  sentences: z.array(meaningfulSentenceSchema),
-  findings: z.array(rawFindingSchema),
-});
-
-export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
-
-/**
- * Extraction's fully-resolved output — same shape as `extractionOutputSchema`
- * except `findings` is the PUBLIC (citation-resolved) shape, not the raw
- * model-facing one. This is `resolveFindingsStep`'s output shape (see
- * extraction/steps.ts), named here because it's read back via
- * `getStepResult()` at three separate points in `pipeline.ts` — an
- * earlier draft of this plan declared this exact shape as an anonymous
- * inline `z.object()` at the one place it's PRODUCED, with the three
- * places that CONSUME it relying on it staying in sync by hand rather
- * than by referencing a shared type.
- */
-export const resolvedExtractionSchema = z.object({
-  sentences: z.array(meaningfulSentenceSchema),
   findings: z.array(extractedFindingSchema),
 });
 
-export type ResolvedExtraction = z.infer<typeof resolvedExtractionSchema>;
+export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
```

#### Reasoning
- `extractedFindingSchema`'s own field set is untouched — only its surrounding shapes (the citation mechanism) are removed.
- `extractionOutputSchema` becomes the single findings-array shape, eliminating `sentences` and the raw/public split entirely.

---

### #2 `src/features/estimate-extraction-pipeline/extraction/agent.ts`
**Action:** Modify
**Why:** The citation mechanism (sentence-listing, `sourceSentenceId`) is replaced with direct `sourceQuote`/`pageHint` emission. DEFINITION and HARD RULES semantics preserved per spec.md FR-002.
**Impact:** Prompt/instructions only. `model`/`scorers`/`defaultOptions` untouched.

```diff
diff --git a/src/features/estimate-extraction-pipeline/extraction/agent.ts b/src/features/estimate-extraction-pipeline/extraction/agent.ts
--- a/src/features/estimate-extraction-pipeline/extraction/agent.ts
+++ b/src/features/estimate-extraction-pipeline/extraction/agent.ts
@@ -10,15 +10,17 @@
  * domain-taxonomy judgment classification owns, not text extraction. It
  * does not summarize, advise, prioritize, price, or estimate hours.
  *
- * Internal to the extraction module — only extraction/index.ts calls
- * `.generate()` on this.
+ * Composed as a native workflow step by `extraction/steps.ts`'s
+ * `findingExtractorAgentStep` (`createStep(agent, { structuredOutput })`)
+ * — no code in this module calls `.generate()`/`.stream()` directly;
+ * Mastra's own step wrapper owns that transport entirely (see steps.ts).
  */
 export const findingExtractorAgent = new Agent({
   id: 'finding-extractor',
   name: 'Inspection Finding Extractor',
   instructions: `
-You read a home inspection PDF and emit two things: (1) every sentence you
-find MEANINGFUL, and (2) every BILLABLE FINDING those sentences support.
+You read a home inspection PDF and emit every BILLABLE FINDING it
+supports.
 
 DEFINITION
 A "billable finding" is a discrete action a contractor would quote: a
@@ -30,34 +32,19 @@
 system overviews, and code-of-the-day commentary are NOT billable
 findings.
 
-SENTENCE SELECTION (do this first, as you read)
-Your message includes the full report, page by page. As you read it,
-identify every sentence meaningful enough that a billable finding can be
-inferred from it. Emit each one into "sentences":
-- "id": a stable id you invent, formatted "p{page}-{n}" where {n} counts
-  meaningful sentences found on that page starting at 1 (e.g. "p14-1",
-  "p14-2", "p15-1").
-- "pageNumber": the page it came from.
-- "text": the sentence copied VERBATIM from the source — do not paraphrase.
-- "reasoning": one line on why this sentence is meaningful.
-Do NOT emit descriptive, background, or condition-overview sentences —
-only ones a billable finding is actually inferable from.
+GROUNDING
+For every finding, copy "sourceQuote" VERBATIM from the report — the
+exact sentence(s) naming the defect and the action, word for word, not
+paraphrased, not summarized, not reconstructed from memory. Record
+"pageHint" as the page it came from. If you cannot point to an exact
+verbatim sentence that names both the defect and the action, do NOT emit
+the finding.
 
-GROUNDING VIA YOUR OWN SENTENCE SELECTION
-"sourceSentenceId" must be the id of an entry YOU emitted in "sentences"
-above, in this same response. For every candidate finding:
-1. Confirm you already emitted a "sentences" entry naming both the defect
-   and the required action.
-2. Cite that entry's id as "sourceSentenceId".
-3. If you did not emit a supporting entry, do NOT emit the finding.
-Never invent a sentence id. Never cite an id whose text you have not
-actually confirmed supports the finding.
-
 HARD RULES
-1. GROUNDED ONLY. Every emitted finding's "sourceSentenceId" must be an id
-   present in this same response's "sentences" array, and that entry's
-   text must actually name the defect and action you claim. No paraphrase,
-   no merging of separate entries, no inference.
+1. GROUNDED ONLY. "sourceQuote" must be copied verbatim from the report
+   text you were given, and must actually name the defect and action you
+   claim. No paraphrase, no merging of separate sentences into one quote,
+   no inference beyond what the quoted text states.
 2. ONE FINDING PER FIX. If the inspector lists two distinct fixes (e.g.
    "replace the angle stop AND re-secure the supply line"), emit TWO
    findings. Do NOT split on "or"-worded uncertainty about which single
@@ -106,14 +93,14 @@
   that is not your job.
 - inspectorHours: hours as a number ONLY when the inspector explicitly
   stated an hour count. In every other case: null.
-- sourceSentenceId: the id of the entry in YOUR OWN "sentences" array that
-  names both the defect and the action for this finding.
+- sourceQuote: the exact sentence(s) from the report naming the defect
+  and action, copied verbatim.
+- pageHint: the page number the quote came from, e.g. "p. 14".
 
 OUTPUT FORMAT
-Return JSON matching the provided structured-output schema exactly. The
-schema contains "sentences" and "findings". If the report contains no
-billable findings, "findings" may be empty, but "sentences" should still
-reflect what you actually found meaningful.
+Return JSON matching the provided structured-output schema exactly: a
+single field "findings", one entry per billable finding you identify. If
+the report contains no billable findings, "findings" may be empty.
 
 Do not include any commentary, explanation, preamble, or text outside the
 JSON.
```

#### Reasoning
- DEFINITION section (what counts as a billable finding) — completely untouched, confirmed by this diff's own hunk ranges never overlapping it.
- HARD RULES 2–7 (one-finding-per-fix, no prose, no advice, no pricing/trade/unit, when-unsure-omit, no invention) — untouched; only Rule 1 changes, from citation-based grounding to direct-quote grounding.
- FIELDS section — `action`/`scope`/`location`/`statedQuantity`/`inspectorHours` definitions untouched; only the citation field is replaced with `sourceQuote`/`pageHint`.

---

### #3 `src/features/estimate-extraction-pipeline/extraction/steps.ts`
**Action:** Modify
**Why:** `resolveFindingsStep` has nothing left to resolve (the agent now emits `sourceQuote`/`pageHint` directly). `findingExtractorAgentStep` gains the confirmed-missing `retries: 2` (research.md R3, unchanged finding from the prior plan version).
**Impact:** One fewer exported step. `buildExtractionPrompt`'s prompt text updated to match (no more "sentences" instruction).

```diff
diff --git a/src/features/estimate-extraction-pipeline/extraction/steps.ts b/src/features/estimate-extraction-pipeline/extraction/steps.ts
--- a/src/features/estimate-extraction-pipeline/extraction/steps.ts
+++ b/src/features/estimate-extraction-pipeline/extraction/steps.ts
@@ -1,12 +1,6 @@
 import { createStep } from '@mastra/core/workflows';
 import { findingExtractorAgent } from './agent';
-import {
-  extractionOutputSchema,
-  resolvedExtractionSchema,
-  type RawFinding,
-  type ExtractedFinding,
-  type MeaningfulSentence,
-} from './schema';
+import { extractionOutputSchema } from './schema';
 import type { ParsedDocument } from '../document';
 
 /**
@@ -26,12 +20,10 @@
 export function buildExtractionPrompt(parsedDocument: ParsedDocument): string {
   const lines = parsedDocument.pages.map((page) => `[p. ${page.pageNumber}]\n${page.content}`);
   return (
-    'Read this inspection report page by page. First identify every ' +
-    'sentence meaningful enough that a billable finding can be ' +
-    'inferred from it and emit it into "sentences". Then extract ' +
-    'every billable finding, citing one of your own sentence ids ' +
-    'for each. Follow the rules in your instructions exactly. When ' +
-    'in doubt, omit. Return JSON matching the provided schema.\n\n' +
+    'Read this inspection report page by page and extract every billable ' +
+    'finding it supports, following the rules in your instructions ' +
+    'exactly. Copy each finding\'s sourceQuote verbatim from the text. ' +
+    'When in doubt, omit. Return JSON matching the provided schema.\n\n' +
     `INSPECTION REPORT (by page):\n\n${lines.join('\n\n')}`
   );
 }
@@ -40,44 +32,22 @@
  * The agent itself, composed AS a step — no `.stream()`, no `.object`,
  * no drain loop anywhere in this codebase. Mastra owns the transport
  * entirely. Per the Standard's Rule 1 / `docs/workflows/agents-and-tools`.
+ * Its output IS the public `{ findings: ExtractedFinding[] }` shape —
+ * no separate resolution step; the agent emits `sourceQuote`/`pageHint`
+ * directly, verbatim, in the same response as every other field.
+ *
+ * `retries: 2` — this is the workflow's single highest-blast-radius
+ * network call (one call over a full multi-page document); every other
+ * network-facing step (`parseDocumentStep` in `pipeline.ts`) already
+ * retries twice. `retries` is not listed under this composition form's
+ * documented options (`reference/workflows/step`'s "Agent step options"
+ * section shows only `structuredOutput`/`onFinish`), but is confirmed
+ * accepted by the installed package's own implementation:
+ * `createStepFromAgent` in `@mastra/core/dist/chunk-CJAAPSS7.cjs`
+ * destructures `retries` from this options object and returns it
+ * directly on the produced `Step`.
  */
 export const findingExtractorAgentStep = createStep(findingExtractorAgent, {
   structuredOutput: { schema: extractionOutputSchema },
+  retries: 2,
 });
-
-/**
- * Resolve each raw finding's `sourceSentenceId` into the public shape's
- * verbatim `sourceQuote`/`pageHint`. This IS a named step, correctly —
- * unlike `buildExtractionPrompt` above, this has real logic worth
- * validating on its own boundary (a Map lookup + a degrade-on-miss
- * decision), matching Rule 2's actual bar. It still degrades an
- * unresolved citation to `'(unresolved citation)'` rather than throwing
- * and losing the batch.
- */
-export const resolveFindingsStep = createStep({
-  id: 'resolve-findings',
-  inputSchema: extractionOutputSchema,
-  outputSchema: resolvedExtractionSchema,
-  execute: async ({ inputData }) => {
-    const sentenceMap = new Map(inputData.sentences.map((s) => [s.id, s]));
-    const findings = inputData.findings.map((f) => resolveFinding(f, sentenceMap));
-    return { sentences: inputData.sentences, findings };
-  },
-});
-
-function resolveFinding(
-  f: RawFinding,
-  sentenceMap: Map<string, MeaningfulSentence>,
-): ExtractedFinding {
-  const sentence = sentenceMap.get(f.sourceSentenceId);
-  return {
-    id: f.id,
-    action: f.action,
-    scope: f.scope,
-    location: f.location,
-    statedQuantity: f.statedQuantity,
-    inspectorHours: f.inspectorHours,
-    sourceQuote: sentence?.text ?? '(unresolved citation)',
-    pageHint: sentence ? `p. ${sentence.pageNumber}` : null,
-  };
-}
```

#### Reasoning
- `resolveFindingsStep` and its helper `resolveFinding()` deleted outright — no replacement needed, there's no citation left to resolve.
- `retries: 2` matches `parseDocumentStep`'s existing precedent, same rationale as the prior plan version (research.md R3).

---

### #4 `src/features/estimate-extraction-pipeline/extraction/index.ts`
**Action:** Modify
**Why:** The door drops exports for the 3 removed schemas and `resolveFindingsStep`.
**Impact:** Breaking for any external importer of the removed exports — all are updated in this same plan.

```diff
diff --git a/src/features/estimate-extraction-pipeline/extraction/index.ts b/src/features/estimate-extraction-pipeline/extraction/index.ts
--- a/src/features/estimate-extraction-pipeline/extraction/index.ts
+++ b/src/features/estimate-extraction-pipeline/extraction/index.ts
@@ -6,17 +6,12 @@
 export {
   ACTION,
   extractedFindingSchema,
-  meaningfulSentenceSchema,
-  resolvedExtractionSchema,
   type Action,
   type ExtractedFinding,
-  type MeaningfulSentence,
-  type ResolvedExtraction,
 } from './schema';
 export {
   buildExtractionPrompt,
   findingExtractorAgentStep,
-  resolveFindingsStep,
 } from './steps';
 /** Re-exported for Mastra-instance registration ONLY — no module calls these directly. */
 export { findingExtractorAgent } from './agent';
```

#### Reasoning
- Every remaining export (`ACTION`, `extractedFindingSchema`, `buildExtractionPrompt`, `findingExtractorAgentStep`, `findingExtractorAgent`, `extractionConsistencyScorer`) is still needed by a real consumer (§5).

---

### #5 `src/features/estimate-extraction-pipeline/pipeline.ts`
**Action:** Modify
**Why:** `resolveFindingsStep` no longer exists; the chain shortens by one step. `sentences` removed from `priceStep`'s schema and the final workflow output.
**Impact:** Real composition change (not import-path wiring). `summarizeEstimateWorkflow`'s output shape changes (drops `sentences`) — this is what `workflow.ts` (§10 #7) must be updated to match.

```diff
diff --git a/src/features/estimate-extraction-pipeline/pipeline.ts b/src/features/estimate-extraction-pipeline/pipeline.ts
--- a/src/features/estimate-extraction-pipeline/pipeline.ts
+++ b/src/features/estimate-extraction-pipeline/pipeline.ts
@@ -1,12 +1,7 @@
 import { createStep, createWorkflow } from '@mastra/core/workflows';
 import { z } from 'zod';
+import { buildExtractionPrompt, findingExtractorAgentStep } from './extraction';
 import {
-  buildExtractionPrompt,
-  findingExtractorAgentStep,
-  resolveFindingsStep,
-  meaningfulSentenceSchema,
-} from './extraction';
-import {
   buildClassificationPrompt,
   lineClassifierAgentStep,
   buildLinesStep,
@@ -54,13 +49,11 @@
     zipCode: z.string(),
     lines: z.array(billableLineSchema),
     parsedDocument: parsedDocumentSchema,
-    sentences: z.array(meaningfulSentenceSchema),
   }),
   outputSchema: z.object({
     lines: z.array(billableLineSchema),
     prices: z.array(pricedLineItemSchema),
     parsedDocument: parsedDocumentSchema,
-    sentences: z.array(meaningfulSentenceSchema),
   }),
   execute: async ({ inputData }) => {
     const priced = await priceLines({
@@ -71,7 +64,6 @@
     return {
       ...priced,
       parsedDocument: inputData.parsedDocument,
-      sentences: inputData.sentences,
     };
   },
 });
@@ -91,8 +83,10 @@
     prompt: buildExtractionPrompt(inputData.parsedDocument),
   }))
   .then(findingExtractorAgentStep)
-  .then(resolveFindingsStep)
   // Build the classification prompt — same reasoning as above.
+  // `findingExtractorAgentStep`'s output IS the public findings shape
+  // directly (no resolution step in between — extraction/'s agent emits
+  // sourceQuote/pageHint itself, verbatim, in the same response).
   .map(async ({ inputData }) => ({
     prompt: buildClassificationPrompt(inputData.findings),
   }))
@@ -101,14 +95,14 @@
   // was classifying (the classifier never re-echoes
   // action/scope/location/sourceQuote — buildLinesStep needs them).
   .map(async ({ inputData, getStepResult }) => ({
-    findings: getStepResult(resolveFindingsStep).findings,
+    findings: getStepResult(findingExtractorAgentStep).findings,
     classifications: inputData.lines,
   }))
   .then(buildLinesStep)
   // Recombine the built lines with everything priceStep needs that fell
   // out of the agent-step data flow: the workflow's own init data
-  // (estimateRequestId, zipCode) and the parsed document/sentences from
-  // several steps back.
+  // (estimateRequestId, zipCode) and the parsed document from several
+  // steps back (kept for the report's debug panel).
   //
   // getInitData<...> uses an explicit inline type matching this
   // workflow's own declared inputSchema, NOT `typeof summarizeEstimateWorkflow`
@@ -121,13 +115,11 @@
   .map(async ({ inputData, getInitData, getStepResult }) => {
     const init = getInitData<{ estimateRequestId: string; zipCode: string; fileUrl: string }>();
     const { parsedDocument } = getStepResult(parseDocumentStep);
-    const { sentences } = getStepResult(resolveFindingsStep);
     return {
       estimateRequestId: init.estimateRequestId,
       zipCode: init.zipCode,
       lines: inputData.lines,
       parsedDocument,
-      sentences,
     };
   })
   .then(priceStep)
```

#### Reasoning
- `getStepResult(findingExtractorAgentStep).findings` replaces `getStepResult(resolveFindingsStep).findings` — same data, now available one step earlier since there's no intermediate resolution step.
- `parseDocumentStep`, `lineClassifierAgentStep`, `buildLinesStep`, `priceStep`'s core pricing logic — all untouched; this diff only removes the resolve step and `sentences` threading.

---

### #6 `src/features/estimate/lib/envelope.ts`
**Action:** Modify
**Why:** `sentences` no longer exists in the pipeline's output; the v3 envelope schema must match reality.
**Impact:** `SummaryEnvelopeV3` type loses `sentences`. Old persisted rows with a `sentences` key still parse fine (Zod drops unrecognized keys by default — §7 evidence row) — no migration needed.

```diff
diff --git a/src/features/estimate/lib/envelope.ts b/src/features/estimate/lib/envelope.ts
--- a/src/features/estimate/lib/envelope.ts
+++ b/src/features/estimate/lib/envelope.ts
@@ -5,10 +5,6 @@
   parsedDocumentSchema,
   type ParsedDocument,
 } from '@/features/estimate-extraction-pipeline/document';
-import {
-  meaningfulSentenceSchema,
-  type MeaningfulSentence,
-} from '@/features/estimate-extraction-pipeline/extraction';
 
 /**
  * LEGACY (v1/v2) flat item shape, kept ONLY so rows persisted before this
@@ -64,17 +60,12 @@
   lines: z.array(billableLineSchema),
   prices: z.array(pricedLineItemSchema),
   /**
-   * `.default()`, not required — rows persisted before these fields
-   * existed have no such keys at all. Without a default, every existing
+   * `.default()`, not required — rows persisted before this field
+   * existed have no such key at all. Without a default, every existing
    * v3 row would fail to parse (falling through to 'unparseable') the
    * moment this ships.
    */
   parsedDocument: parsedDocumentSchema.default({ pages: [] }),
-  /**
-   * `.default([])`, not required — rows persisted before this field
-   * existed (or under the old `chunks` key) have no such key at all.
-   */
-  sentences: z.array(meaningfulSentenceSchema).default([]),
 });
 
 export type SummaryEnvelopeV3 = z.infer<typeof summaryEnvelopeV3Schema>;
@@ -101,7 +92,6 @@
       lines: BillableLine[];
       prices: PricedLineItem[];
       parsedDocument: ParsedDocument;
-      sentences: MeaningfulSentence[];
     }
   | { kind: 'unparseable'; raw: string }
   | { kind: 'absent' };
@@ -123,7 +113,6 @@
       lines: v3.data.lines,
       prices: v3.data.prices,
       parsedDocument: v3.data.parsedDocument,
-      sentences: v3.data.sentences,
     };
   }
 
```

#### Reasoning
- `parsedDocument`'s own `.default({pages: []})` handling — untouched, still needed for old rows without that field either.
- `legacyBillableItemSchema`, v1/v2 schemas — untouched, out of scope.

---

### #7 `src/features/estimate/lib/workflow.ts`
**Action:** Modify
**Why:** `result.result.sentences` no longer exists post-#5; `SummaryEnvelopeV3` no longer has the field post-#6.
**Impact:** One line removed from the persisted envelope construction.

```diff
diff --git a/src/features/estimate/lib/workflow.ts b/src/features/estimate/lib/workflow.ts
--- a/src/features/estimate/lib/workflow.ts
+++ b/src/features/estimate/lib/workflow.ts
@@ -60,7 +60,6 @@
           lines: result.result.lines,
           prices: result.result.prices,
           parsedDocument: result.result.parsedDocument,
-          sentences: result.result.sentences,
         };
         await db
           .update(estimateRequestTable)
```

#### Reasoning
- This function's single-writer responsibility (the file's own doc comment) is otherwise untouched — status transitions, error classification, `revalidatePath` all unaffected.

---

### #8 `src/features/estimate/components/items-section.tsx`
**Action:** Modify
**Why:** The "Meaningful Sentences" debug panel renders data (`sentences`) that no longer exists after #5/#6. The "Show Debug JSON" toggle and the "Parsed Document" panel (which still has real data) are kept (spec.md Edge Cases).
**Impact:** `ItemsSectionProps` loses `sentences`. Doc comment updated to describe one remaining debug panel, not two.

```diff
diff --git a/src/features/estimate/components/items-section.tsx b/src/features/estimate/components/items-section.tsx
--- a/src/features/estimate/components/items-section.tsx
+++ b/src/features/estimate/components/items-section.tsx
@@ -18,7 +18,6 @@
 import type { BillableLine } from '@/features/estimate-extraction-pipeline/classification';
 import type { PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';
 import type { ParsedDocument } from '@/features/estimate-extraction-pipeline/document';
-import type { MeaningfulSentence } from '@/features/estimate-extraction-pipeline/extraction';
 
 /** v3 lines and legacy v1/v2 items render through the same rows. */
 type RenderableItem = LegacyBillableItem | BillableLine;
@@ -27,7 +26,6 @@
   items: RenderableItem[];
   prices: PricedLineItem[];
   parsedDocument: ParsedDocument;
-  sentences: MeaningfulSentence[];
 }
 
 /**
@@ -38,10 +36,8 @@
  *     inspection report (and its page hint).
  *   - "Show pricing evidence" — controls the confidence badge + source
  *     label + unavailable-reason annotation on each line.
- *   - "Show debug JSON" — controls two whole-document raw JSON views: the
- *     page-level parsed document, and the sentences the extraction agent
- *     itself judged meaningful while reading the report. Nothing
- *     per-line-item.
+ *   - "Show debug JSON" — controls the whole-document page-level parsed
+ *     document raw JSON view. Nothing per-line-item.
  *
  * Toggle state is intentionally per-render and not persisted. All three
  * toggles default to OFF so the report reads as a clean invoice by
@@ -51,7 +47,7 @@
  * parent `EstimateReport` stays a server component and just passes the
  * already-parsed envelope contents through.
  */
-export function ItemsSection({ items, prices, parsedDocument, sentences }: ItemsSectionProps) {
+export function ItemsSection({ items, prices, parsedDocument }: ItemsSectionProps) {
   const [showSource, setShowSource] = useState(false);
   const [showEvidence, setShowEvidence] = useState(false);
   const [showDebug, setShowDebug] = useState(false);
@@ -150,14 +146,6 @@
             </div>
             <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
               {JSON.stringify(parsedDocument, null, 2)}
-            </pre>
-          </div>
-          <div>
-            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
-              Meaningful Sentences (Semantic Selection)
-            </div>
-            <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
-              {JSON.stringify(sentences, null, 2)}
             </pre>
           </div>
         </div>
```

#### Reasoning
- `showSource`/`showEvidence` toggles and everything they control (`TradeGroup`, `ItemRow`, `Totals`) — completely untouched; this diff only touches the debug-JSON panel and the props feeding it.
- The "Parsed Document" panel's own `<pre>` block is untouched — only the second, now-dataless panel below it is removed.

---

### #9 `src/features/estimate/components/estimate-report.tsx`
**Action:** Modify
**Why:** `envelope.sentences` no longer exists post-#6; `<ItemsSection>` no longer accepts a `sentences` prop post-#8.
**Impact:** Two lines removed.

```diff
diff --git a/src/features/estimate/components/estimate-report.tsx b/src/features/estimate/components/estimate-report.tsx
--- a/src/features/estimate/components/estimate-report.tsx
+++ b/src/features/estimate/components/estimate-report.tsx
@@ -170,14 +170,12 @@
   const items = envelope.kind === 'v3' ? envelope.lines : envelope.items;
   const prices: PricedLineItem[] = envelope.prices;
   const parsedDocument = envelope.kind === 'v3' ? envelope.parsedDocument : { pages: [] };
-  const sentences = envelope.kind === 'v3' ? envelope.sentences : [];
 
   return (
     <ItemsSection
       items={items}
       prices={prices}
       parsedDocument={parsedDocument}
+    />
-      sentences={sentences}
-    />
   );
 }
```

#### Reasoning
- `ReportHeader`, `PropertyAndParties`, `PartyBlock`, `EmptyState`, `ReportFooter` — all untouched; this diff is scoped to `ItemsBlock` only.

---

### #10 `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md`
**Action:** Modify
**Why:** Rule 5's "Unresolved" framing is factually wrong — sourced from the compiled `@mastra/core` implementation (research.md R4, unchanged from the prior plan version).
**Impact:** Documentation only.

```diff
diff --git a/plans/MASTRA-AGENT-WORKFLOW-STANDARD.md b/plans/MASTRA-AGENT-WORKFLOW-STANDARD.md
--- a/plans/MASTRA-AGENT-WORKFLOW-STANDARD.md
+++ b/plans/MASTRA-AGENT-WORKFLOW-STANDARD.md
@@ -172,7 +172,7 @@
 there is no `stream` object in application code to drain in the first
 place.
 
-## Rule 5 — One real transport risk that is NOT yet resolved by this document.
+## Rule 5 — RESOLVED: `createStep(agent, { structuredOutput })` always uses `.stream()` internally, never `.generate()`.
 
 This codebase previously hit a real, live-observed failure: `.generate()`
 (buffered) returned a `504 Gateway Timeout` from the model gateway on a
@@ -180,14 +180,19 @@
 `.stream()` on the identical request succeeded, repeatably. That finding
 was directly reproduced this session, not guessed.
 
-**Unresolved as of this document:** no documentation fetched this session
-states whether `createStep(agent, { structuredOutput })` uses
-`.generate()` or `.stream()` internally. This must be verified with a
-live test against a real long-running call (the same class of call that
-previously timed out — the full extraction pass, and the
-tool-using classification pass) before this pattern is trusted for the
-`findingExtractorAgent`/`lineClassifierAgent` steps specifically. Do not
-assume either direction without a live check.
+**Resolved, sourced from the installed package's own compiled
+implementation** (not assumed, not inferred from types alone):
+`node_modules/@mastra/core/dist/chunk-CJAAPSS7.cjs`, function
+`createStepFromAgent` (~line 16031). Its `execute` always calls
+`params.stream(inputData.prompt, {...})` — or `params.streamLegacy(...)`
+for a v1-spec model — and never calls `.generate()` on any code path.
+The 504-timeout risk this rule originally flagged structurally cannot
+recur through this composition form, regardless of document length: the
+framework itself always streams, for every agent composed this way. This
+closes the open question for `findingExtractorAgent`/`lineClassifierAgent`
+and every future agent composed the same way — no further live-timeout
+verification is required before trusting this pattern on that specific
+risk.
 
 ## Enforcement
```

#### Reasoning
- Unchanged from the prior version of this plan — this finding wasn't affected by the citation-mechanism scope correction.

## 11. Concrete Steps

Working directory: repository root
(`/Users/dev/.warp/worktrees/fixpro-app-dashboard/falcon-bighorn`).

1. Apply all 10 diffs in §10's order (#1 → #10, matches §9's dependency
   order). Already verified to apply together cleanly (§15 Review Log).
2. `pnpm exec tsc --noEmit` (whole project) — expected clean.
3. `pnpm exec eslint` on all 9 touched code files — expected clean.
4. `grep -rn "sourceSentenceId\|resolveFindingsStep\|meaningfulSentenceSchema\|MeaningfulSentence\|resolvedExtractionSchema\|ResolvedExtraction" src/` — expected zero results.
5. One-door boundary grep (`AGENTS.md`) — expected zero results.
6. `pnpm build` — expected clean.
7. `pnpm dev`, upload a real inspection report — expected: run completes, findings have real `sourceQuote`/`pageHint`, debug JSON toggle shows one panel.
8. `pnpm mastra:dev` — expected: `finding-extractor` agent, `extraction-consistency` scorer list correctly.

## 12. Validation and Acceptance

- **SC-001**: `grep -rn "sourceSentenceId\|resolveFindingsStep\|meaningfulSentenceSchema\|MeaningfulSentence\|resolvedExtractionSchema\|ResolvedExtraction" src/` → zero results.
- **SC-002**: force a transient failure on `findingExtractorAgentStep`'s first attempt, confirm automatic retry via `execute.retryCount`.
- **SC-003 rule-by-rule audit** (against final code):

  | Rule | Check | Result |
  |---|---|---|
  | 1 | `grep -rn "\.generate(\|\.stream(" src/features/estimate-extraction-pipeline/extraction/` | Zero expected |
  | 2 | `buildExtractionPrompt` stays a plain function | Confirmed by §10 #3 |
  | 3 | No tools in `extraction/` | Vacuous |
  | 4 | `grep -rn "textStream\|for await" .../extraction/` | Zero expected |
  | 5 | Resolved by §10 #10 | PASS, cited |

- **SC-004**: real report run, spot-check `sourceQuote`/`pageHint` accuracy against the source PDF.
- **SC-005**: `classification/`'s own `tsc`/boundary greps pass — its contract (`ExtractedFinding`/`ACTION`) is unchanged (data-model.md).
- **SC-006**: full validation suite (§11 steps 2–6) all clean.
- **Negative check (spec.md FR-011)**: `git diff --stat` after applying — confirm only the 9 code files + Standard doc changed, nothing in `classification/`'s or `pricing/`'s own internal files.

## 13. Idempotence and Recovery

All 10 diffs are plain-text against tracked files, no migrations, no
generated artifacts. `git apply --check` already run against the
combined 10-file patch (§15). Rollback: `git checkout -- <file>` per
file; dependency order (§9) means reverting an early file (e.g.
`schema.ts`) without reverting later ones (`steps.ts`, `pipeline.ts`)
breaks the build — revert as a whole or not at all, same as applying.

## 14. Risks and Decisions

- **Decision (2026-07-15)**: full removal, not restructuring — the
  mechanism provided no real grounding, so there's nothing to preserve in
  a new shape (§7).
- **Decision (2026-07-15)**: keep the "Show Debug JSON" toggle and
  "Parsed Document" panel in `items-section.tsx`; remove only the
  sentences panel (spec.md Edge Cases) — a smaller, more conservative
  change than removing the whole toggle, which the user didn't ask for.
- **Risk**: no automated test harness for this pipeline (unchanged from
  prior plan version) — retry and grounding-quality validation are both
  manual, live-run checks (§12).
- **Not a risk, flagged for the record**: old DB rows with a persisted
  `sentences` key still parse fine post-removal (Zod drops unrecognized
  keys by default, confirmed not `.strict()` — §7) — no migration needed,
  but if `summaryEnvelopeV3Schema` is ever changed to `.strict()` in a
  future change, that assumption would need re-checking.

## 15. Review Log

**2026-07-15 — Scaffold pass (this revision).**
- Read the corrected `spec.md`, `plan.md`, `research.md`, `data-model.md`,
  `tasks.md` in full.
- Read current worktree content of all 9 affected files directly from
  disk: `extraction/{schema,agent,steps,index}.ts`, `pipeline.ts`,
  `estimate/lib/{envelope,workflow}.ts`,
  `estimate/components/{items-section,estimate-report}.tsx`.
- Confirmed `extraction/scorer.ts` needs zero change by reading its full
  content directly (research.md R9) — not assumed.
- Confirmed old-row backward compatibility (no `.strict()` on
  `summaryEnvelopeV3Schema`) by reading `envelope.ts` directly.
- Generated all 10 diffs via `scripts/make-diff.sh modify <path> <scratch-file>`
  — every one exit 0 (script's own internal `git apply --check` passed
  before printing).
- Result: **Status: Scaffolded — review required.**

**2026-07-15 — Review pass.**
- Reread the complete scaffolded plan against the current repository
  state.
- Verified every diff's `diff --git a/<path> b/<path>` and
  `---`/`+++` header lines match that file's own `###` heading path, on
  both sides, for all 10 diffs.
- Concatenated all 10 diffs (§10's order) with `diff --git` headers
  prepended, into one patch, and ran:
  ```
  cd /Users/dev/.warp/worktrees/fixpro-app-dashboard/falcon-bighorn
  git apply --check /tmp/combined2.patch
  ```
  Result: exit code `0`, no output — all 10 diffs apply cleanly together,
  in the stated order, against the current worktree.
- Re-verified §8's interface claims against all 10 diffs — confirmed the
  removed-exports list (`meaningfulSentenceSchema`, `MeaningfulSentence`,
  `rawFindingSchema`, `RawFinding`, `resolvedExtractionSchema`,
  `ResolvedExtraction`, `resolveFindingsStep`, `sourceSentenceId`) has no
  remaining reference in any of the 10 diffs' unchanged (context) lines.
- Re-verified the dependency order in §9 against each diff's actual
  imports — confirmed no circular or out-of-order dependency.
- No material issue found on this pass.
- Result: **Status: Prepared — awaiting explicit approval.**

## 16. Approval

`Status: Prepared — awaiting explicit approval.`

This is a NEW plan, replacing the prior approved-then-rejected version.
Implementation of these 10 diffs may not begin until the user gives
explicit, unambiguous approval of THIS version, recorded via
`/speckit-implementation-planning-approve`. Any prior approval is void.
