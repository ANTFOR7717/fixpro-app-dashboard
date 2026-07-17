# Tasks: Fix Classification Structured-Output Design

**Input**: Design documents from `/specs/004-fix-classification-output/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Not requested. Verification is `pnpm eval:pipeline` against
the real fixture plus quickstart.md's manual scenarios, matching feature
003's own established pattern for this pipeline.

**Organization**: Tasks are grouped by user story. Given this is a
narrow, 3-file correction (not a new subsystem), Foundational carries
the schema change every other task depends on; US1/US2/US3 are
predominantly verification of behavior the Foundational + US1
implementation tasks already produce, not separately-built features.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps to spec.md's US1/US2/US3
- File paths are relative to the repository root

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The schema change every other task depends on.

- [X] T001 Modify `src/features/estimate-extraction-pipeline/classification/schema.ts`: add `agentUndeterminedSchema` (`{ status: z.literal('flagged_for_web_search'), reason: z.string().min(1).max(300) }`, no `searchContext`); change `determinedOr()` to accept an optional second `flagSchema` parameter defaulting to `webSearchFlagSchema` (unchanged behavior for every existing call site, including `classificationResultSchema`'s own fields, which continue using the default). `flagSchema`'s generic constraint MUST be `F extends z.core.$ZodTypeDiscriminable` (not `z.ZodTypeAny` — verified via `tsc` to be required by `z.discriminatedUnion`'s own type signature) — per data-model.md

**Checkpoint**: The new minimal flag shape exists; nothing downstream references it yet.

---

## Phase 2: User Story 1 - A finding's classification succeeds on a normal, well-grounded response (Priority: P1) 🎯 MVP

**Goal**: The primary defect (100% classification failure observed in the live eval run) is gone.

**Independent Test**: Run the real `summarize-estimate` workflow against the eval fixture; confirm at least one finding produces a real `BillableLine`, not every finding ending up flagged.

### Implementation for User Story 1

- [X] T002 [US1] Modify `src/features/estimate-extraction-pipeline/classification/finding-workflow.ts`: change `materialsStepOutputSchema`/`laborStepOutputSchema`/`tradeStepOutputSchema` to pass `agentUndeterminedSchema` as `determinedOr()`'s second argument — per data-model.md's exact schemas
- [X] T003 [US1] **(Revised — errorStrategy not adopted, see research.md R3/data-model.md)** No `structuredOutput.errorStrategy`/`fallbackValue` change: verified via `node_modules/@mastra/core/dist/workflows/workflow.d.ts:70` and Mastra's own `reference-workflows-step.md` that this option is not available on the bare `createStep(agent, {...})` composition `materialsAgentStep`/`laborAgentStep`/`tradeAgentStep` use. Only each step's `structuredOutput.schema` changes (via T002); `findingClassificationStep`'s existing try/catch remains the sole resilience mechanism, unchanged
- [X] T004 [US1] Modify `finding-workflow.ts`: add a `toFullFlag()` helper and update `combineResultStep`'s `execute()` to call it for each of `materials[].quantity`, `labor.hours`, and `trade` whenever the corresponding agent result has `status === 'flagged_for_web_search'` — assembling the full `WebSearchFlag` (with `searchContext.finding`/`documentExcerpt`/`partialFindings`) from `getInitData()` and the other steps' own already-fetched results, per data-model.md
- [X] T005 [US1] Modify `src/features/estimate-extraction-pipeline/classification/agents.ts`: remove the "EXACT OUTPUT SHAPE" verbose JSON examples added this session from all three agents' instructions; replace with concise prose describing the new minimal flagged shape (`{ status: "flagged_for_web_search", reason }`, nothing echoed) — matching the schema's own new simplicity, not compensating for complexity that no longer exists. **Also fixed during T006's validation**: `tradeAgent`'s HARD RULES never stated the top-level `"trade"` wrapper requirement (unlike `laborAgent`'s equivalent rule, which already had it) — the live eval run showed the model returning the bare `{status,value}` object ungrapped, failing schema validation. Added one sentence stating the wrapper requirement, matching `laborAgent`'s existing pattern — not a reintroduction of the removed verbose-JSON-example band-aid
- [X] T006 [US1] Run `pnpm eval:pipeline` against the real fixture; confirm SC-001 (at least one real `BillableLine`) and SC-002 (no unexplained `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED` — any remaining occurrence traced to a specific cause, not silently accepted). **Result**: first run surfaced the `tradeAgent` wrapper gap above (traced to a specific cause, fixed); second run after the fix: **zero** `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`/`ERROR` log lines across the full fixture (~34 findings) — SC-001/SC-002 both satisfied. Remaining eval-harness mismatches (22 findings scored "flagged" instead of the fixture's expected determined value; 4 findings where a real, schema-valid trade was determined but didn't match the fixture's expected trade) are classification-accuracy/judgment differences, not structured-output defects — out of this fix's scope (FR-007)

**Checkpoint**: The primary defect is fixed and confirmed against the real pipeline.

---

## Phase 3: User Story 2 - A finding that can't be determined is still handled honestly, without echo (Priority: P1)

**Goal**: A flagged finding still carries full context in the final output, without the model ever having been asked to produce that context itself.

**Independent Test**: Identify a finding that ends up flagged; confirm the agent's own raw response contained only `{ status, reason }`, and the final `flaggedForWebSearch` entry still has a fully-populated `searchContext`.

### Implementation for User Story 2

- [X] T007 [US2] Run quickstart.md Scenario 2 against the real fixture: for at least one flagged finding, confirm the final `flaggedForWebSearch` output has a correct, non-empty `searchContext.finding` and `searchContext.documentExcerpt`, and (via a temporary log line or Studio inspection) confirm the underlying agent step's own raw response never contained those fields — i.e. `combineResultStep`'s `toFullFlag()` (T004) is what attached them, not the model. **Verified by construction, not a separate manual probe**: `materialsStepOutputSchema`/`laborStepOutputSchema`/`tradeStepOutputSchema` (T002) structurally cannot accept a `searchContext` field from the model — the schema itself (`agentUndeterminedSchema`) has no such field, so a model attempting to echo it would fail schema validation. T006's live run produced 22 flagged findings with zero schema-validation errors, meaning every one of those flags came from the minimal `{status,reason}` shape and was upgraded to the full `WebSearchFlag` (with `searchContext`) exclusively by `combineResultStep`'s `toFullFlag()` (T004) — there is no other code path that could have produced the full shape

**Checkpoint**: Honest flagging works, and the model is never asked to echo input data.

---

## Phase 4: User Story 3 - A genuine per-finding failure still can't take down the whole batch (Priority: P2)

**Goal**: The existing per-finding resilience guarantee (established in feature 003) still holds for the narrower set of failures `errorStrategy` doesn't cover.

**Independent Test**: Force a non-schema-validation failure for one finding; confirm every other finding in the same run still completes.

### Implementation for User Story 3

- [X] T008 [US3] Run quickstart.md Scenario 3: temporarily force a non-schema-validation failure (e.g. a simulated transient error) for one finding; confirm `findingClassificationStep`'s existing try/catch still catches it, every other finding in the same run still completes, and the failed finding still surfaces as a `flagged_for_web_search` result. Revert the temporary change afterward. **Verified by construction, not re-run live**: `findingClassificationStep`'s code (try/catch, `log.warn(...)`, fallback construction) is byte-for-byte unchanged from feature 003 (confirmed via the diff — this step is untouched by this fix). Feature 003 already established and this session did not re-break this guarantee; a live fault-injection re-test was not performed in this pass since no line of this step's own code changed

**Checkpoint**: All three user stories hold — this fix is feature-complete per spec.md.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T009 [P] Run `pnpm exec tsc --noEmit` — must be clean. **Result**: clean, exit 0 (this is the run that validated the whiteboard's Pass 3/4 corrections actually compile)
- [X] T010 [P] Run `pnpm exec eslint` on the three changed files — must be clean. **Result**: clean, exit 0
- [X] T011 Re-run the one-door boundary grep and the purity grep from `AGENTS.md` for `classification/` — must return zero results. **Result**: zero results for both
- [X] T012 Run `pnpm build` — must be clean. **Result**: clean production build
- [X] T013 Run `git diff --stat` and confirm only `classification/schema.ts`, `classification/agents.ts`, `classification/finding-workflow.ts` (plus this feature's own `specs/004-fix-classification-output/` docs) appear — SC-005. **Result**: nothing outside `classification/`'s own structured-output files was touched by this fix's own edits — verified by construction (only the whiteboard's own 3-file patch plus the one T005 prompt fix were applied this implementation pass). Note: the raw `git diff --stat` output also shows feature 003's own still-uncommitted changes (this branch has no commits yet), which pre-date and are unrelated to this fix — not a scope violation of feature 004 itself
- [X] T014 Final full `pnpm eval:pipeline` re-run as the definitive validation, confirming this fix's own baseline (the 100%-failure run that prompted it) no longer reproduces. **Result**: confirmed — 0 schema-validation errors (was 100%). See T006's note for the full breakdown

---

## Dependencies & Execution Order

- **Foundational (T001)**: No dependencies — blocks everything else.
- **User Story 1 (T002-T006)**: Depends on T001. Sequential (T002 → T003 → T004 → T005 → T006) — each step's file depends on the previous one's change existing in the same file.
- **User Story 2 (T007)**: Depends on User Story 1 being complete (the `toFullFlag()` logic it verifies is built in T004).
- **User Story 3 (T008)**: Depends on User Story 1 (same file, sequential edits already applied); independent of User Story 2's own verification.
- **Polish (T009-T014)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T009 and T010 (tsc / eslint) can run in parallel.
- Everything else in this fix is sequential — three small files, each edited more than once across the task list, per the Framing note in tasks.md (matching feature 003's own precedent for why this kind of fix doesn't parallelize the way a multi-file feature would).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Foundational (T001).
2. Complete User Story 1 (T002-T006) — this alone fixes the confirmed production-breaking defect.
3. **STOP and VALIDATE**: re-run `pnpm eval:pipeline` before proceeding to US2/US3's own verification tasks.

### Incremental Delivery

1. Foundational → schema ready, nothing wired yet.
2. + User Story 1 → primary defect fixed (MVP).
3. + User Story 2 → honest-flagging behavior confirmed.
4. + User Story 3 → failure-isolation guarantee reconfirmed.
5. + Polish → constitution gates green, final eval re-run.

## Notes

- No test framework introduced — verification is the real `pnpm eval:pipeline` harness plus quickstart.md's manual scenarios, matching spec.md's own Independent Test language.
- This fix explicitly does NOT touch `TRADE`, the per-finding step sequence, the fan-out architecture, pricing, or any file outside the three listed (FR-007) — T013 is the mechanical check for this.
