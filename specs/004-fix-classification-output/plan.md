# Implementation Plan: Fix Classification Structured-Output Design

**Branch**: `004-fix-classification-output` (spec artifact directory; git
branch and spec directory are independent per Spec Kit convention, same
as features 001-003)

**Date**: 2026-07-16

**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-fix-classification-output/spec.md`

## Summary

Feature 003's classification rebuild shipped with a structured-output
design defect that caused every finding in a real eval run to fail:
`webSearchFlagSchema.searchContext` required the model itself to
reproduce, inside its own structured output, the entire originating
finding, the surrounding document excerpt, and a `partialFindings`
sub-object — all data the calling code already possessed. Every observed
live failure occurred inside that echoed data, never in the model's own
actual judgment.

This fix removes the echo requirement (agents now emit a minimal
`{ status, reason }` when they can't determine something; the combine
step attaches full context from `getInitData()`/`getStepResult()`,
mechanisms already in use in this exact file for the same purpose on the
input side). That is the entire fix.

**Revised during implementation** (`pnpm exec tsc --noEmit`, the plan's
own first Concrete Steps action, caught this as designed): the original
version of this plan also proposed adopting
`structuredOutput.errorStrategy: 'fallback'` + `fallbackValue` on each
agent step. That is not possible on the bare `createStep(agent, {...})`
composition form these three steps use — verified via
`node_modules/@mastra/core/dist/workflows/workflow.d.ts:70` (this
overload's `structuredOutput` type is exactly `{ schema:
StandardSchemaWithJSON<TStepOutput> }`) and Mastra's own
`reference-workflows-step.md` ("Agent step options" documents only
`{ schema }` for this form; `errorStrategy`/`fallbackValue` are
documented exclusively for a direct `agent.generate()`/`.stream()`
call). This plan does not adopt it. `findingClassificationStep`'s
existing try/catch wrapper (feature 003, unchanged) remains the sole
resilience mechanism for a structured-output schema-validation failure,
exactly as it already was before this fix — see research.md R3
(revised) and spec.md FR-003/FR-004 (revised) for the full evidence
trail.

Whether the remaining discriminated-union shape is reliable enough in
isolation, once the echo problem is removed, is settled by this plan's
own Validation step (a real eval-harness re-run), not asserted in
advance.

## Technical Context

**Language/Version**: TypeScript, Node.js (unchanged — no new runtime
dependency)

**Primary Dependencies**: `@mastra/core` `^1.50.1` — no version change.
`structuredOutput.errorStrategy`/`fallbackValue` exist in the installed
version but are not used by this fix — confirmed (via
`workflow.d.ts:70`) not to be exposed on the `createStep(agent, {...})`
composition form these three steps use.

**Storage**: N/A — no schema/migration change. `webSearchFlagSchema`'s
own persisted shape (`envelope.ts`'s `flaggedForWebSearch` field) is
unchanged; only who constructs a value of that shape changes.

**Testing**: Same as feature 003 — no new test framework. Validation is
a real re-run of `pnpm eval:pipeline` against the existing fixture, per
this project's own established pattern for this pipeline.

**Target Platform**: Server-side Node.js, unchanged — no new entry
point, same `summarize-estimate` workflow.

**Project Type**: Single existing project. This fix touches exactly
three files inside `classification/` (`schema.ts`, `agents.ts`,
`finding-workflow.ts`) — no new files, no file outside `classification/`.

**Performance Goals**: N/A numeric target. Qualitative: this fix does
not add agent calls (still three per finding, unchanged from feature
003) and does not change the resilience path (`findingClassificationStep`'s
try/catch, unchanged) — its performance profile is identical to feature
003's for that dimension. The only expected change is fewer
schema-validation failures reaching that catch block at all, since the
echoed data that previously guaranteed a failure is gone.

**Constraints**: FR-007 — no change to the `TRADE` taxonomy, the
per-finding step sequence, the fan-out/`.foreach()` architecture,
pricing, or any file outside classification's own structured-output/
resilience code. `classification/index.ts`'s own public contract
(`TRADE`, `EXTENT_UNIT`, `billableLineSchema`, `webSearchFlagSchema`,
`classificationFanoutWorkflow`, the three agents) does not change shape
— `webSearchFlagSchema`'s own definition is unchanged; only
`agentUndeterminedSchema` is newly introduced, and it is NOT a door
export (it is an internal detail of how the three agent steps are
composed, never consumed outside `finding-workflow.ts`).

**Scale/Scope**: Three files modified (`classification/schema.ts`,
`classification/agents.ts`, `classification/finding-workflow.ts`); zero
files created; zero files deleted.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v1.0.0:

| Principle | Check | Result |
|---|---|---|
| I. One-Door Module Boundaries | `agentUndeterminedSchema` is a new type but is NOT exported from `classification/index.ts` — it is used only inside `schema.ts`/`finding-workflow.ts`, the same folder. The door's own public contract (what `pipeline.ts`/`envelope.ts` import) does not change | PASS |
| II. Pipeline Purity | No `@/db`/`@/features/estimate/` import added anywhere in this fix | PASS |
| III. Explicit Throw/Retry Failure Model | No change to the failure model — `findingClassificationStep`'s existing try/catch (feature 003) remains the sole resilience mechanism, unchanged; the step's own `retries` config is unchanged | PASS |
| IV. No Hand-Rolled Agent Orchestration | This fix directly REMOVES hand-rolled behavior (the prompt-engineering "EXACT OUTPUT SHAPE" band-aid). It does NOT add `errorStrategy` (verified not available on this composition form) or any new hand-rolled mechanism — the three agent steps remain bare `createStep(agent, { structuredOutput: { schema } })` compositions, matching Rule 1's default form exactly. No new `.generate()`/`.stream()` call, no tool, no manual stream-drain anywhere | PASS |
| V. Verification Discipline Over Guessing | research.md R3 documents both the original (superseded) claim and the correction, with the exact evidence that overturned it (`workflow.d.ts:70`, `reference-workflows-step.md`, and the live `tsc` error) — a real example of this principle catching this plan's own prior mistake, not just describing it. R5's open question (discriminated-union reliability in isolation) remains recorded as unresolved, deferred to this plan's own Validation step | PASS |
| VI. No Slop | This fix's entire purpose is removing slop feature 003 introduced (the echo-back schema design, the prompt-engineering band-aid). It also avoids adding a NEW piece of slop this plan almost introduced itself — `errorStrategy` on a composition form that doesn't support it — once `tsc` and Mastra's own docs made that clear | PASS |

**No violations. Complexity Tracking table (below) is empty — no
justification needed.**

## Project Structure

### Documentation (this feature)

```text
specs/004-fix-classification-output/
├── plan.md              # This file
├── research.md          # Phase 0 output — R1-R6
├── data-model.md         # Phase 1 output — revised schemas, fallbackValue shapes
├── quickstart.md         # Phase 1 output — validation guide
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

No `contracts/` — same reasoning as features 001-003: internal pipeline
module, no external API surface.

### Source Code (repository root) — all MODIFY, nothing created or deleted

```text
src/features/estimate-extraction-pipeline/classification/
├── schema.ts               # [MODIFY] add agentUndeterminedSchema; determinedOr() gains
│                            #   an optional flagSchema parameter (defaults to webSearchFlagSchema,
│                            #   unchanged for classificationResultSchema's own fields)
├── agents.ts                # [MODIFY] remove the "EXACT OUTPUT SHAPE" JSON examples added
│                            #   this session; instructions describe the now-minimal flagged
│                            #   shape in plain prose, matching the schema's own new simplicity
└── finding-workflow.ts      # [MODIFY] materialsStepOutputSchema/laborStepOutputSchema/
                             #   tradeStepOutputSchema use agentUndeterminedSchema via
                             #   determinedOr()'s new second parameter; combineResultStep
                             #   gains toFullFlag() and calls it for each flagged field;
                             #   the three agent steps' structuredOutput.schema changes only
                             #   (no errorStrategy/fallbackValue — not available on this
                             #   composition form); findingClassificationStep's own try/catch
                             #   and log.warn(...) are fully unchanged
```

**Structure Decision**: No new files. This is a targeted correction
inside the exact three files feature 003 already created/modified for
this same responsibility — `schema.ts` (the contract), `agents.ts` (the
prompts), `finding-workflow.ts` (the composition and resilience). No
other file in `classification/` (`index.ts`, `workflow.ts`, `flatten.ts`)
needs to change: `flatten.ts` already consumes `classificationResultSchema`
unchanged (it still receives full `webSearchFlagSchema`-shaped values,
now correctly assembled by `combineResultStep` instead of by the
model); `index.ts`'s public exports are unchanged; `workflow.ts` is
untouched.

## Complexity Tracking

*No entries — Constitution Check reported zero violations.*
