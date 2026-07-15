# Phase 0 Research: Pipeline Accuracy Eval Harness

All Mastra-specific findings below are sourced from the installed
`@mastra/core` package's embedded docs, fetched fresh this session via the
Mastra MCP tools (`mcp__mastra__readMastraDocs`,
`mcp__mastra__searchMastraDocs`) — per constitution Principle V, never
from training-data recall or public search. The one non-Mastra technical
claim (R4) was verified empirically by directly running it against this
project's installed Node runtime, not assumed. R1 documents a design
decision that changed mid-research, once further design work exposed a
real limitation in the first approach — recorded honestly as such rather
than silently substituted.

## R1. `createScorer` + a hand-written per-fixture orchestration loop — not `runEvals`

**Decision**: Build each per-stage comparison with `createScorer` (from
`@mastra/core/evals`, the same package `extraction/scorer.ts` already
imports from), but invoke them from a **hand-written per-fixture loop**
that calls `mastra.getWorkflow('summarize-estimate').createRun()` /
`.start(...)` directly — the exact same two-call shape
`estimate/lib/workflow.ts` already uses in production — and then calls
each scorer's own `.run({ input, output, groundTruth })` method directly.
This is **not** `runEvals`'s automatic batch/target-dispatch wrapper.

**Why `runEvals` looked right at first, and why it was rejected once
design work exposed a real limitation**: `runEvals({ target, data,
scorers, gates })` is a real, documented, SDK-native batch-eval primitive
(`references/docs-evals-running-in-ci.md`,
`references/reference-evals-run-evals.md`) with exactly the shape this
feature seemed to need: `target: Agent | Workflow`, `data:
RunEvalsDataItem[]` (`input` + `groundTruth` per fixture), `scorers: {
workflow: [...], steps: { stepId: [...] } }`, and `gates` for a hard
pass/fail verdict. It was the first design considered, for good reason —
it is the primitive built for "batch-run a target against known test
cases and grade the result," and reusing it instead of hand-rolling
equivalent logic is exactly what Constitution Principle VI asks for.

It was rejected once data-model design (see data-model.md, "Cross-stage
id resolution") surfaced a real problem: the classification and pricing
comparisons need to know *which actual generated finding* corresponds to
*which hand-authored expected finding* — a correspondence only the
extraction-recall scorer's own semantic judgment can resolve, because a
human fixture author cannot predict an LLM's exact generated wording in
advance (spec.md SC-004). `runEvals` dispatches every scorer attached to a
data item on its own; nothing in the docs fetched this session shows one
scorer's result being handed to another scorer for the same item before
it runs. A hand-written loop has no such limitation: it calls the
extraction-recall scorer's `.run()` first, reads its `analyzeStepResult`
(confirmed part of `.run()`'s return shape —
`reference-evals-mastra-scorer.md`), and passes the resulting
label-to-actual-id map into the classification/pricing comparisons as a
plain local variable inside the harness's own script — no Mastra-internal
state-passing mechanism invented or assumed.

This does not reopen the "hand-rolled duplication" concern (Principle
VI): the loop calls `.createRun()/.start()` and `.run()` directly — the
same primitives `runEvals` itself would call internally — with no
diffing/scoring logic reimplemented. The only hand-written part is
fixture iteration and passing one scorer's structured output into the
next call: orchestration glue, not a duplicated SDK primitive.

**Also considered and rejected**: `dataset.startExperiment({ targetType,
targetId, ... })` (Mastra's Datasets/Experiments feature) — its
`result.results: ItemWithScores[]` return shape exposes richer per-item
`output`/`groundTruth`/`error` fields than `runEvals`'s aggregate-only
return, which looked useful for FR-009's three-way outcome reporting.
Rejected: datasets are created and accessed via
`mastra.datasets.create(...)` (`reference-datasets-create.md`), whose own
usage example instantiates `new Mastra({ /* storage config */ })` — a
storage-backed Mastra instance is the entry point for the whole feature.
This project's Mastra instance has no storage configured today (confirmed
directly this session: `mastra:dev`'s own startup log warns "No
`storage` configured on Mastra — falling back to an in-memory store").
Introducing a storage backend plus dataset/versioning machinery to
satisfy "run a PDF, diff the result" is exactly the overengineering the
user's own request explicitly rejected — and the hand-written loop
already solves the per-item detail problem without it.

## R2. `result.steps[stepId].output` is populated for every step on a successful run — read directly, not via `runEvals`'s automatic wiring

**Finding**: a workflow run's `result.steps[stepId].output` holds *that
step's own output*, populated for every step on a successful run — not
only the final step. This is the fact that makes "one real pipeline run
per fixture, graded per stage" possible at all: the harness calls
`run.start()` once per fixture and then reads
`result.steps['finding-extractor'].output`,
`result.steps['line-classifier-agent'].output`, and
`result.steps['price'].output` directly off that one result, handing each
exact slice to the relevant scorer's `.run({ output, ... })` call by hand.

**Source**: two independent confirmations. First,
`references/docs-workflows-overview.md`'s "Workflow output" worked
example shows a two-step workflow's `status: 'success'` result with both
`steps['step-1'].output` and `steps['step-2'].output` populated alongside
the final `result` — not just the last step:

```json
{
  "status": "success",
  "steps": {
    "step-1": { "status": "success", "output": { "formatted": "HELLO WORLD" } },
    "step-2": { "status": "success", "output": { "emphasized": "HELLO WORLD!!!" } }
  },
  "result": { "emphasized": "HELLO WORLD!!!" }
}
```

Second, `references/reference-datasets-startExperiment.md`'s `scorers`
parameter description (documenting the same `WorkflowScorerConfig` shape
`runEvals` shares) states directly: "For workflow targets, per-step
scorers can be passed via `scorers: { steps: { stepId: [...] } }` and run
against **each step's own output**" (quoted verbatim) — confirming the
same step-output-scoping fact from a second, independent doc, regardless
of which dispatch mechanism (automatic via `runEvals`, or manual as this
plan does) reads it.

## R3. `groundTruth` is passed explicitly per scorer call, not auto-wired — because orchestration is manual (R1)

**Finding**: `MastraScorer.run()`'s `groundTruth` parameter is documented
as "Automatically passed when using runEvals"
(`reference-evals-mastra-scorer.md`) — but since this design calls
`.run()` directly rather than through `runEvals` (R1), the harness passes
`groundTruth` explicitly on every call instead: the relevant slice of the
fixture's `.expected.ts` object for that scorer
(`expected.findings` for the extraction scorers, `expected.classifications`
for the classification scorer, `expected.pricing` for the pricing
scorer). The auto-wiring fact confirms `.run()`'s parameter shape but is
not itself load-bearing for the final design.

## R4. Local fixture PDFs must be served over real HTTP — `file://` URLs do not work with this project's fetch

**Decision**: The eval harness spins up a throwaway `node:http` static
server (Node built-in, zero new dependency) for the duration of a run,
serving the `eval/fixtures/` directory, and passes
`http://localhost:<port>/<fixture-file>.pdf` as the workflow's `fileUrl`
input — the exact same shape production already sends (a real URL fetched
over HTTP), so `document/parse.ts`'s `parsePdfFromUrl` runs completely
unmodified.

**Source**: empirically verified this session, not found in or assumed
from documentation (this is a Node/undici runtime question, not a Mastra
one — no relevant Mastra doc exists for it, and constitution Principle V's
"try it and see" prohibition is about substituting trial-and-error for
*available* documentation, not about refusing to run a direct, reproducible
verification when no authoritative doc covers the question at all):

```
$ node -e "fetch('file:///.../dummy.pdf').then(r=>console.log('OK',r.status)).catch(e=>console.log('ERROR:',e.message))"
ERROR: fetch failed
$ node --version
v25.3.0
```

**Alternatives considered and rejected**:
- *`file://` URL.* Empirically fails on the installed runtime (above) —
  not viable.
- *`data:` URL embedding the PDF bytes.* Would work but produces enormous
  URL strings for multi-MB PDFs (the 4014 Sparrow House fixture is ~3.9MB)
  and is not what `fetch(fileUrl)` is documented or intended to receive;
  rejected as needlessly indirect versus just serving the file.
- *Modify `parsePdfFromUrl`/`parseDocumentStep` to accept raw bytes as an
  alternative to a URL.* Rejected — this would touch production pipeline
  code (`document/parse.ts`, `pipeline.ts`'s input schema) for a
  harness-only need, violating this plan's own zero-pipeline-file-change
  constraint and spec.md FR-012's explicit "no new pipeline functionality"
  bound. A local HTTP server achieves the same result with zero pipeline
  changes.

## R5. Classification-stage comparison can be deterministic — no LLM judge needed

**Decision**: The classification-stage scorer is a plain function-mode
`createScorer` — no `judge`, no LLM call — comparing the classifier
agent's own raw step output (`{ lines: LineClassification[] }`, keyed by
`findingId`) against the fixture's expected classification per finding,
resolved to a specific `findingId` via the label→id map R1 establishes:
`trade` (closed enum, exact match), the material/labor line shape implied
by `materials[]` length and `laborHours > 0` (structural presence/count,
not free text), and each material's `unit` (closed enum, exact match).

**Source**: read directly from this project's own
`classification/schema.ts` (project-specific schema inspection, same
evidentiary standard as a doc citation). `trade` is `z.enum(TRADE)`
(11-value closed set), `unit` is `z.enum(EXTENT_UNIT)` (4-value closed
set) — both exact-comparable with no paraphrase-tolerance concern. The
only free-text fields (`material`, `laborType`, `reasoning`) are
descriptive detail, not the decision this stage exists to get right; the
fixture's expected output does not need to pin these down verbatim.

**Why this matters**: avoids a second paid LLM-judge call per fixture for
a comparison that a plain equality/count check already settles precisely
— directly serving Constitution Principle VI's "no invented consistency
that costs the architecture precision it already has" (an LLM judge would
be *less* precise than exact enum comparison here, not more).

## R6. Pricing-stage comparison can be deterministic — no LLM judge needed

**Decision**: The pricing-stage scorer is a plain function-mode
`createScorer` comparing `PricedLineItem[]` (keyed by `itemId`, resolved
to a specific finding via the same label→id map) against the fixture's
expected pricing outcome per finding: `unitPrice !== null` (priced) XOR
the fixture expects that line unavailable — matching FR-005b's resolved
"structural only" scope exactly.

**Source**: read directly from `pricing/schema.ts`. `pricedLineItemSchema`
already encodes this as an XOR invariant at the type level
(`unitPrice: number | null` alongside `unavailableReason: string | null`,
enforced by the pricing agent's own response schemas' `xorUnavailable`
refinement) — the eval only needs to check which side of that XOR a line
landed on, never a dollar amount.

## R7. Behavior on a target execution failure — resolved via compiled source, not a forced live failure

**Decision**: earlier steps' `.output` remains readable in `result.steps`
even when a later step in the same run fails. The harness reads each
relevant step's own `status` before trusting its `.output` — a step that
itself failed has no usable `.output` and is reported as that fixture's
run-failure; a step that succeeded before a later one failed can still be
scored normally.

**Source**: read directly from the installed `@mastra/core` package's
compiled workflow-execution source this session (the same
verification-by-source-read technique feature 001's research.md R3/R4
used, not a live-forced-failure test — per the correction that forcing a
real pipeline failure just to observe reporting behavior is the wrong
way to answer a question documentation doesn't cover; reading the actual
implementation answers it directly, with no artificial breakage of a real
system needed):
`node_modules/.pnpm/@mastra+core@.../node_modules/@mastra/core/dist/chunk-GYHL47NL.cjs`,
the default execution engine's `execute()` method (~line 13727) and
`fmtReturnValue()` (~line 13578).

`execute()` holds one `stepResults` object (starting as `{ input }`) and
loops over the workflow's steps in order, passing that same object by
reference into `executeEntry()` for every step — each step writes its own
entry into it as it completes. When a step's result status isn't
`"success"` (failed, suspended, or bailed), the loop stops advancing and
calls `fmtReturnValue(pubsub, stepResults, lastOutput, ...)` immediately
— but `stepResults` at that point still contains every step that already
completed before the failing one, untouched:

```js
// chunk-GYHL47NL.cjs, execute()
for (let i = startIdx; i < steps.length; i++) {
  ...
  lastOutput = await this.executeEntry({ ..., stepResults, ... });
  ...
  if (lastOutput.result.status !== "success") {
    ...
    const result2 = await this.fmtReturnValue(params.pubsub, stepResults, lastOutput.result, void 0, stepExecutionPath);
    ...
  }
}
```

`fmtReturnValue()` then builds the final `steps` field from *every* entry
in `stepResults`, not just the one that failed:

```js
// chunk-GYHL47NL.cjs, fmtReturnValue()
const cleanStepResults = {};
for (const [stepId, stepResult] of Object.entries(stepResults)) {
  cleanStepResults[stepId] = stepResult; // (simplified — metadata stripped, but every step's own result kept)
}
const base = { status: lastOutput.status, steps: cleanStepResults, input: cleanStepResults.input };
if (lastOutput.status === "success") base.result = lastOutput.output;
else if (lastOutput.status === "failed") base.error = this.formatResultError(error, lastOutput);
```

**Design consequence for FR-009's "pipeline run failure" category**: if
`price` fails but `finding-extractor` and `line-classifier-agent`
succeeded, `result.steps['finding-extractor'].output` and
`result.steps['line-classifier-agent'].output` are both still present and
scoreable — the harness scores whichever earlier stages actually
completed and reports only the failed stage (and anything after it) as
run-failed, rather than discarding the whole fixture's result. If
`finding-extractor` itself is the one that fails, none of the later
steps ran at all, so the whole fixture is reported as run-failed with no
stage scored — determined per-fixture by checking each relevant step's
own `status` field, not by treating the top-level `result.status` as an
all-or-nothing signal.

## R8. `dummy.pdf` and the missing-fixture history (carried from spec.md, restated for completeness)

**Finding**: exhaustively confirmed during the specify phase — no PDF
other than the empty 212-byte `dummy.pdf` placeholder exists anywhere in
this repository's working tree, `node_modules`, or the full history of
every local and remote branch (including added-then-removed files). The
first real fixture (4014 Sparrow House Ln, a 42-page InterNACHI-standard
home inspection report) was supplied by the user from outside the repo
and confirmed real by parsing it with this project's own `pdf-parse`
dependency. Restated here so research.md is self-contained without
requiring cross-referencing the conversation history.
