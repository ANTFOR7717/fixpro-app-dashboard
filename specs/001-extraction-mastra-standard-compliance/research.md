# Phase 0 Research: Extraction Module Clean-Room Rebuild

All findings below are sourced from the installed `@mastra/core` package
(embedded docs + compiled source) fetched fresh via the mastra skill this
session — not from `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md`'s own
citations, which are independently re-verified rather than trusted
secondhand, per this project's constitution Principle V.

## R0. Scope correction (2026-07-15) — the citation mechanism is removed, not preserved

The user corrected this research's original framing directly: the
sentence-invention-and-citation scheme (`meaningfulSentenceSchema`,
`rawFindingSchema.sourceSentenceId`, `resolveFindingsStep`) is FAKE
grounding, not real grounding. `resolveFindingsStep` resolves a finding's
citation against the SAME model response's own self-reported sentence
list — nothing checks that list against the actual `parsedDocument`. A
hallucinated sentence + a finding citing it resolves "successfully." This
design has no verification value under the current architecture, where
`document/parse.ts` hands the agent the full source text directly (Rule
3's own stated reasoning). R1–R8 below are preserved for their still-true
findings about Mastra composition patterns; R9 covers the removal itself.
This document's original framing (treating the citation mechanism as
preservable business logic) was wrong and is superseded by this note and
by `spec.md`'s Revision Note.

## R9. Removing the citation mechanism — scope and one confirmed side effect

**Full blast radius**, verified by reading each file's current content
directly (not assumed): `extraction/schema.ts` (drop `meaningfulSentenceSchema`,
`rawFindingSchema`, `resolvedExtractionSchema`), `extraction/agent.ts`
(rewrite the citation portion of the instructions only), `extraction/steps.ts`
(drop `resolveFindingsStep`), `extraction/index.ts` (drop the now-removed
exports), `pipeline.ts` (drop `.then(resolveFindingsStep)` from the
chain, drop `sentences` from `priceStep`'s schema and the final workflow
output), `estimate/lib/envelope.ts` (drop `sentences` from
`summaryEnvelopeV3Schema` and `ParsedEnvelope`'s v3 variant),
`estimate/lib/workflow.ts` (drop `sentences: result.result.sentences`
from the persisted envelope), `estimate/components/items-section.tsx`
(drop the `sentences` prop, the `MeaningfulSentence` import, the
"Meaningful Sentences" debug panel), `estimate/components/estimate-report.tsx`
(drop the `sentences` variable and prop pass).

**Confirmed side effect on `extraction/scorer.ts` (checked, not
assumed — spec.md FR-008)**: `extractionConsistencyScorer`'s judge prompt
already reads `sourceQuote` per item ("whether its verbatim sourceQuote
names the defect and action"), scored against `run.output` — the AGENT's
own raw structured-output, i.e. today's `extractionOutputSchema` shape
(`{sentences, findings: RawFinding[]}`, where `RawFinding` has
`sourceSentenceId`, NOT `sourceQuote`). This means the scorer's prompt
already references a field that doesn't exist on the agent's raw,
pre-resolution output today. After this removal, `extractionOutputSchema`
becomes `{findings: ExtractedFinding[]}` where `sourceQuote` IS present
directly on the agent's raw output — the scorer starts reading a field
that actually exists, for the first time. **Zero code change required to
`scorer.ts`.**

## R1. Agents as steps — the primary composition pattern

**Decision**: `createStep(agent, { structuredOutput: { schema } })`,
preceded by a bare `.map()` (never a named step) that builds the prompt.

**Source**: `node_modules/@mastra/core/dist/docs/references/docs-workflows-agents-and-tools.md`,
"Agents as steps" / "Agents with structured output":

> "Compose an agent as a step using `createStep()` when you don't need to
> modify the agent call. Use `.map()` to transform the previous step's
> output into a `prompt` the agent can use."

Worked example in the doc (verbatim shape):

```ts
export const testWorkflow = createWorkflow({})
  .map(async ({ inputData }) => ({ prompt: `Generate an article about: ${inputData.topic}` }))
  .then(agentStep)
  .then(processStep)
  .commit()
```

**Alternatives considered**: calling `.generate()`/`.stream()` by hand
inside a step's `execute()` — the doc's own "Calling agents" section
documents this as the deliberate-control-needed alternative ("Call from a
step's `execute()` function for more control over the agent call"), not
the default. Extraction's agent call needs no such per-call control (no
runtime schema choice, no tool+structuredOutput combo — that's
classification's situation, out of scope here) — the bare composition
form is the correct fit.

## R2. Transform placement — named step vs. `.map()`

**Decision**: A plain reshape (building the extraction prompt from the
parsed document) is a bare `.map()`, not a named step. Real logic with a
decision in it (resolving a citation id, degrading gracefully on a miss)
is a named `createStep({ id, inputSchema, outputSchema, execute })`.

**Source**: same doc as R1, plus `docs-workflows-control-flow.md`,
"Input data mapping": `.map()` is documented specifically for "transform
the output of a previous step to match the input of the next" — a pure
reshape, not a decision. No embedded doc shows business logic
(conditionals, lookups, degrade-on-miss) inlined as a bare `.map()`.

## R3. `retries` on an agent-composed step

**Decision**: set `retries: 2` directly in the `agentOptions` object
passed as `createStep(agent, agentOptions)`'s second argument, matching
`parseDocumentStep`'s existing precedent for the workflow's other
network-facing step.

**Two sources, one gap between them, resolved by going to the compiled
source when the reference doc was silent (per constitution Principle
V — "source the installed package itself when docs don't answer it")**:

1. `reference-workflows-step.md`'s "Agent step options" section
   documents only two options for the agent-composed form:
   `structuredOutput` and `onFinish`. `retries` is NOT listed here.
2. `docs-workflows-error-handling.md` documents `retries` only via the
   OBJECT-form `createStep({ execute, retries: 3 })` example, and
   separately documents a workflow-level `retryConfig: { attempts, delay }`
   on `createWorkflow({...})` that "applies to all steps in the workflow"
   and is overridden by any step's own `retries`.
3. Neither reference page shows `retries` on the AGENT-composed form
   explicitly. Rather than assume either way, the compiled implementation
   was inspected directly: `node_modules/@mastra/core/dist/chunk-CJAAPSS7.cjs`,
   function `createStepFromAgent` (~line 16031):

   ```js
   function createStepFromAgent(params, agentOrToolOptions) {
     const options = agentOrToolOptions ?? {};
     ...
     const { retries, scorers, metadata, ...agentOptions } = options ?? {};
     return {
       id: params.id,
       ...
       retries,
       scorers,
       metadata,
       execute: async (...) => { ... }
     };
   }
   ```

   `retries` is explicitly destructured from the options object passed to
   `createStep(agent, options)` and threaded directly onto the returned
   `Step` object — the same field the object-form step uses. **Confirmed
   working, not merely undocumented-but-untested.**

**Alternatives considered and rejected**:
- *Workflow-level `retryConfig` on `createWorkflow({...})` in
  `pipeline.ts`* — would apply uniformly to every step in the workflow,
  including pure-logic steps (`resolveFindingsStep`) whose failures are
  deterministic (a `Map` lookup doesn't fail transiently; retrying it
  wastes a retry budget on a bug that will reproduce identically).
  Rejected per constitution Principle VI ("no invented consistency that
  costs the architecture precision it already has") — targeted step-level
  `retries` on the one step that actually makes a network call is more
  precise than a blanket policy. Also out of scope: this touches
  `pipeline.ts`, which spec.md's FR-007 excludes beyond minimal wiring.
- *Exponential backoff / retry-only-on-specific-error-types* — no
  embedded doc shows a configuration option for this on either step form;
  `retries: N` is a flat retry count with no backoff/error-type
  parameters documented anywhere found. Not pursued — would be inventing
  an unconfirmed mechanism.

## R4. Rule 5 resolved — `.generate()` vs `.stream()` internally

**Decision**: `createStep(agent, { structuredOutput })` always uses
`.stream()` internally (`.streamLegacy()` for v1-spec models) — never
`.generate()`. This closes the Standard's own Rule 5, previously marked
"Unresolved as of this document."

**Source**: same `createStepFromAgent` function, compiled source:

```js
if ((await params.getModel()).specificationVersion === "v1" && typeof params.streamLegacy === "function") {
  const { fullStream } = await params.streamLegacy(inputData.prompt, {...});
  stream = fullStream;
} else {
  const modelOutput = await params.stream(inputData.prompt, {...});
  stream = modelOutput.fullStream;
}
```

No code path in this function calls `.generate()`. The 504-timeout risk
the Standard's Rule 5 flagged (observed under `.generate()` on a long
tool-calling call) structurally cannot recur through this composition
form, regardless of document length — the framework already always
streams.

**Action required beyond this plan's own scope**: this answer should be
written back into `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md`'s Rule 5
itself (spec.md FR-005) so the question is closed for every future reader
of the Standard, not just this feature's own docs.

## R5. `getStepResult()` / `getInitData()` reach-back distance

**Finding**: no embedded doc states or implies a distance limit. Every
example shown (`docs-workflows-control-flow.md`,
`reference-workflows-workflow-methods-map.md`) calls `getStepResult()`
immediately after the referenced step ran, but nothing states this is a
requirement — the function reads from the run's accumulated step-result
store, not a transient value.

**Relevance to this spec**: NONE. Neither `getStepResult()` nor
`getInitData()` is used inside `extraction/`'s own module boundary in the
current code, and the rebuild has no reason to introduce them there
either — `extraction/steps.ts`'s three exports
(`buildExtractionPrompt`, `findingExtractorAgentStep`,
`resolveFindingsStep`) are composed by `pipeline.ts`, which is out of
scope. Recorded for completeness since it was one of the original
research questions, not because it drives a rebuild decision here.

**Related, out-of-scope observation**: `reference-workflows-workflow-methods-map.md`
documents an object-form declarative alternative,
`mapVariable({ step, path })` / `mapVariable({ initData, path })`, as a
cleaner way to carry data through a chain than repeated manual
`getInitData()` calls in `.map()` callbacks. `pipeline.ts` currently uses
the manual form. This is a real, sourced observation but belongs to a
future pipeline.ts-scoped pass, not this extraction-only rebuild.

## R6. Idiomatic pattern for citation resolution

**Finding**: no embedded doc shows a more native/idiomatic pattern for
"resolve an id emitted earlier in the same response back to its source"
than a plain named `createStep({ execute })` doing a `Map` lookup. This
is exactly the shape `docs-workflows-agents-and-tools.md`'s and
`docs-workflows-control-flow.md`'s own "named step for real logic"
guidance describes in the abstract — no dedicated primitive exists for
this specific task. The rebuild keeps this as a named step
(`resolveFindingsStep`), independently re-derived from the general
named-step-for-real-logic pattern rather than carried forward from the
prior file.

## R7. Structured output streaming — `stream.object` / `stream.fullStream`

**Decision**: confirmed still current, no change needed.

**Source**: `docs-agents-structured-output.md`, line 129 (embedded, fresh
this session — same claim the Standard's Rule 4 already cited, now
independently re-confirmed rather than trusted secondhand):

> "The final structured object is available on `stream.fullStream` and
> after the stream completes on `stream.object`."

No embedded doc anywhere states or implies `stream.textStream` must be
iterated for `stream.object` to resolve. Under `createStep(agent, {
structuredOutput })` (R1/R4), this is moot regardless — the framework
owns the transport, application code never touches a `stream` object.

## R8. Stale/untrustworthy artifacts found in the current code during fresh reading (not carried forward)

Found while reading the current files fresh for this plan, independent of
the retries gap:

- `extraction/agent.ts`'s doc comment: "Internal to the extraction
  module — only extraction/index.ts calls `.generate()` on this." False
  of the current code — `extraction/index.ts` is the door (re-exports
  only); no `.generate()` call exists anywhere in `extraction/` (R1/R4
  confirm the framework calls `.stream()` internally, and even that call
  happens inside `@mastra/core`, not in this module's own code).
- `extraction/schema.ts`'s `resolvedExtractionSchema` doc comment: "an
  earlier draft of this plan declared this exact shape as an anonymous
  inline `z.object()`..." — a reference to a transient planning
  document's revision history baked into permanent source code. This is
  the exact staleness trap `REFACTOR(ai-pipeline-mastra-native-realignment).md`
  already identified and corrected once for `AGENTS.md` ("plan documents
  are session artifacts that get archived or superseded... permanent
  agent guidance must not depend on a transient doc") — recurring here in
  a different file, independently found.
- `extraction/schema.ts`'s `rawFindingSchema` doc comment: "`extraction/index.ts`
  resolves the citation into the public shape" — also false; resolution
  happens in `resolveFindingsStep` (`extraction/steps.ts`), not
  `index.ts`.

All three are corrected in the rebuild per spec.md FR-006 — zero
behavior change, comment-only.
