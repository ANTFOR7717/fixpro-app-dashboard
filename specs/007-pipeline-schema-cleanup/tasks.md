# Tasks: Pipeline Schema Cleanup

**Input**: Design documents from `/specs/007-pipeline-schema-cleanup/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md (all present; no `contracts/` — internal pipeline module, no external API surface)

**Tests**: Not requested in spec.md — this feature's validation is `pnpm eval:pipeline` (quickstart.md) plus the standard regression gates, matching every prior feature in this pipeline. No test-task phase.

**Organization**: Tasks are grouped by user story per spec-kit convention, but several files are genuinely shared across multiple stories (`classification/schema.ts` alone satisfies parts of US1, US2, and US5; `pricing/schema.ts` satisfies parts of US2 and US3). Rather than editing the same file twice under two different phases — which would mean re-deriving the same lines and risking conflicting edits — each such file is ONE task, labeled with every story it completes. This reflects the real coupling documented in data-model.md, not a deviation from the plan.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on an incomplete task)
- **[Story]**: Which user story this task belongs to (US1-US5); some tasks carry more than one label because the underlying file is genuinely shared
- Every task's own FR references are drawn directly from spec.md

## Phase 1: Setup

None. Zero new files, zero new dependencies, zero new project structure — this is a schema/shape/dead-code cleanup of already-existing code (plan.md's own Structure Decision).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `classification/schema.ts`'s FR-008 fix derives `classificationResultSchema` from `extractedFindingSchema` via `.omit()`/`.extend()` — `extraction/schema.ts` must have `pageHint` already removed before that derivation can be written correctly. This is a real, not arbitrary, ordering constraint (research.md R1).

- [X] T001 [P] `src/features/estimate-extraction-pipeline/extraction/schema.ts` — remove `pageHint` from `extractedFindingSchema`; loosen `sourceQuote` to `z.string().min(1)` (FR-001, FR-019). See data-model.md's `extraction/schema.ts` section for the exact before/after.
- [X] T002 [P] `src/features/estimate-extraction-pipeline/extraction/agent.ts` — remove the `pageHint` field instruction and its grounding sentence from the agent's own prompt (FR-001).

**Checkpoint**: `extractedFindingSchema` has no `pageHint`; nothing downstream depends on T001/T002 being done in any particular order relative to each other (different files).

---

## Phase 3: User Story 1 — `pageHint` is gone, everywhere (Priority: P1)

**Goal**: No `pageHint` field anywhere in extraction, classification, or the report UI. Classification agents still receive real document context (via a replacement, not a silent gap).

**Independent Test** (spec.md): grep `src/` for `pageHint` — zero results outside `legacyBillableItemSchema`.

This phase's classification/schema.ts task also completes US2's (FR-004/006/007/008/010) and US5's (FR-018/019) classification-side requirements — see the header note on why this isn't split.

- [X] T003 [US1][US2][US5] `src/features/estimate-extraction-pipeline/classification/schema.ts` — comprehensive rewrite in one pass (data-model.md's `classification/schema.ts` section has the exact before/after for each piece):
  - Remove `pageHint` from `itemIdentityFields`/`classificationResultSchema` (FR-001)
  - `itemIdentityFields` → real `ZodObject` (`itemIdentitySchema`); `materialLineSchema`/`laborLineSchema` built via `.extend()` (FR-007)
  - `classificationResultSchema` built via `extractedFindingSchema.omit({...}).extend({...})` (FR-008) — depends on T001
  - `materialDeterminationSchema`/`laborDeterminationSchema`: `amountSource`/`hoursSource` moved inside the determined branch's own value; labor's `.multipleOf(0.25)` removed (FR-004, FR-018)
  - `agentUndeterminedSchema` → `webSearchFlagSchema.omit({ searchContext: true })` (FR-010)
  - `webSearchFlagSchema.reason` loosened to `z.string().min(1)` (FR-019)
- [X] T004 [P] [US1] `src/features/estimate-extraction-pipeline/classification/agents.ts` — remove the three `pageHint` mentions in the materials/labor/trade agents' own prompt instructions (FR-001). No dependency on T003 (prompt text only).
- [X] T005 [US1] `src/features/estimate-extraction-pipeline/classification/finding-workflow.ts` — delete `excerptNearPageHint()`; add a full-document `formatDocumentContext()` matching `buildExtractionPrompt`'s shape; update all four call sites (FR-002). Update `materialsStepOutputSchema`/`laborStepOutputSchema` to reference T003's new determination shapes instead of retyping `material`/`amountSource`/`laborType`/`hoursSource` (FR-006). Depends on T003.
- [X] T006 [US1] `src/features/estimate-extraction-pipeline/classification/flatten.ts` — delete the two `throw new Error(...)` invariant guards; update field access to `material.quantity.value.amountSource`/`result.labor.hours.value.hoursSource` (FR-005). Depends on T003. See data-model.md for the exact before/after.

**Checkpoint**: `pnpm exec tsc --noEmit` on classification/ should be clean; classification's own agents receive full-document context; no `pageHint` remains in extraction or classification.

---

## Phase 4: User Story 2 (continued) — pricing schema dedup (Priority: P2)

**Goal**: `pricing/schema.ts` reuses `classification/schema.ts`'s `determinedOr()` instead of a hand-written `xorUnavailable` refinement, and reuses `priceEvidenceFields` once instead of retyping it.

This phase's `pricing/schema.ts` task also completes US3's (FR-011) merged-schema definition — same file, same reasoning as Phase 3.

- [X] T007 [US2] `src/features/estimate-extraction-pipeline/classification/index.ts` — re-export `determinedOr` through classification's own door, so `pricing/schema.ts` can reuse it without a deep import (Constitution Principle I; plan.md's Constitution Check row I). Depends on T003.
- [X] T008 [US2][US3] `src/features/estimate-extraction-pipeline/pricing/schema.ts` — comprehensive rewrite (data-model.md's `pricing/schema.ts` section):
  - Delete `xorUnavailable` and its two `.superRefine()` call sites (FR-017)
  - Restructure `materialPriceResponseSchema`/`laborPriceResponseSchema` via `determinedOr(z.object({ unitPrice/hourlyRate, ...priceEvidenceFields }), priceFlagSchema)` (FR-017)
  - `priceEvidenceFields` narrows to `{ currency, confidence, source }` (drops `unavailableReason`), spread ONCE into each determined branch (FR-009); `source`'s bound loosens to `z.string().min(1)` (FR-019)
  - Build `pricedMaterialLineSchema`/`pricedLaborLineSchema` (extending `materialLineSchema`/`laborLineSchema` individually with `price`) and `pricedLineSchema = z.discriminatedUnion('costType', [...])` — NOT `billableLineSchema.extend()` (FR-011; research.md R4 explains why the direct-extend form doesn't compile)
  - Delete `pricedLineItemSchema` entirely
  Depends on T007 and T003 (needs `materialLineSchema`/`laborLineSchema`'s finished shape).
- [X] T009 [US2] `src/features/estimate-extraction-pipeline/pricing/agent.ts` — rewrite the OUTPUT section and hard-rule 1 to describe the `determinedOr()` contract instead of the old flat "unitPrice ... or null" shape (FR-017a). Depends on T008.

**Checkpoint**: `pricing/schema.ts` has no `xorUnavailable`, no `pricedLineItemSchema`; `pricedLineSchema` exists and is exported.

---

## Phase 5: User Story 3 — one array for billable lines (Priority: P3)

**Goal**: `priceLines()` returns one array of merged priced lines; `summaryEnvelopeV3Schema` persists one `lines` array; the report UI reads price data directly off each line.

**Independent Test** (spec.md): `summaryEnvelopeV3Schema` has one `lines` array with no separate `prices` field; `items-section.tsx` has no `priceByItemId` `Map`.

- [X] T010 [US3] `src/features/estimate-extraction-pipeline/pricing/price-line.ts` — success path returns `{ ...line, price: m.price }` (a direct pass-through, not field-by-field reconstruction); catch-block fallback returns `{ ...line, price: { status: 'unavailable', reason: 'Pricing lookup failed; needs contractor quote.' } }` (FR-011). The try/catch mechanism itself (still catch, still degrade, never throw) is UNCHANGED — only the shape it constructs changes (FR-016's boundary; see spec.md's FR-016 for why this isn't a contradiction). Depends on T008.
- [X] T011 [US3] `src/features/estimate-extraction-pipeline/pricing/index.ts` — `priceLines()` returns `PricedLine[]`, not `{ lines, prices }` (FR-011). Depends on T010.
- [X] T012 [US3] `src/features/estimate/lib/envelope.ts` — `summaryEnvelopeV3Schema` modified in place: `lines: z.array(pricedLineSchema)`, `prices` field removed entirely (still version 3, no new version literal per the resolved Clarification); `ParsedEnvelope`'s `'v3'` variant updated to match (FR-012). **REVISED (whiteboard, FR-003 revised)**: `legacyBillableItemSchema`, `summaryEnvelopeV1Schema`, `summaryEnvelopeV2Schema`, and `ParsedEnvelope`'s `'v1'`/`'v2'` variants are DELETED entirely, not left untouched — explicit user direction during implementation planning that legacy compatibility is itself unrequested-complexity slop. Depends on T011.
- [X] T012a [US1][US3] `src/features/estimate/components/estimate-report.tsx` — simplify `ItemsBlock` to route on `'v3' | 'unparseable' | 'absent'` only (no more items/prices assembly from two shapes), per T012's legacy deletion. Depends on T012. (Found during whiteboarding — missing from original task scope.)
- [X] T013 [US1][US3] `src/features/estimate/components/items-section.tsx` — remove the `pageHint` render block AND the `priceByItemId` `Map`/its construction, reading `line.price` directly instead via a shared `priceAmount()` helper (FR-013). `RenderableItem`/legacy item type deleted — this component only ever receives the current `PricedLine[]` shape now. Depends on T012a.
- [X] T013a [US3] `src/features/estimate-extraction-pipeline/pricing/workflow.ts`, `src/features/estimate-extraction-pipeline/pipeline.ts`, `src/features/estimate/lib/workflow.ts` — propagate the merged `PricedLine[]` shape through `pricingFanoutWorkflow`'s output, `pipeline.ts`'s `priceStep`, and `triggerSummarizeEstimate()`'s envelope construction (FR-011). Found during whiteboarding by tracing `priceLineStep`'s output type outward through every consumer — missing from original task scope. Depends on T011.

**Checkpoint**: A fresh estimate run persists one `lines` array with prices embedded; an estimate persisted under any prior shape (v1, v2, or the OLD split-array v3) falls through to `'unparseable'` and surfaces the existing retry affordance — legacy compatibility is explicitly out of scope (revised FR-003), not a regression to investigate.

---

## Phase 6: User Story 4 — dead code is gone (Priority: P4)

**Goal**: `roundToQuarter()` and `kiloGateway` no longer exist.

**Independent Test** (spec.md): grep for both — zero results.

Fully independent of every other phase — no shared files, no shared exports with anything above.

- [X] T014 [P] [US4] `src/features/estimate-extraction-pipeline/shared/quarter-hour.ts` — delete `roundToQuarter()` (and the file itself, if nothing else lands in it) (FR-014).
- [X] T015 [P] [US4] `src/features/estimate-extraction-pipeline/shared/gateway.ts` — remove `kiloGateway`; `pioneerGateway` unaffected (FR-015).

**Checkpoint**: `pnpm exec tsc --noEmit` stays clean (nothing referenced either export).

---

## Phase 6a: Follow-up findings from whiteboarding (found after the original task breakdown)

**Purpose**: Two independent audit passes during whiteboarding (explicitly requested) and a final pre-implementation review found six further findings (#15/#16, #18-#22) beyond this feature's original scope — five are dead code or literal `pageHint` survivors the legacy deletion (Phase 5) either created or exposed; one (#22) is a live prompt-text contradiction of FR-018 found only by re-reading every agent prompt fresh before implementing. None of these tasks existed in the original task breakdown.

- [X] T015a [P] `src/features/estimate/lib/format.ts` — remove `formatTradeLabel()`'s 5 dead legacy-taxonomy cases and `formatUnit()`'s dead `'sqft'` case; tighten both functions' parameter types from `string` to `Trade`/`ExtentUnit | 'hrs'` (FR-020/FR-021, findings #15/#16). Depends on T012a/T013 (needs `items-section.tsx`'s final v3-only shape) and T007 (needs `Trade`/`ExtentUnit` exported through classification's door).
- [X] T015b [P] `src/features/estimate-extraction-pipeline/document/schema.ts` — reword the doc comment to remove its literal `pageHint` mention; no shape change (FR-022, finding #18).
- [X] T015c `src/features/estimate-extraction-pipeline/classification/index.ts` — re-export `type ExtentUnit` alongside `type Trade` (FR-024, finding #20 — a real compile error found by running `tsc --noEmit` against the fully-applied patch). Depends on T007.
- [X] T015d `src/features/estimate-extraction-pipeline/classification/finding-workflow.ts` — reword `formatDocumentContext()`'s replacement comment to describe what it replaced without the literal string `pageHint` (FR-023, finding #19 — self-inflicted by this feature's own first-pass wording). Depends on T005.
- [X] T015e `src/features/estimate-extraction-pipeline/pricing/schema.ts` — add exported `priceAmount(line: PricedLine): number | null`, the shared "determined price amount, or null" helper (finding #21's fix). Depends on T008.
- [X] T015f `src/features/estimate-extraction-pipeline/pricing/index.ts` — re-export `priceAmount` through pricing's door. Depends on T015e.
- [X] T015g `src/features/estimate/components/items-section.tsx` — **REVISED post-implementation (finding #23)**: importing `priceAmount` from pricing's door broke `pnpm build` — this file is `'use client'`, and a real (non-type) import from the `pricing` door pulls Mastra/Node-only code (`stream/web`) into the browser bundle. Reverted to a local `priceAmount()` copy (its original form); `pricing/schema.ts`'s exported version now serves only the eval scorer (Node-only, no client-bundle constraint). Depends on T013, T015f.
- [X] T015h [P] `eval/pipeline/run.ts`, `eval/pipeline/scorers/pricing-match.ts` — update to use `PricedLine` (not the deleted `PricedLineItem`) and the shared `priceAmount()` helper, matching FR-011/FR-017's restructure (FR-025, finding #21). Outside `src/`, found only by running `tsc --noEmit` against the whole repository — no `src/`-scoped scope trace would ever have found these. Depends on T015f. **Known pre-existing bug, deliberately NOT fixed**: `pricing-match.ts`'s id-suffix match checks for a hyphen; the actual id format (`classification/flatten.ts`'s `buildLineId()`, untouched by this feature) uses a colon — this scorer has likely never matched a multi-line finding, independent of this feature. Out of scope; documented in spec.md's Assumptions.
- [X] T015i `src/features/estimate-extraction-pipeline/classification/agents.ts` — remove `laborAgent`'s "quarter-hour increments" prompt instruction, replacing it with unconstrained "a real positive number of hours" language (FR-026, finding #22) — the same unverified assumption FR-018 already removes from the schema, found only by re-reading this prompt fresh during a final pre-implementation review. Depends on T004.

**Checkpoint**: `grep -rn pageHint src/ eval/` returns zero; `grep -rn "quarter-hour increments\|multipleOf" src/features/estimate-extraction-pipeline/classification/` returns zero; `tsc --noEmit` clean across the whole repository including `eval/`.

---

## Phase 7: Polish & Validation

**Purpose**: The regression gates every prior feature in this pipeline uses (constitution.md's own Development Workflow section), plus quickstart.md's 7 scenarios.

- [X] T016 Run `pnpm exec tsc --noEmit` — must be clean.
- [X] T017 Run `pnpm exec eslint <changed paths>` — must be clean.
- [X] T018 Run the one-door/purity greps from `AGENTS.md` (extended for any new door export from T007) — must return zero results.
- [X] T019 Run `pnpm build` — must be clean.
- [ ] T020 Run `pnpm eval:pipeline` against the existing fixture and walk through quickstart.md's Scenarios 1-7 (SC-001 through SC-008).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — can start immediately. BLOCKS Phase 3's T003 (needs `extractedFindingSchema` with `pageHint` already removed).
- **Phase 3 (US1/US2/US5 — classification)**: Depends on Phase 2. T003 blocks T005/T006 (both need its new shapes). T004 has no dependency on T003 (prompt text only, different file).
- **Phase 4 (US2/US3 — pricing schema)**: Depends on Phase 3's T003 (needs `materialLineSchema`/`laborLineSchema`'s finished shape) and its own T007.
- **Phase 5 (US3 — merge propagation)**: Depends on Phase 4's T008, strictly sequential (T010 → T011 → T012 → T013 — each consumes the previous task's output type).
- **Phase 6 (US4 — dead code)**: No dependency on anything above or below. Can run at any point, including in parallel with every other phase.
- **Phase 7 (Polish)**: Depends on every task above being complete.

### Parallel Opportunities

- T001 and T002 (Phase 2, different files).
- T004 alongside T003 (Phase 3, different files, no shared dependency).
- T014 and T015 (Phase 6) — and both can run in parallel with ANY other phase, since they touch files nothing else in this feature imports.

### Critical Path

T001 → T003 → T005/T006 (parallel-safe once T003 lands) → T007 → T008 → T009, and separately T008 → T010 → T011 → T012 → T013 → T016-T020.

---

## Implementation Strategy

Given the real file-level coupling (one schema file often satisfies 2-3 user stories at once), sequential delivery in dependency order is the only correct strategy here — there is no meaningful "MVP-first, ship US1 alone" slice, because US1's own `classification/schema.ts` task (T003) is the same edit that also completes US2/US5's requirements for that file. The phases above ARE the delivery order:

1. Phase 2 (extraction) → Phase 3 (classification) → Phase 4 (pricing schema) → Phase 5 (pricing propagation + envelope + UI) → Phase 7 (validation).
2. Phase 6 (dead code) can be done at any point — first, last, or interleaved — with zero risk to the rest.
3. Stop and run `pnpm exec tsc --noEmit` after each phase's checkpoint, not only at the end, since several tasks (T003, T008) are large, multi-FR rewrites where a compile error would be cheaper to catch immediately than after several more dependent tasks build on the wrong shape.

## Notes

- No task marked `[P]` shares a file with another task in this list — verified against the file path in every task above.
- Every task's FR references trace directly to spec.md; every code shape referenced traces to data-model.md.
- FR-016's boundary (T010) is not optional nuance — the review that produced this plan found it as a real source of potential implementation error (data-model.md's own note on `price-line.ts`), so it's called out explicitly here, not just in the plan.
