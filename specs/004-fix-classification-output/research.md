# Research: Fix Classification Structured-Output Design

Every Mastra-specific claim below is sourced from either the installed
package's own embedded docs (`node_modules/@mastra/core/dist/docs/`) or
its compiled source/type declarations, read directly this session — not
training-data recall.

## R1: Root cause of the live failure — confirmed via direct comparison of live log output against the schema

**Finding**: `webSearchFlagSchema.searchContext` (the pre-fix schema)
required the model itself to reproduce, inside its own structured
output: the full originating `finding` object (7 fields), the full
`documentExcerpt` string, and a `partialFindings` sub-object. Every
failure captured in the live eval run (`STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`)
occurred inside this echoed data — a missing `finding.id`, a
`partialFindings.materials` shaped as an object instead of an array, a
quantity typed as a string instead of a number — never in the model's
own core judgment fields (`status`, `value`, `reason`).

**Decision**: remove `searchContext.finding`, `searchContext.documentExcerpt`,
and `searchContext.partialFindings` from what the agent's own
structured-output schema requires. The model's own flagged-value output
becomes `{ status: 'flagged_for_web_search', reason: string }` — nothing
echoed.

## R2: Where the removed context actually belongs — `getInitData()`/`getStepResult()`, already-documented, already used elsewhere in this exact file

**Source**: `reference/workflows/step` (read this session and in
feature 003's own research.md): `execute.getInitData` ("Function to
access the initial input data of the workflow in any step") and
`execute.getStepResult` ("Function to access results from other
steps").

**Finding**: `finding-workflow.ts`'s `combineResultStep` already calls
`getInitData<...>()` to read `finding.id`/`finding.action`/etc. when
assembling `ClassificationResult` (feature 003's own code, unchanged by
this fix). There was never a reason for the model to reproduce the
finding or document excerpt — the step that receives the model's
response already has that data via the exact mechanism already in use
one line above.

**Decision**: `combineResultStep` (or the flatten step, wherever a
`WebSearchFlag` is finally assembled) attaches `searchContext.finding`
and `searchContext.documentExcerpt` itself, from `getInitData()`, after
receiving the model's minimal `{ status, reason }` signal — matching
this codebase's own `MASTRA-AGENT-WORKFLOW-STANDARD.md` Rule 2 ("every
data transform between steps is a named step or a `.map()`... never
inline logic inside an agent-calling function"), which this project
already treats as binding.

## R3: `structuredOutput.errorStrategy`/`fallbackValue` — CORRECTED: not usable on the composition form these three steps use

**Original (superseded) finding**: reading the compiled implementation
directly, `node_modules/@mastra/core/dist/chunk-PRT2AP4W.cjs`'s
`handleValidationError` (~line 611) and `createStepFromAgent`'s own
compiled implementation (`node_modules/@mastra/core/dist/chunk-CJAAPSS7.cjs`,
~line 16031), showed `errorStrategy`/`fallbackValue` flowing through to
the underlying `.stream()` call when present on the options object
passed to `createStepFromAgent`. This was read as confirmation that
`createStep(agent, { structuredOutput: { schema, errorStrategy,
fallbackValue } })` was a valid, working composition.

**What that verification missed**: it checked runtime forwarding
behavior only, never the actual exported TypeScript type governing what
is legal to write at this exact call site. `pnpm exec tsc --noEmit`
during implementation rejected `errorStrategy`/`fallbackValue` on all
three agent steps: `'errorStrategy' does not exist in type '{ schema:
StandardSchemaWithJSON<...> }'`.

**Corrected, verified finding**:
`node_modules/@mastra/core/dist/workflows/workflow.d.ts:70` — the
`createStep(agent, agentOptions)` overload for structured output types
`agentOptions.structuredOutput` as exactly `{ schema:
StandardSchemaWithJSON<TStepOutput> }`. No `errorStrategy`, no
`fallbackValue`. Confirmed independently against Mastra's own
documentation: `reference-workflows-step.md`'s "Agent step options"
section states the entire documented option set for this form is
`**structuredOutput** ({ schema: StandardJSONSchemaV1 })`.
`docs-agents-structured-output.md`'s "Handle errors" section — the only
place `errorStrategy`/`fallbackValue` are documented at all — shows them
exclusively on a direct `agent.generate()`/`.stream()` call, never on
`createStep(agent, {...})`.

**Decision**: do not adopt `errorStrategy`/`fallbackValue` for
`materialsAgentStep`/`laborAgentStep`/`tradeAgentStep`. They remain bare
`createStep(agent, { structuredOutput: { schema } })` compositions —
only `schema` changes (to reference `agentUndeterminedSchema`, R1).
`findingClassificationStep`'s existing try/catch wrapper (feature 003,
unchanged by this fix) continues as the sole resilience mechanism for a
structured-output schema-validation failure in any of the three steps —
it already catches this today, via
`perFindingClassificationWorkflow.createRun()/.start()` surfacing the
failure as a thrown error the wrapper's own `catch` block handles. This
is not a new mechanism; it is the one already proven correct, retained
unchanged, not narrowed.

**Note on the documented per-call-control exception**: `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md`
Rule 1 does document an exception — calling the agent inside a step's
own `execute()` (as `pricing/price-line.ts` already does) — under which
`errorStrategy`/`fallbackValue` genuinely would be reachable, since that
path calls `agent.generate()` directly with the full
`StructuredOutputOptions` type. This fix does not take that path: it
was evaluated and explicitly not chosen, in favor of keeping these three
steps as bare agent compositions and leaving the existing, already-working
try/catch wrapper as the single resilience mechanism (FR-003/FR-004,
revised).

## R4: `structuredOutput.model` — a documented lever for raising first-pass validity, dropped without justification when this module was rebuilt

**Source**: `docs/agents/structured-output`, "Structuring agent": "When
your main agent isn't proficient at creating structured output you can
provide a `model` to `structuredOutput`. In this case, Mastra uses a
second agent under the hood to extract structured data from the main
agent's natural language response... can improve accuracy for complex
structuring tasks."

**Finding**: the scrapped (pre-feature-003) classification module used
exactly this option (`structuredOutput.model`) for its own agent. When
this module was rebuilt in feature 003, this option was dropped
entirely without evaluating whether it was still warranted for the
NEW, smaller schemas — an unexamined removal, not a verified decision.

**Decision for this fix**: do not add `structuredOutput.model` back
preemptively. R1-R3's changes (remove the echo, add `errorStrategy`)
directly address every failure actually observed. Record `structuredOutput.model`
as the next documented lever to reach for if R1-R3 alone do not bring
first-pass validity high enough after this fix's own re-run of the eval
harness (Validation, below) — not something to add speculatively before
that evidence exists.

## R5: Whether `z.discriminatedUnion('status', [...])` itself is reliable, independent of the echo problem — genuinely unresolved, not assumed either way

Every failure captured in the live eval run occurred inside the echoed
`searchContext` fields. None occurred in the core `status`/`value`
discriminated-union shape itself. This is suggestive but not proof that
the discriminated union is fine in isolation — an isolated, controlled
test was started this session (a minimal schema with no echo, run
against real findings) but was not completed; the user directed that
further live experimentation stop until the documentation-grounded
understanding of the actual guarantee was corrected first (see
Review Log / this plan's own Validation section).

**Decision**: this fix's own Validation step (re-running the real eval
harness after implementation, per feature 003's own established
pattern) is the mechanism that actually settles this question. Per R3
(revised), `errorStrategy` is not in play as a backstop; if the
discriminated union itself proves unreliable, the existing per-finding
try/catch wrapper is what prevents a crash (exactly as it already does
for any other per-finding failure) while that is investigated. This is
recorded as an open verification the plan's own Validation phase must
close, not asserted as resolved by this research phase.

## R6: `jsonPromptInjection` — considered, not adopted

**Source**: same page, "`jsonPromptInjection`": "If your model provider
doesn't support `response_format`, you'll get an error from the API...
This is less reliable than the API parameter approach."

**Decision**: not adopted. Mastra's own docs explicitly frame this as a
fallback for providers that reject `response_format` outright (a hard
API error), which is not what was observed — the API calls succeeded
and returned text; the failures were all downstream schema-validation
failures on data the model was never positioned to get right in the
first place (the echo problem). Adopting a documented "less reliable"
mode to compensate for a self-inflicted schema design flaw would be
solving the wrong problem.
