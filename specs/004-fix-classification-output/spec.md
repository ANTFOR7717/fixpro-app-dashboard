# Feature Specification: Fix Classification Structured-Output Design

**Feature Branch**: `004-fix-classification-output`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "Fix the classification module's structured-output design, which was implemented incorrectly in feature 003 and confirmed broken by a real eval run against the live pipeline: every finding's classification failed with 'Structured output validation failed' errors. Root cause: webSearchFlagSchema.searchContext requires the model itself to echo back, verbatim, the entire originating finding, the full document excerpt, and a partialFindings sub-object — all data the calling code already possesses. Remove that echo requirement, remove the prompt-engineering band-aid added on top of it, adopt Mastra's native structuredOutput.errorStrategy/fallbackValue mechanism in place of (or narrowing) the hand-rolled try/catch wrapper, and re-verify (not assume) whether the discriminated-union shape itself is reliably supported independent of the echo problem."

> **Framing note**: this spec's subject is an internal pipeline
> module's structured-output contract (feature 003's classification
> rebuild), not a standalone user-facing feature — the same framing
> exception already used in specs 001-003 applies here. Two
> stakeholders are real: the **developer** correcting a confirmed
> production-breaking defect, and — because this module's output
> becomes real line items on a real customer's repair estimate — the
> **end user** requesting that estimate, who is directly affected by
> whether classification runs at all. Every finding in the one real
> eval run performed against this code failed; this is not a
> theoretical risk, it is a confirmed, 100%-reproducing production
> outage in the feature this spec corrects.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A finding's classification succeeds on a normal, well-grounded response (Priority: P1)

A homeowner uploads an inspection report. For a finding whose materials,
labor, and trade the agents can determine confidently, the classification
stage must actually complete successfully and hand off a real billable
line — not fail with a schema-validation error the way every single
finding did in the live eval run that prompted this fix.

**Why this priority**: This is the entire reason this fix exists. Feature
003's classification rebuild currently fails on effectively every real
finding; nothing else in this spec matters if the basic determined-value
path doesn't work.

**Independent Test**: Run the real `summarize-estimate` workflow against
the existing eval fixture and confirm at least one finding produces a
real `BillableLine` (not a `WebSearchFlag`) with no structured-output
validation error logged for it.

**Acceptance Scenarios**:

1. **Given** a finding whose materials/labor/trade the agents can
   confidently determine, **When** it is classified, **Then** the
   structured-output call succeeds (no `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`
   error) and a real `BillableLine` is produced.

---

### User Story 2 - A finding that can't be determined is still handled honestly, without requiring the model to echo input back at itself (Priority: P1)

When a finding's quantity, hours, or trade genuinely cannot be grounded,
the system must still represent this honestly (per feature 003's own
`flagged_for_web_search` contract) — but the agent producing that flag
must never be required to reproduce, verbatim, data the calling code
already possesses (the finding, the surrounding document excerpt).

**Why this priority**: Equal priority to User Story 1 — this is the
exact failure mode confirmed in the live eval run. Every observed
failure was inside data the model was being asked to echo back, never
in the model's own actual judgment.

**Independent Test**: Identify or construct a finding with no
determinable quantity/hours/trade; confirm the run produces a
`flagged_for_web_search` result with a real, specific reason, that the
agent's own structured-output call succeeded (no validation error), and
that the resulting flag's full context (finding, document excerpt) is
present in the final output even though the agent itself never had to
produce those fields.

**Acceptance Scenarios**:

1. **Given** a finding with no determinable quantity, hours, or trade,
   **When** it is classified, **Then** the agent's own structured-output
   response contains only its own judgment (a status + a reason, and
   whatever it did determine) — never the original finding object, the
   document excerpt, or a duplicate of its own already-stated partial
   findings.
2. **Given** the same finding, **When** the final result is assembled,
   **Then** it still carries the full context (the originating finding,
   the surrounding document excerpt) needed for a future web-search
   resolution step — attached by the calling code from data it already
   holds, not reproduced by the model.

---

### User Story 3 - A genuine per-finding failure still can't take down the whole batch (Priority: P2)

A finding whose classification fails for a reason that has nothing to do
with the structured-output shape (a transient network error surviving
retries, an unexpected internal failure) must still not prevent any
other finding in the same run from being classified — the resilience
guarantee feature 003 already established must not regress just because
this fix changes how schema-validation failures specifically are
handled.

**Why this priority**: Secondary to Stories 1-2 because it addresses a
failure mode this fix does not primarily target (genuine non-schema
failures), but it must not be silently broken as a side effect of
changing how schema-validation failures are handled.

**Independent Test**: Force a non-schema-validation failure for one
finding (e.g. a simulated transient error) and confirm every other
finding in the same run still completes normally.

**Acceptance Scenarios**:

1. **Given** one finding's classification fails for a reason unrelated
   to structured-output schema validation, **When** the batch runs,
   **Then** every other finding still completes, and the failed
   finding is still represented as a `flagged_for_web_search` result
   (never a dropped finding, never a whole-batch failure).

### Edge Cases

- What happens when the agent's own structured-output response for a
  flagged value omits its `reason` or produces something that still
  fails the (now much smaller) schema? See Clarification Q1.
- What happens when a materials/labor/trade agent step's structured-output
  response fails schema validation? Confirmed: `findingClassificationStep`'s
  existing try/catch (unchanged by this fix) catches it via
  `perFindingClassificationWorkflow.createRun()/.start()` failing, and
  degrades that finding to a `flagged_for_web_search` result exactly as
  it already does for any other per-finding failure — `errorStrategy`/
  `fallbackValue` is not used (FR-003).
- What happens to a finding whose trade IS determined but whose
  materials or labor hours are flagged — does the flag's attached
  context (finding, document excerpt) still get assembled correctly by
  the calling code for that partial-flag case, not just the
  everything-flagged case?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The materials, labor, and trade agents' own structured-output
  schemas MUST NOT require the model to reproduce the originating
  finding's own fields, the surrounding document excerpt, or a
  restatement of the same response's own already-determined partial
  values. The model's own output for an undetermined value MUST be
  limited to its own judgment (a status discriminant and a specific
  reason, and — where the model has already produced them in the SAME
  response, e.g. a labor type alongside flagged hours — its own existing
  fields, never a re-statement of them in a nested duplicate object).
- **FR-002**: The calling code (not the model) MUST assemble the full
  `WebSearchFlag` context (the originating finding, the surrounding
  document excerpt) from data already available via `getInitData()`/
  `getStepResult()` at the point a flagged value is produced or a
  failure is caught.
- **FR-003**: The system MUST NOT rely on
  `structuredOutput.errorStrategy`/`fallbackValue` on the three per-finding
  agent steps' own bare `createStep(agent, { structuredOutput })`
  composition — verified, not assumed, that this composition form's own
  type declaration (`node_modules/@mastra/core/dist/workflows/workflow.d.ts`)
  and Mastra's own documentation (`reference-workflows-step.md`, "Agent
  step options") expose only `{ schema }` for this exact form;
  `errorStrategy`/`fallbackValue` are documented only for a direct
  `agent.generate()`/`.stream()` call. Resolving a structured-output
  schema-validation failure for these three steps MUST continue to use
  `findingClassificationStep`'s existing try/catch wrapper (established
  in feature 003, unchanged by this fix) — the mechanism already proven
  to work through this exact composition form.
- **FR-004**: The system MUST confirm, through actual verification (not
  assumption), that `findingClassificationStep`'s existing try/catch
  wrapper already covers a structured-output schema-validation failure
  for each of the three agent steps (it does — the wrapper catches any
  failure surfaced by `perFindingClassificationWorkflow.createRun()/.start()`,
  including a schema-validation failure inside any of its steps). This
  fix introduces no new resilience mechanism beyond the schema-shape
  correction (FR-001/FR-002) itself; the existing per-finding
  failure-isolation guarantee (one finding's failure never blocks
  another) MUST continue to hold, unchanged.
- **FR-005**: The system MUST determine, through actual verification
  (constructing and running a real test of the discriminated-union
  schema shape against the actual model/gateway in use), whether
  `z.discriminatedUnion('status', [...])` itself is reliably produced by
  the model independent of the echo-back problem this fix removes — this
  MUST NOT be assumed correct or assumed broken without a real test.
- **FR-006**: Prompt instructions for the three classification agents
  MUST NOT need verbose, hand-authored "exact JSON shape" examples to
  reliably produce a valid response once the schema itself no longer
  requires an echo — if such examples are still genuinely necessary
  after the schema simplification, that MUST be treated as a new,
  separately justified finding, not silently re-added as it was before.
- **FR-007**: This fix MUST NOT change the classification taxonomy
  (`TRADE` values), the per-finding step sequence (materials → labor →
  trade → combine), the fan-out/`.foreach()` architecture, pricing, or
  any module outside classification's own structured-output contract and
  resilience mechanism.
- **FR-008**: Every finding submitted for classification MUST still
  receive a result — no finding may be silently dropped as a side effect
  of this fix (this guarantee, established in feature 003, MUST NOT
  regress).

### Key Entities

- **WebSearchFlag (revised)**: the shared "couldn't determine"
  representation. Its `searchContext` no longer requires the model to
  produce `finding`/`documentExcerpt`/`partialFindings` as part of its
  own structured output — those are attached by the calling code after
  the model responds. The exact reduced shape the model itself must
  produce (and the exact point in the code where the fuller context gets
  attached) is a plan-level design decision, not fixed by this spec.
- **Fallback Value**: N/A for this fix. `structuredOutput.errorStrategy`/
  `fallbackValue` is not available on the bare `createStep(agent, {...})`
  composition form used for the three agent steps (verified via the
  installed package's own type declarations — FR-003); a genuine
  structured-output schema-validation failure continues to be handled by
  `findingClassificationStep`'s existing try/catch wrapper, which already
  degrades any per-finding failure to a `flagged_for_web_search` result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running the real `summarize-estimate` workflow against the
  existing eval fixture produces at least one real `BillableLine` (not
  100% of findings ending up flagged, as in the run that prompted this
  fix).
- **SC-002**: Zero `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED` errors are
  logged for findings whose underlying agent response represents a
  genuine, coherent determination or an honest flag — validation
  failures, if any remain, are traceable to a specific, understood cause
  documented in this fix's own plan, not silently tolerated.
- **SC-003**: A finding with no determinable quantity/hours/trade still
  produces a `flagged_for_web_search` result whose full context
  (finding, document excerpt) is present in the final pipeline output,
  without the agent's own structured-output response having contained
  that context itself.
- **SC-004**: A simulated non-schema-validation failure for one finding
  does not prevent any other finding in the same run from completing.
- **SC-005**: No classification taxonomy value, per-finding step order,
  or file outside `classification/`'s own structured-output/resilience
  code changes as a result of this fix (verified via `git diff --stat`
  scoped to this fix).

## Assumptions

- Feature 003's own architecture (per-finding nested workflow, `.foreach()`
  fan-out, the three-agent decoupled design, the sourced trade taxonomy)
  is correct and settled — this fix corrects a structured-output/resilience
  DEFECT within that architecture, it does not redesign the architecture
  itself.
- The live eval run's observed failures are the authoritative evidence
  for this fix's root-cause diagnosis; no further reproduction is needed
  before planning, though the fix's own validation MUST re-run the eval
  harness to confirm the defect is actually resolved.
- Mastra's `structuredOutput.errorStrategy`/`fallbackValue` mechanism
  exists in the installed package (confirmed on `StructuredOutputOptionsBase`,
  consumed by `agent.generate()`/`.stream()`'s own options) but is
  verified — via `workflow.d.ts`'s `createStep(agent, {...})` overload
  and Mastra's own `reference-workflows-step.md` — NOT to be exposed on
  the bare agent-composition form these three steps use. This fix does
  not adopt it; `findingClassificationStep`'s existing try/catch wrapper,
  already proven correct in feature 003, is retained unchanged as the
  sole resilience mechanism.
