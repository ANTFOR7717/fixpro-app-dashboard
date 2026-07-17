# Feature Specification: Pipeline Schema Cleanup

**Feature Branch**: `007-pipeline-schema-cleanup`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Remove `pageHint` entirely from the pipeline
(a field that should never have been created), and — since this already
touches every schema layer of the pipeline — eliminate every other
instance of hand-rolled schema duplication and dead code found during a
full, evidence-based audit of every schema/agent/workflow file in
`estimate-extraction-pipeline`. Twenty-three confirmed findings, listed
below. (#23 was found post-implementation, by `pnpm build` — see its own
entry for why `tsc --noEmit` alone couldn't have caught it.) Nothing in this list is a guess — every item was verified by
reading the actual file, and for library-behavior claims (Zod's
`.extend()`/`.omit()` and exactly which Zod types support them, and
whether Mastra's `.foreach()`/structured-output primitives support the
alternatives considered), by reading the installed package's own type
declarations or Mastra's own current docs, not from memory. #13 and #14
surfaced mid-session when the user directly challenged whether unverified
assumptions counted as slop; tracing them against the actual
spec/clarification history confirmed neither was ever actually requested.
#17 is an explicit user direction (delete legacy compatibility entirely
rather than accommodate it) issued during implementation planning; #15
and #16 are dead code #17 itself created, found in a dedicated follow-up
audit requested after #17 landed. #18 and #19 are two more real
`pageHint` occurrences found by grepping the repository directly during
a second, explicitly schema-focused audit pass rather than trusting the
plan's own prior claims (#19 was self-inflicted, added by this feature's
own first-pass wording, not present before it). #20 and #21 were found
by a step no earlier pass in this plan had run: actually compiling
(`tsc --noEmit`) the fully-applied combined patch in a scratch worktree,
rather than only verifying that each diff's hunks apply — patch
application proves internal consistency, never that the resulting code
compiles."

## Governing Rule

A schema's job is to make an invalid state unrepresentable, not to
describe a shape loosely and lean on surrounding code to police it. Every
finding in this list that involves a hand-written `if`/`throw`/
`superRefine` check (#3, #4, #12) or a manual join reconstructing a
relationship that was never actually two things (#11) exists **only**
because a schema allowed a state its own domain rules forbid. Nobody
asked for that compensating code — it's a symptom, and the fix in every
one of those findings is to correct the schema's own shape (a
discriminated union, `.extend()`/`.omit()`, or moving a field into the
branch it actually belongs to) so the check, throw, refinement, or join
becomes structurally unnecessary and is deleted, not rewritten elsewhere.

The one thing this rule does NOT cover: reading a discriminated union's
own tag to branch on it (e.g. `flatten.ts` checking
`material.quantity.status !== 'determined'`) is not a violation — that's
the unavoidable, correct way to consume a union once the schema itself
has already ruled out the invalid states. The defect is a check that
compensates for a schema's own gap, not a check that reads a tag the
schema itself defines.

## Governing Rule 2: Every constraint traces to a request, or it's slop

A schema constraint (a numeric bound, an enum's exact member list, a
required-vs-optional split, a rounding rule) is only legitimate if it
traces to something the user actually asked for or an explicit
clarification the user actually answered — findable in a spec's own
Clarifications/Assumptions section, or stated directly in conversation.
"It sounds like a reasonable default" is not a source; it's the same
assumption-instead-of-verification failure this project's constitution
(Principle V) already exists to prevent, applied to constraint values
instead of SDK behavior. Findings #13 and #14 were both found this way:
by tracing a suspicious-looking constant back through every spec
artifact that could have justified it and confirming none did — not by
judging whether the constant "seemed fine." The trade taxonomy
(`TRADE` in `classification/schema.ts`) is the standing counter-example:
it traces to an explicit, answered clarification
(`specs/003-classification-rebuild/spec.md` Clarification Q3, sourced
from published state contractor-licensing documents) and is therefore
NOT a finding in this list, despite being exactly the kind of "someone
picked a specific list of values" constraint that would otherwise invite
the same scrutiny.

## The Slop List

1. **`pageHint`** — a "p. {N}" page citation field, threaded through
   `extraction/schema.ts`, `extraction/agent.ts`, `classification/schema.ts`,
   `classification/agents.ts`, `classification/finding-workflow.ts`, and
   rendered live in `estimate/components/items-section.tsx`. Explicitly
   directed for full removal, regardless of it being live UI-rendered
   functionality (confirmed via source read, not assumed dead code).
2. **`excerptNearPageHint()`** (`classification/finding-workflow.ts`) —
   the document-context windowing function that anchors on `pageHint`.
   Removing `pageHint` removes its only anchor; needs a real replacement,
   not a deletion with no substitute (that would silently strip document
   context from every classification agent call — a regression).
3. **`flatten.ts`'s hand-written `throw new Error(...)` invariant checks**
   (lines ~72-76, ~98-100) — runtime checks enforcing "a determined
   quantity/hours must have an `amountSource`/`hoursSource`," because the
   schema doesn't express that coupling itself (`amountSource`/
   `hoursSource` are dangling `.optional()` siblings, disconnected from
   `quantity.status`/`hours.status`).
4. **`finding-workflow.ts`'s `materialsStepOutputSchema`/
   `laborStepOutputSchema`** (lines ~62-81) — hand-retype `material`/
   `amountSource`/`laborType`/`hoursSource` field definitions that already
   exist once in `schema.ts`'s `materialDeterminationSchema`/
   `laborDeterminationSchema`. Same root cause as #3 — fixing the
   determined-branch shape fixes both at once.
5. **`shared/quarter-hour.ts`'s `roundToQuarter()`** — zero callers
   anywhere in the codebase (confirmed via full-repo grep). Classification's
   actual quarter-hour enforcement happens via Zod's `.multipleOf(0.25)`
   on the schema directly; this function is not that mechanism and is not
   used by it.
6. **`shared/gateway.ts`'s `kiloGateway`** — its own comment admits it:
   "Currently unused by any agent; not deleted on purpose... kept... in
   case reverting to it... proves necessary." A speculative, unused export
   kept for a hypothetical future revert.
7. **`classificationResultSchema`** (`classification/schema.ts`, lines
   ~200-213) hand-retypes the same `action`/`scope`/`location`/
   `sourceQuote` field definitions (`pageHint` too, before #1) already
   captured by `itemIdentityFields` (lines ~174-185) — byte-for-byte
   identical Zod constraints, written twice in the same file.
8. **`itemIdentityFields` itself is a bare object literal**, not a real
   `ZodObject` — spread (`...itemIdentityFields`) into `materialLineSchema`/
   `laborLineSchema` rather than composed via Zod's own `.extend()`
   method. Verified real and available in the installed package
   (`node_modules/zod/v4/classic/schemas.d.ts:444`:
   `extend<U>(shape: U): ZodObject<util.Extend<Shape, U>, Config>`, plus
   `.omit()`/`.pick()` alongside it) — the correct native mechanism for
   "this schema is built from that schema, plus/minus specific fields,"
   which is what both `classificationResultSchema` (extraction's finding,
   renamed/trimmed, plus determinations) and the line schemas (identity
   fields plus line-specific fields) actually are.
9. **`pricing/schema.ts`'s `pricedLineItemSchema`** (lines ~52-59)
   hand-retypes `currency`/`confidence`/`source`/`unavailableReason` —
   fields already defined once as `priceEvidenceFields` and correctly
   spread into `materialPriceResponseSchema`/`laborPriceResponseSchema` in
   the same file. `pricedLineItemSchema` just doesn't reuse it.
10. **`agentUndeterminedSchema`** (`classification/schema.ts`, lines
    ~108-112) — `{ status, reason }` is exactly
    `webSearchFlagSchema.omit({ searchContext: true })`. Same duplication
    pattern as #7/#9, expressible via the same `.omit()` primitive
    verified for #8.
11. **`billableLineSchema`/`pricedLineItemSchema` are split into two
    separately-persisted, separately-correlated arrays** (`lines` +
    `prices`, joined by `id`/`itemId` at render time via a `Map` in
    `items-section.tsx`), even though: (a) the natural, paired shape
    already exists at `pricing/price-line.ts`'s own step output
    (`{ line, price }`) and is actively unzipped by `pricing/index.ts`'s
    `priceLines()` before being handed onward; and (b) no code path
    anywhere re-prices an already-classified line independently —
    `retryEstimateAction` re-runs the entire pipeline from scratch
    (confirmed via grep + reading `estimate/api/actions.ts`), so the
    "independently recomputable" justification for keeping them apart
    does not hold. The correct shape is one merged `pricedLineSchema`,
    built by extending `materialLineSchema`/`laborLineSchema` (each a real
    `ZodObject`) individually with a `price` field and rebuilding the
    discriminated union — NOT `billableLineSchema.extend({ price })`
    directly, since `billableLineSchema` is itself a
    `z.discriminatedUnion(...)` with no `.extend()` method (caught during
    plan review; see `research.md` R4). `price` is the restructured shape
    from finding #12 below — not a flat `unitPrice`/`currency`/
    `confidence`/`source`/`unavailableReason` spread.
12. **`pricing/schema.ts`'s `xorUnavailable`** — a hand-written
    `superRefine` enforcing "exactly one of `unitPrice`/`unavailableReason`
    is non-null" at runtime. This codebase already has the correct,
    proven-in-production Zod primitive for this exact case —
    `determinedOr()` (`classification/schema.ts`), a discriminated union
    with a literal `status` tag, already used successfully by three
    agents. `pricing/schema.ts` reinvents the identical "real value OR an
    explicit reason it's unknown" semantics as two nullable sibling
    fields plus a hand-written mutual-exclusion check instead of reusing
    it. Correction to an earlier claim made this session: a
    `discriminatedUnion` with an explicit literal tag (what `determinedOr`
    already is) is NOT the same fragile thing that broke in specs/005 — that
    was a **plain**, non-discriminated `z.union([...])` with no shared tag
    for the model to key off of. Conflating the two was wrong. The fix:
    `price: determinedOr(z.object({ unitPrice: z.number().int().min(0),
    ...priceEvidenceFields }))` for material (and the `hourlyRate`
    equivalent for labor — the existing material/labor field-name
    distinction is kept, NOT unified into one generic `amount` field; an
    earlier draft of this finding proposed that unification, pattern-matched
    from unrelated work in `specs/006-resolution-mastra-primitives`, and
    was walked back as scope creep) with a minimal pricing-specific flag
    branch (`{ status, reason }`, mirroring `agentUndeterminedSchema`) —
    `confidence`/`source` only ever required alongside an actual price
    (currently required even when `unitPrice` is null, which doesn't
    coherently mean anything), and `unavailableReason` becomes the flag
    branch's own `reason`. This
    reshapes finding #9's fix: `priceEvidenceFields` stops being a flat
    spread of five sibling fields and becomes the determined branch's own
    value shape instead.
13. **`.multipleOf(0.25)`** (`classification/schema.ts`'s
    `laborDeterminationSchema.hours` and `laborLineSchema.quantity`) — an
    unconfirmed assumption, not a verified requirement. Checked against
    `specs/003-classification-rebuild/spec.md`'s own functional
    requirements and clarifications: quarter-hour billing increments are
    not named anywhere in it. The constraint first appears in that
    feature's whiteboard/data-model planning artifacts, justified by a
    comment citing `.prototype/fixpro-report-mock.v3.html`'s sample labor
    values (`0.25, 1.5, 3.5, 4.5`, confirmed via reading the mock — all
    happen to be quarter-hour multiples). A past instance of this
    assistant pattern-matched a validation rule from ~11 example numbers
    in a mock file and encoded it as a hard, structured-output-failing
    constraint, without ever confirming it as an intentional product rule
    versus incidental round numbers in sample data. No spec, clarification,
    or explicit user statement establishes quarter-hour billing as an
    actual requirement for this product.
14. **Every specific numeric string-length bound across the pipeline's
    schemas** — traced by grepping every `specs/*/spec.md` Clarifications
    and Assumptions section for each value; none appear:
    - `sourceQuote: z.string().min(8).max(500)` — first appears
      `specs/001-extraction-mastra-standard-compliance/data-model.md:29`,
      a planning artifact, not a clarified requirement.
    - `reason: z.string().min(1).max(300)` — first appears
      `specs/003-classification-rebuild/data-model.md:37`, same status.
    - `source: z.string().min(1).max(200)` — first appears
      `specs/005-classification-web-search-resolution/data-model.md:37`
      (carried into 006's `resolvedValueSchema`), same status.
    - `source: z.string().min(1).max(120)` (`pricing/schema.ts`'s
      `priceEvidenceFields`) — same status.
    - `unavailableReason: z.string().min(1).max(280)` — same status.
    Every one of these was invented during a whiteboarding/data-model
    planning pass, not requested in any spec's Clarifications or
    Assumptions section, and not stated by the user in this session.
15. **`estimate/lib/format.ts`'s `formatTradeLabel()`** special-cases five
    trade values (`structural`, `appliance`, `exterior`, `interior`,
    `other`) from a "retired 11-value taxonomy" its own comment
    describes. None appear in the current `TRADE` enum (confirmed via
    grep of `classification/schema.ts`) — the only way any of these
    could ever reach this function was from v1/v2-persisted rows, which
    finding #17 (below) deletes support for entirely. Dead code, created
    by this feature's own legacy-removal work, not present before it.
16. **`estimate/lib/format.ts`'s `formatUnit()`** special-cases `'sqft'`,
    the "retired legacy unit alias" its own comment describes. `'sqft'`
    never appeared in the current `EXTENT_UNIT` enum — only in
    `envelope.ts`'s now-deleted `LEGACY_UNIT` array. Same status as #15:
    dead code created by this feature's own legacy-removal work.
17. **`estimate/lib/envelope.ts`'s v1/v2 legacy support** —
    `legacyBillableItemSchema`, `summaryEnvelopeV1Schema`,
    `summaryEnvelopeV2Schema`, and `ParsedEnvelope`'s `'v1'`/`'v2'`
    variants — explicit user direction mid-implementation-planning:
    legacy compatibility is itself unrequested-complexity slop, not
    something to preserve or build a rendering path around ("i do not
    care about legacy, it is slop stop trying to build around it").
    Reverses this spec's own original FR-003 (see revised FR-003).
    Findings #15/#16 are direct downstream consequences of this one.
18. **`document/schema.ts`'s doc comment** — literally names `pageHint`
    ("to match how pageHint (\"p. 14\") and pdf-parse's own page
    numbering both count pages") despite carrying no `pageHint` field or
    logic itself. This file was never in this feature's original
    20-file scope; found by grepping `src/` for `pageHint` directly
    against the actual repository during a second, schema-focused audit
    pass rather than only re-reading files already believed in scope.
    SC-001's own Independent Test (`grep -rn pageHint src/`, zero
    results, no exception) fails against it as written.
19. **`classification/finding-workflow.ts`'s own replacement comment for
    `excerptNearPageHint()`** (see FR-002) — a first-pass rewrite of that
    comment described what it replaced using the literal string
    `` `pageHint` ``-anchored windowing", reintroducing the exact string
    SC-001 requires to have zero occurrences, inside prose this feature
    itself adds. Caught only by the whiteboarding Review Gate's own
    "extract every diff block from this document's prose and run one
    combined `git apply --check`, then grep the applied result" step —
    not by re-reading the plan's own claims.
20. **`classification/index.ts`'s barrel export** — re-exports
    `type Trade` but not `type ExtentUnit`, even though `format.ts`'s
    revised `formatUnit(unit: ExtentUnit | 'hrs')` (finding #16/FR-021)
    imports `ExtentUnit` from that exact barrel. A real compile error,
    invisible to every `git apply --check`-based verification this plan
    ran, because diff application proves a patch's hunks are internally
    consistent — never that the resulting tree actually compiles. Found
    by running `tsc --noEmit` against the fully-applied combined patch
    in a scratch worktree, the first time this plan was checked that way.
21. **`eval/pipeline/run.ts` and `eval/pipeline/scorers/pricing-match.ts`**
    — both import `PricedLineItem` and read a flat `unitPrice`/`itemId`
    shape that finding #11/FR-011/FR-017 delete entirely (replaced by
    `PricedLine`'s merged, discriminated-union shape). Neither file is
    under `src/`, so no scope-tracing step in this plan (which only ever
    grepped `src/`) would have found them; found the same way as #20,
    by actually compiling the applied patch. Fixing them surfaced a
    genuine duplication: both files need the identical "get the
    determined price amount, or null" branch check that
    `items-section.tsx` already has locally — per User Story 2, that
    logic now lives once, in `pricing/schema.ts`'s exported
    `priceAmount()`, not copied a second and third time.
22. **`classification/agents.ts`'s `laborAgent` prompt** — still
    instructed "hours in quarter-hour increments (0.25, 0.5, 0.75, 1.0,
    ...)", the exact same unverified assumption FR-018 already removes
    at the schema level (finding #13). Removing `laborLineSchema`'s
    `.multipleOf(0.25)` constraint while leaving the prompt instruction
    in place would have left the underlying assumption fully intact —
    just relocated to prose a schema-focused grep would never catch.
    Found during a final pre-implementation review that re-read every
    agent prompt fresh, rather than trusting each file's own "prompt
    text only, no further changes" characterization from the scaffold
    pass, which was accurate for the `pageHint` removal but stopped
    being accurate once FR-018 changed what the schema actually
    requires.
23. **`items-section.tsx`'s import of `priceAmount` from the `pricing`
    door** — a REAL BUG introduced by this feature's own fix for finding
    #21, caught only after implementation by `pnpm build` (not by
    `tsc --noEmit`, which the whole review process had relied on up to
    this point). `items-section.tsx` is `'use client'`; every existing
    import from `pricing` there was deliberately `import type` so it
    erases at compile time. Changing one to a real (non-type) import of
    `priceAmount` pulled `pricing/index.ts`'s full module graph —
    including `workflow.ts`/`agent.ts`'s Mastra/Node-only code
    (`stream/web`, unavailable in a browser bundle) — into the client
    bundle, and the production build failed outright. Fixed by reverting
    `items-section.tsx` to its own local `priceAmount()` copy (its
    original form, before finding #21's "fix") and leaving
    `pricing/schema.ts`'s exported `priceAmount()` serving only the eval
    scorer (a Node-only script with no client-bundle constraint). This
    reintroduces one small, structurally-necessary duplication — not
    slop, since the alternative is a build failure, not a style
    preference. Lesson recorded for future audits in this codebase:
    `tsc --noEmit` proves types are consistent; it does NOT prove a
    'use client' component's import graph stays server-code-free. Only
    an actual bundler build does.
24. **`classification/agents.ts`'s `materialsAgent`/`laborAgent` prompts
    described the WRONG output shape** — a genuine, severe regression,
    caught only by actually running `pnpm eval:pipeline` against a real
    fixture (not by `tsc`, `eslint`, or `pnpm build`, none of which
    understand what shape an LLM prompt describes). FR-004 restructured
    `materialDeterminationSchema`/`laborDeterminationSchema` so
    `amountSource`/`hoursSource` live INSIDE the determined branch's own
    `value` object (`materialQuantityValueSchema`/`laborHoursValueSchema`
    in `classification/schema.ts`) rather than as dangling optional
    siblings — a deliberate, correct schema change (see finding #4's own
    entry). But the agent prompts describing what shape to PRODUCE were
    never updated to match: `materialsAgent`'s prompt still told the
    model `amountSource` was a sibling field of `quantity` (and its own
    HARD RULE 5 showed the determined value as `{ amount, unit }`, no
    `amountSource` at all); `laborAgent`'s was worse — its HARD RULE 4
    claimed a determined hours value was a bare number
    (`{ "value": <number> }`), when the schema actually requires
    `{ "value": { "amount", "hoursSource" } }`. Every real LLM call
    against this fixture (`pnpm eval:pipeline`) failed structured-output
    validation on nearly every finding with materials or labor
    (`STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED:
    materials.0.quantity.value.amountSource: Invalid input: expected
    string, received undefined`), which `finding-workflow.ts`'s own
    documented per-finding catch-block (FR-016's mechanism, confirmed
    NOT a defect below) correctly degraded into "classification failed,
    flag for web search" — meaning the pipeline was silently producing
    almost zero billable lines for any real report, while every static
    check (`tsc`, `eslint`, `pnpm build`) reported clean. Fixed by
    rewriting both prompts' output-shape descriptions and hard rules to
    match the actual nested schema exactly. Re-ran `pnpm eval:pipeline`
    after the fix to confirm the specific failure mode is gone (see
    whiteboard/tasks.md for the actual before/after run results). Lesson
    recorded: a schema restructuring that changes an agent's
    structured-output contract must always be paired with reading the
    corresponding prompt text against the new shape field-by-field, not
    just checking that the SCHEMA FILE'S OWN types compile — this is a
    class of defect that only a live agent call can surface, and this
    feature's entire review process (four passes deep) never once ran
    the actual pipeline before implementation.

Explicitly confirmed NOT slop during this same audit (so a future pass
doesn't re-litigate these): `pricing/price-line.ts`'s direct
`agent.generate()` calls (the documented Mastra "per-call runtime
control" exception — it must pick between two different structured-output
schemas at runtime by `costType` and inject a per-call `RequestContext`,
neither of which the bare `createStep(agent, {...})` form supports);
`findingClassificationStep`'s try/catch in `finding-workflow.ts` (matches
Mastra's own documented "Conditional branching" error-handling idiom —
catch inside `execute()`, return a typed result instead of throwing, so
one bad finding doesn't fail the whole batch — and it degrades to the
same honest `flagged_for_web_search` shape a successful-but-uncertain
agent run already produces, not a fabricated value, so it is not the same
defect class as specs/005's system-default fallback).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - `pageHint` is gone, everywhere (Priority: P1)

A developer reading the pipeline's schemas, agent prompts, or the
rendered estimate report never encounters `pageHint` again. The field
does not exist in extraction's output, classification's output, any
billable line, or the report UI.

**Why this priority**: This is the explicit, originally-mandated removal
that triggered the rest of the audit. Every other item is downstream
cleanup found while doing this one correctly.

**Independent Test**: Grep the entire `src/` tree for `pageHint` after
implementation — zero results anywhere (legacy v1/v2 schemas that used
to carve out an exception here are themselves deleted per revised
FR-003).

**Acceptance Scenarios**:

1. **Given** a fresh estimate run against the eval fixture, **When** the
   pipeline completes, **Then** no `pageHint` field appears anywhere in
   the persisted v3 envelope, and classification's agents still receive
   real document context (not an empty excerpt) for every finding.
2. **Given** the "Show Source Quote" toggle in the report UI, **When** a
   user enables it, **Then** the source quote renders without a page
   citation suffix (the `({pageHint})` span is gone).

---

### User Story 2 - One definition per shared field group, not two or three (Priority: P2)

A developer changing a shared field's validation rule (e.g. tightening
`sourceQuote`'s length bound) makes that change in exactly one place and
it takes effect everywhere that field appears — not in two or three
hand-retyped copies that can silently drift out of sync.

**Why this priority**: Real, confirmed duplication (findings #3, #4, #7,
#8, #9, #10) and hand-written-check-instead-of-schema-shape defects
(findings #3, #4, #12 — see Governing Rule above) across four different
files in two different pipeline modules — a systemic pattern, not a local
nit, but lower risk than #1 (no field is removed, only how existing
fields are declared/checked changes) and independent of it.

**Independent Test**: Grep for the specific field-name+constraint pairs
listed in findings #3/#4/#7/#9/#10 (e.g. `sourceQuote: z.string().min(8)`)
— each must appear in exactly one schema declaration; every other use is
a `.extend()`/`.omit()`/spread reference to that one declaration, not a
retyped copy.

**Acceptance Scenarios**:

1. **Given** `classification/schema.ts`, **When** `itemIdentityFields`
   becomes a real `ZodObject`, **Then** `materialLineSchema` and
   `laborLineSchema` are both built via `.extend()` off it, and
   `classificationResultSchema` is built via `extractedFindingSchema
   .omit({...}).extend({...})` rather than independently retyping
   `action`/`scope`/`location`/`sourceQuote`.
2. **Given** `classification/schema.ts`'s `materialDeterminationSchema`/
   `laborDeterminationSchema`, **When** their determined branch is
   reshaped so `amountSource`/`hoursSource` live inside the determined
   value instead of as dangling optional siblings, **Then**
   `flatten.ts`'s hand-written `throw new Error(...)` invariant checks
   are removed entirely (the shape now makes the invalid state
   unrepresentable), and `finding-workflow.ts`'s step-output schemas
   reference the same shared piece instead of retyping it.
3. **Given** `pricing/schema.ts`'s `materialPriceResponseSchema`/
   `laborPriceResponseSchema`, **When** price is restructured via
   `determinedOr()`, **Then** `xorUnavailable` and its `superRefine` call
   are deleted entirely — the determined/unavailable split is enforced by
   the union's own shape, not a runtime check.
4. **Given** `classification/schema.ts`'s `agentUndeterminedSchema`,
   **When** it is rebuilt, **Then** it is defined as
   `webSearchFlagSchema.omit({ searchContext: true })` rather than
   independently retyping `status`/`reason`.

---

### User Story 3 - One array for billable lines, not two correlated ones (Priority: P3)

A developer reading a persisted estimate, or rendering one in the report,
works with a single list of priced lines — no separate `prices` array, no
`Map`-based join by id to reconstruct what should have been one object
all along.

**Why this priority**: The largest blast radius of the three stories —
touches persistence (`envelope.ts`'s v3 schema shape), the pipeline's own
output contract (`pricing/index.ts`, `pipeline.ts`), and rendering
(`items-section.tsx`) — so it ships last and independently, after the
lower-risk schema-consolidation work in User Story 2 is proven out.

**Why this priority**: Confirmed real via evidence, not preference: the
paired shape already exists at `price-line.ts`'s own step output and is
actively thrown away by `priceLines()`; no code path ever needs `lines`
and `prices` independently recomputable (retry re-runs the whole
pipeline, confirmed by reading `retryEstimateAction`).

**Independent Test**: After implementation, `summaryEnvelopeV3Schema` has
one `lines` array with no separate `prices` field. `items-section.tsx`
has no `priceByItemId` `Map`. An estimate persisted before this change
under the old split shape falls through to `ParsedEnvelope`'s
`'unparseable'` variant and surfaces the existing retry affordance,
rather than rendering incorrectly.

**Acceptance Scenarios**:

1. **Given** a fresh estimate run, **When** pricing completes, **Then**
   `priceLines()` returns one array of merged priced lines (each branch of
   `billableLineSchema` extended individually with a `price` field, where
   `price` is finding #12's restructured `determinedOr()` shape, then
   rebuilt as a discriminated union — see `research.md` R4), not a
   `{ lines, prices }` pair.
2. **Given** `estimate/lib/envelope.ts`, **When** this story ships,
   **Then** `summaryEnvelopeV3Schema` is modified in place to the merged
   one-`lines`-array shape (still version 3 — no v4), and
   `ParsedEnvelope`'s `'v3'` variant is updated to match.
3. **Given** an estimate persisted under the OLD v3 shape (separate
   `lines`/`prices` arrays), **When** it is loaded after this change,
   **Then** it falls through to `'unparseable'` — an explicitly accepted
   outcome (per the resolved Clarification below), since the user
   re-triggers it via the existing retry flow rather than this feature
   maintaining a versioning cascade to keep it parsing.

---

### User Story 4 - Dead code is gone (Priority: P4)

A developer reading `shared/` sees only code something actually calls.

**Why this priority**: Lowest risk, lowest effort, zero behavior change —
ships any time, independent of every other story.

**Independent Test**: `roundToQuarter` and `kiloGateway` no longer exist
in the codebase; `pnpm exec tsc --noEmit` stays clean (nothing referenced
either).

**Acceptance Scenarios**:

1. **Given** `shared/quarter-hour.ts`, **When** this story ships,
   **Then** `roundToQuarter()` and the file itself (if nothing else lands
   in it) no longer exist.
2. **Given** `shared/gateway.ts`, **When** this story ships, **Then**
   `kiloGateway` no longer exists; `pioneerGateway` is unaffected.

---

### User Story 5 - Every remaining constraint traces to a request (Priority: P2)

A developer reading any numeric bound, rounding rule, or enum in the
pipeline's schemas can find, for each one, either the spec clarification
that established it or a direct statement from the user — never a
constraint that exists only because it "seemed reasonable" during
planning.

**Why this priority**: Same priority as User Story 2 — both are
schema-correctness work, independent of the higher-risk array merge (US3)
and lower-priority dead-code removal (US4). Surfaced mid-session via
Governing Rule 2, applied by tracing every suspicious constant against
the actual spec/clarification history rather than judging it in
isolation.

**Independent Test**: For each of findings #13/#14, grep the resulting
code for the old constraint (`.multipleOf(0.25)`, the specific `min`/`max`
numbers) — zero results. `TRADE`'s taxonomy (already traced to an
answered clarification) is unaffected — this story does not touch it.

**Acceptance Scenarios**:

1. **Given** `classification/schema.ts`'s `laborDeterminationSchema.hours`
   and `laborLineSchema.quantity`, **When** this story ships, **Then**
   both accept any positive number, with no quarter-hour rounding rule.
2. **Given** the five untraceable string-length bounds named in finding
   #14, **When** this story ships, **Then** each is either replaced with
   a minimal, defensible sanity bound, or — if the user supplies an
   actual reason for a specific number during implementation — kept and
   annotated with that reason, so a future audit can trace it.

---

### Edge Cases

- A finding's document context (previously windowed via
  `excerptNearPageHint`) must not silently become empty once `pageHint`
  is gone — the replacement (full-document context, mirroring
  `buildExtractionPrompt`'s existing format) must actually reach every
  classification agent call, not just compile.
- `legacyBillableItemSchema` (v1/v2) is deleted entirely (revised FR-003)
  — no exception remains for `pageHint` to carve out; it is gone
  unconditionally.
- User Story 3's schema merge changes the v3 envelope's on-disk shape.
  Estimates already persisted under the current (`lines` + `prices`) v3
  shape are explicitly allowed to become unparseable — a user recovers
  via the existing retry flow, not via preserving old-shape parsing (see
  resolved Clarification).

## Clarifications

### Session 2026-07-17

- Q: User Story 3 changes what's persisted under `summaryEnvelopeV3Schema`
  (removes the separate `prices` array). Existing v1→v2→v3 migrations in
  `envelope.ts` each introduced a new `version` literal specifically so
  old rows keep parsing under their own schema. Does this merge get a new
  version number (`SUMMARY_ENVELOPE_VERSION_4`) the same way, or does it
  reuse version 3? → A: Reuse version 3, modified in place — no v4.
  Estimates already persisted under the current split `lines`/`prices`
  v3 shape are explicitly NOT required to keep parsing after this ships;
  a user with such an estimate re-runs it via the existing
  `EstimateRetryButton`/`retryEstimateAction` (already re-runs the entire
  pipeline from scratch, confirmed via finding #11's own research) to
  regenerate it under the new shape. This revises SC-006 (below); v1/v2
  compatibility was initially assumed unaffected, then also explicitly
  dropped later in the same session (see revised FR-003) — legacy
  compatibility as a whole is now out of scope, not just old-v3-shape
  parsing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `pageHint` MUST be removed from `extraction/schema.ts`'s
  `extractedFindingSchema`, `extraction/agent.ts`'s prompt instructions,
  `classification/schema.ts`'s `itemIdentityFields` (and everywhere it
  cascades: `classificationResultSchema`, `materialLineSchema`,
  `laborLineSchema`), `classification/agents.ts`'s three agent prompts,
  and `estimate/components/items-section.tsx`'s render output.
- **FR-002**: `classification/finding-workflow.ts`'s `excerptNearPageHint()`
  MUST be replaced with a document-context mechanism that does not depend
  on `pageHint`, and every one of its four call sites in that file must
  use the replacement — none may silently degrade to empty context.
- **FR-003 (REVISED)**: `estimate/lib/envelope.ts`'s v1/v2 legacy support
  (`legacyBillableItemSchema`, `summaryEnvelopeV1Schema`,
  `summaryEnvelopeV2Schema`, and `ParsedEnvelope`'s `'v1'`/`'v2'`
  variants) MUST be deleted entirely — explicit user direction: legacy
  compatibility is itself unrequested-complexity slop, not something to
  preserve or build around. Original wording (kept for the decision
  trail) said this MUST NOT be modified; reversed explicitly by the user
  mid-implementation-planning. An estimate persisted under the old v1/v2
  shape renders as `'unparseable'` after this ships — same recovery path
  already accepted for old-shape v3 rows (FR-012): the user re-runs it.
- **FR-004**: `classification/schema.ts`'s `materialDeterminationSchema`/
  `laborDeterminationSchema` MUST be reshaped so `amountSource`/
  `hoursSource` live inside the determined branch's own value rather than
  as dangling `.optional()` siblings, making "a determined quantity/hours
  always has a source" a structural guarantee instead of a runtime check.
- **FR-005**: `classification/flatten.ts`'s hand-written
  `throw new Error(...)` invariant checks (enforcing the constraint FR-004
  now makes structurally impossible to violate) MUST be removed.
- **FR-006**: `classification/finding-workflow.ts`'s
  `materialsStepOutputSchema`/`laborStepOutputSchema` MUST reference the
  shared determination shape from `schema.ts` (per FR-004) rather than
  independently retyping `material`/`amountSource`/`laborType`/
  `hoursSource`.
- **FR-007**: `classification/schema.ts`'s `itemIdentityFields` MUST
  become a real `ZodObject`, and `materialLineSchema`/`laborLineSchema`
  MUST be built via that object's own `.extend()` method rather than
  object-spread.
- **FR-008**: `classification/schema.ts`'s `classificationResultSchema`
  MUST be built via `extractedFindingSchema`'s own `.omit()`/`.extend()`
  methods rather than independently retyping `action`/`scope`/`location`/
  `sourceQuote`.
- **FR-009**: `pricing/schema.ts`'s `materialPriceResponseSchema`/
  `laborPriceResponseSchema`/the persisted price shape MUST reuse a
  single, shared "priced or explicitly unavailable" determined-branch
  value definition (per FR-017) rather than each independently retyping
  `currency`/`confidence`/`source`.
- **FR-010**: `classification/schema.ts`'s `agentUndeterminedSchema` MUST
  be defined as `webSearchFlagSchema.omit({ searchContext: true })`
  rather than independently retyping `status`/`reason`.
- **FR-011**: `billableLineSchema` and the pricing output MUST be merged
  into one `pricedLineSchema`, built by extending `materialLineSchema`/
  `laborLineSchema` individually with a `price` field (FR-017's
  restructured determined-or-unavailable value) and rebuilding the
  discriminated union — NOT via a direct `billableLineSchema.extend()`
  call, since `billableLineSchema` is a `z.discriminatedUnion(...)` and
  has no `.extend()` method (verified against the installed Zod package;
  see `research.md` R4). `pricing/index.ts`'s `priceLines()` MUST return
  one array of this merged shape, not a `{ lines, prices }` pair.
- **FR-012**: `estimate/lib/envelope.ts`'s `summaryEnvelopeV3Schema` MUST
  be modified in place (still version 3, no new version literal) to match
  FR-011's merged shape, and `ParsedEnvelope`'s `'v3'` variant updated to
  match. Per the resolved Clarification, estimates persisted under the
  prior (split `lines`/`prices`) v3 shape are explicitly NOT required to
  keep parsing — they fall through to `'unparseable'` and are recovered
  via the existing retry flow, not via a versioning cascade.
- **FR-013**: `estimate/components/items-section.tsx` MUST be updated to
  read price fields directly off each line, removing the `priceByItemId`
  `Map` correlation entirely.
- **FR-014**: `shared/quarter-hour.ts`'s `roundToQuarter()` MUST be
  deleted (zero callers, confirmed via full-repo grep).
- **FR-015**: `shared/gateway.ts`'s `kiloGateway` MUST be deleted (zero
  agents reference it, confirmed via source read of every agent
  definition in the pipeline).
- **FR-016**: `pricing/price-line.ts`'s use of `agent.generate()` (as
  opposed to the bare `createStep(agent, {...})` form) and
  `finding-workflow.ts`'s catch-and-return-typed-result pattern (as
  opposed to throwing) MUST NOT change — both were verified this session
  against Mastra's own current docs/installed source and confirmed to be
  legitimate, documented patterns, not defects. This is a boundary on the
  *mechanism*, not a freeze on the file: `price-line.ts`'s own success-path
  and catch-block return values MUST still be updated to match FR-011's
  merged `pricedLineSchema` shape (its `price` field simplifies to a
  direct pass-through of the agent's own `result.object.price`, since both
  sides are the same `determinedOr()` union — see `data-model.md`), and
  its catch-block fallback MUST return the new `{ status: 'unavailable',
  reason }` shape instead of the old flat one. The resilience behavior
  (catch, degrade, never throw) does not change; the data shape it
  produces does, because FR-011/FR-017 changed what `pricedLineSchema`
  itself looks like.
- **FR-017**: `pricing/schema.ts`'s `xorUnavailable` hand-written
  `superRefine` MUST be removed. Price MUST instead be represented via
  `determinedOr()` (the same discriminated-union builder
  `classification/schema.ts` already uses and three of its agents already
  rely on in production): a determined branch carrying `{ unitPrice,
  ...priceEvidenceFields }` for `materialPriceResponseSchema` and
  `{ hourlyRate, ...priceEvidenceFields }` for `laborPriceResponseSchema`
  — `confidence`/`source` (via `priceEvidenceFields`, per FR-009) are NOT
  independently retyped in each determined branch, only the
  material/labor-specific price field differs — and a minimal flag branch
  carrying `{ status, reason }` for the unavailable case.
  `confidence`/`source` MUST be required only in the determined branch,
  not unconditionally alongside a null price as they are today.
- **FR-017a**: `pricing/agent.ts`'s own prompt instructions (currently
  "OUTPUT: MATERIAL lines: unitPrice (integer whole USD, or null),
  currency, confidence, source, unavailableReason..." and "return null
  with a one-sentence unavailableReason") MUST be rewritten to describe
  FR-017's actual structured-output contract (a determined price value OR
  an explicit `{ status: 'unavailable', reason }`), matching how
  `classification/agents.ts`'s three agents already correctly describe
  their own determined-or-flagged output shape. Caught during plan
  review: the prompt was missing from this spec's original scope despite
  describing the exact shape FR-017 replaces.
- **FR-018**: `classification/schema.ts`'s `.multipleOf(0.25)` constraint
  on `laborDeterminationSchema.hours` and `laborLineSchema.quantity` MUST
  be removed. Labor hours MUST accept any positive number
  (`z.number().positive()`), matching `specs/006-resolution-mastra-primitives`'s
  own already-established labor-hours equivalent (`amount: z.number().positive()`,
  no rounding rule) — since no spec, clarification, or explicit user
  statement establishes quarter-hour billing as an actual product
  requirement.
- **FR-019**: The following numeric string-length bounds MUST each be
  re-justified or loosened to a minimal, defensible sanity bound (e.g.
  non-empty, no arbitrary upper ceiling) rather than the specific,
  untraceable numbers currently in place: `sourceQuote`'s `min(8)`/`max(500)`,
  `reason`'s `max(300)`, `source`'s `max(200)`/`max(120)`, and
  `unavailableReason`'s `max(280)`. None of these values trace to a spec
  clarification, an assumption explicitly recorded in a spec, or a
  direct user statement (finding #14).
- **FR-020**: `estimate/lib/format.ts`'s `formatTradeLabel()` MUST have
  its five dead legacy-taxonomy cases (`structural`, `appliance`,
  `exterior`, `interior`, `other`) removed, and its parameter type
  tightened from `string` to the real `Trade` union — every live caller
  now only ever passes a `Trade`, so the generic `default` fallback
  branch has no remaining reason to exist (finding #15).
- **FR-021**: `estimate/lib/format.ts`'s `formatUnit()` MUST have its
  dead `'sqft'` case removed, and its parameter type tightened from
  `string` to the real unit union (`ExtentUnit | 'hrs'`) — every live
  caller now only ever passes one of those, so the generic `default`
  fallback branch has no remaining reason to exist (finding #16).
- **FR-022**: `document/schema.ts`'s doc comment MUST be reworded to
  remove its literal `pageHint` mention, with no change to
  `documentPageSchema`/`parsedDocumentSchema`'s actual shape (finding
  #18).
- **FR-023**: `classification/finding-workflow.ts`'s replacement comment
  for `excerptNearPageHint()` (FR-002) MUST describe what it replaced
  without using the literal string `pageHint` (finding #19).
- **FR-024**: `classification/index.ts` MUST re-export `type ExtentUnit`
  alongside its existing `type Trade` export, so `format.ts`'s revised
  `formatUnit()` (FR-021) can import it (finding #20).
- **FR-025**: `eval/pipeline/run.ts` and
  `eval/pipeline/scorers/pricing-match.ts` MUST be updated to use
  `PricedLine` (not the deleted `PricedLineItem`) and the shared
  `priceAmount()` helper (not a locally re-derived `unitPrice !== null`
  check), matching FR-011/FR-017's restructure and User Story 2's
  one-definition principle (finding #21). The pre-existing `id`-suffix
  matching bug this surfaced in `pricing-match.ts` (documented in
  Assumptions) is explicitly NOT in scope for this fix.
- **FR-026**: `classification/agents.ts`'s `laborAgent` prompt MUST NOT
  instruct quarter-hour rounding — "hours in quarter-hour increments"
  MUST be replaced with unconstrained "a real positive number of hours"
  language, matching FR-018's schema-level removal of the same
  assumption (finding #22). No `.multipleOf` re-appears anywhere,
  neither in schema nor in prompt text.

### Key Entities

- **Extracted Finding** (`extraction/schema.ts`): a fact-only record of
  one billable thing an inspection report names. Loses `pageHint` (FR-001);
  everything else unchanged.
- **Classification Result** (`classification/schema.ts`): one finding's
  materials/labor/trade determinations. Restructured to derive from
  Extracted Finding via `.omit()`/`.extend()` (FR-008) instead of
  independent field retyping; its material/labor determination shapes
  gain a structural amountSource/hoursSource coupling (FR-004).
- **Billable Line** (`classification/schema.ts`): one flattened,
  priceable material or labor line. Its identity fields become a real,
  extendable base schema (FR-007); merges with its own price into one
  shape rather than staying a separate, correlated pair (FR-011).
- **Priced Line** (NEW, replaces `PricedLineItem`): `BillableLine` extended
  with a `price` field (FR-011) — a `determinedOr()` discriminated union
  (FR-017), not a flat `unitPrice`/`unavailableReason` pair.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (REVISED)**: Zero occurrences of `pageHint` anywhere in `src/`
  after implementation — no exception, since `legacyBillableItemSchema`
  (the one exception this originally carved out) is itself deleted.
- **SC-002**: Zero hand-retyped duplicates of any shared field group
  named in findings #3/#4/#7/#9/#10 — each such field group has exactly
  one schema declaration, referenced everywhere else via `.extend()`,
  `.omit()`, or spread of that one declaration.
- **SC-003**: `pricing/index.ts`'s public output type has one array of
  priced lines, not a `{ lines, prices }` pair; `items-section.tsx` has
  no `Map`-based price correlation.
- **SC-004**: `roundToQuarter` and `kiloGateway` no longer exist in the
  codebase.
- **SC-005**: A fresh `pnpm eval:pipeline` run against the existing
  fixture produces a real estimate with real document-grounded
  classification (proving FR-002's replacement context mechanism works),
  zero schema-validation failures caused by this change, and every line
  correctly priced under the merged shape.
- **SC-006 (REVISED)**: An estimate persisted under v1, v2, or the OLD
  (split `lines`/`prices`) v3 shape is NOT required to still parse —
  each surfaces via the existing `'unparseable'`/retry path, and a user
  can regenerate it by re-running the pipeline. Legacy (v1/v2)
  compatibility is explicitly out of scope entirely, per revised FR-003.
- **SC-007**: `.multipleOf(0.25)` no longer appears anywhere in
  `classification/schema.ts`; a labor determination of e.g. 1.3 hours is
  accepted, not rejected.
- **SC-008**: Every remaining numeric string-length bound in the
  pipeline's schemas is either a minimal sanity bound or is accompanied
  by a traceable justification (a cited spec clarification, or a comment
  recording the user's own stated reason) — not an unexplained specific
  number.
- **SC-009**: `formatTradeLabel()`/`formatUnit()` have zero dead
  legacy-taxonomy cases and accept the real `Trade`/unit union types, not
  bare `string`.
- **SC-010**: `tsc --noEmit` against the repository, with every diff in
  this plan applied, exits 0 — zero type errors anywhere, including
  `eval/` (outside `src/`, but a real consumer of the pipeline's public
  types). Diff-application checks (`git apply --check`) prove hunks are
  internally consistent; only an actual compile proves the resulting
  code is correct, and findings #20/#21 were invisible to every earlier
  check in this plan for exactly that reason.

## Assumptions

- `pageHint`'s replacement document-context mechanism (FR-002) sends each
  classification agent call the full parsed document (mirroring
  `buildExtractionPrompt`'s existing "[p. N]\ncontent" format), not a
  narrower windowing heuristic — chosen because it's the only mechanism
  already proven in this exact codebase (extraction already does this),
  rather than inventing a new, unverified windowing strategy.
- This feature is independent of `specs/006-resolution-mastra-primitives`
  (the in-progress resolution rebuild). Neither blocks the other. 006's
  own `data-model.md` currently references `finding.pageHint` in
  `combineResolvedValuesStep` and will need that line dropped once this
  feature's schema change lands, in whichever order the two features
  actually ship.
- No new runtime behavior is introduced — this is a schema/shape/dead-code
  cleanup. The pipeline's actual determinations (what materials, what
  hours, what trade, what price) are unaffected; only how the data is
  shaped, validated, and persisted changes.
- **Known, pre-existing, out-of-scope defect found during this feature's
  audit (FR-025):** `eval/pipeline/scorers/pricing-match.ts` matches
  priced lines back to their originating finding by checking whether the
  line's id starts with `` `${findingId}-` `` (a hyphen). The actual id
  format, from `classification/flatten.ts`'s `buildLineId()` (untouched
  by this feature), uses a colon: `` `${findingId}:material:${index}` ``/
  `` `${findingId}:labor` ``. This means the scorer's suffix match has
  likely never actually matched a multi-line finding, independent of
  anything this feature changes — FR-025 preserves this behavior
  byte-for-byte (only renaming the field it reads) rather than fixing
  it, since the fix is unrelated to schema cleanup and was never
  requested. Flagged here for the user's awareness, not silently left
  undocumented and not silently fixed as a drive-by.
