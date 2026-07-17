# Research: Classification Module Rebuild

Every Mastra-specific claim below was fetched fresh this session via the
Mastra MCP tools (`mcp__mastra__mastraDocs`), per Constitution Principle
V — not training-data recall, not public search results. Doc paths are
cited so each claim can be independently re-verified.

## R1: `.foreach()` + nested workflow is the correct shape for "decoupled but context-sharing per-finding steps"

**Decision**: A per-finding nested workflow (materials -> labor -> trade
-> combine), fanned out via `.foreach(findingWorkflow, { concurrency })`.

**Source**: `reference/workflows/workflow-methods/foreach` and
`docs/workflows/control-flow` ("Nested workflows inside foreach"):

> "If you need to run multiple sequential operations per item, use a
> nested workflow instead of chaining multiple `.foreach()` calls. This
> keeps all operations for each item together and is cleaner than
> multiple `.foreach()` calls which create nested arrays."

> "Each nested workflow execution is independent with its own data
> flow... With `concurrency > 1`, multiple nested workflows execute in
> parallel."

**Why not chained `.foreach().foreach().foreach()`** (one per stage):
the doc's own comparison table states plainly this "creates array of
arrays" and should be avoided in favor of a nested workflow — and,
separately, chaining would force EVERY finding through the materials
stage before ANY finding could start its labor stage, which is a
strictly worse decoupling property than what the nested-workflow shape
gives (each finding's own 3 steps run together, independent of every
other finding).

**Alternatives considered**: `.parallel()` — rejected; it fans out
DIFFERENT operations over the SAME input, not the same operation over
MANY inputs (`docs/workflows/control-flow`, "`.parallel()` vs
`.foreach()`" comparison table). `.branch()` — rejected; it is
conditional path selection, not iteration.

## R2: A nested workflow's `getInitData()` resolves to ITS OWN init data, not the parent's — the parent must attach document context before `.foreach()`

**Decision**: The parent fan-out workflow's own `.map()` (before
`.foreach()`) combines each finding with the full `parsedDocument` into
one object (`{ finding, parsedDocument }`); THAT combined object becomes
each nested workflow instance's own input/init data.

**Source**: `docs/workflows/control-flow`, "Nested workflows inside
foreach", step-by-step "How it works": "The parent workflow passes each
array item to an instance of the nested workflow" and "Each nested
workflow execution is independent with its own data flow." A nested
workflow instance has no mechanism to reach back into its PARENT's own
`getInitData()` — its `getInitData()` returns whatever the parent handed
it as that one array item, per `reference/workflows/step`'s own
definition ("`execute.getInitData`: Function to access the initial input
data of the workflow" — "the workflow," meaning the workflow the step
itself belongs to, not an ancestor).

**Consequence for this feature**: this is exactly the mechanism spec.md
FR-007 requires ("the system MUST have access to the source document
content surrounding a finding's own extracted location") — achieved by
attaching `parsedDocument` once, in the parent's `.map()`, using the
SAME `getInitData()`/`getStepResult()` pattern `pipeline.ts` already uses
today (its own `.map()` before `.then(priceStep)` reads
`getStepResult(parseDocumentStep)` for exactly this reason). No new
hand-rolled data-passing scheme is introduced — this is the documented
mechanism, applied one level deeper (into a nested workflow) than
`pipeline.ts`'s existing usage.

## R3: A workflow can be composed directly as a parent step ("workflows as steps") — informs how `classification/` hands off to `pipeline.ts`

**Source**: `docs/workflows/overview`, "Workflows as steps":

> "Use a workflow as a step to reuse its logic within a larger
> composition. Input and output follow the same schema rules described
> in Core principles." (worked example: `.then(childWorkflow)`)

**Decision**: `classification/`'s door exports a public async function,
`classifyFindings({ findings, parsedDocument, estimateRequestId? })`,
that internally runs `classificationFanoutWorkflow.createRun()/.start()`
— mirroring `pricing/index.ts`'s own `priceLines()` function exactly,
which itself wraps `pricingFanoutWorkflow` the same way. `pipeline.ts`
then composes ONE named step (`classifyStep`, whose `execute()` calls
`classifyFindings()`) the same way it already composes `priceStep`
(whose `execute()` calls `priceLines()`) — not a bare
`.then(classificationFanoutWorkflow)`, even though R3 confirms that would
also work mechanically. This is a deliberate consistency choice, not a
technical requirement: the user's own feature description explicitly
asked for this rebuild to "match the `.foreach()` pattern this
codebase's own `pricing/workflow.ts` already uses," and `pricing/`'s own
established shape is the wrap-in-a-function-behind-one-step pattern, not
bare workflow-as-step composition — matching that shape exactly, rather
than a technically-equivalent-but-differently-shaped alternative, keeps
the two fan-out modules structurally identical for the next reader.

## R4: Bare `createStep(agent, { structuredOutput })` is sufficient for all three new agents — no per-call runtime control is needed

**Source**: `reference/workflows/step`, "Agent step with structured
output"; `MASTRA-AGENT-WORKFLOW-STANDARD.md` Rule 1 (already governs this
codebase, restated here for this feature's own file-by-file
justification, not re-derived from scratch).

**Decision**: `materialsAgentStep`, `laborAgentStep`, and `tradeAgentStep`
are each `createStep(agent, { structuredOutput: { schema }, retries: 2 })`
— matching `findingExtractorAgentStep`'s own precedent in
`extraction/steps.ts` exactly. None of the three needs the one documented
exception (`pricing/price-line.ts`'s per-call schema switching based on
`line.costType`) — each of the three has exactly one fixed output schema,
always.

## R5: `getStepResult()` for optional cross-step context inside the nested workflow

**Source**: `docs/workflows/control-flow`, "Input data mapping":
"`getStepResult()`: Access a specific step's full output," used from a
`.map()` between `.then()` calls — the same shape `pipeline.ts` already
uses (`getStepResult(findingExtractorAgentStep).findings` /
`getStepResult(parseDocumentStep)`).

**Decision**: The `.map()` immediately before `laborAgentStep` builds
that step's prompt using `getInitData()` (the finding + document
context) AND, when present, `getStepResult(materialsAgentStep)` — added
to the prompt as "materials already determined for this finding, if
relevant" framing, never as a hard dependency (spec.md FR-005/FR-006: the
labor determination must be independently correct whether or not
materials produced anything). Same shape for `tradeAgentStep`'s own
`.map()`, reading both `getStepResult(materialsAgentStep)` and
`getStepResult(laborAgentStep)`.

## R6: The scrapped module's justification for hand-rolled `execute()`+`.stream()` composition is FALSE — independently disproven this session

**Claim in the scrapped `classification/steps.ts`**: a comment asserted
`createStep(agent, { structuredOutput })`'s type does not accept a
`model` field, used to justify a hand-rolled `execute()`+`.stream()`
fallback instead of the bare composition form.

**Verification performed**: read
`node_modules/@mastra/core/dist/agent/types.d.ts` directly this session.
`StructuredOutputOptionsBase.model?: MastraModelConfig` is present and
flows through `AgentExecutionOptions` into the bare
`createStep(agent, agentOptions)` overload unmodified — the claim is
false. (This finding is now moot for the REBUILT module regardless, per
R4 — none of the three new agents need per-call model switching at all —
but is recorded here because it directly disproves the scrapped code's
own stated reason for existing in its old hand-rolled shape, and that
reasoning must not be carried forward into the rebuild even by
assumption.)

## R7: `@mastra/tavily` has no remaining consumer after this rebuild — kept anyway, per explicit user instruction

**Verification performed**: `grep -rn "tavily\|Tavily" --include="*.ts"
src/` — the only match anywhere in `src/` is
`classification/agent.ts`'s own `import { createTavilySearchTool } from
'@mastra/tavily'` and its one call site, both inside the file being
deleted. No other module imports this package.

**Decision**: Do NOT remove `@mastra/tavily` from `package.json`. The
user explicitly stated it "will come into use later" (the deferred
future web-search pass this feature's `flagged_for_web_search` data
contract is designed to feed — see Q2 in spec.md) and instructed to
leave it alone. This overrides the dead-dependency cleanup this research
entry originally recommended by analogy to the constitution's
migration-hygiene guidance — that guidance concerns a dependency with NO
future consumer, which is not the case here once a concrete future
consumer is confirmed. No `package.json` change in this feature.

## R8: `pricing/price-line.ts` field dependencies on `billableLineSchema` — verified directly, not assumed

**Verification performed**: read `pricing/price-line.ts`'s own
prompt-building code directly. It reads, by field name: `line.trade`,
`line.action`, `line.scope`, `line.location`, `line.costType`,
`line.pricingBasis`, `line.quantity`, `line.unit` (material) or
implicitly `line.quantity` again (labor, "hours"), and
`line.sourceQuote`. `envelope.ts`, `items-section.tsx`, and `format.ts`
additionally read `line.id`, `line.pageHint`.

**Decision**: the rebuilt `billableLineSchema` preserves every one of
these fields under the same names and the same discriminated-union shape
(`costType: 'material' | 'labor'` as the discriminant) — only `trade`'s
value set changes (Q3's new taxonomy) and the mechanism producing `id`
changes (one named `buildLineId()` helper replacing the old inline
string-suffixing). `material`/`amountSource` (material lines) and
`laborType`/`hoursSource` (labor lines) are also kept — they are not
consumed by `pricing/price-line.ts`'s prompt text directly, but are
retained as the evidence trail for a DETERMINED (non-flagged) value,
consistent with spec.md FR-002/FR-003's grounding requirement, and their
removal was never part of this feature's requested scope.
