# Implementation Plan: Pipeline Schema Cleanup

**Branch**: `feat/classification-web-search-resolution` (spec artifact
directory `007-pipeline-schema-cleanup`; git branch and spec directory
are independent per Spec Kit convention, same as `006-resolution-mastra-primitives`
on this same branch)

**Date**: 2026-07-17

**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-pipeline-schema-cleanup/spec.md`

## Summary

An evidence-based audit of every schema file in
`estimate-extraction-pipeline` (triggered by an explicit request to
remove the `pageHint` field) surfaced 14 confirmed defects, each verified
by reading the actual source, not assumed: one field that should never
have existed (`pageHint`) plus its downstream windowing function; five
instances of the same field group hand-retyped in multiple files instead
of composed via Zod's own `.extend()`/`.omit()`; two hand-written
runtime checks (`flatten.ts`'s throws, `xorUnavailable`) compensating for
schemas that don't make an invalid state structurally impossible; one
unforced array split (`lines`/`prices`) where the natural paired shape
already exists and is actively thrown away; two dead exports; and two
assumption-not-verified constraints (a quarter-hour rounding rule, five
untraceable string-length bounds) neither of which trace to any spec
clarification or user request, confirmed by grepping every prior spec's
Clarifications/Assumptions sections.

This plan corrects every one of the 14 findings using only Zod primitives
already verified against the installed package (`.extend()`, `.omit()`,
`determinedOr()`'s existing discriminated-union pattern) — no new
hand-written validation is introduced anywhere. Two items considered
during the audit (`pricing/price-line.ts`'s `agent.generate()` calls,
`finding-workflow.ts`'s try/catch) were verified against Mastra's own
current docs and confirmed NOT defects; this plan does not touch either.

**Plan-review correction**: an initial draft of FR-011/data-model.md
proposed `billableLineSchema.extend({ price })` directly. Re-verified
against the installed Zod package during self-review and found wrong —
`billableLineSchema` is a `z.discriminatedUnion(...)`, which has no
`.extend()` method (only `ZodObject` does). Corrected to extend each
branch schema individually and rebuild the union (research.md R4). The
same review pass also found `pricing/agent.ts`'s own prompt was missing
from scope despite describing the exact flat output shape FR-017
replaces — added as FR-017a.

## Technical Context

**Language/Version**: TypeScript, Node.js (unchanged).

**Primary Dependencies**: `zod` `^4.2.1` (`.extend()`/`.omit()`/
`.discriminatedUnion()`, all verified directly against
`node_modules/zod/v4/classic/schemas.d.ts`); `@mastra/core` (unchanged —
no new Mastra primitive introduced; existing `createStep`/`createWorkflow`
composition is untouched by this feature).

**Storage**: PostgreSQL via Drizzle — `estimate_requests.summary` (JSON
text column). This feature modifies `summaryEnvelopeV3Schema`'s shape in
place (no migration; the column type itself is unchanged, only the JSON
shape validated against it).

**Testing**: `pnpm eval:pipeline` against the existing fixture, matching
every prior feature's established pattern. No new test framework.

**Target Platform**: Server-side Node.js, unchanged.

**Project Type**: Single existing project. Zero new files; 12 existing
files modified (`extraction/schema.ts`, `extraction/agent.ts`,
`classification/schema.ts`, `classification/agents.ts`,
`classification/finding-workflow.ts`, `classification/flatten.ts`,
`pricing/schema.ts`, `pricing/agent.ts`, `pricing/price-line.ts`,
`pricing/index.ts`, `estimate/lib/envelope.ts`,
`estimate/components/items-section.tsx`); 2 files deleted entirely
(`shared/quarter-hour.ts`) or trimmed (`shared/gateway.ts`).

**Performance Goals**: N/A hard target. Qualitative: FR-002's
full-document context replacement increases per-classification-call
token usage versus the removed ±1-page window; accepted per research.md
R3 since no alternative windowing mechanism is itself traceable to a
request.

**Constraints**: Governing Rule (spec.md) — every schema fix must make
the invalid state structurally unrepresentable, not add a new runtime
check. Governing Rule 2 (spec.md) — every remaining constraint must trace
to a request or clarification; untraceable ones are removed, not kept.
FR-016 — `pricing/price-line.ts`'s use of `agent.generate()` (vs. bare
`createStep`) and `finding-workflow.ts`'s catch-and-return pattern (vs.
throw) MUST NOT change; the data shapes these files construct DO change,
per FR-011/FR-017.

**Scale/Scope**: 14 findings, 5 user stories, 20 functional requirements
(FR-001 through FR-019, plus FR-017a), 0 new files, 12 existing files
touched, 2 exports deleted.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v1.0.0:

| Principle | Check | Result |
|---|---|---|
| I. One-Door Module Boundaries | No module's door (`index.ts`) changes its public export set except `pricing/index.ts` (`priceLines()`'s return type changes from `{lines, prices}` to `PricedLine[]`) and `classification/index.ts` (if `determinedOr` is re-exported for `pricing/schema.ts`'s reuse, per research.md R2 — exact placement decided at tasks/implementation time, still through each module's own door, never a deep import) | PASS |
| II. Pipeline Purity | No `@/db`/`@/features/estimate/` import added to any file under `estimate-extraction-pipeline/`. `estimate/lib/envelope.ts` and `estimate/components/items-section.tsx` are outside the pipeline package and already import pipeline types across that one existing, permitted boundary | PASS |
| III. Explicit Throw/Retry Failure Model | This plan does not touch either module's failure/retry MECHANISM (FR-016: `price-line.ts` still catches and degrades gracefully rather than throwing; `finding-workflow.ts`'s catch-and-return pattern is unchanged) — only the DATA SHAPES those same code paths construct change, per FR-011/FR-017. The `flatten.ts` throws removed (FR-005) are invariant-violation guards made structurally unreachable by FR-004's schema change, not part of this principle's own retry/throw failure model | PASS |
| IV. No Hand-Rolled Agent Orchestration | No agent composition changes. `pricing/schema.ts`'s restructuring (FR-017) changes the SCHEMA the pricer agent's structured output validates against, not how the agent is composed — still the same `agent.generate()` call site, confirmed unchanged by FR-016 | PASS |
| V. Verification Discipline Over Guessing | Every one of the 14 findings and every proposed fix is sourced: Zod's `.extend()`/`.omit()` against the installed package's own `.d.ts`; Mastra's error-handling/foreach behavior against its own current docs (research.md R8); every "was this requested" claim against an actual grep of every prior spec's Clarifications/Assumptions sections (research.md R6), not assumed | PASS |
| VI. No Slop | This plan's entire purpose is removing 14 specifically-named instances of duplication, unrequested assumption, and hand-written-check-instead-of-schema-shape, using only Zod primitives already proven in this codebase (`determinedOr()`) or verified in the installed package (`.extend()`/`.omit()`) | PASS |

**No violations. Complexity Tracking table (below) is empty — no
justification needed.**

## Project Structure

### Documentation (this feature)

```text
specs/007-pipeline-schema-cleanup/
├── plan.md              # This file
├── research.md          # Phase 0 output — R1-R8
├── data-model.md         # Phase 1 output — before/after shapes for every file
├── quickstart.md         # Phase 1 output — 7 validation scenarios + regression check
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

No `contracts/` — internal pipeline module, no external API surface,
same reasoning as every prior feature in this pipeline.

### Source Code (repository root)

```text
src/features/estimate-extraction-pipeline/
├── extraction/
│   ├── schema.ts                       # [MODIFY] remove pageHint (FR-001, FR-019)
│   └── agent.ts                        # [MODIFY] remove pageHint prompt instructions (FR-001)
├── classification/
│   ├── schema.ts                       # [MODIFY] FR-001,004,006,007,008,010,018,019
│   ├── agents.ts                       # [MODIFY] remove pageHint prompt mentions (FR-001)
│   ├── finding-workflow.ts             # [MODIFY] FR-001,002,006
│   └── flatten.ts                      # [MODIFY] remove hand-written throws (FR-005)
├── pricing/
│   ├── schema.ts                       # [MODIFY] FR-009, FR-017, FR-019
│   ├── agent.ts                        # [MODIFY] rewrite prompt for determinedOr output (FR-017a)
│   ├── price-line.ts                   # [MODIFY] emit merged pricedLineSchema (FR-011)
│   └── index.ts                        # [MODIFY] priceLines() returns PricedLine[] (FR-011)
└── shared/
    ├── quarter-hour.ts                 # [DELETE] roundToQuarter (FR-014)
    └── gateway.ts                      # [MODIFY] remove kiloGateway (FR-015)

src/features/estimate/
├── lib/envelope.ts                     # [MODIFY] summaryEnvelopeV3Schema merged shape (FR-012)
└── components/items-section.tsx        # [MODIFY] remove pageHint render + priceByItemId Map (FR-001, FR-013)
```

**Structure Decision**: No new modules, no new files except `tasks.md`
(next phase). Every change is a modification within an existing module's
own boundary, or a deletion of dead code — matching this feature's own
nature as a correctness/duplication cleanup, not new capability.

## Complexity Tracking

*No entries — Constitution Check reported zero violations.*
