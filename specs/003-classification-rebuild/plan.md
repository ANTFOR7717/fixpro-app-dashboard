# Implementation Plan: Classification Module Rebuild — Labor/Material/Trade Determination

**Branch**: `003-classification-rebuild` (spec artifact directory; actual
git work happens on whatever branch is active when `/speckit-implement`
runs — spec directory name and git branch are independent per Spec Kit
convention, same as features 001/002)

**Date**: 2026-07-16

**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-classification-rebuild/spec.md`

## Summary

Fully scrap and rebuild `src/features/estimate-extraction-pipeline/classification/`.
For each finding extraction produces, determine (1) material presence +
quantity/unit per distinct material, (2) labor presence + hours + labor
type, and (3) trade — derived from the combination, selected from a
23-value taxonomy sourced from a real published state contractor
licensing classification (spec.md Clarification Q3), not the scrapped
module's unsourced 11-value set. Any of these three that cannot be
grounded in the finding's own content or its surrounding parsed-document
context produces a `flagged_for_web_search` result (Q2) — never a bare
null, never a fabricated number, never a generic taxonomy value —
carrying the finding, a document excerpt, a failure reason, and whatever
else was determined, so a future (out-of-scope) web-search pass can act
without re-deriving anything.

Architecture (verified this session against Mastra's own current
documentation, fetched via the Mastra MCP tools — `research.md` R1-R6):
a per-finding **nested workflow** (materials step -> labor step -> trade
step -> combine step), fanned out across all findings via `.foreach()`,
matching this codebase's own `pricing/workflow.ts` `.foreach()` +
`pricing/index.ts` public-async-function precedent exactly — a
`classification/workflow.ts` internal fan-out workflow (never registered
on the top-level `Mastra` instance, same reasoning as
`pricingFanoutWorkflow`), invoked through one public `classifyFindings()`
function classification's door exports. Each of the three per-finding
agent steps is a bare `createStep(agent, { structuredOutput })` — no
hand-rolled `execute()`+`.stream()` fallback (Rule 1); the false
"`structuredOutput.model` isn't accepted by the bare form" claim that
justified the old code's fallback was verified this session to be false
by reading `@mastra/core`'s own type declarations directly, and is
irrelevant here regardless, since none of the three new agents need
per-call model switching (unlike pricing's `price-line.ts`, which
legitimately does).

Each per-finding nested workflow receives `{ finding, parsedDocument }` as
its own init data (attached by a `.map()` in the parent fan-out workflow,
before `.foreach()`) — so `getInitData()` inside every step of the nested
chain resolves to that finding's own document context, and
`getStepResult(materialsStep)` / `getStepResult(laborStep)` give the
labor/trade steps optional access to earlier results, exactly the
mechanism `pipeline.ts` itself already uses and the mechanism confirmed
in Mastra's own "Nested workflows inside foreach" and "Workflows as
steps" documentation (research.md R2-R3). A same-codebase precedent
(`pricing/price-line.ts`) already establishes that a per-item step
catching its own failure and returning a degraded-but-typed result — never
letting one item's failure fail the whole `.foreach()` batch — is this
project's accepted resilience pattern; the new combine step applies the
identical pattern, downgrading an unexpected per-finding failure to the
same `flagged_for_web_search` shape (with a failure-derived reason)
rather than inventing a second, competing error path.

Because pricing's own logic/schema is explicitly out of scope (FR-011),
`billableLineSchema` — the flattened, one-line-per-billable-material-or-
labor handoff shape `pricing/price-line.ts` already consumes by field
name (`trade`, `costType`, `quantity`, `unit`, `pricingBasis`, plus
`material`/`amountSource` or `laborType`/`hoursSource`) — keeps that exact
field contract. Only `trade`'s value set changes (new taxonomy) and the
old stringly-typed ID-suffixing convention is replaced with one named
`buildLineId()` helper. A finding whose trade is flagged, or one whose
specific material/labor determination is flagged, does not produce a
`BillableLine` for that flagged part — it is surfaced instead in a new
`flaggedForWebSearch` array threaded through `pipeline.ts`'s own output
and `estimate/lib/envelope.ts`'s v3 schema (an additive, `.default([])`
field, matching the existing `parsedDocument.default(...)` precedent —
no version bump, no schema break for already-persisted rows). This is
the only way FR-009 ("no finding silently dropped") and FR-011 ("do not
alter pricing's own responsibilities") can both hold at once: pricing
never receives a value it wasn't designed to handle, and nothing is lost
in transit either.

## Technical Context

**Language/Version**: TypeScript, Node.js (matches the rest of the
project; no separate runtime)

**Primary Dependencies**: `@mastra/core` `^1.50.1` (`createStep`,
`createWorkflow`, `.foreach()`, nested-workflow-as-step — all already a
project dependency, same package every other pipeline module uses); no
new package. `@mastra/tavily` (Tavily web search) is REMOVED from this
module's own code — the old `webSearch` tool/agent usage is retired
along with the module using it (spec.md's explicit out-of-scope note) —
but the `package.json` dependency itself is deliberately KEPT, per
explicit user instruction: it has a confirmed future consumer (the
deferred web-search resolution pass this feature's `flagged_for_web_search`
contract is designed to feed) even though no code references it once
this rebuild ships (research.md R7).

**Storage**: N/A — this feature changes in-memory pipeline data shapes
only. The one persistence-adjacent change is additive:
`estimate/lib/envelope.ts`'s `summaryEnvelopeV3Schema` gains one new
`.default([])` field (`flaggedForWebSearch`) so a persisted row never
loses data this feature produces; no migration, no new table, no version
bump (same reasoning `parsedDocument`'s own `.default(...)` already
established for the same schema).

**Testing**: No new automated test framework. `pnpm eval:pipeline`
(feature 002's harness) already runs the real, unmodified
`summarize-estimate` workflow against a real fixture and is the
mechanism that will surface whether this rebuild's classification stage
still produces coherent output end-to-end; its classification-facing
scorer(s) may need field-name/taxonomy updates to match the new schema
(tracked in tasks.md, not a new eval-harness feature).

**Target Platform**: Server-side Node.js, invoked only as part of the
`summarize-estimate` Mastra workflow (`triggerSummarizeEstimate` in
`estimate/lib/workflow.ts`) — no new entry point.

**Project Type**: Single existing project. This feature replaces the
entire contents of one existing module folder
(`src/features/estimate-extraction-pipeline/classification/`) and makes
small, additive, precedented touches to three files outside it
(`pipeline.ts`, `estimate/lib/envelope.ts`, `estimate/lib/format.ts`).

**Performance Goals**: N/A numeric target. Qualitative: three agent
calls per finding (materials, labor, trade) sequentially inside one
finding's nested workflow, findings themselves processed with bounded
`.foreach()` concurrency (mirroring `pricing/workflow.ts`'s own
`PRICING_CONCURRENCY` knob) — this is strictly MORE agent calls per
finding than the scrapped module's one shared batched call, traded
deliberately for per-finding decoupling and per-step correctness (the
scrapped module's single large batched call was itself a named
anti-pattern in spec.md's Input).

**Constraints**: `classification/`'s door (`index.ts`) is the only import
path anything outside the folder may use (Constitution Principle I);
`pipeline.ts` composes `classifyFindings()` (or the fan-out workflow
directly, see research.md R3) the same way it already composes
extraction's and pricing's own module-level entry points — never a deep
import into `classification/schema.ts`/`agents.ts`/`workflow.ts`
directly. No `@/db` or `@/features/estimate/` import anywhere in
`classification/` (Principle II) — unchanged from the scrapped module,
which already respected this.

**Scale/Scope**: One module folder fully rewritten (new file layout
below); three small, additive touches elsewhere. No new top-level
directory, no new `package.json` script.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v1.0.0:

| Principle | Check | Result |
|---|---|---|
| I. One-Door Module Boundaries | `classification/index.ts` exports exactly what `pipeline.ts` and `estimate/lib/envelope.ts` need (`TRADE`, `billableLineSchema`/`BillableLine`, `webSearchFlagSchema`/`WebSearchFlag`, `classifyFindings()`, `lineClassifierAgent`-equivalents re-exported for Studio registration only) — nothing outside the folder reaches `schema.ts`/`agents.ts`/`workflow.ts`/`finding-workflow.ts` directly. Verified by re-running the existing one-door greps from `AGENTS.md` after implementation (tasks.md Polish phase) | PASS |
| II. Pipeline Purity | `classification/` imports no `@/db`, no `@/features/estimate/` — unchanged from the scrapped module, which already honored this | PASS |
| III. Explicit Throw/Retry Failure Model | Each of the three per-finding agent steps uses `retries` for transient failures (matching `findingExtractorAgentStep`'s own `retries: 2` precedent); a genuine per-finding determination failure (after retries exhausted) is caught once, at the combine step, and downgraded to a `flagged_for_web_search` result — the same accepted resilience pattern `pricing/price-line.ts` already uses for its own `.foreach()`, not a new failure model. The fan-out workflow itself (`classifyFindings()`) still throws if the run cannot even start, matching `priceLines()`'s own precedent exactly | PASS |
| IV. No Hand-Rolled Agent Orchestration | All three per-finding agents composed via bare `createStep(agent, { structuredOutput })` (Rule 1) — no per-call runtime schema switching is needed by any of them, so none qualify for the one documented exception pricing's `price-line.ts` uses. No tools (`createTool()`) needed at all — the web-search tool this rebuild removes was the only tool the scrapped module had. No manual stream-draining anywhere | PASS |
| V. Verification Discipline Over Guessing | Every Mastra claim in research.md is cited to a doc path fetched fresh this session via the Mastra MCP tools (`mcp__mastra__mastraDocs`); the false "`structuredOutput.model` unsupported on the bare form" claim in the scrapped code was independently disproven by reading `@mastra/core`'s own compiled type declarations directly (research.md R6), not assumed correct or silently carried forward. The trade taxonomy (spec.md Q3) is sourced from a real fetched-and-extracted government PDF, not training-data recall | PASS |
| VI. No Slop | Removes: the dead `COST_TYPE` export, the broken/patched Tavily web-search tool, the implicit stringly-typed ID-suffixing convention (replaced by one named `buildLineId()`), the one-large-batched-call architecture. Keeps only what pricing genuinely still depends on by field name (`pricingBasis`, `amountSource`/`hoursSource`, the discriminated `billableLineSchema` shape) — verified by reading `pricing/price-line.ts`'s own prompt-building code directly, not assumed. `EXTENT_UNIT`'s four physical units are kept as-is (a correct, minimal domain fact, not slop) | PASS |

**No violations. Complexity Tracking table (below) is empty — no
justification needed.**

## Project Structure

### Documentation (this feature)

```text
specs/003-classification-rebuild/
├── plan.md              # This file
├── research.md          # Phase 0 output — R1-R7
├── data-model.md         # Phase 1 output — schemas, entities, flatten-step logic
├── quickstart.md         # Phase 1 output — validation guide
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

No `contracts/` directory — like features 001/002, this is an internal
pipeline module with no external HTTP/CLI-consumer-facing API surface;
the schemas that matter here are internal data shapes, documented in
data-model.md.

### Source Code (repository root)

```text
src/features/estimate-extraction-pipeline/
├── classification/                    # [REPLACE] entire folder rewritten
│   ├── index.ts                       # the door
│   ├── schema.ts                      # TRADE (23 values), EXTENT_UNIT, webSearchFlagSchema,
│   │                                   # materialDeterminationSchema, laborDeterminationSchema,
│   │                                   # tradeResultSchema, classificationResultSchema,
│   │                                   # billableLineSchema (unchanged field contract, new TRADE values)
│   ├── agents.ts                      # materialsAgent, laborAgent, tradeAgent — 3 focused agents,
│   │                                   # replacing the single overloaded lineClassifierAgent; no tools
│   ├── finding-workflow.ts            # per-finding nested workflow: materials -> labor -> trade -> combine
│   ├── workflow.ts                    # classificationFanoutWorkflow (.foreach(findingWorkflow)),
│   │                                   # mirrors pricing/workflow.ts; NOT registered on the Mastra instance
│   └── flatten.ts                     # flattenClassificationResultsStep + buildLineId() —
│                                       # turns ClassificationResult[] into { lines, flaggedForWebSearch }
├── pipeline.ts                        # [MODIFY] replace classification composition (see data-model.md)
├── estimate/lib/envelope.ts           # [MODIFY] add flaggedForWebSearch: array().default([]) to v3 schema
│                                       #   (note: this file lives in src/features/estimate/, not the
│                                       #   pipeline package — Constitution Principle II is unaffected,
│                                       #   since the pipeline package itself still imports nothing from it)
└── estimate/components/... (format.ts)  # [MODIFY] extend formatTradeLabel's switch for the new 23 values
                                        #   (its existing default case already renders any unrecognized
                                        #   value safely — this is a display-quality touch, not a fix
                                        #   for a break)
```

**Structure Decision**: The entire `classification/` folder is replaced
in place — same module boundary position in the pipeline
(`document/ -> extraction/ -> classification/ -> pricing/`), same
Constitution Principle I module list entry, no new top-level directory.
`pipeline.ts`'s own composition changes from directly chaining
`lineClassifierAgentStep`/`buildLinesStep` (the scrapped module's flat
single-step shape) to composing `classification/workflow.ts`'s fan-out
workflow — matching how `pipeline.ts` already composes `priceStep`
(itself backed by `pricing/workflow.ts`'s own internal fan-out) rather
than inlining pricing's per-line logic directly. The two small touches
outside the pipeline package (`envelope.ts`, `format.ts`) are the
minimal additive changes needed so the new `flaggedForWebSearch` data
isn't silently lost at the persistence boundary and so the new trade
taxonomy renders cleanly — neither changes pricing's or the UI's own
logic/behavior beyond that.

## Complexity Tracking

*No entries — Constitution Check reported zero violations.*
