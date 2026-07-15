# Quickstart: Validating the Pipeline Accuracy Eval Harness

## Prerequisites

- `pnpm install` up to date
- `.env` has `PIONEER_API_KEY`/`PIONEER_API_URL` set (the gateway the
  pipeline's agents route through — the harness makes real calls through
  it, same as production)
- At least one fixture pair present under `eval/fixtures/`:
  `<slug>.pdf` + `<slug>.expected.ts` (this plan starts with
  `4014-sparrow-house-ln-inspection-report.{pdf,expected.ts}`, moved there
  from `specs/002-pipeline-eval-harness/fixtures/` during implementation
  — see plan.md's Structure Decision)

## Running the eval

```sh
# Full fixture-set sweep
pnpm eval:pipeline

# Single fixture, fast iteration while authoring/debugging one test case
pnpm eval:pipeline 4014-sparrow-house-ln-inspection-report
```

Both forms are the same command (`tsx eval/pipeline/run.ts [fixture-slug]`)
per FR-010 — an optional slug argument filters the discovered fixture set
down to one before the loop runs.

## What a run does, per fixture

1. `fixtures.ts` discovers `<slug>.pdf` + `<slug>.expected.ts` pairs under
   `eval/fixtures/`; any `.pdf` without a matching, schema-valid
   `.expected.ts` (or vice versa) is reported immediately as **invalid**
   and excluded from the run (FR-009b) — it does not crash the sweep.
2. `fixture-server.ts` starts a throwaway local HTTP server serving
   `eval/fixtures/`, for the duration of the whole sweep.
3. For each valid fixture: the harness calls
   `mastra.getWorkflow('summarize-estimate').createRun()` /
   `.start({ inputData: { estimateRequestId: <slug>, fileUrl:
   'http://localhost:<port>/<slug>.pdf', zipCode: expected.zipCode } })`
   — the exact same two-call shape `estimate/lib/workflow.ts` already
   uses in production. This is the one real, unmocked pipeline run for
   that fixture (FR-004).
4. If the run's `status !== 'success'`, the harness checks each relevant
   step's own `status` rather than discarding the whole fixture: any
   stage whose step actually completed (`status === 'success'`) before
   the failure is still scored normally; the stage that failed (and
   anything after it, which never ran) is reported as **run-failed**
   (FR-009c) with the failing step and error. This is confirmed directly
   from `@mastra/core`'s compiled workflow-execution source — see
   research.md R7 — not something that needed a forced live failure to
   observe.
5. On success, the harness reads
   `result.steps['finding-extractor'].output`,
   `result.steps['line-classifier-agent'].output`, and
   `result.steps['price'].output` directly (research.md R2) and runs each
   scorer's `.run({ input, output, groundTruth })` manually, in order:
   - `grounding` (deterministic, gate) — every finding's `sourceQuote`
     found verbatim in `parsedDocument`'s page text.
   - `extraction-recall` (LLM-judge, gate) — every
     `expected.findings` entry matched semantically against
     `result.steps['finding-extractor'].output.findings`; its
     `analyzeStepResult` supplies the label→actual-id map used next.
   - `classification-match` (deterministic, gate) — using the label→id
     map, compares `expected.classifications` against
     `result.steps['line-classifier-agent'].output.lines`.
   - `pricing-match` (deterministic, gate) — using the same map, compares
     `expected.pricing` against `result.steps['price'].output.prices`.
6. The harness prints a per-fixture report (stage-by-stage pass/fail,
   grounding violations, unverifiable expected findings) and exits
   non-zero if any fixture came back `invalid`, `run-failed`, or failed
   any gate (FR-011).

## Sanity checks before trusting a result

```sh
# Confirm the harness touches zero pipeline files
git status --short src/features/estimate-extraction-pipeline/
# expect: no output

# Confirm the one-door boundary still holds for the new consumer
grep -rn "estimate-extraction-pipeline/\(pipeline\|extraction/schema\|extraction/steps\)" eval/
# expect: zero results — eval/ only ever imports through each module's own index.ts door
```

## Adding a second fixture (validates FR-008/SC-002 directly)

1. Drop a new real inspection-report PDF at `eval/fixtures/<new-slug>.pdf`.
2. Read it, and hand-author `eval/fixtures/<new-slug>.expected.ts`
   (`export default` an object satisfying `expectedOutputSchema` from
   `eval/pipeline/schema.ts`).
3. Run `pnpm eval:pipeline` with no other change. Confirm the new fixture
   is discovered and evaluated alongside the existing one, with zero
   edits to any file under `eval/pipeline/` itself.

## Confirming a real regression is actually caught (validates SC-003)

Temporarily reintroduce a known-bad change — e.g. drop `retries` from
`findingExtractorAgentStep`'s options, or (more directly testable without
touching production code) truncate one `expected.findings` entry's
`scope` in a way that no longer matches anything the agent would
plausibly emit — run `pnpm eval:pipeline <slug>`, and confirm the
extraction stage is reported as failed, naming the specific expected
finding that could not be matched. Revert the temporary change afterward.

## Run-failure reporting is resolved — no live-forced-failure step needed

Per research.md R7, `run-failed` reporting is settled by reading
`@mastra/core`'s own compiled execution source, not by deliberately
breaking the real pipeline to observe it: earlier successful steps'
outputs remain in `result.steps` even when a later step fails, so the
harness checks each relevant step's own `status` rather than treating any
failure as an all-or-nothing loss of the whole fixture's result. Ordinary
use of the harness (running it against real fixtures) is how its
run-failure path gets exercised for real, if and when a real transient
failure happens to occur — nothing here needs to be artificially
provoked.
