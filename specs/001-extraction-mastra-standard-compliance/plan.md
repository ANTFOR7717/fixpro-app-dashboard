# Implementation Plan: Extraction Module — Clean-Room Rebuild from the Mastra Agent Workflow Standard

**Branch**: `001-extraction-mastra-standard-compliance` (spec artifact
directory; actual git work happens on the current working branch,
`refactor/extraction-mastra-native-workflow` — spec directory name and
git branch are independent per Spec Kit convention)

**Date**: 2026-07-14

**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-extraction-mastra-standard-compliance/spec.md`

## Summary

**Revised 2026-07-15** — original scope (structural rebuild only,
`extraction/` alone) is superseded. Corrected scope, per direct user
instruction: remove `extraction/`'s sentence-invention-and-citation
mechanism entirely (research.md R0/R9) — it is fake grounding
(`resolveFindingsStep` checks a citation against the model's own
self-reported sentence list, never against the real `parsedDocument`),
not real grounding, and made sense only under a pre-`pdf-parse`
architecture this project no longer has. `findingExtractorAgent` now
emits `sourceQuote`/`pageHint` directly per finding, single pass. This
removal ripples through 5 files outside `extraction/` that consume the
removed data: `pipeline.ts`, `estimate/lib/envelope.ts`,
`estimate/lib/workflow.ts`, `estimate/components/items-section.tsx`,
`estimate/components/estimate-report.tsx` — all confirmed real,
currently-shipped consumers, not assumed. Also still in scope, unchanged
from the original plan: the confirmed-missing `retries` on
`findingExtractorAgentStep` (research.md R3), and resolving the
Standard's own Rule 5 (research.md R4). The extraction agent's
DEFINITION/HARD RULES/per-field semantics (what counts as a billable
finding, action/scope/location/statedQuantity/inspectorHours) are still
preserved unchanged — only the citation/grounding mechanism is removed.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 (App Router)

**Primary Dependencies**: `@mastra/core` (version per `package.json` — not
hardcoded, per this project's own established staleness-avoidance
convention), `zod`

**Storage**: N/A — `extraction/` is pure (constitution Principle II); no
DB access in this module

**Testing**: This project has no formal automated test runner for the
pipeline. Established precedent (see prior `plans/REFACTOR/*.md`
Validation Plans): `pnpm exec tsc --noEmit` + `pnpm exec eslint` +
mechanical boundary greps for static correctness, plus a live run against
a real inspection-report PDF for behavioral verification. This plan
follows that same precedent (see quickstart.md) rather than introducing a
new testing framework, which would be scope creep unrelated to this
spec's request.

**Target Platform**: Node.js server (Next.js server actions / background
work via `after()`)

**Project Type**: Single existing project (Next.js monorepo-style app);
this feature touches one existing module within it, not a new project

**Performance Goals**: N/A numeric target. Qualitative: the workflow's
highest-blast-radius network call (a full-document LLM extraction) gains
the same self-healing behavior every other network-facing step in this
workflow already has.

**Constraints**: Zero behavior change to extraction's output shape or the
extraction agent's instructions (spec.md FR-002); zero scope expansion
into `classification/`, `pricing/`, `document/`, or `pipeline.ts`'s
composition logic beyond import-path wiring if an export name changes
(spec.md FR-007).

**Scale/Scope**: One module, 4 files, ~300 lines total pre-rebuild.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v1.0.0:

| Principle | Check | Result |
|---|---|---|
| I. One-Door Module Boundaries | Rebuild preserves `extraction/index.ts` as the sole external import path; no new deep import introduced anywhere | PASS |
| II. Pipeline Purity | No `@/db` or `@/features/estimate/` import added to `extraction/` | PASS |
| III. Explicit Throw/Retry Failure Model | This plan's core deliverable — `findingExtractorAgentStep` gains `retries`, matching the uniform throw-and-retry model; no `.branch()` or in-workflow persistence introduced | PASS (directly implements this principle) |
| IV. No Hand-Rolled Agent Orchestration | Rebuild re-derives every construct from the Standard's own rules (R1/R2 in research.md); no hand-rolled `.generate()`/`.stream()` call, no manual drain loop | PASS (directly implements this principle) |
| V. Verification Discipline Over Guessing | Every decision in research.md is cited to an embedded doc path or compiled package source read fresh this session, including going to source code when the reference doc was silent on `retries` (R3) | PASS (directly implements this principle) |
| VI. No Slop | This revision's entire point: removes a hand-rolled mechanism (`sourceSentenceId`/`resolveFindingsStep`) that provided no real reliability guarantee, tracing scope correctly to every real consumer instead of stopping at an artificial `extraction/`-only boundary (research.md R9) | PASS (directly implements this principle) |

**No violations. Complexity Tracking table (below) is empty — no
justification needed.**

## Project Structure

### Documentation (this feature)

```text
specs/001-extraction-mastra-standard-compliance/
├── plan.md              # This file
├── research.md          # Phase 0 output — sourced findings, R1-R8
├── data-model.md         # Phase 1 output — preserved public contract
├── quickstart.md         # Phase 1 output — validation guide
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

No `contracts/` directory — `extraction/` is an internal pipeline module
with no external API surface (no HTTP endpoint, no CLI, no public
package boundary beyond this monorepo's own `index.ts` door convention,
which `data-model.md` already documents as the preserved contract).

### Source Code (existing, this feature touches the files below — scope now spans two features, not one)

```text
src/features/estimate-extraction-pipeline/
├── extraction/
│   ├── agent.ts     # [MODIFY] citation portion of instructions rewritten; DEFINITION/HARD RULES/field semantics unchanged
│   ├── schema.ts    # [MODIFY] meaningfulSentenceSchema/rawFindingSchema/resolvedExtractionSchema removed; extractedFindingSchema gains sourceQuote/pageHint as agent-emitted fields
│   ├── steps.ts     # [MODIFY] resolveFindingsStep removed; findingExtractorAgentStep gains retries: 2, outputs extractedFindingSchema[] directly
│   ├── index.ts     # [MODIFY] door drops the removed exports
│   └── scorer.ts    # [VERIFIED NO CHANGE] already expects sourceQuote on run.output — research.md R9
├── pipeline.ts       # [MODIFY] resolveFindingsStep removed from chain; sentences dropped from priceStep + final output
└── (document/, classification/, pricing/, shared/)  # OUT OF SCOPE beyond the above (spec.md FR-011)

src/features/estimate/
├── lib/
│   ├── envelope.ts   # [MODIFY] sentences dropped from v3 schema + ParsedEnvelope
│   └── workflow.ts   # [MODIFY] sentences dropped from persisted envelope construction
└── components/
    ├── items-section.tsx    # [MODIFY] sentences prop + "Meaningful Sentences" debug panel removed
    └── estimate-report.tsx  # [MODIFY] sentences variable + prop pass removed
```

**Structure Decision**: No new files, no new directories — this is a
removal (net negative LOC), not an addition. Scope now correctly spans
`estimate-extraction-pipeline/` AND `estimate/` because the data being
removed flows all the way to the UI — confirmed by reading each
consumer's current file content (research.md R9), not assumed narrow.

## Complexity Tracking

*No entries — Constitution Check reported zero violations.*
