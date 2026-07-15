# Mastra Agent Workflow Standard

**Status: BINDING.** Every file this document governs must comply exactly.
This is not guidance to be interpreted loosely — a partial match is a
failure, not a pass. If code deviates from what's written here, the
implementation is wrong and must be corrected before it is considered
done.

This document exists because prior work in this codebase hand-rolled
agent orchestration — manual `.generate()`/`.stream()` calls wrapped in
bespoke exported async functions, including a stream-draining
`for await` loop with no documented basis for existing — instead of using
Mastra's own native primitives for the exact same job. Every rule below
is sourced directly from Mastra's own documentation, fetched via the
Mastra MCP (`mcp__mastra__mastraDocs`/`mcp__mastra__searchMastraDocs`)
this session — not invented, not guessed. The exact doc path is cited
next to every rule so it can be independently re-verified at any time.

## Rule 1 — Agents ARE steps. Never wrap an agent call in a hand-rolled function.

When a step's only job is "call this agent, get structured output,"
compose the agent directly as a step with
`createStep(agent, { structuredOutput })`. Do NOT write an exported
`async function` that manually calls `agent.generate()` or
`agent.stream()`, manually reads `.object`, or manually loops over
`.textStream`. Mastra's `createStep(agent, options)` already owns that
transport entirely — there is no `stream` variable in application code to
manage.

**Source:** `docs/workflows/agents-and-tools`, sections "Agents as steps"
and "Agents with structured output":

> "Compose an agent as a step using `createStep()` when you don't need to
> modify the agent call. Use `.map()` to transform the previous step's
> output into a `prompt` the agent can use."

> "When you need the agent to return structured data instead of plain
> text, pass the `structuredOutput` option to `createStep()`. The step's
> output schema will match your provided schema, enabling type-safe
> chaining to subsequent steps."

```ts
const agentStep = createStep(testAgent, {
  structuredOutput: { schema: articleSchema },
})
```

**The one documented exception**, same page: if a step needs per-call
runtime control over the agent invocation — e.g. picking between two
different `structuredOutput` schemas depending on the step's own input
data (this codebase's `pricing/price-line.ts` is exactly this case: it
picks `materialPriceResponseSchema` or `laborPriceResponseSchema`
depending on `line.costType`) — call the agent inside that step's own
`execute()` function instead. This is still a
`createStep({ id, inputSchema, outputSchema, execute })`, never a free
function exported from a module's `index.ts`.

> "Call from a step's `execute()` function for more control over the
> agent call (e.g., track message history or return structured output)."

## Rule 2 — Every data transform between steps is a named step or a `.map()`. Never inline logic inside an agent-calling function.

Business logic that transforms data (deduping, resolving a citation,
building output lines from a classification) is real logic and must be
preserved — it does not disappear, it moves. It does not belong inside
the same function that also owns agent transport. Each transform is
either:
- a `.map()` callback (for a simple reshape), or
- its own named `createStep({ id, inputSchema, outputSchema, execute })`
  (for anything with real business logic worth naming and validating on
  its own boundary).

**Source:** `docs/workflows/control-flow`, "Input data mapping":

> "When using `.then()`, `.parallel()`, or `.branch()`, it's sometimes
> necessary to transform the output of a previous step to match the input
> of the next. In these cases you can use `.map()` to access the
> `inputData` and transform it to create a suitable data shape for the
> next step."

Use the declarative helpers instead of ad-hoc destructuring where they
apply:

**Source:** `reference/workflows/workflow-methods/map`:

> "Use `getInitData<typeof workflow>()` to access the initial input data
> provided to the workflow."

**Caution on that exact quote:** the doc's own PROSE says
`getInitData<typeof workflow>()`, but the doc's own CODE EXAMPLE
immediately below that prose actually uses `getInitData<any>()`:

```ts
.then(step1)
  .map(async ({ getInitData }) => {
    console.log(getInitData<any>());
  })
```

When the `.map()` callback is defined inside the SAME workflow's own
initializer chain (`export const myWorkflow = createWorkflow({...}).then(...).map(...)....commit()`),
writing `getInitData<typeof myWorkflow>()` self-references a type that
hasn't finished being inferred yet — a real, plausible TypeScript
circular-inference trap. Mastra's own shipped example avoids this by
using `<any>` instead of the prose's self-referential form. Prefer an
explicit inline type matching the workflow's own declared `inputSchema`
over either the self-referential form or `<any>` — this was caught as a
real mistake in the governed plan (copied the prose, missed that the
example deliberately doesn't follow it) and corrected there.

> "Use `getStepResult()` to access the full output of a specific step by
> referencing the step's instance."

> "The object form of `.map()` provides an alternative declarative syntax
> for mapping fields... each value uses `mapVariable()` to extract data
> from previous steps or workflow input."

```ts
import { mapVariable } from '@mastra/core/workflows'

workflow.map({
  details: mapVariable({ step: step1, path: 'value' }),
})
```

## Rule 3 — Tools are always `createTool()`. Never a plain object.

**Source:** `reference/tools/create-tool`:

> "The `createTool()` function is used to define custom tools that your
> Mastra agents can execute."

A tool that gives an agent mediated access to content it doesn't have
yet — read-from-disk, fetch-a-URL, parse-a-PDF — is a legitimate use of
`createTool()`. That is NOT the same as a tool whose `execute` function
just echoes back an input string unchanged (`execute: async ({ text }) =>
({ content: text })`) — an identity tool has no read/fetch/parse behavior
to mediate, so wrapping it in a tool call only forces an extra agentic
round trip for data the caller already possesses.

In THIS pipeline specifically, that distinction resolves cleanly: the
read/fetch/parse job (`document/parse.ts`'s `parsePdfFromUrl`) already
runs as its own deterministic workflow step (`parseDocumentStep`),
*before* `findingExtractorAgent` ever executes. By the time the agent
runs, the report text is already fully resolved plain data — there is
nothing left to mediate, so it is handed directly as prompt content
(built by `buildExtractionPrompt`, a plain function — not itself a
`createStep()`, see Rule 2's own worked example in the governed plan for
why), not wrapped in a tool the agent
must separately invoke. This is a project-specific application of the
rule, not itself sourced from Mastra's docs — flagged as such.

## Rule 4 — No manual stream draining. Ever.

Code must never contain a `for await (... of stream.textStream)` loop
whose only purpose is "keep the connection open" or "let `.object`
resolve." This exact pattern existed in this codebase's prior
`extraction/index.ts` and `classification/index.ts`, justified by an
inline comment claiming it was required — that claim was never backed by
documentation, and is contradicted by the documentation actually fetched
this session.

**Source:** `docs/agents/structured-output`, "Stream structured output":

> "The final structured object is available on `stream.fullStream` and
> after the stream completes on `stream.object`."

Nothing in this section, or anywhere else in the documentation fetched
this session, states that `stream.textStream` must be iterated for
`stream.object` to resolve. Under `createStep(agent, { structuredOutput })`
(Rule 1), this question is moot anyway — Mastra owns the transport, so
there is no `stream` object in application code to drain in the first
place.

## Rule 5 — Resolved: `createStep(agent, { structuredOutput })` always streams internally.

This codebase previously hit a real, live-observed failure: `.generate()`
(buffered) returned a `504 Gateway Timeout` from the model gateway on a
long-running, tool-calling agent call over a large document, while
`.stream()` on the identical request succeeded, repeatably. That finding
was directly reproduced this session, not guessed.

**Resolved** (specs/001-extraction-mastra-standard-compliance/research.md
R4): the compiled implementation of `createStepFromAgent`
(`node_modules/@mastra/core/dist/chunk-CJAAPSS7.cjs`, ~line 16031) shows
`createStep(agent, { structuredOutput })` always calls `.stream()`
internally (`.streamLegacy()` for v1-spec models) — no code path in this
function calls `.generate()`. The 504-timeout risk this rule originally
flagged structurally cannot recur through this composition form,
regardless of document length, for either the `findingExtractorAgent` or
`lineClassifierAgent` steps.

## Enforcement

Any code reviewed against this document that does not match it exactly —
a hand-rolled agent-calling function where `createStep(agent, ...)` should
be used, inline transform logic left inside an agent-calling function
instead of becoming a named step, a plain-object tool, a manual
stream-drain loop — is a failed implementation. It must be corrected in
full, not partially patched, not left "close enough."
