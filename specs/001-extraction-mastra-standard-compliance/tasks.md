# Tasks: Extraction Module — Citation Mechanism Removal + Standard Compliance

**Revised 2026-07-15.** Original tasks.md scoped this to 4 files inside
`extraction/`. Corrected scope: removing the fake-grounding citation
mechanism ripples through 9 implementation files plus the Standard doc.
See spec.md's Revision Note and research.md R0/R9.

**Input**: Design documents from `specs/001-extraction-mastra-standard-compliance/`

**Tests**: No formal test runner for this pipeline (unchanged). Validation is static (tsc/eslint/greps/build) plus a live run — Phase 5.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Confirm `pnpm install` current, `.env` has `PIONEER_API_KEY`/`PIONEER_API_URL` set.

---

## Phase 2: Foundational (Blocking Prerequisite)

- [X] T002 Rebuild `src/features/estimate-extraction-pipeline/extraction/schema.ts`: remove `meaningfulSentenceSchema`, `rawFindingSchema`, `resolvedExtractionSchema` and their types entirely. `extractedFindingSchema` becomes the agent's direct structured-output schema (unchanged field set — `sourceQuote`/`pageHint` now agent-populated, not resolved). `extractionOutputSchema` becomes `{ findings: z.array(extractedFindingSchema) }`.

**Checkpoint**: `schema.ts` rebuilt. Everything else can proceed.

---

## Phase 3: User Story 1 — Citation mechanism removed end-to-end (Priority: P1) 🎯

- [X] T003 [US1] Rewrite `extraction/agent.ts`'s `findingExtractorAgent` instructions: remove the "SENTENCE SELECTION" and "GROUNDING VIA YOUR OWN SENTENCE SELECTION" sections; require direct `sourceQuote` (verbatim copied text) and `pageHint` per finding instead of `sourceSentenceId`. DEFINITION, HARD RULES 1–7 (renumbered if needed), and all other per-field semantics (action/scope/location/statedQuantity/inspectorHours) unchanged. `model`/`scorers`/`defaultOptions` unchanged.
- [X] T004 [US1] Rebuild `extraction/steps.ts`: remove `resolveFindingsStep` and its helper `resolveFinding()` function entirely. `buildExtractionPrompt` updated to describe the single-pass extraction (no more "sentences" step). `findingExtractorAgentStep` = `createStep(findingExtractorAgent, { structuredOutput: { schema: extractionOutputSchema }, retries: 2 })` — its output is now `{ findings: ExtractedFinding[] }` directly, ready for `classification/` to consume.
- [X] T005 [US1] Rebuild `extraction/index.ts` (the door): drop `meaningfulSentenceSchema`, `resolvedExtractionSchema`, `resolveFindingsStep`, and their types from exports. Keep `ACTION`, `extractedFindingSchema`, `type ExtractedFinding`, `buildExtractionPrompt`, `findingExtractorAgentStep`, `findingExtractorAgent`, `extractionConsistencyScorer`.
- [X] T006 [US1] Rebuild `estimate-extraction-pipeline/pipeline.ts`: remove `.then(resolveFindingsStep)` from the workflow chain — `findingExtractorAgentStep`'s output feeds the classification `.map()` directly (`inputData.findings` instead of `getStepResult(resolveFindingsStep).findings`). Remove `meaningfulSentenceSchema` import. `priceStep`'s `inputSchema`/`outputSchema` drop `sentences`. The final `.map()` before `priceStep` drops `sentences` from its returned object and the `getStepResult(resolveFindingsStep)` call.
- [X] T007 [US1] Update `estimate/lib/envelope.ts`: drop `sentences` field from `summaryEnvelopeV3Schema`, drop the `meaningfulSentenceSchema`/`MeaningfulSentence` import, drop `sentences` from `ParsedEnvelope`'s `v3` variant and from `parseSummaryEnvelope`'s v3 return.
- [X] T008 [US1] Update `estimate/lib/workflow.ts`: drop `sentences: result.result.sentences` from the constructed `SummaryEnvelopeV3` object.
- [X] T009 [US1] Update `estimate/components/items-section.tsx`: drop the `sentences` prop from `ItemsSectionProps` and the function signature, drop the `MeaningfulSentence` import, drop the "Meaningful Sentences (Semantic Selection)" debug panel `<div>` block. Update the component's doc comment (currently describes "two whole-document raw JSON views") to describe one. Keep the "Show Debug JSON" toggle and the "Parsed Document" panel.
- [X] T010 [US1] Update `estimate/components/estimate-report.tsx`: drop the `sentences` local variable and the `sentences={sentences}` prop pass to `<ItemsSection />`.
- [X] T011 [US1] Verify `extraction/scorer.ts` needs no change (research.md R9 already confirmed this) — re-check during implementation that `run.output.findings[].sourceQuote` is what the judge prompt actually receives post-T004.

**Checkpoint**: Citation mechanism fully removed, all 5 downstream files updated. Zero dangling references to removed exports.

---

## Phase 4: User Story 2 — Standard Rules 1–5 verified against the final code (Priority: P1)

- [X] T012 [US2] Update `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md`'s Rule 5: replace "Unresolved as of this document" with the sourced answer (research.md R4) — `createStep(agent, {...})` always calls `.stream()` internally, cite `createStepFromAgent` in `chunk-CJAAPSS7.cjs`.
- [X] T013 [US2] Rule-by-rule audit against the final code: Rule 1 (`grep` for `.generate(`/`.stream(` in `extraction/` — zero expected), Rule 2 (`buildExtractionPrompt` stays a plain function; no named step reintroduced where a `.map()` suffices), Rule 3 (no tools in `extraction/` — vacuous), Rule 4 (`grep` for `textStream`/`for await` — zero expected), Rule 5 (closed by T012).

---

## Phase 5: Polish & Validation

- [X] T014 [P] `pnpm exec tsc --noEmit` (whole project — this now touches `estimate/` too) — must be clean.
- [X] T015 [P] `pnpm exec eslint` on all 9 touched files — must be clean.
- [X] T016 One-door boundary grep (`AGENTS.md`, extraction line) — zero results.
- [X] T017 Dead-reference grep: `grep -rn "sourceSentenceId\|resolveFindingsStep\|meaningfulSentenceSchema\|MeaningfulSentence\|resolvedExtractionSchema\|ResolvedExtraction" src/` — zero results anywhere (spec.md SC-001).
- [X] T018 `pnpm build` — must be clean.
- [ ] T019 Live verification: real inspection report run, confirm findings have accurate `sourceQuote`/`pageHint` (spot-check against source PDF). Force a transient failure on `findingExtractorAgentStep`, confirm automatic retry.
- [X] T020 `pnpm mastra:dev` — confirm `finding-extractor` agent and `extraction-consistency` scorer still list correctly.
- [ ] T021 Manual UI check: "Show Debug JSON" toggle in the estimate report still works, shows only the "Parsed Document" panel now.

---

## Dependencies & Execution Order

- Setup → Foundational (T002) → US1 (T003–T011, mostly sequential: T003→T004→T005 within `extraction/`, T006 depends on T003–T005's final export shape, T007–T010 depend on T006's `pipeline.ts` output shape being final, T011 is a verification-only task) → US2 (T012–T013, depends on US1 complete) → Polish (T014–T021).
- T014/T015 parallelizable (read-only checks). Everything else sequential — real import/data-flow dependencies, not artificial ordering.

## Notes

- 21 tasks (was 14) — the increase is entirely the correctly-traced blast
  radius (5 additional files in `estimate/`), not scope creep.
- Every task cites a specific research.md finding or spec.md FR.
- Commit after Phase 5 passes in full — intermediate states don't
  typecheck (e.g. `pipeline.ts` alone, before `envelope.ts` catches up,
  would leave `priceStep`'s new output shape mismatched against
  `workflow.ts`'s still-old envelope construction).
