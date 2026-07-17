# Research: Pipeline Schema Cleanup

Every decision below was reached during spec.md's own drafting, via direct
source reads and installed-package verification — not invented at plan
time. This file consolidates that work into the standard research format.
No `[NEEDS CLARIFICATION]` markers remain in spec.md; there is nothing
left to resolve here except documenting *why* each design choice is what
it is.

## R1: Zod's `.extend()`/`.omit()` are the real mechanism for FR-007/FR-008

**Decision**: `itemIdentityFields` becomes a real `ZodObject`;
`materialLineSchema`/`laborLineSchema` compose it via `.extend()`;
`classificationResultSchema` derives from `extractedFindingSchema` via
`.omit({ id: true, statedQuantity: true, inspectorHours: true }).extend({ findingId: z.string(), materials: ..., labor: ..., trade: ... })`.

**Rationale**: Verified directly against the installed package —
`node_modules/zod/v4/classic/schemas.d.ts:444`:
`extend<U extends core.$ZodLooseShape>(shape: U): ZodObject<util.Extend<Shape, U>, Config>`
— overlapping keys in `U` override the base shape's type; non-overlapping
keys from both are kept. `.omit()`/`.pick()` (same file) exist alongside
it. This is Zod's own documented mechanism for "this schema is built from
that schema, plus/minus specific fields," not a hand-rolled substitute.

**Alternatives considered**: A bare object-literal `const` spread into
multiple schemas (what `itemIdentityFields` does today) — rejected
because it isn't independently referenceable as a schema (no
`.extend()`/`.omit()` available on a plain object), so every consumer
that wants to compose from it has to re-spread rather than build on it.
A fully nullable single schema spanning every pipeline stage — rejected
per spec.md's own reasoning (a `null` meaning "not computed yet" and a
`null` meaning "explicitly absent in the source" collapse into the same
representation; classification's own module boundary would be broken by
extraction having to declare fields it's forbidden from filling in).

## R2: `determinedOr()` reuse for pricing (FR-017) — corrects an in-session error

**Decision**: `pricing/schema.ts`'s price representation moves from two
nullable sibling fields (`unitPrice`/`unavailableReason`) plus a
hand-written `superRefine` (`xorUnavailable`) to
`determinedOr(z.object({ unitPrice, ...priceEvidenceFields }))` (material)
/ the `hourlyRate` equivalent (labor), reusing `classification/schema.ts`'s
existing `determinedOr()` builder with a minimal pricing-specific flag
branch (`{ status, reason }`, mirroring `agentUndeterminedSchema`).
`priceEvidenceFields` (`currency`/`confidence`/`source`) is spread once
into each determined branch, not retyped independently — the fix for
FR-009, which an initial draft of `data-model.md` failed to actually
apply (still hand-retyped the three fields inside `determinedOr()`'s
argument), caught during a later self-review pass.

**Rationale**: `determinedOr()` is a `z.discriminatedUnion('status', [...])`
— a literal-tag union, already used successfully in production by three
agents (materials, labor, trade). A discriminated union with an explicit
tag makes "priced XOR unavailable-with-reason" structurally impossible to
violate, eliminating `xorUnavailable`'s runtime check entirely (Governing
Rule in spec.md: a schema should make an invalid state unrepresentable,
not lean on surrounding code to police it).

**Alternatives considered / correction**: This session initially rejected
a discriminated-union fix on the grounds that "adding a new field to the
agent's own contract" was itself undesirable, conflating a **tagged**
`discriminatedUnion` (safe — the model always has an explicit key to key
off, already proven 3x in this codebase) with the **untagged**
`z.union([...])` that broke in `specs/005-classification-web-search-resolution`
(`STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`, no shared discriminant for
the model to disambiguate by). That conflation was wrong and is corrected
here: `determinedOr()`'s tagged form is the proven-safe pattern, not the
fragile one.

## R3: `excerptNearPageHint()` replacement (FR-002) — full-document context

**Decision**: Every one of `finding-workflow.ts`'s four call sites to
`excerptNearPageHint(parsedDocument, finding.pageHint)` is replaced with
a call that formats the FULL parsed document, mirroring
`extraction/steps.ts`'s existing `buildExtractionPrompt()`:
`parsedDocument.pages.map((page) => \`[p. ${page.pageNumber}]\n${page.content}\`).join('\n\n')`.

**Rationale**: This is the only document-context mechanism already
proven working in this exact codebase — extraction's own agent already
receives the full document this way, successfully, in production. No new
windowing heuristic is invented; the replacement reuses an existing,
working pattern rather than designing a new one specifically for this
removal.

**Alternatives considered**: Keep some form of windowing (e.g. by finding
index, or a fixed page range) — rejected: with `pageHint` gone, there is
no per-finding anchor left to window around, and inventing a new
heuristic (e.g. "always include the first N pages") would be exactly the
kind of unrequested assumption spec.md's Governing Rule 2 already
prohibits. Full-document context has a real, if modest, cost (more tokens
per classification agent call); this is accepted since it removes a
per-finding heuristic in favor of a codebase-proven pattern, and
classification's document excerpts were already bounded to ±1 page around
a hint that covered a small fraction of most reports in the first place.

## R4: Billable line + price merge (FR-011) — the pair already exists

**Decision**: `billableLineSchema` and the pricing output merge into one
`pricedLineSchema`, built by extending each of `billableLineSchema`'s two
branches individually (`materialLineSchema.extend({ price })`,
`laborLineSchema.extend({ price })`) and rebuilding the discriminated
union — NOT `billableLineSchema.extend({ price })` directly.
`billableLineSchema` is a `z.discriminatedUnion(...)` (a
`ZodDiscriminatedUnion`), which has no `.extend()` method — verified
against `node_modules/zod/v4/classic/schemas.d.ts`:
`ZodDiscriminatedUnion extends ZodUnion extends _ZodType`, none of which
declare `.extend()`; only `ZodObject` does (`schemas.d.ts:444`). This
correction was caught during plan review (re-checking data-model.md
against the same installed-package evidence R1 already established),
after an initial draft of this plan asserted the direct-extend form
without re-verifying it applied to a union type, not just an object type.
`pricing/index.ts`'s `priceLines()` returns one array of the rebuilt
union's shape.

**Rationale**: `pricing/price-line.ts`'s own step output is already
`{ line, price }` — a pair, per line, at the exact point of creation.
`priceLines()` currently unzips this pair into two parallel arrays for no
documented benefit; no code path re-prices a line independently of a full
pipeline re-run (`retryEstimateAction` re-runs `triggerSummarizeEstimate`
end-to-end — confirmed via reading `estimate/api/actions.ts`). Merging
removes the unzip (`pricing/index.ts`), the array split (`envelope.ts`),
and the re-join (`items-section.tsx`'s `priceByItemId` `Map`) — three
places compensating for one unforced decision.

**Alternatives considered**: Keep `lines`/`prices` separate but express
their relationship via a stronger type (e.g. a branded/paired index type)
— rejected: this still requires a join at render time, and no evidence
was found that the two ever need independent lifecycles.

## R5: Envelope versioning (FR-012) — modify v3 in place, no v4

**Decision**: `summaryEnvelopeV3Schema` is modified in place to the
merged one-`lines`-array shape. No `SUMMARY_ENVELOPE_VERSION_4` is
introduced. Estimates persisted under the prior (split `lines`/`prices`)
v3 shape fall through to `ParsedEnvelope`'s existing `'unparseable'`
variant.

**Rationale**: Explicit user direction — old estimates are recovered by
re-running the pipeline via the already-existing
`EstimateRetryButton`/`retryEstimateAction` flow, not by preserving
old-shape parsing. This is a deliberate, explicit reversal of the
v1→v2→v3 precedent (each of which DID introduce a new version literal
specifically to keep old rows parsing) — the difference here is an
explicit decision that regeneration is an acceptable, already-available
recovery path, not an oversight or a gap in this plan's own reasoning.

**Alternatives considered**: A new `SUMMARY_ENVELOPE_VERSION_4` alongside
an unmodified v3 (matching the v1→v2→v3 precedent exactly) — this was
the initial plan, reversed on explicit instruction: maintaining a
versioning cascade for data that will be regenerated anyway is exactly
the kind of unrequested complexity spec.md's Governing Rule 2 targets,
once regeneration was confirmed as an accepted outcome.

## R6: Quarter-hour and string-length bounds removal (FR-018/FR-019)

**Decision**: `.multipleOf(0.25)` is removed from
`laborDeterminationSchema.hours`/`laborLineSchema.quantity` (accept any
positive number). The five untraceable string-length bounds
(`sourceQuote` `min(8)`/`max(500)`, `reason` `max(300)`, `source`
`max(200)`/`max(120)`, `unavailableReason` `max(280)`) are each loosened
to a minimal sanity bound.

**Rationale**: Traced against every `specs/*/spec.md`'s Clarifications
and Assumptions sections (`grep` across the full `specs/` tree) — none of
these values are named in any clarification, assumption, or user
statement. Each first appears only in a whiteboard/data-model planning
artifact. Per spec.md's Governing Rule 2 ("every constraint traces to a
request, or it's slop"), an untraceable constraint is removed rather than
kept on the assumption it's probably fine. `specs/006-resolution-mastra-primitives`'s
own `resolvedValueSchema.amount: z.number().positive()` (no rounding
rule) independently corroborates that quarter-hour rounding was never a
cross-cutting product requirement.

**Alternatives considered**: Keep the bounds as "reasonable defensive
limits" — rejected per the Governing Rule; a defensive limit that was
never requested and is not load-bearing for any documented business rule
is exactly the assumption-instead-of-verification failure Constitution
Principle V exists to prevent, applied to constraint values rather than
SDK behavior claims.

## R7: Dead code removal (FR-014/FR-015)

**Decision**: `shared/quarter-hour.ts`'s `roundToQuarter()` and
`shared/gateway.ts`'s `kiloGateway` are deleted.

**Rationale**: Full-repo grep (`grep -rn "roundToQuarter" src/`) returns
zero call sites. `kiloGateway`'s own comment states it is "Currently
unused by any agent" — confirmed via reading every agent definition that
actually exists in `src/` (`extraction/agent.ts`,
`classification/agents.ts`, `pricing/agent.ts`) — all use
`pioneerGateway`. Correction made during this same review pass: an
earlier draft of this file also cited "`resolution/agent.ts` in the
in-progress 006 branch" as verified — false. Checked just now
(`find src/features/estimate-extraction-pipeline -type d -name resolution`):
no `resolution/` directory exists anywhere in `src/`. Feature 006 has only
ever been spec'd (`specs/006-resolution-mastra-primitives/`), never
implemented, so no such file was ever read. Removed the false claim.

## R8: Confirmed NOT in scope — verified, not assumed

**`pricing/price-line.ts`'s direct `agent.generate()` calls**: verified
against Mastra's own documented "per-call runtime control" exception —
this step must pick between `materialPriceResponseSchema`/
`laborPriceResponseSchema` at runtime by `costType` and inject a per-call
`RequestContext` (`estimateRequestId`, `itemId`), neither of which the
bare `createStep(agent, { structuredOutput })` form supports (a single,
statically-declared schema, no per-call context injection point).

**`findingClassificationStep`'s try/catch** (`finding-workflow.ts`):
verified against Mastra's own current docs
(`docs-workflows-error-handling.md`, "Conditional branching" section) —
catching inside a step's `execute()` and returning a typed result instead
of throwing is the documented idiom for letting a workflow continue past
one failure. This step degrades to the same honest
`flagged_for_web_search` shape a successful-but-uncertain agent run
already produces, not a fabricated value — a different defect class from
`specs/005`'s system-default fallback (which fabricated a plausible-looking
determined value on failure).

Neither is touched by this feature. Both are cited here so a future pass
doesn't re-litigate them without new evidence.
