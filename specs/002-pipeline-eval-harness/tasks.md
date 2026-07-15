# Tasks: Estimate-Extraction-Pipeline Accuracy Eval Harness

**Input**: Design documents from `specs/002-pipeline-eval-harness/`

**Tests**: No formal test runner is introduced for this pipeline (unchanged
project precedent, plan.md's own Testing section) — this feature *is* the
test/eval mechanism. Validation is: `tsc`/`eslint`/one-door greps (static),
plus a live run against the real fixture (Phase 6).

**Prerequisites**: plan.md, spec.md, research.md (R1–R8), data-model.md,
quickstart.md — all present and resolved, zero open `[NEEDS
CLARIFICATION]` markers, zero Constitution violations.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [ ] T001 Confirm `pnpm install` current, `.env` has `PIONEER_API_KEY`/`PIONEER_API_URL` set (same precedent as feature 001).
- [ ] T002 Create the directory structure `eval/pipeline/scorers/` and `eval/fixtures/` per plan.md's Project Structure — empty directories only, no code yet.
- [X] T003 [P] Add `"eval:pipeline": "tsx --env-file=.env eval/pipeline/run.ts"` to `package.json`'s `scripts`. (`--env-file` discovered necessary during T022's live run — plain `tsx`, unlike Next.js, does not auto-load `.env`; Node's own built-in flag, no new dependency.)

---

## Phase 2: Foundational (Blocking Prerequisite)

- [ ] T004 Add `TRADE`, `type Trade`, `EXTENT_UNIT`, `type ExtentUnit`, `lineClassificationSchema`, `type LineClassification` to `src/features/estimate-extraction-pipeline/classification/index.ts`'s exports — additive only, no existing export changes. Discovered during whiteboarding: this door does not currently export what this feature's `schema.ts`/`classification-match.ts` genuinely need (Constitution Principle I: the door's export surface catching up to a real new consumer, not a violation of the one-door boundary).
- [ ] T005 Write `eval/pipeline/schema.ts`: `expectedFindingSchema`, `expectedClassificationSchema`, `expectedPricingSchema`, `expectedOutputSchema` (zod), matching data-model.md's `ExpectedOutput` contract exactly — imports `ACTION` from `@/features/estimate-extraction-pipeline/extraction` and `TRADE`/`EXTENT_UNIT` from `@/features/estimate-extraction-pipeline/classification` (through each module's own door, per Constitution Principle I; depends on T004).
- [ ] T006 Write `eval/pipeline/gateway.ts`: the harness's own Pioneer AI gateway instance, mirroring `src/features/estimate-extraction-pipeline/shared/gateway.ts`'s `pioneerGateway` (same env vars, same default base URL) — not imported from there, since `eval/` lives outside the pipeline package and importing a non-door path would violate its one-door boundary.
- [ ] T007 Write `eval/pipeline/fixture-server.ts`: a throwaway `node:http` static file server (research.md R4) exposing `start(dir: string): Promise<{ port: number; stop: () => Promise<void> }>` that serves files under `dir` by filename on an ephemeral local port.
- [ ] T008 Move the specify-phase-staged PDF from `specs/002-pipeline-eval-harness/fixtures/4014-sparrow-house-ln-inspection-report.pdf` to `eval/fixtures/4014-sparrow-house-ln-inspection-report.pdf` (plan.md's Structure Decision — `specs/` is a planning artifact location, `eval/fixtures/` is the runtime one). Plain filesystem move — the file is untracked, no git history to preserve.

**Checkpoint**: shared fixture-authoring contract and local-serving
infrastructure exist. Every user story below builds on these files
without modifying them.

---

## Phase 3: User Story 1 — Catch an accuracy regression before it ships (Priority: P1) 🎯 MVP

**Goal**: A developer runs one command; the real pipeline runs against
the real fixture; the command reports pass/fail for extraction,
classification, and pricing independently.

**Independent Test**: Run `pnpm eval:pipeline` against the current,
working pipeline and confirm the one fixture reports all three stages
passing; then deliberately edit the fixture's `.expected.ts` to require a
finding that doesn't exist in the report, re-run, and confirm the
extraction stage is reported as failed (revert the edit afterward).

- [ ] T009 [P] [US1] Author `eval/fixtures/4014-sparrow-house-ln-inspection-report.expected.ts`: read all 42 pages of the fixture PDF and hand-record its real `zipCode` (20866) plus every ground-truth billable finding/classification/pricing outcome, satisfying `expectedOutputSchema` from T005.
- [ ] T010 [P] [US1] Write `eval/pipeline/scorers/grounding.ts`: deterministic (function-mode, no judge) `createScorer` — for every actual finding, check `parsedDocument.pages.some(p => p.content.includes(finding.sourceQuote))`; return a `GroundingViolation[]` per data-model.md. This is a gate (FR-006). Include a doc comment recording the known NUL-byte/ligature-squishing false-positive risk (whiteboard.md Risks and Decisions) — low priority to fix now, but must be visible in the code, not only in a planning doc.
- [ ] T011 [P] [US1] Write `eval/pipeline/scorers/extraction-recall.ts`: LLM-judge `createScorer` (using `eval/pipeline/gateway.ts` from T006, matching `extraction/scorer.ts`'s existing precedent) — `analyze` step matches every `expected.findings` entry against the actual `ExtractedFinding[]` semantically, `generateScore` returns recall (1.0 only if every expected finding matched), and the scorer's `analyzeStepResult` carries the resolved `label → actual finding id` map plus any unmatched labels, per data-model.md's Cross-stage id resolution. This scorer is a gate (FR-005a). Matching is recall-only — extra, distinct findings beyond what's expected are never penalized; this scorer does not attempt to detect or report duplicate findings, which is explicitly out of scope (not something to build preemptively).
- [ ] T012 [P] [US1] Write `eval/pipeline/scorers/classification-match.ts`: deterministic `createScorer` — given the label→id map (passed in as part of this scorer's `input`) and `LineClassification[]` keyed by `findingId`, compare each expected classification's `trade`/`materialCount`/`materialUnits` against the matched actual entry (research.md R5). Gate (FR-005a).
- [ ] T013 [P] [US1] Write `eval/pipeline/scorers/pricing-match.ts`: deterministic `createScorer` — given the label→id map and `PricedLineItem[]` keyed by `itemId`, compare each expected pricing outcome (`'priced' | 'unavailable'`) against whether the matched actual line(s) have `unitPrice !== null` (research.md R6). Gate (FR-005b).
- [ ] T014 [US1] Write `eval/pipeline/fixtures.ts`: discover `<slug>.pdf` + `<slug>.expected.ts` pairs under `eval/fixtures/`; `expectedOutputSchema.safeParse()` each `.expected.ts`'s default export; return `{ valid: { slug, pdfPath, expected }[], invalid: { slug, reason }[] }` (FR-008, FR-009b) — depends on T005.
- [ ] T015 [US1] Write `eval/pipeline/run.ts`: entry script — parse an optional fixture-slug CLI arg; call `fixtures.ts` (T014); start `fixture-server.ts` (T007) over `eval/fixtures/`; for each valid fixture, call a `runFixture()` function that calls `mastra.getWorkflow('summarize-estimate').createRun()` / `.start({ inputData: { estimateRequestId: slug, fileUrl: \`http://localhost:${port}/${slug}.pdf\`, zipCode: expected.zipCode } })`; per research.md R2/R7, read each relevant step's own `status`/`.output` off the result (never assume the whole result is unusable just because the overall run failed); call each scorer's `.run({ input, output, groundTruth })` in order (grounding → extraction-recall → classification-match → pricing-match) per quickstart.md's sequencing, threading the extraction-recall scorer's label→id map into the two scorers that need it. **`runFixture()` must wrap its entire body in one try/catch and never throw** — any pipeline-level or scorer-level failure is caught and returned as that fixture's own `'run-failed'` outcome with the real error message, so one fixture's failure (including a scorer bug or a transient LLM-judge call failure) never aborts the sweep over the remaining fixtures; the production pipeline being tested matters more than this eval tooling's own scoring correctness. Accumulate one `FixtureOutcome` per fixture (data-model.md) with full per-mismatch diagnostic detail (specific expected label/actual id and field involved, per FR-007); stop the fixture server; print the per-fixture, per-stage report; exit non-zero if any fixture is `invalid`, `run-failed`, or has any gate `false` (FR-011). Depends on T005–T014.

**Checkpoint**: `pnpm eval:pipeline` runs the real pipeline against the
one real fixture and reports pass/fail per stage with full diagnostic
detail. This is a complete, usable tool — not a stripped-down MVP
followed by later diagnostic work, since per-mismatch detail is no
harder to build than bare pass/fail once the comparison logic exists.

---

## Phase 4: User Story 2 — Add a new fixture without touching harness code (Priority: P2)

**Goal**: Confirm the fixture-discovery mechanism genuinely requires zero
harness-code changes to add a new test case, and that a malformed/
incomplete fixture pair is reported distinctly rather than silently
mishandled.

**Independent Test**: Add a new fixture PDF + `.expected.ts` pair with no
other change and confirm it's discovered and evaluated; separately, add a
`.pdf` with no matching `.expected.ts` and confirm it's reported invalid,
not silently skipped or falsely passed.

- [ ] T016 [US2] Verify `fixtures.ts`'s invalid-pair handling end-to-end: temporarily add a `eval/fixtures/tmp-invalid.pdf` with no matching `.expected.ts`, run `pnpm eval:pipeline`, confirm it's reported in the `invalid` category (not crashed on, not silently skipped, not scored) — then remove the temporary file. Fix `fixtures.ts` if this doesn't already hold (FR-009b).
- [ ] T017 [US2] Validation exercise (requires the user to supply a second real inspection-report PDF, same as the first one was sourced): add `eval/fixtures/<new-slug>.pdf` + hand-author `eval/fixtures/<new-slug>.expected.ts`, run `pnpm eval:pipeline` with zero changes to any file under `eval/pipeline/`, and confirm both fixtures are discovered and evaluated in the same run (SC-002).

**Checkpoint**: fixture-set growth is proven to require zero harness-code
changes, and malformed fixtures fail loudly and specifically.

---

## Phase 5: Polish & Validation

- [ ] T018 [P] `pnpm exec tsc --noEmit` (whole project, including the new `eval/` tree) — must be clean.
- [ ] T019 [P] `pnpm exec eslint eval/` — must be clean.
- [ ] T020 One-door boundary grep: `grep -rn "estimate-extraction-pipeline/\(pipeline\|extraction/schema\|extraction/steps\|classification/schema\|classification/steps\|pricing/schema\|pricing/agent\)" eval/` — zero results (the harness only ever imports through each module's own `index.ts` door, per Constitution Principle I).
- [ ] T021 `git status --short src/features/estimate-extraction-pipeline/` — output shows only the additive `classification/index.ts` export change from T004, nothing else (confirms the feature's only pipeline-file touch is that one additive door export, per plan.md's constraint).
- [ ] T022 Live run: `pnpm eval:pipeline` against the real `4014-sparrow-house-ln-inspection-report` fixture. Confirm it completes, reports genuine per-stage pass/fail, and any mismatch it surfaces is investigated and resolved by correcting the fixture's `.expected.ts` (if the harness is right and the fixture's ground truth was wrong) or by treating it as a real finding to fix in the pipeline (if the harness caught a real issue) — not by loosening the scorer to make it pass.
- [ ] T023 Run quickstart.md's "Confirming a real regression is actually caught" scenario (validates SC-003) using a temporary, deliberate fixture edit — revert afterward.

---

## Dependencies & Execution Order

- Setup (T001–T003) → Foundational (T004–T008) → US1 (T009–T015, mostly
  parallel until T014/T015 which depend on everything before them) → US2
  (T016–T017, depends on US1's `fixtures.ts`/`run.ts` existing) → Polish
  (T018–T023, depends on all of the above).
- T009–T013 are parallelizable (five independent files: one fixture data
  file, four scorer files — grounding, extraction-recall,
  classification-match, pricing-match). T011 (extraction-recall) depends
  on T006 (gateway.ts, already done in Foundational), not on any of
  T009/T010/T012/T013. T014 depends on T005. T015 depends on T005–T014
  all being done (it imports and orchestrates every one of them).
- T018/T019 are parallelizable (read-only checks). T020–T023 are
  sequential validation steps, each meaningful only once the prior one
  passes.

## Parallel Example: User Story 1

```bash
# After Foundational (T004-T008) completes, launch these together:
Task: "Author eval/fixtures/4014-sparrow-house-ln-inspection-report.expected.ts"
Task: "Write eval/pipeline/scorers/grounding.ts"
Task: "Write eval/pipeline/scorers/extraction-recall.ts"
Task: "Write eval/pipeline/scorers/classification-match.ts"
Task: "Write eval/pipeline/scorers/pricing-match.ts"
# Then sequentially: fixtures.ts (T014), then run.ts (T015)
```

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Setup (T001–T003) + Foundational (T004–T008).
2. Complete US1 (T009–T015).
3. **Stop and validate**: run `pnpm eval:pipeline`, confirm real pass/fail
   output against the one real fixture.
4. This alone is a usable regression-catching tool — US2 adds robustness
   for fixture-set growth, not core capability.

### Incremental Delivery

1. Foundational → US1 (MVP: one fixture, full per-stage pass/fail with
   diagnostic detail).
2. US2 (prove the fixture-growth story + invalid-fixture handling).
3. Polish (static gates + live validation against the real fixture).

## Notes

- 23 tasks across Setup/Foundational/2 user stories/Polish.
- Every task cites a specific research.md/data-model.md/spec.md FR it
  implements — no task exists without a traceable reason.
- No duplicate-finding detection anywhere in this feature — considered
  during clarification, explicitly removed as speculative, unrequested
  scope. If duplicate findings turn out to be a real, observed problem,
  that gets addressed then, with real evidence, not engineered against
  preemptively now.
- T009's fixture-authoring effort (reading 42 real pages and recording
  ground truth by hand) is real, non-trivial human/AI work — it is not a
  formality, and should not be rushed or approximated; the entire
  feature's value depends on this data being genuinely correct, not just
  present.
- T017 requires a second real PDF the user supplies (same sourcing
  situation as the first fixture) — it cannot be fabricated.
- Commit after each checkpoint, not mid-phase — an in-progress US1 (e.g.
  `run.ts` written but `fixtures.ts` not yet) doesn't produce a runnable
  tool.
