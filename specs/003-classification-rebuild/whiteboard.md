# Whiteboard: Classification Module Rebuild — Labor/Material/Trade Determination

## Status

Prepared — awaiting explicit approval.

## Purpose / Big Picture

`src/features/estimate-extraction-pipeline/classification/` is fully
scrapped and rebuilt. Given each finding extraction already produced
(action, scope, location, statedQuantity, inspectorHours, sourceQuote,
pageHint), the rebuilt module determines: (1) whether material and/or
labor is involved, (2) for material — a real quantity + unit per
distinct material, (3) for labor — real hours + a labor type, and (4)
the trade, derived from the combination — selected from a 23-value
taxonomy sourced from a real published state contractor licensing
classification, not the scrapped module's unsourced 11-value set with
its lazy `other` fallback. Anything that cannot be grounded in the
finding's own content or its surrounding parsed-document context becomes
a `flagged_for_web_search` result — never a bare null, never a
fabricated number, never a generic taxonomy value — carrying full
context for a future (out-of-scope-for-this-pass) web-search resolution
step.

What becomes observable: running the real `summarize-estimate` workflow
against a real inspection-report PDF produces, for every finding, either
a set of `BillableLine`s (pricing's existing handoff shape, unchanged
field contract) or a `WebSearchFlag` entry surfaced in the pipeline's own
output and persisted in the estimate envelope — never a silently dropped
finding, never an invented number, never a forced trade guess.

## User Contract

Acceptance criteria (from `specs/003-classification-rebuild/spec.md`):

1. For every finding, determine whether the described work involves
   material, labor, or both (FR-001).
2. For material involved, determine a real quantity + unit for each
   distinct material (a finding may have zero, one, or many), grounded
   in the finding's own content or its surrounding document context —
   never fabricated. An ungroundable quantity becomes a
   `flagged_for_web_search` result (FR-002, FR-010).
3. For labor involved, determine a real hour count + labor type,
   grounded the same way; an ungroundable hour count becomes a
   `flagged_for_web_search` result (FR-003, FR-010).
4. Determine the trade from the finding's own determined labor +
   materials — never assigned independently — selected from the closed,
   sourced 23-value taxonomy; an undeterminable trade becomes a
   `flagged_for_web_search` result, never a generic/`other` value
   (FR-004, FR-010).
5. The materials determination and labor determination are each
   independently correct regardless of whether the other produced a
   non-empty result — a labor-only finding must classify correctly with
   no material data present, and this is never treated as a degraded
   case (FR-005, FR-006).
6. Every per-finding determination has access to the source document
   content surrounding that finding's own `pageHint`, not just the
   finding's own summarized fields (FR-007).
7. No external/web-based lookup happens in this pass (FR-008) — that
   whole mechanism is deferred; `@mastra/tavily` remains a `package.json`
   dependency for that future pass but is not used anywhere in this
   rebuild's own code (explicit user instruction this session).
8. Every finding submitted for classification receives a result — no
   finding is silently dropped, and one finding's processing failure
   never prevents any other finding from being classified (FR-009).
9. This feature does not alter pricing's own logic/schema beyond the
   minimal interface needed to hand off a result pricing can use, and
   does not perform any dollar-amount determination (FR-011).

Constraints / exclusions:

- `classification/index.ts` is the only import path anything outside the
  folder may use (Constitution Principle I).
- No `@/db` or `@/features/estimate/` import inside `classification/`
  (Constitution Principle II).
- `billableLineSchema`'s field contract (as `pricing/price-line.ts`
  already reads it: `trade`, `action`, `scope`, `location`, `costType`,
  `pricingBasis`, `quantity`, `unit`, `sourceQuote`, plus
  `material`/`amountSource` or `laborType`/`hoursSource`) is unchanged —
  only `trade`'s value set changes.
- No new test framework is introduced; verification is the real
  `pnpm eval:pipeline` harness plus manual scenarios
  (`specs/003-classification-rebuild/quickstart.md`).
- `@mastra/tavily` is NOT removed from `package.json` (explicit user
  instruction — it has a confirmed future consumer).

Invariants:

- Every `BillableLine` this module emits has a real, non-null
  `quantity`/`unit`/`hours` — a flagged (undetermined) value never
  reaches `billableLineSchema`; it is only ever represented via
  `webSearchFlagSchema`.
- `pricing/`'s own files are never modified by this feature.

Assumptions (from spec.md, carried into this plan):

- Every finding produces exactly one Labor Determination (never zero) —
  no "zero labor" case is anticipated.
- The per-finding processing architecture (a nested per-finding
  sequence, fanned out across all findings) is a settled architectural
  decision, not re-litigated here.

## Acceptance Coverage

| Criterion | Files | Plan Step | Validation |
|---|---|---|---|
| 1 (FR-001) | `schema.ts`, `finding-workflow.ts`, `agents.ts` | Milestone 1-2 | Scenario 1 (quickstart.md) |
| 2 (FR-002/FR-010, material) | `schema.ts`, `agents.ts` (`materialsAgent`), `finding-workflow.ts`, `flatten.ts` | Milestone 1-3 | Scenario 1 + 3 |
| 3 (FR-003/FR-010, labor) | `schema.ts`, `agents.ts` (`laborAgent`), `finding-workflow.ts`, `flatten.ts` | Milestone 1-3 | Scenario 1 + 3 |
| 4 (FR-004/FR-010, trade) | `schema.ts`, `agents.ts` (`tradeAgent`), `finding-workflow.ts`, `flatten.ts` | Milestone 1-3 | Scenario 2 + 3 |
| 5 (FR-005/FR-006, decoupling) | `agents.ts` (`laborAgent` instructions), `finding-workflow.ts` (labor step's `.map()`) | Milestone 2 | Scenario 1 (labor-only case) |
| 6 (FR-007, document context) | `finding-workflow.ts` (`excerptNearPageHint`, `getInitData()`) | Milestone 2 | Scenario 1 |
| 7 (FR-008, no web search this pass) | entire module — no `webSearch` tool anywhere | Milestone 1-3 | Code review / grep for `tavily`/`webSearch` in `classification/` |
| 8 (FR-009, no drop, failure isolation) | `finding-workflow.ts` (`findingClassificationStep`'s try/catch), `flatten.ts` | Milestone 3 | Scenario 4 |
| 9 (FR-011, pricing untouched) | `flatten.ts`, `pipeline.ts`, `envelope.ts` | Milestone 4-5 | `pricing/` directory has zero diff in this plan |

## Context and Orientation

- **`src/features/estimate-extraction-pipeline/extraction/`**: upstream
  of classification. `extraction/schema.ts`'s `extractedFindingSchema`
  is this feature's own input shape (id, action, scope, location,
  statedQuantity, inspectorHours, sourceQuote, pageHint) — read, never
  modified by this feature. `extraction/index.ts` is its door.
- **`src/features/estimate-extraction-pipeline/document/`**:
  `parsedDocumentSchema`/`ParsedDocument` (`{ pages: [{ pageNumber,
  content }] }`) — the whole parsed report, page by page. This feature
  reads it (via `document/index.ts`'s door) to build a bounded excerpt
  near a finding's own `pageHint`; never modified.
- **`src/features/estimate-extraction-pipeline/pricing/`**: downstream
  consumer of this feature's `billableLineSchema` output.
  `pricing/price-line.ts` reads `line.trade`, `line.action`,
  `line.scope`, `line.location`, `line.costType`, `line.pricingBasis`,
  `line.quantity`, `line.unit`, `line.sourceQuote` directly by field name
  — verified by reading that file directly this session (not assumed).
  `pricing/workflow.ts`'s `pricingFanoutWorkflow` (`.foreach(priceLineStep,
  { concurrency: PRICING_CONCURRENCY })`) is the precedent
  `classification/workflow.ts`'s own `.foreach()` usage mirrors. Its
  wrapping `pricing/index.ts`'s `priceLines()` function (a separate,
  standalone `.createRun()/.start()`) is NOT mirrored by
  `classification/index.ts` — `pricing/price-line.ts`'s own comment
  states that indirection exists because a standalone run was
  empirically confirmed to leave `execute.mastra` undefined, which
  pricing's own steps need for `mastra.getLogger()`; classification's
  fan-out has no such need, so `classification/index.ts` exports
  `classificationFanoutWorkflow` directly instead (Pass 6 correction —
  see Review Log).
- **`src/features/estimate-extraction-pipeline/pipeline.ts`**: the
  composition root. Composes `parseDocumentStep` (file I/O),
  `findingExtractorAgentStep` (bare agent step), and (after this change)
  `classificationFanoutWorkflow` (composed directly via `.then()`,
  Mastra's documented "workflows as steps" pattern) and `priceStep` (a
  named step wrapping `priceLines()`) into `summarizeEstimateWorkflow`.
- **`src/features/estimate/lib/envelope.ts`**: outside the pipeline
  package (Constitution Principle II is unaffected — the pipeline
  package itself never imports from here). Defines the v1/v2/v3
  persisted-envelope schemas `estimate_requests.summary` parses into.
  `summaryEnvelopeV3Schema` already has one precedent for an additive,
  `.default(...)`-guarded field (`parsedDocument`) — this plan adds
  `flaggedForWebSearch` the same way.
- **`src/features/estimate/lib/workflow.ts`**: `triggerSummarizeEstimate`,
  the single writer of `estimate_requests` rows; builds the
  `SummaryEnvelopeV3` from the workflow's own result.
- **`src/features/estimate/lib/format.ts`**: `formatTradeLabel`'s
  `switch` renders a `BillableItem.trade`/`BillableLine.trade` string as
  a human label; its `default` branch already renders any unrecognized
  value safely via title-casing.

Unfamiliar terms this plan introduces:

- **`determinedOr(schema)`**: a `schema.ts` helper building a
  `z.discriminatedUnion('status', [...])` of `{ status: 'determined',
  value: T }` or a `WebSearchFlag` — the one reusable shape for every
  "resolved or flagged" value in this module.
- **`WebSearchFlag`**: the shared "couldn't determine" representation
  (spec.md Clarification Q2) — `{ status: 'flagged_for_web_search',
  reason, searchContext: { finding, documentExcerpt, partialFindings } }`.
- **`ClassificationResult`**: one finding's complete per-finding-workflow
  output — `findingId` + the finding's own identity fields (`action`,
  `scope`, `location`, `sourceQuote`, `pageHint`) + `materials`
  (array) + `labor` + `trade` (the latter two each possibly a
  `WebSearchFlag`).
## Directory Map and Modification Table

```text
src/features/estimate-extraction-pipeline/
├── classification/
│   ├── agent.ts                [DELETE] — replaced by agents.ts's 3 focused agents
│   ├── steps.ts                [DELETE] — replaced by finding-workflow.ts
│   ├── schema.ts               [MODIFY] — full rewrite: new TRADE (23 values),
│   │                            WebSearchFlag/determinedOr, ClassificationResult,
│   │                            billableLineSchema (field contract unchanged)
│   ├── agents.ts               [CREATE] — materialsAgent, laborAgent, tradeAgent
│   ├── flatten.ts              [CREATE] — buildLineId(), flattenClassificationResultsStep
│   ├── finding-workflow.ts     [CREATE] — per-finding nested workflow + failure-isolated wrapper
│   ├── workflow.ts             [CREATE] — classificationFanoutWorkflow (.foreach + flatten)
│   └── index.ts                [MODIFY] — the door: re-exports classificationFanoutWorkflow directly
├── pipeline.ts                 [MODIFY] — classificationFanoutWorkflow replaces lineClassifierAgentStep/
│                                buildLinesStep, composed directly via .then(); flaggedForWebSearch threaded through
└── index.ts                    [MODIFY] — Mastra registration: materialsAgent/laborAgent/
                                 tradeAgent replace lineClassifierAgent
src/features/estimate/lib/
├── envelope.ts                 [MODIFY] — flaggedForWebSearch: .default([]) on v3 schema
├── workflow.ts                 [MODIFY] — pass flaggedForWebSearch through to the envelope
└── format.ts                   [MODIFY] — formatTradeLabel gains 17 new trade-value cases
```

No file appears in more than one row above; the same list is used
verbatim in "Plan of Work" and "Exact File Changes" below.

## Pattern Audit and Evidence Ledger

| Decision | Repository or explicit-user evidence | Constraint learned | Reuse or deviation |
|---|---|---|---|
| Per-finding nested workflow, fanned out via `.foreach()` | `reference/workflows/workflow-methods/foreach` + `docs/workflows/control-flow` "Nested workflows inside foreach" (fetched this session) | "If you need to run multiple sequential operations per item, use a nested workflow instead of chaining multiple `.foreach()` calls" | Reuse — matches user's explicit instruction to mirror `pricing/workflow.ts`'s own `.foreach()` shape |
| Parent attaches document context before `.foreach()`, not inside the nested workflow | `docs/workflows/control-flow`: "Each nested workflow execution is independent with its own data flow" | A nested workflow's `getInitData()` returns only what the parent handed it as that array item, never an ancestor's own init data | Reuse of the documented mechanism, applied one level deeper than `pipeline.ts`'s own existing `getStepResult(parseDocumentStep)` usage |
| `classificationFanoutWorkflow` is composed DIRECTLY as a step in `pipeline.ts` — no wrapping function | `pricing/price-line.ts`'s own comment: a standalone `.createRun()` was empirically confirmed to leave `execute.mastra` undefined, which is WHY `pricingFanoutWorkflow` stays unregistered and wrapped behind `priceLines()`. `docs/workflows/overview` "Workflows as steps" (`Workflow` implements `Step`, so `.then(workflow)` composes directly); confirmed not just by docs but by compiling AND actually EXECUTING (via `tsx`) a throwaway probe replicating outer-workflow-composes-inner-fanout-workflow, with correct runtime output | An earlier draft (Pass 1-5) wrapped `classificationFanoutWorkflow` in a `classifyFindings()` function calling its own separate `.createRun()/.start()`, mirroring `pricing/index.ts`'s `priceLines()` shape purely for cross-module consistency — without checking whether pricing's OWN reason for that shape (the `execute.mastra`-loss workaround) actually applies to classification. It does not: classification's fan-out never reads `execute.mastra` | Corrected (Pass 6, prompted by direct user challenge to re-audit pricing as "terrible by design" rather than treat it as unquestioned precedent): `classificationFanoutWorkflow` is exported directly from the door and composed via a bare `.then()` in `pipeline.ts` — simpler, and does not reproduce a workaround for a constraint that doesn't apply |
| A bare `.map()` CAN be the first call in a workflow chain | `node_modules/@mastra/core/dist/workflows/workflow.d.ts` (read directly, not inferred from docs prose): the `Workflow` class's own generic defaults `TPrevSchema = TInput`, and `map()`'s signature is unconditional — nothing in the type requires a prior `.then()`. Confirmed by actually compiling a throwaway two-case probe (`.map().then(step)` and `.map().foreach(step)`) against the installed package with `pnpm exec tsc --noEmit`: **0 errors, both cases** | An earlier draft of this plan added two unnecessary named steps (`buildMaterialsPromptStep` in `finding-workflow.ts`, `attachDocumentToFindingsStep` in `workflow.ts`) purely from "no fetched doc example happened to show `.map()` first," which is absence of an example, not a documented constraint | Corrected — both replaced with a bare `.map()`, matching `pipeline.ts`'s own established "prompt right before an agent step via a bare `.map()`" pattern exactly, per direct user feedback that unverified caution should not be mistaken for a real requirement |
| Bare `createStep(agent, { structuredOutput })` for `materialsAgentStep`/`laborAgentStep`/`tradeAgentStep` | `extraction/steps.ts`'s `findingExtractorAgentStep` (read directly); `reference/workflows/step` "Agent step with structured output"; MASTRA-AGENT-WORKFLOW-STANDARD.md Rule 1 | None of the three agents needs per-call runtime control (unlike `pricing/price-line.ts`'s schema-switching case) | Reuse of the codebase's own default composition form |
| Per-finding failure isolation via one wrapping step (`findingClassificationStep`) around the nested workflow, not inside individual agent steps | `pricing/price-line.ts` (read directly): "a per-line failure records a 'lookup-failed' price rather than throwing, so one bad line never fails the whole `.foreach` batch" — the SAME resilience need, one level up (a nested-workflow's overall failure, not a single agent call's) | Mastra's own docs confirm `.foreach()` tracks `iterationStatus: 'success' \| 'failed' \| 'suspended'` per item during streaming, but do NOT document whether a non-streaming `run.start()` surfaces a partial array when one iteration's nested workflow fails — rather than rely on that undocumented behavior, catch explicitly at the one level where Mastra's own agent-step throw/retry model (Constitution III) would otherwise propagate | Deviation from a bare nested-workflow-as-`.foreach()`-step (the textbook-simplest form) specifically to avoid relying on unverified `.foreach()` failure semantics — recorded here rather than guessed past |
| `billableLineSchema`'s field contract preserved exactly | `pricing/price-line.ts` (read directly): its prompt-building code reads `line.trade`, `line.action`, `line.scope`, `line.location`, `line.costType`, `line.pricingBasis`, `line.quantity`, `line.unit`, `line.sourceQuote` by name | Removing/renaming any of these fields would break `pricing/price-line.ts` without touching it, violating FR-011 | Reuse — only `TRADE`'s value set and the ID-generation mechanism change |
| `pricingBasis` derivation rule (`material-part-only` / `labor-install-hourly` / `labor-all-in-hourly`) | Old (now-deleted) `classification/schema.ts`'s own doc comment on `laborLineSchema.pricingBasis`, cross-checked against `pricing/price-line.ts`'s own prompt text reading this field | This is genuinely correct, load-bearing domain logic pricing depends on — not itself "slop" even though it lived in the scrapped file | Reuse, moved into `flatten.ts`'s own logic (computed once, based on whether any material line was emitted for the same finding) |
| Trade taxonomy sourced from a real government PDF | Tennessee Board for Licensing Contractors' "Classification Outline with Trade Exam Requirements" (fetched, `pdftotext`-extracted, and read directly this session — see spec.md Clarification Q3 for the full citation) | A real, defensible, closed set exists; no `other` catch-all is needed | New — replaces the scrapped module's unsourced 11-value taxonomy entirely |
| `formatTradeLabel` extended additively, old cases kept | `format.ts` (read directly): its `default` branch already title-cases any unrecognized string safely | Removing old cases (`structural`/`appliance`/`exterior`/`interior`) would be a no-op (default already renders them identically); removing `other`'s special case would regress a legacy row's label from "General" to "Other" | Additive-only change — no existing case removed, 17 new cases added |
| Top-level `estimate-extraction-pipeline/index.ts` needs its own diff | Direct grep of every file importing from `classification`'s door (`grep -rln "estimate-extraction-pipeline/classification..." src/`) surfaced that this file — NOT listed in the original plan.md's Project Structure — imports `lineClassifierAgent` directly for `Mastra` instance registration | plan.md's own file list was incomplete; a plan produced before this grep would have shipped a broken `Mastra` registration (`lineClassifierAgent` no longer exported) | Correction made during this whiteboarding pass, not carried as an assumption from plan.md — recorded in the Review Log below |

## Interfaces and Dependencies

- **`classification/index.ts`'s new public contract**: `TRADE`,
  `EXTENT_UNIT`, `billableLineSchema`/`BillableLine`,
  `webSearchFlagSchema`/`WebSearchFlag`, `Trade` type,
  `classificationFanoutWorkflow` (a ready-composed `Workflow`, for
  `pipeline.ts` to `.then()` directly — not a wrapping function; Pass 6
  correction), and `materialsAgent`/`laborAgent`/`tradeAgent`
  (re-exported for Studio registration only, matching
  `extraction/index.ts`'s own `findingExtractorAgent` precedent).
  Everything this module no longer exports (`lineClassifierAgent`,
  `lineClassificationSchema`, `buildClassificationPrompt`,
  `lineClassifierAgentStep`, `buildLinesStep`, `COST_TYPE`) has zero
  remaining consumers after `pipeline.ts`'s and the top-level
  `estimate-extraction-pipeline/index.ts`'s own changes — verified by
  grepping every file that imports from `classification`'s door
  (`pipeline.ts`, the top-level `index.ts`, `pricing/index.ts`,
  `pricing/price-line.ts`, `pricing/workflow.ts`,
  `estimate/components/items-section.tsx`, `estimate/lib/envelope.ts`):
  the three `pricing/*.ts` files and `items-section.tsx` only import
  `BillableLine`/`billableLineSchema` (name and field contract
  unchanged — no update needed to any of them), and the top-level
  `index.ts` is the one file that DOES need updating (it registers
  `lineClassifierAgent` with the `Mastra` instance directly — added to
  this plan's file list above).
- **`pipeline.ts`'s `summarizeEstimateWorkflow.outputSchema`**: gains one
  new top-level field, `flaggedForWebSearch: WebSearchFlag[]` — additive,
  not a breaking change to the workflow's own contract (every existing
  field stays).
- **`estimate/lib/envelope.ts`'s `summaryEnvelopeV3Schema`**: gains
  `flaggedForWebSearch: z.array(webSearchFlagSchema).default([])` —
  `.default([])` means every already-persisted v3 row (with no such key)
  still parses successfully; no version bump.
- **No change to `pricing/`'s own files, `@mastra/tavily`'s
  `package.json` entry, or any database schema/migration.**
- **`@mastra/core` `^1.50.1`**: no version change; only newly-used APIs
  (`.foreach()` with a nested-workflow-shaped step, `createWorkflow`
  used as a step's internal implementation detail) are already part of
  this installed version, per the Mastra MCP docs fetched this session.

## Plan of Work

Dependency-ordered, independently verifiable milestones:

1. **Schema foundation** — `classification/schema.ts` (full rewrite).
   Outcome: the new `TRADE`, `WebSearchFlag`/`determinedOr`,
   `ClassificationResult`, and unchanged-contract `billableLineSchema`
   exist and type-check in isolation. Proof: `pnpm exec tsc --noEmit`
   scoped to this one file has no NEW errors introduced by it (other
   files still reference the OLD `agent.ts`/`steps.ts` until step 2-4,
   so a full-project `tsc` pass is not the right proof until step 6).
2. **Agents + per-finding workflow** — `classification/agents.ts`,
   `classification/flatten.ts`, `classification/finding-workflow.ts`
   (all created; delete `agent.ts`/`steps.ts` in the same milestone,
   since nothing else references the old names once these three exist).
   Outcome: `findingClassificationStep` is a complete, self-contained,
   failure-isolated unit exported from this file.
3. **Fan-out + door** — `classification/workflow.ts`,
   `classification/index.ts` (rewrite). Outcome: `classificationFanoutWorkflow`
   is callable end-to-end in isolation (unit-level, not yet wired into
   `pipeline.ts`), and is directly exported (no wrapping function).
4. **Pipeline wiring** — `pipeline.ts` and the top-level
   `estimate-extraction-pipeline/index.ts` (both modify). Outcome:
   `summarizeEstimateWorkflow` composes `classificationFanoutWorkflow`
   directly via `.then()` in place of the scrapped classification steps;
   `priceStep`/the workflow's own `outputSchema` carry
   `flaggedForWebSearch` through; the `Mastra`
   instance registers `materialsAgent`/`laborAgent`/`tradeAgent` in
   place of the retired `lineClassifierAgent`.
5. **Persistence + display** — `estimate/lib/envelope.ts`,
   `estimate/lib/workflow.ts`, `estimate/lib/format.ts` (all modify).
   Outcome: `flaggedForWebSearch` is never lost at the persistence
   boundary; the new taxonomy renders with clean labels.
6. **Full validation** — `pnpm exec tsc --noEmit`, `pnpm exec eslint`,
   the one-door/purity greps, `pnpm build`, then `pnpm eval:pipeline`
   against the real fixture (quickstart.md's scenarios).

Each milestone is safely ordered: nothing in an earlier milestone
references a symbol only a later milestone introduces (verified per-file
below in "Exact File Changes").
## Exact File Changes

### `src/features/estimate-extraction-pipeline/classification/agent.ts`
**Action:** Delete  
**Why:** Replaced by `agents.ts`'s three focused agents (`materialsAgent`, `laborAgent`, `tradeAgent`); this file's single `lineClassifierAgent` (with its `webSearch` Tavily tool) is the scrapped module's own named anti-pattern (a broken tool patched with prompt text; one large batched agent call)  
**Impact:** No other file may reference `lineClassifierAgent` after this deletion — verified: only `classification/steps.ts` (also deleted) and `classification/index.ts` (rewritten in this same plan) imported it

```diff
--- a/src/features/estimate-extraction-pipeline/classification/agent.ts
+++ b/src/features/estimate-extraction-pipeline/classification/agent.ts
@@ -1,143 +0,0 @@
-import { Agent } from '@mastra/core/agent';
-import { createTavilySearchTool } from '@mastra/tavily';
-import { pioneerGateway } from '../shared/gateway';
-
-/**
- * The agent has exactly one job: given a batch of already-grounded
- * findings, classify EACH ONE — trade, every material involved (name,
- * amount, unit), and the labor (type, hours) — from the finding's ACTUAL
- * CONTENT, grounded in real signal, NEVER a bare guess and NEVER null.
- *
- * Signal priority, in order:
- *   1. The finding's own sourceQuote.
- *   2. The rest of the source document (a nearby sentence may state a
- *      measurement the flagged sentence itself doesn't).
- *   3. A real web search — grounded in an actual market/industry
- *      reference (a typical job-scope convention, a sourced labor
- *      productivity rate) — used ONLY when steps 1-2 give nothing. This
- *      is a lookup against real external facts, not the model guessing
- *      from its own training data (that class of guess — see
- *      pricing/agent.ts's old itemPricerAgent, confirmed zero tools — is
- *      exactly what this replaces).
- *
- * Internal to the classification module — only classification/index.ts
- * calls `.generate()` on this.
- */
-export const lineClassifierAgent = new Agent({
-  id: 'line-classifier',
-  name: 'Billable Line Classifier',
-  instructions: `
-You read a batch of already-grounded billable findings from a home
-inspection report. For EACH finding, determine:
-1. Which TRADE would actually do the work.
-2. Every MATERIAL involved, by name, with a real quantity and unit.
-3. The LABOR involved: what type, and how many hours.
-
-NOTHING IS EVER NULL. Every material you list has a real quantity. Every
-finding gets a real labor hour count. If the finding's own text and the
-rest of the document give you no number, use your web search tool to
-ground a real one — never leave a gap, and never fabricate a number with
-no basis.
-
-READ THE CONTENT, NOT JUST THE ACTION VERB. "repair" does not always mean
-labor-only; "install"/"replace" does not always mean material-and-labor.
-Read what is actually being worked on.
-  action=repair, scope="damaged wood siding board" -> material present
-    (the board), labor present (installing it)
-  action=repair, scope="loose door hinge" -> no material, labor only
-  action=evaluate, scope="heat exchanger leak test" -> no material, labor
-    only (a specialist's time)
-
-MULTIPLE MATERIALS. If a finding names components that are DIFFERENT
-material types with DIFFERENT units (e.g. "trim or wood siding" — trim is
-linear-foot, siding is square-foot), list them as SEPARATE entries in
-"materials", each with its own name, quantity, and unit. Never collapse
-two differently-unit-typed materials into one line by picking only one
-unit and discarding the other.
-
-MATERIAL IDENTITY AND UNIT
-unit is the unit REAL CONTRACTORS use to quote that TYPE of material —
-determine it from what the material actually is, not from a fixed
-category table:
-  - Area-installed materials (siding, drywall, roofing, flooring,
-    sheathing, insulation, stucco, plaster) are quoted in "sf".
-  - Length-installed materials (trim, fascia, soffit, gutter, downspout,
-    fencing, railing, baseboard, casing, molding, flashing) are quoted in
-    "lf".
-  - Bulk volume (concrete, fill dirt) is quoted in "cy".
-  - Discrete, individually-purchased items (a receptacle, a breaker, a
-    valve, a damper door, a water heater, a single fixture) are quoted in
-    "ea".
-
-DETERMINING A REAL AMOUNT WHEN NONE IS STATED
-1. Check the finding's own sourceQuote for a stated number.
-2. Check the rest of the document you were given for a nearby stated
-   measurement (a different sentence, elsewhere on the page or report,
-   may state a dimension for the same area/component).
-3. If neither gives you a number, use your web search tool. Restrict your
-   search to reputable cost-estimating sources — prefer homeguide.com,
-   homewyse.com, angi.com, fixr.com, inchcalculator.com over generic
-   results; pass these as includeDomains on the search tool call. Ground
-   the amount in a real, defensible convention for the SPECIFIC scope
-   described — e.g. how contractors scope and price a single unmeasured
-   spot repair of this material type (many trades price small, unmeasured
-   repairs as a bounded minimum job, not an entire elevation/surface —
-   use that real convention, not an arbitrary number). Cite the URL you
-   used in "amountSource".
-   TOOL CALL PARAMETERS: only set fields you actually need. query and
-   includeDomains are normally enough. If you set includeRawContent, its
-   ONLY valid values are false, "markdown", or "text" — never true, never
-   any other string. If a tool call is rejected for invalid input, do NOT
-   give up and report "no results" — read the validation error, fix the
-   one invalid field, and call the tool again with corrected input.
-Never use "1" as a silent default. Every quantity must trace to something
-real — a stated number, a document-wide reference, or a cited search
-result.
-
-DETERMINING REAL LABOR HOURS
-1. If the finding's inspectorHours is present, use it.
-2. Otherwise, use your web search tool (same reputable-source restriction
-   as above) to find a real labor-productivity rate for this type of work
-   (hours per unit of the material involved, or a typical service-call
-   duration for labor-only work). Apply that rate to the material amount
-   you determined. Cite the URL you used in "laborHoursSource".
-Never invent hours with no basis, and never leave hours unset.
-
-TRADE
-"trade" MUST be EXACTLY one of these 11 literal values — never a
-different word, never a more specific specialty name, even if a more
-specific term feels more accurate:
-electrical, plumbing, hvac, roofing, structural, carpentry, masonry,
-appliance, exterior, interior, other.
-Map specialty work onto the closest listed value instead of inventing a
-new one — chimney/fireplace work -> structural (or exterior if it's the
-chimney's exterior masonry/flashing); door/window service -> carpentry;
-anything that doesn't fit cleanly -> other. "other" is always a valid,
-safe choice; a word not in this exact list is never valid, no matter how
-descriptive it sounds.
-
-OUTPUT FORMAT
-Return JSON matching the provided structured-output schema exactly: a
-single field "lines" which is an array, one entry per finding you were
-given, each citing its "findingId" exactly as given, with "materials" as
-an array (possibly empty for labor-only work) and
-"laborType"/"laborHours"/"laborHoursSource" always populated. Do not
-return a bare object — it must be wrapped in "lines". Classify every
-finding you receive — do not omit any.
-
-Do not include any commentary, explanation, preamble, or text outside the
-JSON.
-`,
-  model: pioneerGateway.chat('claude-fable-5'),
-  tools: {
-    webSearch: createTavilySearchTool(),
-  },
-  // Was a per-call option to `.stream()`. maxSteps defaults to 5 — a
-  // batch needing several real web searches plausibly needs more than 5
-  // tool-call steps. Moved to defaultOptions for the same reason as
-  // extraction's maxOutputTokens — createStep(agent, {...}) has no
-  // documented per-call option for this.
-  defaultOptions: {
-    maxSteps: 20,
-  },
-});
```

#### Reasoning
- Confirmed via grep this session that this module's only `webSearch`/Tavily usage anywhere in `src/` lives in this exact file.
- `@mastra/tavily` itself is NOT removed from `package.json` per explicit user instruction (a confirmed future consumer exists) — only this file's own use of it goes away.

### `src/features/estimate-extraction-pipeline/classification/steps.ts`
**Action:** Delete  
**Why:** Replaced by `finding-workflow.ts` (the new per-finding nested workflow) and `flatten.ts` (the new aggregate/flatten step); this file's `buildLinesStep` used an implicit, stringly-typed ID-suffixing convention (`${f.id}-material`, `${f.id}-labor`) that `flatten.ts`'s `buildLineId()` replaces with one named, typed function  
**Impact:** No other file may reference `buildClassificationPrompt`, `lineClassifierAgentStep`, or `buildLinesStep` after this deletion — `pipeline.ts`'s own diff (below) removes its only remaining references

```diff
--- a/src/features/estimate-extraction-pipeline/classification/steps.ts
+++ b/src/features/estimate-extraction-pipeline/classification/steps.ts
@@ -1,149 +0,0 @@
-import { createStep } from '@mastra/core/workflows';
-import { z } from 'zod';
-import { lineClassifierAgent } from './agent';
-import {
-  billableLineSchema,
-  classificationOutputSchema,
-  lineClassificationSchema,
-  type BillableLine,
-} from './schema';
-import { pioneerGateway } from '../shared/gateway';
-import { extractedFindingSchema, type ExtractedFinding } from '../extraction';
-
-/**
- * A plain function, NOT a `createStep()` — same reasoning as
- * `extraction/steps.ts`'s `buildExtractionPrompt`: Mastra's own
- * canonical docs example for "build a prompt right before an
- * agent-composed step" is a bare `.map()`, never a named step. Called
- * from a `.map()` directly in `pipeline.ts`. No dedup step precedes this
- * anymore — the prior implementation's dedup logic was removed after
- * review found no observed evidence it was still needed, since
- * `findingExtractorAgent` already enforces "ONE FINDING PER FIX" at the
- * source.
- */
-export function buildClassificationPrompt(findings: readonly ExtractedFinding[]): string {
-  return (
-    'Classify each finding below. Ground every material amount and ' +
-    'labor hour count in the document or a web search — never null, ' +
-    'never a bare guess. Return JSON matching the provided schema.\n\n' +
-    findings
-      .map(
-        (f) =>
-          `[${f.id}] action=${f.action} scope="${f.scope}" ` +
-          `location="${f.location}" statedQuantity=${f.statedQuantity ?? 'none'} ` +
-          `inspectorHours=${f.inspectorHours ?? 'none'} quote="${f.sourceQuote}"`,
-      )
-      .join('\n')
-  );
-}
-
-/**
- * NOT the bare `createStep(agent, { structuredOutput })` composition —
- * confirmed via `tsc`, not guessed: that overload's `structuredOutput`
- * type only accepts `{ schema }`, no `model` field. This agent needs
- * `structuredOutput.model` (the documented Mastra fix for combining
- * `tools` with `structuredOutput` in the same call —
- * docs/agents/structured-output, "Use a separate structuring model"),
- * which the bare composition form has no way to express. This is
- * exactly Rule 1's own documented exception: "if a step needs per-call
- * runtime control over the agent invocation... call the agent inside
- * that step's own `execute()` function instead" — matching
- * `pricing/price-line.ts`'s established, already-compliant shape.
- *
- * `.stream()`, not `.generate()` — this is the same long, tool-calling
- * batch call that live-reproduced a 504 Gateway Timeout under
- * `.generate()` earlier this session. No manual drain loop (Rule 4):
- * nothing documented requires draining `textStream` for `.object` to
- * resolve.
- */
-export const lineClassifierAgentStep = createStep({
-  id: 'line-classifier-agent',
-  inputSchema: z.object({ prompt: z.string() }),
-  outputSchema: classificationOutputSchema,
-  execute: async ({ inputData }) => {
-    const stream = await lineClassifierAgent.stream(
-      [{ role: 'user', content: [{ type: 'text', text: inputData.prompt }] }],
-      {
-        structuredOutput: {
-          schema: classificationOutputSchema,
-          model: pioneerGateway.chat('claude-fable-5'),
-        },
-      },
-    );
-    const result = await stream.object;
-    if (!result) {
-      throw new Error('Classification returned no structured object');
-    }
-    return result;
-  },
-});
-
-/**
- * Turn the agent's per-finding classification into fully-resolved
- * BillableLine(s) — material array -> N material lines, one labor line.
- * This IS a named step, correctly (Rule 2) — conditional per-material
- * splitting and id-suffixing is real logic worth naming and validating.
- * Input combines the classification output with the ORIGINAL findings
- * (needed for action/scope/location/sourceQuote/pageHint, which the
- * classifier's response never re-echoes) — that combination happens in
- * the `.map()` immediately before this step in pipeline.ts, via
- * `getStepResult(findingExtractorAgentStep)`.
- */
-export const buildLinesStep = createStep({
-  id: 'build-lines',
-  inputSchema: z.object({
-    findings: z.array(extractedFindingSchema),
-    classifications: z.array(lineClassificationSchema),
-  }),
-  outputSchema: z.object({ lines: z.array(billableLineSchema) }),
-  execute: async ({ inputData }) => {
-    const byFindingId = new Map(inputData.classifications.map((l) => [l.findingId, l]));
-    const lines: BillableLine[] = [];
-
-    for (const f of inputData.findings) {
-      const cls = byFindingId.get(f.id);
-      if (!cls) {
-        // Unresolved — the agent didn't classify a finding it was given.
-        // Throw rather than silently drop: an unclassified finding is a
-        // real failure, not a case to paper over with a fabricated line.
-        throw new Error(`Classification did not return a line for finding ${f.id}`);
-      }
-
-      const common = {
-        trade: cls.trade,
-        action: f.action,
-        scope: f.scope,
-        location: f.location,
-        sourceQuote: f.sourceQuote,
-        pageHint: f.pageHint,
-      };
-
-      const hasMaterial = cls.materials.length > 0;
-      cls.materials.forEach((m, i) => {
-        lines.push({
-          ...common,
-          id: cls.materials.length > 1 ? `${f.id}-material-${i}` : `${f.id}-material`,
-          costType: 'material',
-          material: m.material,
-          quantity: m.quantity,
-          unit: m.unit,
-          amountSource: m.amountSource,
-          pricingBasis: 'material-part-only',
-        });
-      });
-
-      lines.push({
-        ...common,
-        id: hasMaterial ? `${f.id}-labor` : f.id,
-        costType: 'labor',
-        laborType: cls.laborType,
-        unit: 'hrs',
-        quantity: cls.laborHours,
-        hoursSource: cls.laborHoursSource,
-        pricingBasis: hasMaterial ? 'labor-install-hourly' : 'labor-all-in-hourly',
-      });
-    }
-
-    return { lines };
-  },
-});
```

#### Reasoning
- This file's own comment claimed the bare `createStep(agent, { structuredOutput })` form doesn't accept a `model` field — verified this session (research.md R6) that this claim is FALSE by reading `@mastra/core`'s own compiled type declarations directly; the claim is not carried forward into the rebuild.

### `src/features/estimate-extraction-pipeline/classification/schema.ts`
**Action:** Modify  
**Why:** Full rewrite: the scrapped 11-value `TRADE` (with its `other` catch-all) is replaced by a sourced 23-value taxonomy; `COST_TYPE" (confirmed dead — no consumer anywhere) is dropped; the new `webSearchFlagSchema`/`determinedOr()`/`ClassificationResult` types support the honest "flagged for web search" contract FR-010 requires  
**Impact:** `billableLineSchema`'s field contract is UNCHANGED (verified against `pricing/price-line.ts`'s own field reads, research.md R8) — only `TRADE`'s value set changes, so `pricing/`'s three consuming files need no changes at all

```diff
--- a/src/features/estimate-extraction-pipeline/classification/schema.ts
+++ b/src/features/estimate-extraction-pipeline/classification/schema.ts
@@ -1,60 +1,136 @@
 import { z } from 'zod';
-import { ACTION } from '../extraction';
+import { ACTION, extractedFindingSchema } from '../extraction';
 
 /**
- * What trade would actually do this work. Assigned HERE, not by
- * extraction — this is a domain-taxonomy judgment, not a fact stated in
- * the report's text.
+ * Trades a residential home-inspection finding can plausibly implicate.
+ * Sourced from the Tennessee Board for Licensing Contractors'
+ * "Classification Outline with Trade Exam Requirements" (Rev. 5/2019),
+ * scoped to the residential-repair-relevant subset and cross-referenced
+ * against Maryland's/Virginia's separate licensing-board structures —
+ * see specs/003-classification-rebuild/spec.md Clarification Q3 for full
+ * sourcing and per-value rationale. Closed set, no `other` value — a
+ * trade that cannot be derived from this list produces a
+ * `WebSearchFlag` (below) instead, never a 24th catch-all value.
  */
 export const TRADE = [
   'electrical',
   'plumbing',
   'hvac',
+  'fire_protection',
   'roofing',
-  'structural',
+  'siding',
   'carpentry',
+  'drywall',
+  'flooring',
+  'glazing',
   'masonry',
-  'appliance',
-  'exterior',
-  'interior',
-  'other',
+  'painting',
+  'insulation',
+  'concrete',
+  'waterproofing',
+  'tile',
+  'foundation',
+  'excavation_grading',
+  'landscaping',
+  'fencing',
+  'mold_remediation',
+  'pest_control',
+  'general_contractor',
 ] as const;
 export type Trade = (typeof TRADE)[number];
 
 /**
- * Physical units a MATERIAL extent can be measured in. `hrs` is
- * deliberately absent — hours are not a physical extent. Assigned HERE
- * for the same reason as TRADE above. NOT a category->unit lookup table —
- * the agent determines the unit per material name it itself names (see
- * agent.ts); this is just the closed set of valid values.
+ * Physical units a MATERIAL quantity can be measured in. `hrs` is
+ * deliberately absent — hours are not a physical extent; they belong
+ * only to the labor determination below.
  */
 export const EXTENT_UNIT = ['ea', 'lf', 'sf', 'cy'] as const;
 export type ExtentUnit = (typeof EXTENT_UNIT)[number];
 
-export const COST_TYPE = ['labor', 'material'] as const;
-export type CostType = (typeof COST_TYPE)[number];
+/**
+ * The shared "couldn't determine" representation, reused identically
+ * for material quantity, labor hours, and trade (spec.md Clarifications
+ * Q2/Q3). Never a bare null, never a fabricated plausible-sounding
+ * value. Carries everything a future (out-of-scope-for-this-pass)
+ * web-search resolution step would need without re-deriving anything:
+ * the full originating finding, the surrounding parsed-document excerpt
+ * near its `pageHint` (captured once via `getInitData()`, not re-fetched
+ * later — see finding-workflow.ts), a short machine-readable reason, and
+ * whatever else this pass DID determine for the same finding.
+ */
+export const webSearchFlagSchema = z.object({
+  status: z.literal('flagged_for_web_search'),
+  reason: z.string().min(1).max(300),
+  searchContext: z.object({
+    finding: extractedFindingSchema,
+    documentExcerpt: z.string(),
+    partialFindings: z.object({
+      materials: z
+        .array(
+          z.object({
+            material: z.string(),
+            quantity: z.number().positive(),
+            unit: z.enum(EXTENT_UNIT),
+          }),
+        )
+        .optional(),
+      labor: z
+        .object({
+          laborType: z.string(),
+          hours: z.number().positive(),
+        })
+        .optional(),
+    }),
+  }),
+});
+export type WebSearchFlag = z.infer<typeof webSearchFlagSchema>;
 
 /**
- * What the pricer's number must cover for one line — computed ONCE, here,
- * at the same moment classification decides a finding's material/labor
- * lines, since that decision is exactly what determines this:
- *
- *   - 'material-part-only'   — a material line with at least one labor sibling.
- *   - 'labor-install-hourly' — the labor line when at least one material sibling exists.
- *     HOURLY RATE for installing the material(s); excludes part cost.
- *   - 'labor-all-in-hourly'  — labor with NO material sibling. The hourly
- *     rate must be the all-in rate a contractor quotes.
- *
- * A plain data field on each line, not a function pricing calls with
- * (action, costType) — pricing already has the line; it just reads this.
+ * Builds the discriminated "determined OR flagged" union used for every
+ * value in this module that can either be resolved or handed off
+ * unresolved. One reusable shape — not three separate ad hoc
+ * undetermined-handling schemes. Exported (not folder-private) so
+ * `finding-workflow.ts` can build each per-step output schema with it.
  */
-export const PRICING_BASIS = [
-  'material-part-only',
-  'labor-install-hourly',
-  'labor-all-in-hourly',
-] as const;
-export type PricingBasis = (typeof PRICING_BASIS)[number];
+export function determinedOr<T extends z.ZodTypeAny>(valueSchema: T) {
+  return z.discriminatedUnion('status', [
+    z.object({ status: z.literal('determined'), value: valueSchema }),
+    webSearchFlagSchema,
+  ]);
+}
 
+/** One physical material identified for a finding, before flattening. */
+export const materialDeterminationSchema = z.object({
+  material: z.string().min(1),
+  quantity: determinedOr(
+    z.object({
+      amount: z.number().positive(),
+      unit: z.enum(EXTENT_UNIT),
+    }),
+  ),
+  /**
+   * Present only alongside a 'determined' quantity — the grounding
+   * citation (a document quote, or in a future pass, a web-search
+   * citation). Omitted entirely when quantity is flagged.
+   */
+  amountSource: z.string().min(1).optional(),
+});
+export type MaterialDetermination = z.infer<typeof materialDeterminationSchema>;
+
+/** The labor identified for a finding, before flattening. */
+export const laborDeterminationSchema = z.object({
+  laborType: z.string().min(1),
+  hours: determinedOr(z.number().multipleOf(0.25).min(0.25)),
+  hoursSource: z.string().min(1).optional(),
+});
+export type LaborDetermination = z.infer<typeof laborDeterminationSchema>;
+
+/**
+ * A finding's identity fields that a billable line must carry through to
+ * pricing/rendering — factored out so both `classificationResultSchema`
+ * and the two line schemas below share one definition instead of two
+ * independently-maintained copies.
+ */
 const itemIdentityFields = {
   id: z.string(),
   trade: z.enum(TRADE),
@@ -69,43 +145,80 @@
 } as const;
 
 /**
- * ONE material billable line. A single finding can produce MULTIPLE of
- * these — e.g. "trim or wood siding" names two materials with two
- * DIFFERENT units (lf vs sf); collapsing them into one line would mean
- * silently picking a unit and hiding the other. `quantity` is NEVER
- * null — classification always resolves a real number (see agent.ts);
- * there is no "pending" state left for pricing to fill in.
+ * One finding's complete classification, as the per-finding nested
+ * workflow's own combine step (finding-workflow.ts) produces it. Carries
+ * the originating finding's own identity fields (`action`/`scope`/
+ * `location`/`sourceQuote`/`pageHint`, from `getInitData()`) alongside
+ * the three agents' own determinations, so `flatten.ts` is fully
+ * self-contained — no separate "merge findings back in by id" step like
+ * the scrapped module's `buildLinesStep` needed. `materials` is an
+ * ARRAY — zero, one, or many entries, each with its own unit — because
+ * one finding can genuinely span multiple differently-unit-typed
+ * materials. Zero materials is a valid, honest "labor-only" state, never
+ * an error (spec.md User Story 2).
  */
+export const classificationResultSchema = z.object({
+  findingId: z.string(),
+  action: z.enum(ACTION),
+  scope: z.string().min(1),
+  location: z.string().min(1),
+  sourceQuote: z.string().min(8).max(500),
+  pageHint: z
+    .string()
+    .regex(/^p\.\s*\d+$/)
+    .nullable(),
+  materials: z.array(materialDeterminationSchema),
+  labor: laborDeterminationSchema,
+  trade: determinedOr(z.enum(TRADE)),
+});
+export type ClassificationResult = z.infer<typeof classificationResultSchema>;
+
+/**
+ * ONE material billable line — the flattened handoff shape pricing
+ * consumes. Field contract preserved exactly as
+ * `pricing/price-line.ts` already reads it (`trade`, `action`, `scope`,
+ * `location`, `costType`, `pricingBasis`, `quantity`, `unit`,
+ * `sourceQuote`) — only `trade`'s value set changes in this rebuild.
+ * `quantity` is never null here — a flagged (undetermined) material
+ * never reaches this schema; it is surfaced via `webSearchFlagSchema`
+ * instead (see flatten.ts).
+ */
 export const materialLineSchema = z.object({
   ...itemIdentityFields,
   costType: z.literal('material'),
-  /** What the material actually is, e.g. "wood siding board", "exterior trim board". */
+  /** What the material actually is, e.g. "wood siding board". */
   material: z.string().min(1),
   quantity: z.number().positive(),
   unit: z.enum(EXTENT_UNIT),
-  /** Grounding for this number: a document citation, or a web-search citation. Never absent. */
   amountSource: z.string().min(1),
   pricingBasis: z.literal('material-part-only'),
 });
 
 /**
- * ONE labor billable line. `quantity` (hours) is NEVER null — same
- * reasoning as `materialLineSchema.quantity`. `hoursSource` replaced the
- * old closed enum (`'inspector' | 'estimated' | 'fallback'`) with a free
- * text citation, because "estimated" used to mean an ungrounded LLM guess
- * (`pricing/agent.ts`'s `itemPricerAgent`, confirmed zero tools) — this
- * field must always name where the number actually came from (a stated
- * inspector hour count, a specific web-search result), not a vague label.
+ * ONE labor billable line. Same "never null, never flagged" reasoning
+ * as `materialLineSchema.quantity` — a flagged labor-hours value never
+ * reaches this schema.
  */
 export const laborLineSchema = z.object({
   ...itemIdentityFields,
   costType: z.literal('labor'),
-  /** What the labor actually is, e.g. "siding/trim repair labor". */
+  /** What the labor actually is, e.g. "siding repair labor". */
   laborType: z.string().min(1),
-  /** Hours, in quarter-hour increments — the v3 mock's 0.25 / 1.5 / 3.5 / 4.5. */
+  /** Hours, in quarter-hour increments. */
   quantity: z.number().multipleOf(0.25).min(0.25),
   unit: z.literal('hrs'),
   hoursSource: z.string().min(1),
+  /**
+   * What the pricer's number must cover for this line:
+   *   - 'material-part-only'   — a material line with a labor sibling.
+   *   - 'labor-install-hourly' — labor with 1+ material siblings; the
+   *     hourly rate covers INSTALLING the material(s), excludes part cost.
+   *   - 'labor-all-in-hourly'  — labor with NO material sibling; the
+   *     all-in rate a contractor would quote.
+   * Computed once, in flatten.ts, from whether any material line was
+   * emitted for the same finding — pricing/price-line.ts already reads
+   * this field directly and is unchanged by this rebuild.
+   */
   pricingBasis: z.enum(['labor-install-hourly', 'labor-all-in-hourly']),
 });
 
@@ -117,36 +230,3 @@
 export type MaterialLine = z.infer<typeof materialLineSchema>;
 export type LaborLine = z.infer<typeof laborLineSchema>;
 export type BillableLine = z.infer<typeof billableLineSchema>;
-
-/**
- * One finding's classification, as the agent returns it. `materials` is
- * an ARRAY, not a single nullable object — 0, 1, or many entries, each
- * with its own unit, because one finding can genuinely span multiple
- * differently-unit-typed materials (see agent.ts). Empty array is a
- * valid, honest "no material" state; there is no null anywhere in this
- * schema — every number the agent emits is a real, grounded value.
- */
-export const lineClassificationSchema = z.object({
-  findingId: z.string(),
-  trade: z.enum(TRADE),
-  materials: z.array(
-    z.object({
-      material: z.string().min(1),
-      quantity: z.number().positive(),
-      unit: z.enum(EXTENT_UNIT),
-      amountSource: z.string().min(1),
-    }),
-  ),
-  laborType: z.string().min(1),
-  laborHours: z.number().positive(),
-  laborHoursSource: z.string().min(1),
-  reasoning: z.string().min(1),
-});
-
-export type LineClassification = z.infer<typeof lineClassificationSchema>;
-
-export const classificationOutputSchema = z.object({
-  lines: z.array(lineClassificationSchema),
-});
-
-export type ClassificationOutput = z.infer<typeof classificationOutputSchema>;
```

#### Reasoning
- `TRADE` sourced from the Tennessee Board for Licensing Contractors' published classification outline (spec.md Clarification Q3) — not guessed.
- `itemIdentityFields` is factored out and reused by both `classificationResultSchema` and the two line schemas, so a finding's identity fields (`action`/`scope`/`location`/`sourceQuote`/`pageHint`) are defined once, not duplicated — this is also what lets `flatten.ts` build a complete `BillableLine` without a separate "merge findings back in by id" step like the scrapped module's `buildLinesStep` needed.

### `src/features/estimate-extraction-pipeline/classification/agents.ts`
**Action:** Create  
**Why:** Three focused agents replace the scrapped module's single overloaded `lineClassifierAgent` (materials, labor, trade — matching the decoupled-but-context-sharing architecture spec.md requires)  
**Impact:** None of the three needs a tool (no web search this pass) or per-call runtime control — each is composed as a bare `createStep(agent, { structuredOutput })` in `finding-workflow.ts`

```diff
--- a/src/features/estimate-extraction-pipeline/classification/agents.ts
+++ b/src/features/estimate-extraction-pipeline/classification/agents.ts
@@ -0,0 +1,191 @@
+import { Agent } from '@mastra/core/agent';
+import { pioneerGateway } from '../shared/gateway';
+
+/**
+ * Determines material presence and, for each distinct material
+ * involved, a real quantity + unit — or, when no real basis exists,
+ * flags that material for future web-search resolution. Zero materials
+ * is a valid, honest answer (a labor-only finding); this agent must
+ * never invent a material to have something to return.
+ *
+ * Internal to the classification module — only `classification/index.ts`
+ * re-exports this, for Studio registration only. Composed as a step via
+ * bare `createStep(materialsAgent, { structuredOutput })` in
+ * `finding-workflow.ts` — no hand-rolled `.generate()`/`.stream()` call
+ * anywhere (MASTRA-AGENT-WORKFLOW-STANDARD.md Rule 1).
+ */
+export const materialsAgent = new Agent({
+  id: 'classification-materials',
+  name: 'Classification — Material Determination',
+  instructions: `
+You determine whether a home-inspection finding involves physical
+MATERIAL, and if so, exactly which materials and how much of each.
+
+INPUT
+You receive one finding (action, scope, location, statedQuantity,
+inspectorHours, sourceQuote, pageHint) plus a document excerpt: the text
+of the source report's page(s) surrounding where this finding's
+sourceQuote appears. Use the excerpt only to ground details about THIS
+finding — never borrow a fact that only supports a different finding
+elsewhere on the same page.
+
+DEFINITION
+A "material" is a physical, purchasable part or component the repair
+requires (a board, a panel, a fixture, a length of pipe, a bundle of
+shingles). Labor-only work (tightening, adjusting, cleaning, a service
+call) involves NO material — return an empty materials array. Do not
+invent a material just to have something to return.
+
+FOR EACH MATERIAL YOU IDENTIFY
+- material: a short, specific name for the physical item (e.g. "wood
+  siding board", "exterior trim board", "GFCI receptacle").
+- quantity: a real amount + a real unit (ea, lf, sf, or cy), grounded
+  either in the finding's own statedQuantity/sourceQuote or in a nearby
+  stated measurement in the document excerpt. If the finding or excerpt
+  genuinely gives no real basis for a quantity, return the FLAGGED shape
+  for that material's quantity instead of guessing — with a specific
+  "reason" (e.g. "no measurement or count stated near this finding") and
+  the full searchContext (finding, documentExcerpt, and whatever this
+  material's name and any partial quantity information you did
+  determine).
+- amountSource: when quantity is determined, name exactly where the
+  number came from (e.g. "sourceQuote states '20 shingles'", "p. 14
+  states siding section is 12 linear feet") — never a vague label like
+  "estimated".
+
+HARD RULES
+1. NEVER invent a quantity or unit with no real grounding. Flag instead.
+2. NEVER invent a material that the finding's action/scope doesn't
+   actually support.
+3. An empty materials array is a valid, complete, honest answer — not a
+   failure, not something to avoid.
+4. Do not determine labor, hours, or trade — those are separate steps.
+
+OUTPUT FORMAT
+Return JSON matching the provided structured-output schema exactly. No
+commentary, no preamble, no text outside the JSON.
+`,
+  model: pioneerGateway.chat('claude-fable-5'),
+});
+
+/**
+ * Determines labor type and hours for a finding. Every finding produces
+ * exactly one labor determination (spec.md Assumptions — no "zero
+ * labor" case is anticipated). May read the materials step's own result
+ * as OPTIONAL additional context when present, but its own correctness
+ * never depends on materials having produced anything (spec.md FR-005 —
+ * a labor-only finding must classify correctly with no material data
+ * present).
+ *
+ * Internal to the classification module — see `materialsAgent`'s own
+ * comment for the module-boundary and composition-form reasoning, which
+ * applies identically here.
+ */
+export const laborAgent = new Agent({
+  id: 'classification-labor',
+  name: 'Classification — Labor Determination',
+  instructions: `
+You determine the labor a home-inspection finding requires: what type of
+labor, and how many hours.
+
+INPUT
+You receive one finding (action, scope, location, statedQuantity,
+inspectorHours, sourceQuote, pageHint), a document excerpt (the source
+report's page(s) surrounding this finding), and — WHEN AVAILABLE — the
+materials already determined for this same finding. The materials
+context is informational only: if it is absent or empty, that is a
+completely normal labor-only finding, not a degraded or partial case.
+Never treat a missing/empty materials list as a reason to lower quality
+or invent a placeholder.
+
+FOR THE LABOR YOU DETERMINE
+- laborType: a short, specific description (e.g. "siding repair labor",
+  "GFCI receptacle replacement labor", "roof leak diagnostic labor").
+- hours: a real number in quarter-hour increments (0.25, 0.5, 0.75, 1.0,
+  ...), grounded either in the finding's own inspectorHours (if the
+  inspector explicitly stated one) or a reasonable, explicitly-cited
+  basis from the document excerpt. If neither the finding nor the
+  excerpt gives a real basis for an hour count, return the FLAGGED shape
+  instead of guessing — with a specific "reason" and the full
+  searchContext (finding, documentExcerpt, and the laborType you did
+  determine, plus any materials context you were given).
+- hoursSource: when hours is determined, name exactly where the number
+  came from (e.g. "inspectorHours states 1.5", "p. 9 estimates a
+  half-day for this scope") — never a vague label like "estimated".
+
+HARD RULES
+1. NEVER invent an hour count with no real grounding. Flag instead.
+2. NEVER let an absent/empty materials context degrade or block your own
+   determination — labor-only findings are common and must classify
+   exactly as completely as material-and-labor findings.
+3. Do not determine materials or trade — those are separate steps.
+
+OUTPUT FORMAT
+Return JSON matching the provided structured-output schema exactly. No
+commentary, no preamble, no text outside the JSON.
+`,
+  model: pioneerGateway.chat('claude-fable-5'),
+});
+
+/**
+ * Determines the trade associated with a finding, derived from the
+ * combination of its materials and labor determinations — never an
+ * independent first fact (spec.md FR-004). Selected from the closed,
+ * sourced 23-value taxonomy in `schema.ts`'s `TRADE`; a finding whose
+ * trade cannot be derived from that taxonomy even with full context
+ * flags instead of picking a generic/closest-guess value.
+ *
+ * Internal to the classification module — see `materialsAgent`'s own
+ * comment for the module-boundary and composition-form reasoning, which
+ * applies identically here.
+ */
+export const tradeAgent = new Agent({
+  id: 'classification-trade',
+  name: 'Classification — Trade Determination',
+  instructions: `
+You determine which contractor TRADE would actually perform a home-
+inspection finding's repair, given what materials and labor were
+already determined for it.
+
+INPUT
+You receive one finding (action, scope, location, sourceQuote,
+pageHint), a document excerpt, and the materials and labor already
+determined for this same finding (materials may be an empty array — a
+labor-only finding is normal).
+
+VALID TRADES (choose exactly one, or flag — see below)
+electrical, plumbing, hvac, fire_protection, roofing, siding, carpentry,
+drywall, flooring, glazing, masonry, painting, insulation, concrete,
+waterproofing, tile, foundation, excavation_grading, landscaping,
+fencing, mold_remediation, pest_control, general_contractor.
+
+HOW TO CHOOSE
+Reason from the actual materials and labor determined for this finding
+— e.g. a wood siding board + siding repair labor is "siding", not
+"carpentry" or "exterior"; a GFCI receptacle + electrical labor is
+"electrical"; a finding whose repair is small and genuinely spans
+multiple ordinary trades with no single dominant one is
+"general_contractor" (a real, licensed category — not a vague
+catch-all; use it deliberately, only when it is genuinely the most
+accurate answer, not as a default when unsure).
+
+IF NO TRADE FITS
+If, even with full finding + document context, no trade in the list
+above is a real, defensible fit, return the FLAGGED shape instead of
+forcing the closest-sounding value — with a specific "reason" and the
+full searchContext (finding, documentExcerpt, and the materials/labor
+you were given).
+
+HARD RULES
+1. NEVER pick a trade independently of the materials/labor you were
+   given — the trade must be CONSISTENT with them.
+2. NEVER invent a 24th trade value or force a poor fit. Flag instead.
+3. Do not determine materials, quantities, labor type, or hours — those
+   were already determined in earlier steps.
+
+OUTPUT FORMAT
+Return JSON matching the provided structured-output schema exactly. No
+commentary, no preamble, no text outside the JSON.
+`,
+  model: pioneerGateway.chat('claude-fable-5'),
+});
```

#### Reasoning
- Each agent's own instructions explicitly tell it to return the `flagged_for_web_search` shape (via its structured-output schema) rather than guess, when it has no real grounding — this is the PRIMARY mechanism for FR-010's honest-undetermined requirement; `finding-workflow.ts`'s own try/catch (below) is a SEPARATE, secondary mechanism for genuine infrastructure failures, not the same code path.
- `tradeAgent`'s instructions list all 23 valid trade values explicitly and instruct it to flag rather than force a poor fit — matching spec.md Q3's explicit rejection of a generic `other` fallback.

### `src/features/estimate-extraction-pipeline/classification/flatten.ts`
**Action:** Create  
**Why:** Turns each finding's `ClassificationResult` into pricing's flattened `BillableLine` handoff shape plus any `WebSearchFlag`s — the aggregate step that runs once after `.foreach()` collects every finding's own result  
**Impact:** `buildLineId()` is the one named, typed replacement for the scrapped module's scattered inline ID-suffixing (Constitution Principle VI's sanctioned "trivial data normalization with no SDK equivalent" exception)

```diff
--- a/src/features/estimate-extraction-pipeline/classification/flatten.ts
+++ b/src/features/estimate-extraction-pipeline/classification/flatten.ts
@@ -0,0 +1,139 @@
+import { createStep } from '@mastra/core/workflows';
+import { z } from 'zod';
+import {
+  billableLineSchema,
+  classificationResultSchema,
+  laborLineSchema,
+  materialLineSchema,
+  webSearchFlagSchema,
+  type ClassificationResult,
+} from './schema';
+
+/**
+ * One named, typed source of truth for a billable line's id — replacing
+ * the scrapped module's scattered inline string-suffixing
+ * (`${f.id}-material`, `${f.id}-material-${i}`, `${f.id}-labor`) with a
+ * single call site per kind. Trivial data normalization with no SDK
+ * equivalent — the sanctioned exception in Constitution Principle VI.
+ */
+export function buildLineId(
+  findingId: string,
+  kind: 'material' | 'labor',
+  index?: number,
+): string {
+  return kind === 'labor' ? `${findingId}:labor` : `${findingId}:material:${index}`;
+}
+
+/**
+ * Turns one finding's `ClassificationResult` into zero or more
+ * `BillableLine`s (the flattened shape `pricing/price-line.ts` already
+ * consumes) plus zero or more `WebSearchFlag`s. Runs once, after
+ * `.foreach()` collects every finding's own result — the documented
+ * `.foreach().then(aggregateStep)` map-reduce shape
+ * (docs/workflows/control-flow).
+ *
+ * Rules (data-model.md):
+ * 1. If `trade` is not `determined`, the WHOLE finding produces no
+ *    `BillableLine` this pass — a finding's lines all need a real trade
+ *    value, so a finding whose trade can't be resolved can't produce a
+ *    line pricing could act on regardless of how well materials/labor
+ *    resolved individually. Its trade flag (which already carries
+ *    whatever materials/labor context the trade agent was given) is
+ *    pushed to `flaggedForWebSearch` as-is.
+ * 2. Otherwise, each material with a `determined` quantity becomes one
+ *    `materialLineSchema` line (`pricingBasis: 'material-part-only'`); a
+ *    flagged material's quantity is pushed to `flaggedForWebSearch`
+ *    instead — deferring only THAT material, not its siblings or labor.
+ * 3. Labor with `determined` hours becomes one `laborLineSchema` line;
+ *    `pricingBasis` is `'labor-install-hourly'` when at least one
+ *    material line was emitted for this finding, else
+ *    `'labor-all-in-hourly'` — the same rule `pricing/price-line.ts`'s
+ *    prompt already relies on. Flagged hours are pushed to
+ *    `flaggedForWebSearch` instead.
+ */
+function flattenOneResult(result: ClassificationResult): {
+  lines: z.infer<typeof billableLineSchema>[];
+  flagged: z.infer<typeof webSearchFlagSchema>[];
+} {
+  const lines: z.infer<typeof billableLineSchema>[] = [];
+  const flagged: z.infer<typeof webSearchFlagSchema>[] = [];
+
+  if (result.trade.status !== 'determined') {
+    flagged.push(result.trade);
+    return { lines, flagged };
+  }
+  const trade = result.trade.value;
+
+  const materialLines: z.infer<typeof materialLineSchema>[] = [];
+  result.materials.forEach((material, index) => {
+    if (material.quantity.status !== 'determined') {
+      flagged.push(material.quantity);
+      return;
+    }
+    if (material.amountSource === undefined) {
+      throw new Error(
+        `material "${material.material}" has a determined quantity but no amountSource`,
+      );
+    }
+    materialLines.push({
+      id: buildLineId(result.findingId, 'material', index),
+      trade,
+      action: result.action,
+      scope: result.scope,
+      location: result.location,
+      sourceQuote: result.sourceQuote,
+      pageHint: result.pageHint,
+      material: material.material,
+      quantity: material.quantity.value.amount,
+      unit: material.quantity.value.unit,
+      amountSource: material.amountSource,
+      costType: 'material',
+      pricingBasis: 'material-part-only',
+    });
+  });
+  lines.push(...materialLines);
+
+  if (result.labor.hours.status !== 'determined') {
+    flagged.push(result.labor.hours);
+  } else {
+    if (result.labor.hoursSource === undefined) {
+      throw new Error('labor has determined hours but no hoursSource');
+    }
+    lines.push({
+      id: buildLineId(result.findingId, 'labor'),
+      trade,
+      action: result.action,
+      scope: result.scope,
+      location: result.location,
+      sourceQuote: result.sourceQuote,
+      pageHint: result.pageHint,
+      laborType: result.labor.laborType,
+      quantity: result.labor.hours.value,
+      unit: 'hrs',
+      hoursSource: result.labor.hoursSource,
+      costType: 'labor',
+      pricingBasis: materialLines.length > 0 ? 'labor-install-hourly' : 'labor-all-in-hourly',
+    });
+  }
+
+  return { lines, flagged };
+}
+
+export const flattenClassificationResultsStep = createStep({
+  id: 'flatten-classification-results',
+  inputSchema: z.array(classificationResultSchema),
+  outputSchema: z.object({
+    lines: z.array(billableLineSchema),
+    flaggedForWebSearch: z.array(webSearchFlagSchema),
+  }),
+  execute: async ({ inputData }) => {
+    const lines: z.infer<typeof billableLineSchema>[] = [];
+    const flaggedForWebSearch: z.infer<typeof webSearchFlagSchema>[] = [];
+    for (const result of inputData) {
+      const { lines: resultLines, flagged } = flattenOneResult(result);
+      lines.push(...resultLines);
+      flaggedForWebSearch.push(...flagged);
+    }
+    return { lines, flaggedForWebSearch };
+  },
+});
```

#### Reasoning
- Rule 1 (data-model.md): if `trade` isn't `determined`, the WHOLE finding produces no `BillableLine` this pass — a finding's lines all need a real trade value — and its trade flag is pushed to `flaggedForWebSearch` as-is (it already carries whatever materials/labor context the trade agent was given).
- Rule 2/3: each material/labor value is flagged independently — deferring only that one value, never its siblings — satisfying FR-005's decoupling requirement even at the flatten stage.
- `pricingBasis` is computed here from whether any material line was emitted for the same finding — the exact rule the (deleted) scrapped module's own schema comment already documented correctly, cross-checked directly against `pricing/price-line.ts`'s own prompt text that reads this field.

### `src/features/estimate-extraction-pipeline/classification/finding-workflow.ts`
**Action:** Create  
**Why:** The per-finding nested workflow (materials -> labor -> trade -> combine) plus `findingClassificationStep`, the one failure-isolated wrapper `workflow.ts`'s `.foreach()` actually uses  
**Impact:** This is the architectural core of the rebuild — decoupled-but-context-sharing determination, document-context grounding via `getInitData()`, and per-finding failure isolation all live here

```diff
--- a/src/features/estimate-extraction-pipeline/classification/finding-workflow.ts
+++ b/src/features/estimate-extraction-pipeline/classification/finding-workflow.ts
@@ -0,0 +1,251 @@
+import { createStep, createWorkflow } from '@mastra/core/workflows';
+import { z } from 'zod';
+import { extractedFindingSchema, type ExtractedFinding } from '../extraction';
+import { parsedDocumentSchema, type ParsedDocument } from '../document';
+import { materialsAgent, laborAgent, tradeAgent } from './agents';
+import {
+  TRADE,
+  determinedOr,
+  materialDeterminationSchema,
+  laborDeterminationSchema,
+  classificationResultSchema,
+} from './schema';
+import { createModuleLogger } from '../shared/logger';
+
+/** Module-scoped: constructed once, not per finding classified. */
+const log = createModuleLogger('classification-finding');
+
+const findingWithDocumentSchema = z.object({
+  finding: extractedFindingSchema,
+  parsedDocument: parsedDocumentSchema,
+});
+
+/**
+ * The surrounding parsed-document text near a finding's own `pageHint`
+ * — the current page plus one page of context on each side (spec.md
+ * FR-007). Bounded, not the whole document, so three agent calls per
+ * finding stay tractable; falls back to `''` when `pageHint` is absent
+ * or unparseable, since there is no anchor to build a window around.
+ */
+function excerptNearPageHint(parsedDocument: ParsedDocument, pageHint: string | null): string {
+  if (pageHint === null) return '';
+  const match = /^p\.\s*(\d+)$/.exec(pageHint);
+  if (!match) return '';
+  const pageNumber = Number(match[1]);
+  const nearby = parsedDocument.pages.filter(
+    (page) => Math.abs(page.pageNumber - pageNumber) <= 1,
+  );
+  return nearby.map((page) => `[p. ${page.pageNumber}]\n${page.content}`).join('\n\n');
+}
+
+function describeFinding(finding: ExtractedFinding): string {
+  return (
+    `action: ${finding.action}\n` +
+    `scope: ${finding.scope}\n` +
+    `location: ${finding.location}\n` +
+    `statedQuantity: ${finding.statedQuantity ?? 'not stated'}\n` +
+    `inspectorHours: ${finding.inspectorHours ?? 'not stated'}\n` +
+    `sourceQuote: ${JSON.stringify(finding.sourceQuote)}\n` +
+    `pageHint: ${finding.pageHint ?? 'not stated'}`
+  );
+}
+
+const materialsStepOutputSchema = z.object({
+  materials: z.array(materialDeterminationSchema),
+});
+
+const laborStepOutputSchema = z.object({
+  labor: laborDeterminationSchema,
+});
+
+const tradeStepOutputSchema = z.object({
+  trade: determinedOr(z.enum(TRADE)),
+});
+
+/**
+ * Bare `createStep(agent, { structuredOutput })` composition for all
+ * three agents — none needs per-call runtime control (research.md R4).
+ * Mastra owns the transport entirely; no hand-rolled
+ * `.generate()`/`.stream()` call anywhere in this file
+ * (MASTRA-AGENT-WORKFLOW-STANDARD.md Rule 1).
+ */
+const materialsAgentStep = createStep(materialsAgent, {
+  structuredOutput: { schema: materialsStepOutputSchema },
+  retries: 2,
+});
+
+const laborAgentStep = createStep(laborAgent, {
+  structuredOutput: { schema: laborStepOutputSchema },
+  retries: 2,
+});
+
+const tradeAgentStep = createStep(tradeAgent, {
+  structuredOutput: { schema: tradeStepOutputSchema },
+  retries: 2,
+});
+
+const combineResultStep = createStep({
+  id: 'combine-classification-result',
+  inputSchema: tradeStepOutputSchema,
+  outputSchema: classificationResultSchema,
+  execute: async ({ inputData, getInitData, getStepResult }) => {
+    const { finding } = getInitData<z.infer<typeof findingWithDocumentSchema>>();
+    const { materials } = getStepResult(materialsAgentStep);
+    const { labor } = getStepResult(laborAgentStep);
+    return {
+      findingId: finding.id,
+      action: finding.action,
+      scope: finding.scope,
+      location: finding.location,
+      sourceQuote: finding.sourceQuote,
+      pageHint: finding.pageHint,
+      materials,
+      labor,
+      trade: inputData.trade,
+    };
+  },
+});
+
+/**
+ * The per-finding nested workflow: build-materials-prompt -> materials
+ * -> labor -> trade -> combine. The first `.map()` builds the materials
+ * prompt directly from the workflow's own init data (its `inputData` at
+ * this position, before any `.then()`, is the workflow's own declared
+ * `inputSchema` — confirmed directly against the installed
+ * `@mastra/core` package's own `Workflow` class type declaration:
+ * `map()`'s `TPrevSchema` generic defaults to `TInput`, so `.map()` is a
+ * fully generic composition method with no constraint requiring a prior
+ * `.then()` — matching `pipeline.ts`'s own established "prompt right
+ * before an agent step via a bare `.map()`" pattern exactly, rather than
+ * a named step). Each `.map()` between agent steps builds that step's
+ * own prompt from `getInitData()` (the finding + its surrounding
+ * document excerpt, research.md R2) and, for labor/trade, the earlier
+ * steps' own results via `getStepResult()` (research.md R5) — offered as
+ * optional context only, never a hard dependency (spec.md FR-005/FR-006).
+ * NOT registered on the top-level `Mastra` instance and not exported
+ * outside this file — `findingClassificationStep` below is the one thing
+ * `workflow.ts` composes.
+ */
+const perFindingClassificationWorkflow = createWorkflow({
+  id: 'classify-one-finding',
+  inputSchema: findingWithDocumentSchema,
+  outputSchema: classificationResultSchema,
+})
+  .map(async ({ inputData }) => {
+    const excerpt = excerptNearPageHint(inputData.parsedDocument, inputData.finding.pageHint);
+    return {
+      prompt:
+        "Determine this finding's material(s), if any.\n\n" +
+        `FINDING\n${describeFinding(inputData.finding)}\n\n` +
+        `DOCUMENT EXCERPT NEAR THIS FINDING\n${excerpt || '(no page hint available)'}`,
+    };
+  })
+  .then(materialsAgentStep)
+  .map(async ({ getInitData, getStepResult }) => {
+    const { finding, parsedDocument } = getInitData<z.infer<typeof findingWithDocumentSchema>>();
+    const excerpt = excerptNearPageHint(parsedDocument, finding.pageHint);
+    const { materials } = getStepResult(materialsAgentStep);
+    const materialsContext =
+      materials.length > 0
+        ? materials
+            .map((m) =>
+              m.quantity.status === 'determined'
+                ? `${m.material}: ${m.quantity.value.amount} ${m.quantity.value.unit}`
+                : `${m.material}: quantity undetermined`,
+            )
+            .join('; ')
+        : '(no materials determined for this finding — a normal labor-only case)';
+    return {
+      prompt:
+        "Determine this finding's labor: type and hours.\n\n" +
+        `FINDING\n${describeFinding(finding)}\n\n` +
+        'MATERIALS ALREADY DETERMINED FOR THIS FINDING (context only, may be empty ' +
+        `— that is normal, not a degraded input)\n${materialsContext}\n\n` +
+        `DOCUMENT EXCERPT NEAR THIS FINDING\n${excerpt || '(no page hint available)'}`,
+    };
+  })
+  .then(laborAgentStep)
+  .map(async ({ getInitData, getStepResult }) => {
+    const { finding, parsedDocument } = getInitData<z.infer<typeof findingWithDocumentSchema>>();
+    const excerpt = excerptNearPageHint(parsedDocument, finding.pageHint);
+    const { materials } = getStepResult(materialsAgentStep);
+    const { labor } = getStepResult(laborAgentStep);
+    const materialsContext = materials.length > 0 ? materials.map((m) => m.material).join(', ') : '(none)';
+    const laborContext =
+      labor.hours.status === 'determined'
+        ? `${labor.laborType} (${labor.hours.value} hours)`
+        : `${labor.laborType} (hours undetermined)`;
+    return {
+      prompt:
+        "Determine this finding's trade, given its materials and labor.\n\n" +
+        `FINDING\n${describeFinding(finding)}\n\n` +
+        `MATERIALS: ${materialsContext}\n` +
+        `LABOR: ${laborContext}\n\n` +
+        `DOCUMENT EXCERPT NEAR THIS FINDING\n${excerpt || '(no page hint available)'}`,
+    };
+  })
+  .then(tradeAgentStep)
+  .then(combineResultStep)
+  .commit();
+
+/**
+ * One failure-isolated unit of work per finding — wraps
+ * `perFindingClassificationWorkflow` in its own try/catch so a genuine
+ * failure (a malformed structured-output response, a transient error
+ * surviving all `retries`) for ONE finding never fails the whole
+ * `.foreach()` batch in `workflow.ts`. Mirrors
+ * `pricing/price-line.ts`'s own already-accepted per-item resilience
+ * pattern — a per-item failure degrades to a typed, honest result
+ * instead of throwing, AND is logged (matching `price-line.ts`'s own
+ * `log.warn(...)` — a per-item failure being silent was a real gap in
+ * an earlier draft, not something to leave unfixed just because the
+ * caught error is being handled rather than thrown). A caught failure
+ * downgrades to the SAME `flagged_for_web_search` shape FR-010 already
+ * defines for an honest "couldn't determine" — not a second, competing
+ * error path.
+ */
+export const findingClassificationStep = createStep({
+  id: 'classify-finding',
+  inputSchema: findingWithDocumentSchema,
+  outputSchema: classificationResultSchema,
+  execute: async ({ inputData }) => {
+    try {
+      const run = await perFindingClassificationWorkflow.createRun();
+      const result = await run.start({ inputData });
+      if (result.status !== 'success') {
+        throw new Error(`classify-one-finding workflow ended non-success: ${result.status}`);
+      }
+      return result.result;
+    } catch (error) {
+      const { finding, parsedDocument } = inputData;
+      const errorMessage = error instanceof Error ? error.message : String(error);
+      log.warn('[classify-finding] per-finding failure', {
+        findingId: finding.id,
+        error: errorMessage,
+      });
+      // Bounded to stay within webSearchFlagSchema's own `reason` limit
+      // (max 300) — an unbounded error message (e.g. a verbose Zod
+      // validation error) must never cause THIS fallback path to fail
+      // its own schema validation; that would defeat the one thing this
+      // catch block exists to guarantee.
+      const reason = `classification failed: ${errorMessage}`.slice(0, 300);
+      const documentExcerpt = excerptNearPageHint(parsedDocument, finding.pageHint);
+      const flag = {
+        status: 'flagged_for_web_search' as const,
+        reason,
+        searchContext: { finding, documentExcerpt, partialFindings: {} },
+      };
+      return {
+        findingId: finding.id,
+        action: finding.action,
+        scope: finding.scope,
+        location: finding.location,
+        sourceQuote: finding.sourceQuote,
+        pageHint: finding.pageHint,
+        materials: [],
+        labor: { laborType: 'unavailable — classification step failed', hours: flag },
+        trade: flag,
+      };
+    }
+  },
+});
```

#### Reasoning
- `excerptNearPageHint()` bounds the document context to the finding's own page +/- 1, not the whole document — keeping three agent calls per finding tractable, satisfying FR-007 without the cost of re-sending an entire 40+ page report three times per finding.
- The first `.map()` (feeding directly into `materialsAgentStep`) is a bare `.map()`, not a named step — confirmed safe both by compiling a throwaway probe against the installed `@mastra/core` package (0 errors) and, further, by actually EXECUTING a runtime probe of this exact map->foreach->then shape via `tsx` (correct output, not just type-clean); an earlier draft used an unnecessary named step here from unverified caution, corrected per Pass 4 (Review Log below).
- Labor's and trade's own `.map()`s read materials/labor context via `getStepResult()` as OPTIONAL framing only ("context only, may be empty — that is normal, not a degraded input") — never a hard dependency, satisfying FR-005/FR-006.
- `findingClassificationStep`'s try/catch is a deliberate deviation from a bare nested-workflow-as-`.foreach()`-step (research.md/Pattern Audit): Mastra's own docs confirm `.foreach()` tracks per-iteration status during STREAMING but do not document non-streaming `run.start()` behavior when one iteration's nested workflow fails outright — rather than rely on that unverified behavior, this wrapper step catches explicitly, matching `pricing/price-line.ts`'s own already-accepted per-item resilience precedent, and downgrades to the SAME `flagged_for_web_search` shape FR-010 already defines (not a second, competing error path).
- **(Pass 2 fix)** The caught-failure `reason` string is bounded to `webSearchFlagSchema`'s own `max(300)` limit via `.slice(0, 300)`.
- **(Pass 6 fix)** The catch block now logs the failure (`log.warn(...)`, via `shared/logger.ts`'s `createModuleLogger` — the same mechanism `pricing/price-line.ts` uses for its own per-item failures) — an earlier draft silently swallowed a real per-finding failure with zero observability, a genuine gap surfaced by direct user challenge, not something to leave "handled so it's fine."

### `src/features/estimate-extraction-pipeline/classification/workflow.ts`
**Action:** Create  
**Why:** The fan-out workflow — attaches the shared `parsedDocument` to every finding, then `.foreach(findingClassificationStep, { concurrency })`, then flattens — mirroring `pricing/workflow.ts`'s own `.foreach()` usage exactly, per explicit user instruction  
**Impact:** Not separately registered on the top-level `Mastra` instance — not because of a context-loss workaround (unlike `pricingFanoutWorkflow`, see Pass 6/Context and Orientation), but simply because it's composed directly into `summarizeEstimateWorkflow` via `.then()` (`pipeline.ts`) and only the top-level workflow needs registering, matching Mastra's own "workflows as steps" example

```diff
--- a/src/features/estimate-extraction-pipeline/classification/workflow.ts
+++ b/src/features/estimate-extraction-pipeline/classification/workflow.ts
@@ -0,0 +1,55 @@
+import { createWorkflow } from '@mastra/core/workflows';
+import { z } from 'zod';
+import { extractedFindingSchema } from '../extraction';
+import { parsedDocumentSchema } from '../document';
+import { findingClassificationStep } from './finding-workflow';
+import { flattenClassificationResultsStep } from './flatten';
+import { billableLineSchema, webSearchFlagSchema } from './schema';
+
+/**
+ * How many findings' per-finding nested classification workflows run
+ * concurrently. An internal throughput knob, mirroring
+ * `pricing/workflow.ts`'s own `PRICING_CONCURRENCY`.
+ */
+const CLASSIFICATION_CONCURRENCY = 3;
+
+const classificationFanoutInputSchema = z.object({
+  findings: z.array(extractedFindingSchema),
+  parsedDocument: parsedDocumentSchema,
+});
+
+/**
+ * Internal fan-out workflow: classifies every finding concurrently via
+ * a per-finding nested workflow (`finding-workflow.ts`'s
+ * `findingClassificationStep`, itself wrapping
+ * `perFindingClassificationWorkflow` — research.md R1), then flattens
+ * every finding's result into pricing's handoff shape in one aggregate
+ * step (the documented `.foreach().then(aggregateStep)` map-reduce
+ * pattern). NOT exported outside this folder — `classification/index.ts`
+ * is the only caller. Mirrors `pricing/workflow.ts`'s own shape exactly
+ * (research.md R3).
+ *
+ * The first `.map()` attaches the shared `parsedDocument` to each
+ * individual finding, directly off the workflow's own init data — a
+ * bare `.map()`, not a named step, confirmed safe by actually compiling
+ * a throwaway probe against the installed `@mastra/core` package
+ * (`.map()` immediately followed by `.foreach()`, mirroring this exact
+ * shape): `pnpm exec tsc --noEmit` on the probe passed with zero errors.
+ * So every nested per-finding workflow instance receives its own
+ * document context via `getInitData()` (research.md R2) — `.foreach()`
+ * fans out over the array this `.map()` returns.
+ */
+export const classificationFanoutWorkflow = createWorkflow({
+  id: 'classification-fanout',
+  inputSchema: classificationFanoutInputSchema,
+  outputSchema: z.object({
+    lines: z.array(billableLineSchema),
+    flaggedForWebSearch: z.array(webSearchFlagSchema),
+  }),
+})
+  .map(async ({ inputData }) =>
+    inputData.findings.map((finding) => ({ finding, parsedDocument: inputData.parsedDocument })),
+  )
+  .foreach(findingClassificationStep, { concurrency: CLASSIFICATION_CONCURRENCY })
+  .then(flattenClassificationResultsStep)
+  .commit();
```

#### Reasoning
- The first `.map()` (attaching `parsedDocument` to every finding, feeding directly into `.foreach()`) is a bare `.map()`, not a named step — confirmed safe by actually compiling a throwaway probe of this exact shape (`.map()` immediately followed by `.foreach()`) against the installed `@mastra/core` package: `pnpm exec tsc --noEmit`, 0 errors. An earlier draft used an unnecessary named step (`attachDocumentToFindingsStep`) here from unverified caution, corrected per Pass 4 (Review Log below).
- Attaching `parsedDocument` to every array item BEFORE `.foreach()` (rather than trying to read it from inside the nested workflow) is required because a nested workflow's own `getInitData()` returns only what its own parent handed it as that array item — verified directly against `docs/workflows/control-flow`'s "Nested workflows inside foreach" section (research.md R2).

### `src/features/estimate-extraction-pipeline/classification/index.ts`
**Action:** Modify  
**Why:** The door: exports the new `TRADE`/`EXTENT_UNIT`/`billableLineSchema`/`webSearchFlagSchema`, and `classificationFanoutWorkflow` directly — Mastra's own documented "workflows as steps" pattern, not a wrapping async function (Pass 6 correction — see Review Log)  
**Impact:** `pipeline.ts` composes `classificationFanoutWorkflow` straight into its own `.then()` chain; nothing outside this folder may reach `schema.ts`/`agents.ts`/`workflow.ts`/`finding-workflow.ts`/`flatten.ts` directly (Constitution Principle I)

```diff
--- a/src/features/estimate-extraction-pipeline/classification/index.ts
+++ b/src/features/estimate-extraction-pipeline/classification/index.ts
@@ -1,22 +1,21 @@
 /**
  * THE DOOR — classification's complete public contract. `pipeline.ts`
- * composes these steps directly; nothing in this module calls
- * `.generate()`/`.stream()` by hand anywhere.
+ * composes `classificationFanoutWorkflow` directly as a step (Mastra's
+ * own documented "workflows as steps" pattern — `docs/workflows/overview`
+ * — matching how `extraction/index.ts` already re-exports
+ * `findingExtractorAgentStep` as a ready-composed primitive, not a
+ * wrapping function). Nothing in this module calls `.generate()`/
+ * `.stream()` by hand anywhere.
  */
 export {
+  TRADE,
+  EXTENT_UNIT,
   billableLineSchema,
+  webSearchFlagSchema,
   type BillableLine,
-  TRADE,
   type Trade,
-  EXTENT_UNIT,
-  type ExtentUnit,
-  lineClassificationSchema,
-  type LineClassification,
+  type WebSearchFlag,
 } from './schema';
-export {
-  buildClassificationPrompt,
-  lineClassifierAgentStep,
-  buildLinesStep,
-} from './steps';
-/** Re-exported for Mastra-instance registration ONLY — no module calls this directly. */
-export { lineClassifierAgent } from './agent';
+export { classificationFanoutWorkflow } from './workflow';
+/** Re-exported for Studio registration ONLY — no module calls these directly. */
+export { materialsAgent, laborAgent, tradeAgent } from './agents';
```

#### Reasoning
- **(Pass 6 correction)** An earlier draft exported a `classifyFindings()` async function that internally ran its own separate `.createRun()/.start()` on `classificationFanoutWorkflow` — mirroring `pricing/index.ts`'s `priceLines()` shape for CONSISTENCY, not because classification needed that indirection. Investigated why pricing's own fan-out uses that shape: `pricing/price-line.ts`'s own comment states a standalone `.createRun()` was empirically confirmed to leave `execute.mastra` undefined, which pricing's steps need for `mastra.getLogger()`. Classification's fan-out has no such need (its one failure-log line uses a plain module-scoped logger, not `execute.mastra` — see `finding-workflow.ts`), so the indirection was reproducing a workaround for a constraint that does not apply here. Corrected to export `classificationFanoutWorkflow` directly, matching `extraction/index.ts`'s own shape (it re-exports `findingExtractorAgentStep`, a ready-composed primitive, not a wrapping function) — verified end-to-end both by compiling AND by actually executing (via `tsx`) a throwaway probe replicating this exact outer-workflow-composes-inner-fanout-workflow shape, confirming correct runtime output, not just clean types.

### `src/features/estimate-extraction-pipeline/pipeline.ts`
**Action:** Modify  
**Why:** Replaces the scrapped `lineClassifierAgentStep`/`buildLinesStep` composition with `classificationFanoutWorkflow`, composed directly via `.then()` (Mastra's documented "workflows as steps" pattern — Pass 6 correction, see Review Log); threads `flaggedForWebSearch` through `priceStep` and the workflow's own `outputSchema`  
**Impact:** `summarizeEstimateWorkflow`'s output gains one new top-level field (`flaggedForWebSearch`) — additive, not breaking; every existing field (`lines`, `prices`, `parsedDocument`) is unchanged; no intermediate `classifyStep` wrapper exists in the final design

```diff
--- a/src/features/estimate-extraction-pipeline/pipeline.ts
+++ b/src/features/estimate-extraction-pipeline/pipeline.ts
@@ -1,30 +1,41 @@
 import { createStep, createWorkflow } from '@mastra/core/workflows';
 import { z } from 'zod';
 import { buildExtractionPrompt, findingExtractorAgentStep } from './extraction';
-import {
-  buildClassificationPrompt,
-  lineClassifierAgentStep,
-  buildLinesStep,
-  billableLineSchema,
-} from './classification';
+import { classificationFanoutWorkflow, billableLineSchema, webSearchFlagSchema } from './classification';
 import { priceLines, pricedLineItemSchema } from './pricing';
 import { parsePdfFromUrl, parsedDocumentSchema } from './document';
 
 /**
- * The composition root. Every agent call in this workflow is a native
- * `createStep(agent, { structuredOutput })` step (extraction, classification)
- * or an already-compliant `execute()`-based call for the one documented
- * exception (pricing, which needs per-line conditional schema selection).
- * No hand-rolled `.generate()`/`.stream()` orchestration anywhere in this
- * file or the modules it composes. See
- * plans/MASTRA-AGENT-WORKFLOW-STANDARD.md.
+ * The composition root. `findingExtractorAgentStep` and
+ * `classificationFanoutWorkflow` are both composed directly as steps —
+ * the latter via Mastra's own documented "workflows as steps" pattern
+ * (`docs/workflows/overview`: a `Workflow` implements `Step`, so it can
+ * be passed straight to `.then()`), not wrapped in an intermediate
+ * function. `priceStep` is the one named step whose `execute()` calls
+ * out to its own module's public door function (`priceLines()`) —
+ * pricing's own `pricingFanoutWorkflow` deliberately stays an
+ * unregistered, standalone-`.createRun()` sub-workflow because its own
+ * steps need `mastra.getLogger()` and a standalone run was confirmed
+ * (pricing/price-line.ts's own comment) to leave that undefined;
+ * classification's fan-out has no such need (its one per-finding
+ * failure-log line uses a plain module-scoped logger — see
+ * finding-workflow.ts — not `execute.mastra`), so composing it directly
+ * is both simpler and avoids reproducing a workaround for a constraint
+ * that doesn't apply here. Neither module hand-rolls `.generate()`/
+ * `.stream()` anywhere in its own internals: inside classification,
+ * every agent call is a bare `createStep(agent, { structuredOutput })`
+ * composed inside its own per-finding nested workflow (see
+ * classification/finding-workflow.ts); inside pricing, `price-line.ts`'s
+ * own per-line step is the one documented exception (it needs per-call
+ * conditional schema selection). See plans/MASTRA-AGENT-WORKFLOW-STANDARD.md.
  */
 
 /**
  * Named, shared — NOT redeclared inline at both `parseDocumentStep` and
  * `summarizeEstimateWorkflow` itself. Mastra's own stated core principle
- * (docs/workflows/control-flow: "The first step's inputSchema must match
- * the workflow's inputSchema") means these two HAVE to stay identical.
+ * (docs/workflows/control-flow: "The first step's inputSchema must
+ * match the workflow's inputSchema") means these two HAVE to stay
+ * identical.
  */
 const summarizeEstimateInputSchema = z.object({
   estimateRequestId: z.string(),
@@ -49,11 +60,13 @@
     zipCode: z.string(),
     lines: z.array(billableLineSchema),
     parsedDocument: parsedDocumentSchema,
+    flaggedForWebSearch: z.array(webSearchFlagSchema),
   }),
   outputSchema: z.object({
     lines: z.array(billableLineSchema),
     prices: z.array(pricedLineItemSchema),
     parsedDocument: parsedDocumentSchema,
+    flaggedForWebSearch: z.array(webSearchFlagSchema),
   }),
   execute: async ({ inputData }) => {
     const priced = await priceLines({
@@ -64,6 +77,7 @@
     return {
       ...priced,
       parsedDocument: inputData.parsedDocument,
+      flaggedForWebSearch: inputData.flaggedForWebSearch,
     };
   },
 });
@@ -83,23 +97,20 @@
     prompt: buildExtractionPrompt(inputData.parsedDocument),
   }))
   .then(findingExtractorAgentStep)
-  // Build the classification prompt — same reasoning as above.
-  .map(async ({ inputData }) => ({
-    prompt: buildClassificationPrompt(inputData.findings),
-  }))
-  .then(lineClassifierAgentStep)
-  // Recombine the classifier's per-finding output with the findings it
-  // was classifying (the classifier never re-echoes
-  // action/scope/location/sourceQuote — buildLinesStep needs them).
+  // Recombine the extractor's findings with the parsed document
+  // classification needs for per-finding document-context grounding
+  // (spec.md FR-007) — the document fell out of the agent-step data
+  // flow several steps back, so it is re-attached here via
+  // `getStepResult()`, the same mechanism already used below.
   .map(async ({ inputData, getStepResult }) => ({
-    findings: getStepResult(findingExtractorAgentStep).findings,
-    classifications: inputData.lines,
+    findings: inputData.findings,
+    parsedDocument: getStepResult(parseDocumentStep).parsedDocument,
   }))
-  .then(buildLinesStep)
-  // Recombine the built lines with everything priceStep needs that fell
-  // out of the agent-step data flow: the workflow's own init data
-  // (estimateRequestId, zipCode) and the parsed document from several
-  // steps back.
+  .then(classificationFanoutWorkflow)
+  // Recombine classification's output with everything priceStep needs
+  // that fell out of the agent-step data flow: the workflow's own init
+  // data (estimateRequestId, zipCode) and the parsed document from
+  // several steps back.
   //
   // getInitData<...> uses an explicit inline type matching this
   // workflow's own declared inputSchema, NOT `typeof summarizeEstimateWorkflow`
@@ -117,6 +128,7 @@
       zipCode: init.zipCode,
       lines: inputData.lines,
       parsedDocument,
+      flaggedForWebSearch: inputData.flaggedForWebSearch,
     };
   })
   .then(priceStep)
```

#### Reasoning
- The `.map()` immediately after `findingExtractorAgentStep` re-attaches `parsedDocument` (via `getStepResult(parseDocumentStep)`) because classification now needs the WHOLE parsed document (not just a prompt string) to attach per-finding document context.
- **(Pass 6 correction)** `classificationFanoutWorkflow` is composed directly via `.then()`, not through an intermediate `classifyStep`/`classifyFindings()` wrapper (removed — see `classification/index.ts`'s own Reasoning). This is both simpler (one fewer file-local step, one fewer function) and correctly reflects that classification's fan-out has no reason to run as a separate, standalone, unregistered sub-run the way pricing's does — it can be, and now is, literally part of `summarizeEstimateWorkflow`'s own execution graph.

### `src/features/estimate-extraction-pipeline/index.ts`
**Action:** Modify  
**Why:** Mastra instance registration: the scrapped `lineClassifierAgent` (which no longer exists after this rebuild) is replaced by the three new agents (`materialsAgent`, `laborAgent`, `tradeAgent`)  
**Impact:** This file was NOT in the original plan.md's Project Structure — surfaced by grepping every consumer of `classification`'s door during this whiteboarding pass (Pattern Audit table, Review Log below); without this change, `Mastra`'s constructor call would reference an undefined import and fail to compile

```diff
--- a/src/features/estimate-extraction-pipeline/index.ts
+++ b/src/features/estimate-extraction-pipeline/index.ts
@@ -4,7 +4,7 @@
   findingExtractorAgent,
   extractionConsistencyScorer,
 } from './extraction';
-import { lineClassifierAgent } from './classification';
+import { materialsAgent, laborAgent, tradeAgent } from './classification';
 import { itemPricerAgent } from './pricing';
 import { summarizeEstimateWorkflow } from './pipeline';
 
@@ -14,7 +14,9 @@
  * it — because registering with Studio is Mastra's own framework
  * boundary, not a peer-module dependency. Nothing here calls `.generate()`
  * on any agent; that only ever happens inside extraction/index.ts,
- * classification/index.ts, and pricing/price-line.ts respectively.
+ * classification/finding-workflow.ts (via its own per-finding nested
+ * workflow's bare agent-step composition), and pricing/price-line.ts
+ * respectively.
  *
  * `logger` is explicit rather than left to Mastra's bare unnamed default:
  * without it, every internally-emitted log line (agent runs, scorer runs,
@@ -26,7 +28,9 @@
 export const mastra = new Mastra({
   agents: {
     'finding-extractor': findingExtractorAgent,
-    'line-classifier': lineClassifierAgent,
+    'classification-materials': materialsAgent,
+    'classification-labor': laborAgent,
+    'classification-trade': tradeAgent,
     'item-pricer': itemPricerAgent,
   },
   scorers: { 'extraction-consistency': extractionConsistencyScorer },
```

#### Reasoning
- Registered under new keys (`classification-materials`/`classification-labor`/`classification-trade`) matching each agent's own `id` field in `agents.ts`, replacing the single `'line-classifier'` key — Studio's own agent list simply shows three agents instead of one, which is the intended, visible reflection of the architecture change.

### `src/features/estimate/lib/envelope.ts`
**Action:** Modify  
**Why:** Adds `flaggedForWebSearch: z.array(webSearchFlagSchema).default([])` to `summaryEnvelopeV3Schema` and the `'v3'` `ParsedEnvelope` variant, so this data is never silently dropped at the persistence boundary (FR-009)  
**Impact:** `.default([])` matches `parsedDocument`'s own existing precedent exactly — every already-persisted v3 row (with no such key) still parses successfully; no version bump, no migration

```diff
--- a/src/features/estimate/lib/envelope.ts
+++ b/src/features/estimate/lib/envelope.ts
@@ -1,5 +1,10 @@
 import { z } from 'zod';
-import { billableLineSchema, type BillableLine } from '@/features/estimate-extraction-pipeline/classification';
+import {
+  billableLineSchema,
+  webSearchFlagSchema,
+  type BillableLine,
+  type WebSearchFlag,
+} from '@/features/estimate-extraction-pipeline/classification';
 import { pricedLineItemSchema, type PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';
 import {
   parsedDocumentSchema,
@@ -66,6 +71,16 @@
    * moment this ships.
    */
   parsedDocument: parsedDocumentSchema.default({ pages: [] }),
+  /**
+   * Findings whose material quantity, labor hours, or trade could not
+   * be grounded this pass (classification's `flagged_for_web_search`
+   * contract — see classification/schema.ts). `.default([])` for the
+   * same reason as `parsedDocument` above: no existing v3 row has this
+   * key. Not yet rendered anywhere in the UI (out of scope for the
+   * classification rebuild that introduced this field) — persisted here
+   * only so it is never silently dropped at the persistence boundary.
+   */
+  flaggedForWebSearch: z.array(webSearchFlagSchema).default([]),
 });
 
 export type SummaryEnvelopeV3 = z.infer<typeof summaryEnvelopeV3Schema>;
@@ -92,6 +107,7 @@
       lines: BillableLine[];
       prices: PricedLineItem[];
       parsedDocument: ParsedDocument;
+      flaggedForWebSearch: WebSearchFlag[];
     }
   | { kind: 'unparseable'; raw: string }
   | { kind: 'absent' };
@@ -113,6 +129,7 @@
       lines: v3.data.lines,
       prices: v3.data.prices,
       parsedDocument: v3.data.parsedDocument,
+      flaggedForWebSearch: v3.data.flaggedForWebSearch,
     };
   }
 
```

#### Reasoning
- No UI rendering of `flaggedForWebSearch` is added in this pass — out of scope per spec.md's own subject (the determination/data-contract, not a UI feature) — the data is simply no longer silently dropped.

### `src/features/estimate/lib/workflow.ts`
**Action:** Modify  
**Why:** `triggerSummarizeEstimate` passes `result.result.flaggedForWebSearch` through when constructing the `SummaryEnvelopeV3`, the same way it already passes `parsedDocument` through  
**Impact:** One line added; no other logic in this file changes

```diff
--- a/src/features/estimate/lib/workflow.ts
+++ b/src/features/estimate/lib/workflow.ts
@@ -60,6 +60,7 @@
           lines: result.result.lines,
           prices: result.result.prices,
           parsedDocument: result.result.parsedDocument,
+          flaggedForWebSearch: result.result.flaggedForWebSearch,
         };
         await db
           .update(estimateRequestTable)
```

#### Reasoning
- This is the single writer of `estimate_requests` rows (Constitution/this file's own doc comment) — the only place this pass-through can correctly happen.

### `src/features/estimate/lib/format.ts`
**Action:** Modify  
**Why:** `formatTradeLabel`'s `switch` gains 17 new cases for the rebuilt taxonomy's values not already covered by an existing case  
**Impact:** Purely additive — every existing case (including `other` -> "General", kept for legacy v1/v2 rows) and the `default" branch are unchanged

```diff
--- a/src/features/estimate/lib/format.ts
+++ b/src/features/estimate/lib/format.ts
@@ -62,6 +62,14 @@
  * lowercase short codes ("hvac", "interior", ...); invoices and estimates
  * print these as capitalized category labels ("HVAC", "Interior"). The
  * report uses this as the small eyebrow above each line title.
+ *
+ * Covers both the current 23-value taxonomy (classification's rebuilt
+ * `TRADE`, specs/003-classification-rebuild) and the retired 11-value
+ * taxonomy's remaining special-cased labels ('hvac', 'other') still
+ * possibly present on rows persisted before that rebuild — the retired
+ * taxonomy's other plain-word values ('structural', 'appliance',
+ * 'exterior', 'interior') are not special-cased because the `default`
+ * branch's title-casing already renders them identically.
  */
 export function formatTradeLabel(trade: string): string {
   switch (trade) {
@@ -71,14 +79,48 @@
       return 'Electrical';
     case 'plumbing':
       return 'Plumbing';
+    case 'fire_protection':
+      return 'Fire Protection';
     case 'roofing':
       return 'Roofing';
+    case 'siding':
+      return 'Siding';
     case 'structural':
       return 'Structural';
     case 'carpentry':
       return 'Carpentry';
+    case 'drywall':
+      return 'Drywall';
+    case 'flooring':
+      return 'Flooring';
+    case 'glazing':
+      return 'Glazing';
     case 'masonry':
       return 'Masonry';
+    case 'painting':
+      return 'Painting';
+    case 'insulation':
+      return 'Insulation';
+    case 'concrete':
+      return 'Concrete';
+    case 'waterproofing':
+      return 'Waterproofing';
+    case 'tile':
+      return 'Tile';
+    case 'foundation':
+      return 'Foundation';
+    case 'excavation_grading':
+      return 'Excavation & Grading';
+    case 'landscaping':
+      return 'Landscaping';
+    case 'fencing':
+      return 'Fencing';
+    case 'mold_remediation':
+      return 'Mold Remediation';
+    case 'pest_control':
+      return 'Pest Control';
+    case 'general_contractor':
+      return 'General Contractor';
     case 'appliance':
       return 'Appliance';
     case 'exterior':
```

#### Reasoning
- `structural`/`appliance`/`exterior`/`interior` (the scrapped taxonomy's remaining plain-word values) are NOT removed — the `default` branch's title-casing already renders them identically, so removing them would be a no-op change with no behavioral difference, not worth the risk of a typo regressing a legacy row's label.

## Concrete Steps

All commands run from the repository root
(`/Users/dev/.warp/worktrees/fixpro-app-dashboard/falcon-bighorn`).

1. Apply every diff in "Exact File Changes" above, in the listed order
   (deletes first, then creates, then modifies — though since no two
   diffs touch the same file, order does not actually matter for
   correctness, only for readability).
2. `pnpm exec tsc --noEmit`
   **Expected**: no errors. In particular: no reference anywhere in
   `src/` to `lineClassifierAgent`, `lineClassificationSchema`,
   `buildClassificationPrompt`, `lineClassifierAgentStep`,
   `buildLinesStep`, or `COST_TYPE`.
3. `pnpm exec eslint src/features/estimate-extraction-pipeline/classification src/features/estimate-extraction-pipeline/pipeline.ts src/features/estimate-extraction-pipeline/index.ts src/features/estimate/lib/envelope.ts src/features/estimate/lib/workflow.ts src/features/estimate/lib/format.ts`
   **Expected**: clean (project-level `pnpm lint` is broken under the
   current Next.js version per the constitution's own Development
   Workflow section — this scoped `eslint` invocation is the actual
   gate).
4. Re-run every one-door boundary grep and the purity grep from
   `AGENTS.md` against the new `classification/` layout.
   **Expected**: zero results for any deep import
   (`classification/schema`, `classification/agents`,
   `classification/workflow`, `classification/finding-workflow`,
   `classification/flatten`) from outside the folder, and zero
   `@/db`/`@/features/estimate/` imports inside `classification/`.
5. `pnpm build`
   **Expected**: clean build.
6. `pnpm eval:pipeline`
   **Expected**: the harness runs the real `summarize-estimate` workflow
   against the existing fixture end-to-end without a hard failure. Its
   classification-facing scorer(s), if they reference the old 11-value
   `TRADE` set or old field names, may report mismatches against the new
   taxonomy/shape — expected and tracked separately (tasks.md T025), not
   a blocker for this plan's own validation, per this project's own
   standing instruction that scorer precision must never block the
   pipeline itself.

## Validation and Acceptance

- **Success — material-and-labor finding** (SC-003): manually locate a
  finding in the eval fixture describing both a physical part and
  installation work (e.g. a damaged-board repair); confirm the run's
  `lines` array contains both a `materialLineSchema` entry (real
  `material`/`quantity`/`unit`) and a `laborLineSchema` entry (real
  `laborType`/`quantity` hours) for that finding's id.
- **Success — labor-only finding** (SC-002): manually locate a
  labor-only finding (e.g. a loose-fixture or service-call finding);
  confirm the run produces a `laborLineSchema` entry for it and ZERO
  `materialLineSchema` entries with that finding's id — with no error
  and no different code path taken (spec.md FR-005).
- **Success — trade consistency** (SC-004): for 5-10 sampled
  `BillableLine`s, manually confirm `trade` is one of the 23 taxonomy
  values and is the trade a real contractor would send for that
  specific material/labor combination.
- **Failure/boundary — honest flagging** (SC-005): identify or
  temporarily construct a finding with no determinable quantity/hours/
  trade; confirm the run's `flaggedForWebSearch` array contains an entry
  whose `searchContext.finding` and `searchContext.documentExcerpt` are
  non-empty and whose `reason` is specific (not a generic placeholder).
- **Failure/boundary — per-finding isolation** (SC-006): per
  quickstart.md Scenario 4, temporarily force one finding's classification
  to fail (e.g. inject a schema mismatch for one test run) and confirm
  every OTHER finding in the same run still completes normally, with the
  forced-failure finding appearing in `flaggedForWebSearch` instead of
  failing the whole workflow run.
- **Regression — pricing untouched** (FR-011): `git diff --stat` after
  applying this plan shows zero changes under
  `src/features/estimate-extraction-pipeline/pricing/`.
- **Compatibility — legacy envelope rows**: a v3 row persisted before
  this change (no `flaggedForWebSearch` key) still parses successfully
  via `summaryEnvelopeV3Schema.safeParse` (the `.default([])` guarantees
  this) — verifiable by constructing a JSON literal matching the OLD v3
  shape (no `flaggedForWebSearch` key) and confirming
  `parseSummaryEnvelope` still returns `{ kind: 'v3', ... }`, not
  `'unparseable'`.

## Idempotence and Recovery

- No database migration, no generated file, no external state change —
  every change in this plan is a source file edit. Re-applying an
  already-applied diff is a no-op check (`git apply --check` on an
  already-applied patch fails cleanly with "patch does not apply,"
  which is the expected, safe signal — not a corruption risk).
- If `pnpm eval:pipeline` (step 6) surfaces a classification-scorer
  mismatch, that is expected and does not require rolling back any file
  in this plan — it is a separate, tracked follow-up (tasks.md T025),
  consistent with this project's standing instruction that scorer
  precision must never gate the pipeline itself.
- If `tsc`/`eslint`/the one-door greps (steps 2-4) surface an issue, fix
  it in the same small set of files this plan already lists — no file
  outside this plan's own list should need touching to resolve a
  type/lint/boundary error introduced by this plan.

## Risks and Decisions

- **Risk**: `.foreach()`'s failure-propagation semantics for a
  non-streaming `run.start()` when one nested-workflow iteration fails
  outright are not documented anywhere fetched this session (only the
  streaming `iterationStatus` field is documented). **Decision**
  (2026-07-16): do not rely on this undocumented behavior — wrap each
  per-finding nested workflow in its own explicit try/catch
  (`findingClassificationStep`), matching `pricing/price-line.ts`'s own
  already-accepted per-item resilience precedent. This makes the
  resilience guarantee independent of whatever `.foreach()`'s actual
  undocumented behavior turns out to be.
- **Risk**: the top-level `estimate-extraction-pipeline/index.ts`'s own
  dependency on `lineClassifierAgent` was absent from the originally
  routed plan.md's Project Structure. **Decision** (2026-07-16):
  corrected during this whiteboarding pass after a direct grep of every
  consumer of `classification`'s door surfaced it — added to this
  plan's file list and given its own exact diff (see Pattern Audit and
  Review Log).
- **Risk**: three agent calls per finding (materials, labor, trade) is
  strictly more model calls than the scrapped module's one batched call
  per finding, at real cost/latency. **Decision**: accepted deliberately
  — the scrapped module's own one-large-batched-call architecture was
  explicitly named as an anti-pattern in this feature's own scope
  (spec.md Input), and per-finding decoupling (spec.md's core
  requirement) is not achievable with a single shared call.
- **Risk**: `formatTradeLabel`'s new cases are UI polish, not a
  functional requirement of spec.md's own Success Criteria (which are
  backend/data-outcome focused, not UI-focused). **Decision**: included
  anyway, scoped as a minimal, purely additive touch (data-model.md,
  plan.md) — an unrecognized trade value would still render safely via
  the existing `default` branch even without this change, so this is
  quality polish, not a break-fix, and does not expand this plan's own
  scope beyond what's needed for the new taxonomy to display cleanly.

## Review Log

**2026-07-16 — Pass 1 (Scaffold — this pass)**

This is the initial scaffold of a previously-empty plan document, not
yet an independent review pass (a Scaffold pass may not conclude
`Prepared` per this skill's own mode rules — a later pass must reread
the complete plan fresh and independently re-verify it before that
status is earned).

Checks performed while drafting:
- Traced every consumer of `classification`'s door via
  `grep -rln "estimate-extraction-pipeline/classification\|from '\.\./classification'\|from '\./classification'" src/` —
  found 7 files; confirmed `pricing/index.ts`, `pricing/price-line.ts`,
  `pricing/workflow.ts`, and `estimate/components/items-section.tsx`
  only import `BillableLine`/`billableLineSchema` (unchanged name and
  field contract — no diff needed), `estimate/lib/envelope.ts` and
  `pipeline.ts` are already in this plan's file list, and the top-level
  `estimate-extraction-pipeline/index.ts` was MISSING from the plan —
  added it and generated its own diff (`diff-top-index.txt`).
- Verified `pricing/price-line.ts`'s own field reads directly (not
  assumed) to confirm `billableLineSchema`'s exact required field set
  (`trade`, `action`, `scope`, `location`, `costType`, `pricingBasis`,
  `quantity`, `unit`, `sourceQuote`) before finalizing `schema.ts`.
- Discovered mid-draft that my initial `classificationResultSchema`
  omitted the finding's own identity fields (`action`/`scope`/
  `location`/`sourceQuote`/`pageHint`), which `flatten.ts` needs to
  build a complete `BillableLine` — corrected `schema.ts` to include
  them (factored via a shared `itemIdentityFields` object) before
  generating any diff for it.
- Verified, via the Mastra MCP docs (`docs/workflows/control-flow`,
  `reference/workflows/workflow-methods/foreach`, `docs/workflows/overview`),
  that: (a) a nested workflow's `getInitData()` returns only what its
  own parent handed it as that array item — informing where
  `parsedDocument` gets attached; (b) no fetched example uses `.map()`
  as the very first call in a chain — informing the addition of
  `buildMaterialsPromptStep`/`attachDocumentToFindingsStep` as real
  named first steps instead; (c) `.foreach()`'s streaming progress
  events track per-iteration status, but non-streaming failure
  propagation for one failed nested-workflow iteration is not
  documented — informing the decision to wrap per-finding resilience in
  an explicit try/catch rather than rely on undocumented `.foreach()`
  behavior.
- Removed two redundant `as z.infer<...>` type casts from `flatten.ts`
  once confirmed TypeScript's contextual typing on `.push()` already
  narrows the object literals correctly without them (a self-caught
  simplification, not a functional fix).
- Corrected `pipeline.ts`'s own top-of-file doc comment mid-draft: an
  earlier version conflated `classifyStep`'s own composition form
  (an execute()-based wrapper, same shape as `priceStep`) with what
  happens inside classification's internals (bare agent-step
  composition) — rewrote for accuracy before generating the file's diff.
- Extracted every diff block from this document in file order,
  concatenated into a single patch, and ran
  `git apply --check <patch>` from the repository root: **PASS** (exit
  0, no output) — command and result recorded here per the Review Gate
  requirement.
- Re-verified every diff header's `diff --git a/<path> b/<path>` and
  `--- a/<path>` / `+++ b/<path>` lines against its own section
  heading (see the grep output cross-check performed during this pass)
  — all 13 match exactly.

No further material issue found while drafting — but per this skill's
own rules, this Scaffold pass may not itself conclude `Prepared`; a
separate review pass (below) is required.

**2026-07-16 — Pass 2 (Review — Revised)**

Reread the complete plan fresh (not relying on memory of drafting it),
cross-checked against the current repository, and traced every diff's
own data flow line by line.

Issue found and fixed:
- `finding-workflow.ts`'s `findingClassificationStep` catch block built
  its `reason` string as `` `classification failed: ${errorMessage}` ``
  with no length bound, but `webSearchFlagSchema.reason` is
  `z.string().min(1).max(300)`. A verbose underlying error message (e.g.
  a Zod validation error, which can easily exceed 300 characters) would
  have made this exact fallback path fail its OWN schema validation —
  defeating the one guarantee this catch block exists to provide
  (FR-009's per-finding failure isolation). Fixed by bounding the
  constructed string to `.slice(0, 300)`. Regenerated the file's diff
  (`diff-finding-workflow.txt`) and replaced its "Exact File Changes"
  block and Reasoning bullets above.

Other checks performed this pass, no issue found:
- Traced `flatten.ts`'s narrowing logic (`if (result.trade.status !==
  'determined')`) against `determinedOr()`'s discriminated-union shape
  — confirmed TypeScript narrows correctly on a 2-branch discriminated
  union via a `!==` literal comparison; no unsound cast needed.
- Confirmed the catch-block fallback's constructed `ClassificationResult`
  satisfies every field `classificationResultSchema` requires: `materials:
  []` (valid empty array), `labor: { laborType, hours: flag }` (valid —
  `hoursSource` is optional and correctly omitted), `trade: flag` (valid
  — matches `webSearchFlagSchema`'s exact shape, including
  `partialFindings: {}` satisfying its own all-optional-fields schema).
- Re-extracted every diff block from the CORRECTED document in file
  order, concatenated into a single patch, and ran
  `git apply --check <patch>` from the repository root: **PASS** (exit
  0, no output).
- Re-verified the corrected `finding-workflow.ts` diff block's own
  `diff --git`/`---`/`+++` header lines still match its section heading
  exactly.

This pass fixed a concrete issue, so per this skill's own rules it ends
`Revised — review again`, not `Prepared` — a later pass must reread this
exact corrected version fresh and independently re-verify it before that
status is earned.

**2026-07-16 — Pass 3 (Review — Prepared)**

Reread the complete plan fresh from disk, start to finish (Purpose
through Approval), independently of memory of drafting or revising it.

Checks performed:
- Re-verified the Pass 2 fix is correctly embedded: `finding-workflow.ts`'s
  diff shows `const reason = \`classification failed: ${errorMessage}\`.slice(0, 300);`
  with a hunk header (`@@ -0,0 +1,245 @@`) matching the corrected file's
  actual line count — generated by `make-diff.sh`, which fails closed on
  its own `git apply --check` before ever printing a diff, so this count
  is tool-verified, not hand-counted.
- Confirmed no stale reference to the pre-fix file remained anywhere in
  the document (e.g. an old line count) via
  `grep -n "239\b" specs/003-classification-rebuild/whiteboard.md` — no
  matches.
- Re-walked the User Contract's 9 acceptance criteria against the
  Acceptance Coverage table and the Exact File Changes: each criterion
  maps to a real file/diff, not a placeholder.
- Re-confirmed all 13 "Exact File Changes" section headings appear
  exactly once, in the same order as the Directory Map, via
  `grep -n "^### \`" whiteboard.md`.
- Extracted every diff block from this exact, corrected document,
  concatenated into a single patch, and ran `git apply --check <patch>`
  from the repository root: **PASS** (exit 0, no output).

No further material issue found after this independent, complete check.

**2026-07-16 — Pass 4 (Review — Revised, prompted by direct user challenge)**

The user directly asked whether this plan hand-rolled unnecessary
complexity instead of staying lean and scoped. Rather than defend the
existing draft, re-audited every non-obvious structural choice against
"is this genuinely necessary, or did caution add code that wasn't
needed."

Issue found and fixed:
- `finding-workflow.ts`'s `buildMaterialsPromptStep` and
  `workflow.ts`'s `attachDocumentToFindingsStep` were both real named
  `createStep(...)`s, justified in Pass 1 by the claim that "no fetched
  Mastra doc example uses `.map()` as the first call in a chain." That
  claim was true but insufficient — absence of an example is not a
  documented constraint, and I had not actually verified one existed.
  Checked directly against the installed `@mastra/core` package's own
  type declaration (`node_modules/@mastra/core/dist/workflows/workflow.d.ts`):
  the `Workflow` class's `map()` method is unconditional, and its
  `TPrevSchema` generic defaults to `TInput` — nothing requires a prior
  `.then()`. To be certain (a `.d.ts` read alone can be misleading for
  subtle generic/conditional-type interactions, particularly around
  `.foreach()`'s own "previous step must return an array type" generic
  check), wrote a throwaway two-case probe replicating both shapes
  (`.map()` -> `.then()`, and `.map()` -> `.foreach()`) against the
  actual installed package and compiled it with
  `pnpm exec tsc --noEmit --strict` (matching the project's own
  compiler options): **0 errors, both cases**. The probe file was
  temporary (copied to the repo root only to resolve `node_modules`,
  never committed) and was deleted immediately after, confirmed via
  `git status --short | grep -i probe` (no match).
- Removed both named steps; replaced each with a bare `.map()`, matching
  `pipeline.ts`'s own established, leaner "prompt right before an
  agent step via a bare `.map()`" pattern (Rule 2) — the pattern this
  rebuild should have used from the start rather than reaching for an
  unnecessarily heavier form out of unverified caution.
- Removed `workflow.ts`'s now-unused `createStep` import (the only
  call site was the step just removed).
- Updated the Pattern Audit table row, both files' "Exact File Changes"
  diffs and Reasoning bullets, and this Review Log to reflect the
  correction — not left as silent history.
- Re-extracted every diff block from this exact, corrected document,
  concatenated into a single patch, and ran `git apply --check <patch>`
  from the repository root: **PASS** (exit 0, no output).
- Re-confirmed all 13 section headings still appear exactly once, in
  order.

This pass fixed concrete issues, so it ends `Revised — review again`,
not `Prepared` — a later pass must reread this exact corrected version
fresh before that status is earned.

**2026-07-16 — Pass 5 (Review — Prepared)**

Reread the complete plan fresh from disk, start to finish, independently
of memory of the Pass 4 correction.

Checks performed:
- Confirmed `finding-workflow.ts`'s diff no longer contains
  `buildMaterialsPromptStep` and `workflow.ts`'s diff no longer contains
  `attachDocumentToFindingsStep` — both fully replaced by bare `.map()`
  calls, with correct, tool-verified hunk headers.
- Confirmed `workflow.ts`'s import line no longer imports `createStep`
  (removed as part of the same fix, since its only call site was
  deleted) — re-read the diff's own `+import { createWorkflow } from
  '@mastra/core/workflows';` line directly.
- Re-walked `finding-workflow.ts`'s full step chain once more end to
  end: workflow init data (`{finding, parsedDocument}`) -> bare `.map()`
  (materials prompt) -> `materialsAgentStep` -> `.map()` (labor prompt,
  reading `getStepResult(materialsAgentStep)`) -> `laborAgentStep` ->
  `.map()` (trade prompt, reading both prior results) -> `tradeAgentStep`
  -> `combineResultStep` (reading `getInitData()` + both `getStepResult()`
  calls + its own `inputData.trade`) — every step's declared
  `inputSchema` matches the immediately preceding step's/`.map()`'s
  actual return shape.
- Re-ran the full concatenated `git apply --check` on this exact
  document: **PASS** (exit 0, no output).
- Re-confirmed all 13 "Exact File Changes" headings appear exactly
  once, in Directory-Map order.

No further material issue found after this independent, complete check.
The plan is now leaner than Pass 1's version (2 fewer named steps, 1
fewer unused import) with no loss of correctness — every remaining
structural choice (three separate agents, the `findingClassificationStep`
resilience wrapper, `buildLineId()`, the sourced trade taxonomy) traces
to either an explicit spec.md requirement or a verified, cited technical
constraint, not unverified caution.

**Note on this pass's own limits (recorded honestly, not silently
superseded — see Pass 6 immediately below)**: Pass 5's "no further issue
found" was true only for what it actually re-checked — the specific
Pass 4 fix and the surrounding step chain. It was not a fresh audit of
whether OTHER structural choices (in particular, ones justified by
"matches pricing's own precedent") were independently sound rather than
inherited from pricing without scrutiny. That gap is exactly what a
direct user challenge surfaced next.

**2026-07-16 — Pass 6 (Review — Revised, prompted by a second direct
user challenge: "pricing is also terrible by design, did you use mastra
skills at all?")**

Two separate questions, both taken seriously rather than deflected:

**1. Did this session use the installed Mastra skill?** No — only the
`mcp__mastra__mastraDocs`/`searchMastraDocs` MCP tools were used
throughout. A real, already-installed `mastra` skill exists in this
repo (`skills-lock.json`, `.claude/skills/mastra/SKILL.md`,
`.agents/skills/mastra/references/*.md`) and was never invoked. Read it
directly this pass: it points to the SAME embedded docs the MCP tools
were already pulling from (`node_modules/@mastra/core/dist/docs/`,
confirmed by direct `ls`/`grep` against that exact path this pass), so
no additional Mastra-specific facts were missed as a result — but the
skill's own final instruction ("Test with the project scripts or Studio
when available") was NOT being followed. This pass corrects that: see
the two `pnpm exec tsc --noEmit` probe compilations (Pass 4, retained)
and, new this pass, an actual RUNTIME execution via `tsx` of a
throwaway probe (below) — going beyond type-checking to confirm real
behavior, per that skill's own emphasis on testing over reading alone.

**2. Is pricing's own design actually sound to mirror?** Re-read
`pricing/agent.ts` fresh (had not been read in full before this pass).
Confirmed a real, pre-existing flaw: `itemPricerAgent` has zero tools
and produces a dollar price from the model's own unverified
"confidence" self-assessment — genuinely the same class of ungrounded
guessing this whole classification rebuild exists to eliminate
elsewhere in the pipeline. This is explicitly OUT OF SCOPE for this
feature (FR-011: pricing's own logic is untouched) and is not
introduced anywhere in classification's own new agents (which flag
rather than guess) — so this specific flaw was not inherited. But
re-auditing `pricing/price-line.ts`'s and `pricing/workflow.ts`'s own
STRUCTURAL choices (as opposed to the agent's prompt content) surfaced
a real issue that WAS inherited:

Issue found and fixed:
- `classification/index.ts` exported a `classifyFindings()` async
  function wrapping its own separate `.createRun()/.start()` on
  `classificationFanoutWorkflow` — mirroring `pricing/index.ts`'s
  `priceLines()` shape for cross-module CONSISTENCY, without checking
  whether pricing's own reason for that shape actually applied.
  `pricing/price-line.ts`'s own comment states the reason plainly: a
  standalone `.createRun()` was empirically confirmed to leave
  `execute.mastra` undefined, which pricing's own steps need for
  `mastra.getLogger()`. Classification's fan-out never reads
  `execute.mastra` anywhere — so the indirection was reproducing a
  workaround for a constraint that does not exist in classification's
  own design. Fixed: `classification/index.ts` now exports
  `classificationFanoutWorkflow` directly (matching `extraction/index.ts`'s
  own shape — a ready-composed primitive, not a wrapping function);
  `pipeline.ts` composes it via a bare `.then()`, Mastra's own
  documented "workflows as steps" pattern. This removes one function,
  one interface pair (`ClassifyFindingsInput`/`ClassifyFindingsOutput`),
  and one named step (`classifyStep`) — net simpler, not just
  differently shaped.
- Verified this correction two ways, not one: (a) compiled a throwaway
  probe replicating the exact outer-workflow-composes-inner-fanout-
  workflow shape (`.map().then(innerWorkflow).map()`, where
  `innerWorkflow` itself contains `.map().foreach().then()`) with
  `pnpm exec tsc --noEmit --strict`: 0 errors; (b) went further and
  actually EXECUTED that same probe at runtime with `tsx` — not just
  type-checked it — confirming `finalTotal: 12` for input `[1,2,3]`
  (expected: double each then sum = 2+4+6=12), proving the composition
  works end to end, not merely compiles. Both probe files were copied
  into the repo root only to resolve `node_modules` (module resolution
  requires a real project context), never committed, and deleted
  immediately after each check — confirmed via
  `git status --short | grep -i probe` (no match, both times).
- Also found, while re-reading `finding-workflow.ts`'s catch block with
  the "is this actually as good as pricing's OWN accepted pattern"
  question in mind: `pricing/price-line.ts`'s own catch block LOGS its
  per-item failure (`log.warn(...)`); `findingClassificationStep`'s
  catch block did not log anything at all — a real observability gap,
  not a stylistic difference. Fixed: added a module-scoped logger (via
  `shared/logger.ts`'s `createModuleLogger`, the exact same mechanism
  `price-line.ts` uses) and a `log.warn(...)` call before constructing
  the fallback result.
- Updated the Pattern Audit table, the Directory Map, the Interfaces
  and Plan of Work sections, and the three affected files' "Exact File
  Changes" diffs/Reasoning to reflect both corrections.
- Re-extracted every diff block from this exact, corrected document,
  concatenated into a single patch, and ran `git apply --check <patch>`
  from the repository root: **PASS** (exit 0, no output).
- Re-confirmed all 13 section headings still appear exactly once, in
  order, via `grep -n "^### \`"`.
- Also caught and fixed, during this pass, an internal inconsistency
  left over from Pass 5: the document's own top `## Status` line still
  read "Revised — review again" while the bottom `**Status:**` line
  under Approval read "Prepared" — Pass 5's own review did not catch
  this despite claiming a complete fresh reread, a small but real
  reminder that "reread fresh" must include the document's own
  structural/status fields, not only its technical content.

This pass fixed concrete issues, so it ends `Revised — review again`,
not `Prepared` — a later pass must reread this exact corrected version
fresh before that status is earned.

**2026-07-16 — Pass 7 (Review — Prepared)**

Reread the complete plan fresh from disk, start to finish (Purpose
through Approval), independently of memory of the Pass 6 corrections.

Checks performed:
- Found and fixed one more stale reference Pass 6 itself missed: the
  "Context and Orientation" section's own bullet about `pricing/` still
  claimed `classification/workflow.ts` AND `classification/index.ts`
  both "structurally mirror" `pricing/workflow.ts`/`pricing/index.ts` —
  true only for the `.foreach()` usage, no longer true for the
  wrapper-function shape after Pass 6's correction. Rewrote it to state
  the distinction precisely (mirrors `.foreach()` usage; does NOT mirror
  the `priceLines()`-style wrapper, and why).
- Found and fixed a second stale reference: `workflow.ts`'s own
  "Exact File Changes" entry still said it stays unregistered
  "matching `pricingFanoutWorkflow`'s own precedent" — technically true
  as an observation but misleading about WHY, since Pass 6 established
  classification's reason (composed directly into the parent's own
  graph) is different from pricing's reason (context-loss workaround).
  Corrected to state the real reason.
- Re-confirmed every remaining `classifyFindings`/`classifyStep`/
  `ClassifyFindingsInput`/`ClassifyFindingsOutput` match in the document
  is inside the Pass 6 Review Log entry itself (describing what was
  removed and why) — none in live plan content, Directory Map, Pattern
  Audit, Interfaces, Plan of Work, or any "Exact File Changes" diff/
  Reasoning block.
- Re-extracted every diff block from this exact, corrected document,
  concatenated into a single patch, and ran `git apply --check <patch>`
  from the repository root: **PASS** (exit 0, no output).
- Re-confirmed all 13 section headings appear exactly once, in
  Directory-Map order.

No further material issue found after this independent, complete check.
Two direct user challenges across Passes 4-7 caught real issues (two
unnecessary named steps, one unjustified architectural indirection
copied from pricing without checking whether its reason applied, one
missing observability log line, and two stale post-hoc references) that
earlier passes' own "no further issue found" conclusions had missed —
recorded here plainly rather than smoothed over, since that is the more
useful record for whoever reads this Review Log next.

## Approval

Implementation must not begin until a `Prepared` plan receives explicit,
unambiguous human approval (via
`/speckit-implementation-planning-approve`) for its exact version. Any
later change to this document voids that approval and requires it
again.

**Status: Prepared — awaiting explicit approval.**
