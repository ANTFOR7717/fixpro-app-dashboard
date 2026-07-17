# Tasks: Classification Module Rebuild — Labor/Material/Trade Determination

**Input**: Design documents from `/specs/003-classification-rebuild/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not requested for this feature. Verification is via
`pnpm eval:pipeline` (feature 002's harness) and quickstart.md's manual
scenarios, per spec.md's own Independent Test / Success Criteria
framing — no new Vitest/Jest suite is introduced.

**Framing note**: Unlike a typical multi-screen feature, this module is
one integrated per-finding nested workflow — spec.md's own Independent
Test for User Story 1 explicitly requires BOTH a material *and* a labor
determination to already work together, and User Story 2 is literally
"the decoupled requirement itself" applied to the same code path, not a
separate one. Foundational therefore carries real weight here; US1
builds the full happy-path per-finding pipeline; US2 hardens and
verifies its decoupling guarantee specifically; US3 layers the honest
"couldn't determine" contract and per-finding failure resilience on top
of the same pipeline. This is a deliberate reflection of the actual
architecture, not a template-filling shortcut.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps to spec.md's US1/US2/US3
- File paths are relative to the repository root

---

## Phase 1: Setup

**Purpose**: Remove the scrapped module's old file layout so the new one has a clean slate.

- [ ] T001 Delete `src/features/estimate-extraction-pipeline/classification/agent.ts` and `src/features/estimate-extraction-pipeline/classification/steps.ts` (old filenames retired by the new layout in plan.md's Project Structure — `schema.ts` and `index.ts` are overwritten in place by Foundational tasks below, not deleted first)

**Checkpoint**: Old classification module files matching the new layout's replaced names are gone; `schema.ts`/`index.ts` still hold their old (soon-to-be-overwritten) content until T002/T007.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared schema, agents, and module-boundary plumbing every user story's own work depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 Rewrite `src/features/estimate-extraction-pipeline/classification/schema.ts`: `TRADE` (23-value taxonomy), `EXTENT_UNIT`, `webSearchFlagSchema`, the `determinedOr()` helper, `materialDeterminationSchema`, `laborDeterminationSchema`, `classificationResultSchema`, and `billableLineSchema`/`materialLineSchema`/`laborLineSchema` (field contract unchanged from the scrapped module per research.md R8 — only `TRADE`'s values and the ID-generation mechanism change) — per data-model.md in full
- [ ] T003 Write `src/features/estimate-extraction-pipeline/classification/agents.ts`: `materialsAgent`, `laborAgent`, `tradeAgent` — three focused agents (no `webSearch` tool, no shared batched-call instructions), each with its own narrow instructions matching its own single responsibility; base prompt engineering only for the "determined" happy path here (US3 adds the flagging instructions)
- [ ] T004 Write `src/features/estimate-extraction-pipeline/classification/flatten.ts`: the `buildLineId()` helper (research.md/data-model.md's typed replacement for the scrapped module's inline ID-suffixing) and the `flattenClassificationResultsStep` skeleton (input/output schemas wired per data-model.md; full branch logic added in T009/T013)
- [ ] T005 Write `src/features/estimate-extraction-pipeline/classification/index.ts` (the door): export `TRADE`, `EXTENT_UNIT`, `billableLineSchema`/`BillableLine`, `webSearchFlagSchema`/`WebSearchFlag`, `classifyFindings` (added in T008), and the three agents re-exported for Studio registration only (matching `extraction/index.ts`'s own `findingExtractorAgent` re-export precedent)
- [ ] T006 [P] Modify `src/features/estimate/lib/envelope.ts`: add `flaggedForWebSearch: z.array(webSearchFlagSchema).default([])` to `summaryEnvelopeV3Schema` and the `'v3'` `ParsedEnvelope` variant, importing `webSearchFlagSchema` from `classification`'s door only (per data-model.md)
- [ ] T007 [P] Modify `src/features/estimate/lib/format.ts`: extend `formatTradeLabel`'s `switch` with one clean label per new `TRADE` value (data-model.md's examples: `excavation_grading` -> "Excavation & Grading", `general_contractor` -> "General Contractor", etc.)

**Checkpoint**: Foundation ready — schema, agents, module door, and the two small outside-the-pipeline touches are in place. The nested per-finding workflow (US1) can now be built.

---

## Phase 3: User Story 1 - An estimate correctly separates material and labor for each defect (Priority: P1) 🎯 MVP

**Goal**: Given a finding with both a physical material and installation labor, the rebuilt module determines both correctly and hands off a real `BillableLine` for each.

**Independent Test**: Process a real finding known to involve both a material and labor; confirm the result names a real material with a real quantity/unit AND a real labor-hours figure — not one or the other (spec.md US1).

### Implementation for User Story 1

- [ ] T008 [US1] Write `src/features/estimate-extraction-pipeline/classification/finding-workflow.ts`: the per-finding nested workflow — `materialsAgentStep` (bare `createStep(materialsAgent, { structuredOutput, retries: 2 })`), a `.map()` building its prompt from `getInitData()` (the finding + surrounding document excerpt near `pageHint`, per FR-007/research.md R2), then `laborAgentStep` with its own `.map()` reading `getInitData()` and (when present) `getStepResult(materialsAgentStep)` as optional context (FR-006), then `tradeAgentStep` with its own `.map()` reading both prior results plus `getInitData()`, then a `combineResultStep` assembling one `classificationResultSchema` value from the finding's id + all three step outputs — `.then().then().then().then().commit()`, matching research.md R4/R5
- [ ] T009 [US1] Complete `classification/flatten.ts`'s `flattenClassificationResultsStep` full branch logic (data-model.md's numbered steps 1-3): per finding, skip emission entirely if `trade` isn't `'determined'`; otherwise emit one `materialLineSchema` line per determined material (via `buildLineId(findingId, 'material', index)`) and one `laborLineSchema` line if labor hours are determined (via `buildLineId(findingId, 'labor')`), computing `pricingBasis` from whether any material line was emitted for that finding — matching the scrapped module's already-correct `pricingBasis` rule (data-model.md, research.md R8)
- [ ] T010 [US1] Write `src/features/estimate-extraction-pipeline/classification/workflow.ts`: `classificationFanoutWorkflow` — `.map()` attaching `parsedDocument` to each finding (research.md R2) then `.foreach(findingWorkflow, { concurrency: CLASSIFICATION_CONCURRENCY })` then `.then(flattenClassificationResultsStep)` — `.commit()`, mirroring `pricing/workflow.ts`'s own shape exactly; NOT registered on the top-level `Mastra` instance (same reasoning as `pricingFanoutWorkflow`)
- [ ] T011 [US1] Add `classifyFindings({ findings, parsedDocument })` to `classification/index.ts` — runs `classificationFanoutWorkflow.createRun()/.start()`, throws if the run itself doesn't start successfully, otherwise returns `{ lines, flaggedForWebSearch }` — mirroring `pricing/index.ts`'s `priceLines()` exactly (research.md R3)
- [ ] T012 [US1] Modify `src/features/estimate-extraction-pipeline/pipeline.ts`: replace the scrapped `lineClassifierAgentStep`/`buildLinesStep` composition with a `.map()` (reading `getStepResult(findingExtractorAgentStep)` and `getStepResult(parseDocumentStep)`) followed by `.then(classifyStep)` (a new named step whose `execute()` calls `classifyFindings()`); update `priceStep`'s `inputSchema`/`execute()` to pass `flaggedForWebSearch` through unchanged (matching its existing `parsedDocument` pass-through); update `summarizeEstimateWorkflow`'s `outputSchema` to include `flaggedForWebSearch` — per data-model.md's exact before/after
- [ ] T013 [US1] Modify `src/features/estimate/lib/workflow.ts`'s `triggerSummarizeEstimate`: pass `result.result.flaggedForWebSearch` through when constructing the `SummaryEnvelopeV3` (matching how `parsedDocument` is already passed through)
- [ ] T014 [US1] Manually run quickstart.md Scenario 1 against a known material-and-labor finding in the existing eval fixture; confirm SC-003 (both a real material determination and a real labor determination, each independently correct)

**Checkpoint**: A material-and-labor finding classifies correctly end-to-end through the real `summarize-estimate` workflow.

---

## Phase 4: User Story 2 - A defect that needs no material still gets a correct labor determination (Priority: P1)

**Goal**: A labor-only finding classifies completely and correctly with an empty materials result — no error, no degraded outcome.

**Independent Test**: Process a known labor-only finding; confirm a complete, correct labor determination with an empty materials result, no error (spec.md US2).

### Implementation for User Story 2

- [ ] T015 [US2] Review and, if needed, harden `materialsAgent`'s instructions (`agents.ts`) so it confidently returns an empty `materials: []` array (never a forced/invented material) when a finding's content genuinely describes no physical part — and confirm `laborAgentStep`'s own prompt (`finding-workflow.ts`) never treats an empty materials result as an error or degraded input (FR-005)
- [ ] T016 [US2] Manually run quickstart.md Scenario 1 against a known labor-only finding in the existing eval fixture; confirm SC-002 (empty materials result, complete correct labor determination, no error, no degraded outcome versus a material-and-labor finding)

**Checkpoint**: Both US1 and US2 hold together — materials and labor are genuinely decoupled, not just sequentially dependent.

---

## Phase 5: User Story 3 - An unresolvable amount is represented honestly, not invented (Priority: P2)

**Goal**: A finding whose quantity, hours, or trade has no real grounding produces a `flagged_for_web_search` result carrying full context — never a fabricated value, never a bare null, never a generic taxonomy fallback.

**Independent Test**: Construct/identify a finding with no determinable quantity/hours/trade; confirm the result is `flagged_for_web_search` with a document excerpt and failure reason (spec.md US3).

### Implementation for User Story 3

- [ ] T017 [US3] Add explicit "when you cannot determine X, return the flagged shape with a specific reason" instructions to all three agents' prompts (`agents.ts`) — each agent's own structured-output schema already supports this via `determinedOr()` (T002); this task is the prompt engineering that makes agents actually use it instead of guessing
- [ ] T018 [US3] Add failure-downgrade handling to `finding-workflow.ts`'s `combineResultStep` (or per agent step, whichever the implementation naturally supports): catch a genuine per-finding step failure (after `retries` exhausted) and downgrade the affected field(s) to a `flagged_for_web_search` result with a failure-derived `reason` — mirroring `pricing/price-line.ts`'s already-accepted per-item resilience pattern (research.md), so one finding's hard failure never fails the whole `.foreach()` batch (FR-009/SC-006)
- [ ] T019 [US3] Confirm `flatten.ts`'s branch logic (T009) correctly routes every flagged material/labor/trade value into the `flaggedForWebSearch` output array with its full `searchContext` intact (document excerpt, originating finding, partial findings) — adjust if T017/T018 changed the shape agents actually emit
- [ ] T020 [US3] Manually run quickstart.md Scenario 3 (construct or identify a genuinely ungroundable finding); confirm SC-005. Manually run quickstart.md Scenario 4 (temporarily force one per-finding failure); confirm SC-006, then revert the temporary change

**Checkpoint**: All three user stories hold independently and together — the module is feature-complete per spec.md.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Constitution validation gates and one-door/purity verification, matching this project's Development Workflow requirements.

- [ ] T021 [P] Run `pnpm exec tsc --noEmit` — must be clean
- [ ] T022 [P] Run `pnpm exec eslint` on every changed path — must be clean
- [ ] T023 Re-run every one-door boundary grep and the purity grep from `AGENTS.md` against the new `classification/` layout — must return zero results; update `AGENTS.md`'s grep list only if a new deep-import path pattern needs covering (unlikely — same folder position, same door)
- [ ] T024 Run `pnpm build` — must be clean
- [ ] T025 Run `pnpm eval:pipeline` (feature 002's harness) against the real fixture end-to-end; if its classification-facing scorer(s) reference old field names or the old 11-value `TRADE` set, update them to match this rebuild's schema (a scorer update, not a scope expansion of this feature — the harness's own accuracy is explicitly out of scope per this project's own prior instruction that scorer precision is low-priority and must never block the pipeline itself)
- [ ] T026 Confirm `git status` shows no stray unused imports/exports left from the old module (e.g. no lingering `COST_TYPE`-equivalent dead export in the new `schema.ts`) — per Constitution VI

---

## Dependencies & Execution Order

- **Setup (T001)**: No dependencies.
- **Foundational (T002-T007)**: Depends on T001. T002 blocks T003/T004/T005 (all reference its types). T006/T007 depend only on T002 (the `webSearchFlagSchema`/`billableLineSchema` shapes) and are `[P]` against each other and against T003-T005 — different files, no shared dependency beyond T002.
- **User Story 1 (T008-T014)**: Depends on Foundational completion. Sequential within the story (T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014) — each step's file depends on the previous one existing.
- **User Story 2 (T015-T016)**: Depends on User Story 1 (the full nested workflow must exist to verify its decoupling property against a real run).
- **User Story 3 (T017-T020)**: Depends on User Story 1 (same reasoning); independent of User Story 2's own tasks (different concern — flagging vs. decoupling — though both exercise the same underlying files, so treat as sequential, not parallel, to avoid same-file conflicts).
- **Polish (T021-T026)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T006 and T007 (different files, `envelope.ts` / `format.ts`) can run in parallel once T002 is done.
- T021 and T022 (tsc / eslint) can run in parallel; the rest of Polish is sequential (each depends on the codebase being in the state the previous check validated).
- Within User Stories 1/2/3, tasks are predominantly sequential (same small set of tightly-coupled files) — see the Framing note at the top for why this feature doesn't parallelize the way a multi-screen feature would.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Setup + Foundational.
2. Complete User Story 1 — this alone gives a working, end-to-end rebuilt classification stage for the common material-and-labor case.
3. **STOP and VALIDATE**: run quickstart.md Scenario 1 for both a labor-only and a material+labor finding manually before continuing, even though User Story 2's own task list is what formally covers the labor-only case.

### Incremental Delivery

1. Setup + Foundational -> schema/agents/door ready, nothing runnable yet.
2. + User Story 1 -> real end-to-end classification for the common case (MVP).
3. + User Story 2 -> decoupling guarantee verified/hardened.
4. + User Story 3 -> honest-flagging + per-finding resilience layered on top.
5. + Polish -> constitution gates green, eval harness updated.

## Notes

- No test framework is introduced (Tests header above) — verification is
  the real `pnpm eval:pipeline` harness plus quickstart.md's manual
  scenarios, matching spec.md's own Independent Test / Success Criteria
  language exactly.
- `@mastra/tavily` is NOT touched by this feature (explicit user
  instruction, research.md R7 updated accordingly) — it has a confirmed
  future consumer (the deferred web-search resolution pass) even though
  no code in this feature calls it.
