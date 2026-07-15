# Implementation Plan: Estimate-Extraction-Pipeline Accuracy Eval Harness

**Branch**: `002-pipeline-eval-harness` (spec artifact directory; actual
git work happens on whatever branch is active when `/speckit-implement`
runs — spec directory name and git branch are independent per Spec Kit
convention, same as feature 001)

**Date**: 2026-07-15

**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-pipeline-eval-harness/spec.md`

## Summary

Build a command-line eval harness that runs the real, unmodified
`summarize-estimate` workflow against real inspection-report PDF fixtures
and grades its output per stage (extraction, classification, pricing)
against a hand-authored expected-output record per fixture — built on
Mastra's `createScorer` primitive (`@mastra/core/evals`, already a
project dependency, the same one `extraction/scorer.ts` already uses)
rather than a hand-rolled diff script, invoked from a hand-written
per-fixture loop rather than `runEvals`'s automatic batch dispatch (see
below for why). This is not a new pipeline capability: zero files under
`src/features/estimate-extraction-pipeline/` change. The harness is a
new, separate consumer of that package's existing public door
(`mastra.getWorkflow('summarize-estimate')`), living outside it.

Three Mastra API facts, verified this session via the Mastra MCP docs
(`research.md` R1–R3), make the design possible: (1)
`result.steps[stepId].output` on a successful `run.start()` holds *that
step's own output*, populated for every step, not just the final one —
so ONE real pipeline run per fixture is enough to grade
extraction/classification/pricing independently, by reading each stage's
own step output straight off that one result; (2) `MastraScorer.run({
input, output, groundTruth })` is directly callable, not only reachable
through `runEvals`'s automatic dispatch, and its return includes
`analyzeStepResult` — which is what lets the harness read back the
extraction-recall scorer's own semantic finding-id correspondence and
feed it into the classification/pricing comparisons afterward, as a
plain local variable in the harness's own script. `runEvals` was the
first design considered (it is the documented batch-eval primitive for
exactly this class of problem) but was rejected once this cross-stage
correspondence need became clear — see research.md R1 for the reasoning,
recorded honestly as a design correction rather than glossed over.

One more fact, verified empirically this session (not documented, so
tested directly): the installed Node runtime's global `fetch()` does not
support `file://` URLs (`fetch failed`). Since `document/parse.ts`'s
`parsePdfFromUrl(fileUrl)` — which the workflow calls unmodified — only
ever does `fetch(fileUrl)`, a local fixture PDF must be served over real
HTTP (a throwaway `node:http` static server, zero new dependency) for the
harness to feed it in without touching pipeline code at all.

## Technical Context

**Language/Version**: TypeScript, Node.js (matches the rest of the
project; no separate runtime)

**Primary Dependencies**: `@mastra/core/evals` (`createScorer` — already
installed, same package `extraction/scorer.ts` already imports from);
`pdf-parse` (already installed, used only to peek at fixture text for the
grounding scorer — see data-model.md); `node:http` (Node built-in, zero
new dependency, for the local fixture-serving server); `tsx` (already an
installed devDependency, used to run the eval entry script directly with
no build step, matching how `mastra:dev` already runs today).

**Storage**: N/A — fixtures are a PDF file plus a hand-authored,
version-controlled `.expected.ts` file per test case, both checked into
the repo. No database, no Mastra storage backend (this Mastra instance
has none configured today — confirmed via `mastra:dev`'s own
"No `storage` configured" warning — and this feature does not add one).

**Testing**: This feature *is* the pipeline's testing/eval mechanism —
there is nothing further to test it with. No Vitest/Jest/Mocha is
introduced: the harness is a plain script (a per-fixture loop calling
`.createRun()/.start()` and each scorer's `.run()` directly — see Summary
and research.md R1) executed via `tsx`, with the script's own exit code
carrying the pass/fail signal (FR-011). This is the "no bloated test
framework" reading of the spec's own explicit instruction.

**Target Platform**: Node.js, local CLI invocation only
(`pnpm eval:pipeline` or similar new script) — no browser, no Playwright,
matching FR-001.

**Project Type**: Single existing project. This feature adds one new,
self-contained directory tree (harness script + scorers + fixtures);
zero existing files change.

**Performance Goals**: N/A numeric target. Qualitative: a single-fixture
run costs about the same as one real production pipeline run (this is the
whole point — it *is* the real pipeline); a full fixture-set sweep scales
linearly with fixture count. The harness's per-fixture loop runs fixtures
sequentially, one at a time — sequential, predictable load on the real
Pioneer gateway is preferable to premature parallelization for a feature
whose fixture count starts at 1 (spec.md Assumptions); concurrency can be
revisited later if the fixture set grows large enough to make sequential
sweeps slow, but that is not a need this plan builds for speculatively.

**Constraints**: Zero modification to any file under
`src/features/estimate-extraction-pipeline/` — the harness is purely
additive and calls that package's existing public door
(`mastra.getWorkflow('summarize-estimate')`, exported today from
`estimate-extraction-pipeline/index.ts`), the same entry point
`estimate/lib/workflow.ts` already uses in production, not a direct
import of `pipeline.ts`'s internals (this keeps the harness a first-class
*outside consumer* of the package's one door — Constitution Principle I
— rather than a new module *inside* the pipeline's own architecture).
Local fixture PDFs are served over a throwaway local HTTP server rather
than fed via a `file://` URL, per the empirical fetch-support finding
above (research.md R4).

**Scale/Scope**: One new top-level `eval/` directory (script + five
per-stage scorers + a fixtures sub-directory), one new `package.json`
script, zero existing files touched. Starts with one real fixture (4014
Sparrow House Ln); designed so a second, third, Nth fixture is just a PDF
+ an `.expected.ts` file, no code change (FR-008).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Checked against `.specify/memory/constitution.md` v1.0.0:

| Principle | Check | Result |
|---|---|---|
| I. One-Door Module Boundaries | Harness imports only `mastra` from `estimate-extraction-pipeline/index.ts` (the package's one door) and each stage's own public types via `extraction`/`classification`/`pricing`'s own doors — never a deep path like `pipeline.ts`, `extraction/schema.ts`, etc. Lives *outside* `src/features/estimate-extraction-pipeline/` entirely, as a new external consumer, not a new module added to that package's own one-door list | PASS |
| II. Pipeline Purity | Zero files under `estimate-extraction-pipeline/` change; the harness itself may import `@/db`-free, pure fixture/scorer code only — it never touches `@/db` or `@/features/estimate/` | PASS |
| III. Explicit Throw/Retry Failure Model | Harness does not change the workflow's failure model; a thrown run is caught by the harness's own reporting layer and surfaced as a distinct "run failure" category (FR-009), not papered over with a new retry/catch inside the pipeline itself | PASS |
| IV. No Hand-Rolled Agent Orchestration | Harness never calls `.generate()`/`.stream()` itself and never hand-rolls diff/scoring logic where an SDK primitive exists — it composes every comparison via `createScorer` (Mastra's own documented scorer primitive) and invokes the workflow via the same `mastra.getWorkflow(...).createRun()/.start()` shape production code already uses. The per-fixture loop itself is orchestration glue (fixture iteration, passing one scorer's output into the next call), not a reimplementation of anything the SDK already does | PASS (directly implements this principle) |
| V. Verification Discipline Over Guessing | Every Mastra-specific claim in research.md is cited to a doc file fetched fresh this session via the Mastra MCP tools; the one Node-runtime fact with no relevant doc (`file://` URL support in `fetch`) was verified empirically by directly running it against the installed Node version, not assumed. The initial `runEvals`-based design was abandoned once further design work exposed a real limitation (no documented way to pass one scorer's result into another for the same item) — recorded as a design correction in research.md R1, not silently swapped. The one question no fetched doc answered (exact per-step `result` shape when a run fails partway through) was resolved by reading `@mastra/core`'s own compiled execution source directly (research.md R7) — not by deliberately forcing a real pipeline failure to observe it, which would have been an artificial, invasive test of a real system rather than a documentation-equivalent verification | PASS |
| VI. No Slop | Reuses `createScorer` instead of hand-rolling comparison/scoring logic (avoids duplicating an SDK primitive); the per-fixture loop replacing `runEvals` is thin orchestration, not a reimplementation of `runEvals`'s own internals. Keeps every comparison that is genuinely enum/structural (grounding-quote substring check, classification trade/costType/unit match, pricing priced-vs-unavailable match) as a deterministic function-mode scorer — no LLM call, no judge — reserving the paid, non-deterministic LLM-judge scorer for only the one place semantic paraphrase-tolerance is genuinely unavoidable (extraction-recall match). No speculative duplicate-finding detection or other unrequested scoring added — if duplicates become a real, observed problem, that gets addressed then, not engineered against preemptively | PASS |

**No violations. Complexity Tracking table (below) is empty — no
justification needed.**

## Project Structure

### Documentation (this feature)

```text
specs/002-pipeline-eval-harness/
├── plan.md              # This file
├── research.md          # Phase 0 output — R1-R8
├── data-model.md         # Phase 1 output — Fixture / ExpectedOutput / scorer contracts
├── quickstart.md         # Phase 1 output — validation guide
├── fixtures/              # Real fixture staged during specify phase (see spec.md Assumptions)
│   └── 4014-sparrow-house-ln-inspection-report.pdf
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

No `contracts/` directory — like feature 001, this is an internal
developer tool with no external HTTP/CLI-consumer-facing API surface
beyond the one new `pnpm` script documented in quickstart.md; the
scorer/fixture "contracts" that matter here are internal data shapes,
which belong in data-model.md, not a public API contracts folder.

### Source Code (repository root) — all NEW, nothing existing touched

```text
eval/
├── pipeline/
│   ├── run.ts                    # entry: tsx eval/pipeline/run.ts [fixture-slug]
│   ├── fixtures.ts               # discovers + validates fixture pairs (FR-008, FR-009b)
│   ├── fixture-server.ts         # throwaway node:http static server for local PDFs
│   ├── schema.ts                 # expectedOutputSchema (zod) — the fixture-authoring contract
│   └── scorers/
│       ├── grounding.ts           # deterministic — sourceQuote verbatim in parsed text (FR-006)
│       ├── extraction-recall.ts   # LLM-judge — every expected finding present (FR-005a)
│       ├── classification-match.ts  # deterministic — trade/costType-set/unit match (FR-005a)
│       └── pricing-match.ts        # deterministic — priced-vs-unavailable match (FR-005b)
└── fixtures/
    ├── 4014-sparrow-house-ln-inspection-report.pdf
    └── 4014-sparrow-house-ln-inspection-report.expected.ts

package.json               # [MODIFY] adds one script: "eval:pipeline": "tsx --env-file=.env eval/pipeline/run.ts"
```

**Structure Decision**: `eval/` lives at the repository root, as a sibling
of `src/`, not nested inside
`src/features/estimate-extraction-pipeline/`. The harness is a *consumer*
of that package's public contract (`mastra.getWorkflow(...)`), the same
architectural relationship `estimate/lib/workflow.ts` already has to it —
not a new internal module of the pipeline's own architecture. Nesting it
inside the pipeline package would incorrectly extend Constitution
Principle I's fixed module list (`document/`, `extraction/`,
`classification/`, `pricing/`) with a module that isn't part of the
pipeline's own runtime composition at all, and would require touching
`AGENTS.md`'s one-door grep list for a tool that every other one-door
consumer already reaches through the front door. The real fixture staged
during the specify phase at `specs/002-pipeline-eval-harness/fixtures/`
moves to `eval/fixtures/` during implementation — its expected-output
record is authored fresh there, since specs/ is a planning artifact
directory, not the runtime fixtures location.

## Complexity Tracking

*No entries — Constitution Check reported zero violations.*
