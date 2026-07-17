# Whiteboard: Fix Classification Structured-Output Design

## Status

Prepared — awaiting explicit approval.

## Purpose / Big Picture

Feature 003's classification rebuild shipped with a structured-output
defect: `webSearchFlagSchema.searchContext` required the model itself to
reproduce, inside its own structured output, the entire originating
finding, the full document excerpt, and a `partialFindings` sub-object —
all data the calling code already possessed. A live eval run against the
real pipeline confirmed this broke every finding: 100% classification
failure, every error a `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`
inside the echoed data, never inside the model's own actual judgment.

What becomes observable after this fix: the same real pipeline run
produces real `BillableLine`s again, and flagged findings still carry
full context in the final output (assembled by code, never by the
model). Per-finding failure isolation (a genuine failure for one finding
can't take down a whole batch) continues to be provided by
`findingClassificationStep`'s existing try/catch wrapper — unchanged
from feature 003.

**Revised (this pass)**: the previous version of this plan also proposed
adopting Mastra's `structuredOutput.errorStrategy: 'fallback'` +
`fallbackValue` on each of the three agent steps, narrowing the existing
try/catch wrapper's scope. During implementation, `pnpm exec tsc --noEmit`
rejected this — `errorStrategy`/`fallbackValue` are not part of the
`structuredOutput` type this codebase's `createStep(agent, {...})`
composition form exposes. See Risks and Decisions and research.md R3
(revised) for the full evidence trail. This plan no longer adopts
`errorStrategy`; the existing wrapper is retained exactly as it already
was, unchanged.

## User Contract

Acceptance criteria (from `specs/004-fix-classification-output/spec.md`,
revised):

1. A finding whose materials/labor/trade the agents can confidently
   determine actually succeeds — no `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`
   for it (FR-001, User Story 1).
2. The three agents' own structured-output schemas never require
   reproducing the originating finding, the document excerpt, or a
   restatement of the same response's own already-determined values
   (FR-001, User Story 2).
3. The calling code (not the model) assembles the full `WebSearchFlag`
   context from `getInitData()`/`getStepResult()` (FR-002).
4. `structuredOutput.errorStrategy`/`fallbackValue` is verified NOT to be
   available on the bare `createStep(agent, {...})` composition form
   these three steps use; `findingClassificationStep`'s existing
   try/catch remains the resilience mechanism for a structured-output
   schema-validation failure — the same mechanism already proven correct
   in feature 003, not narrowed, not replaced (FR-003, revised).
5. This fix introduces no new resilience mechanism beyond the
   schema-shape correction (items 1-3) — confirmed, not assumed, that
   the existing wrapper already covers a schema-validation failure for
   each of the three agent steps (FR-004, revised, User Story 3).
6. Whether `z.discriminatedUnion('status', [...])` itself is reliable
   independent of the echo problem is settled by this fix's own
   Validation step (a real eval-harness re-run), not assumed either way
   (FR-005).
7. No verbose hand-authored "exact JSON shape" prompt examples are
   needed once the schema itself no longer requires an echo; if still
   needed after this fix, that is a new, separately justified finding
   (FR-006).
8. No change to `TRADE`, the per-finding step sequence, the fan-out
   architecture, pricing, or any file outside classification's own
   structured-output/resilience code (FR-007).
9. No finding is silently dropped as a side effect of this fix (FR-008).

Constraints / exclusions:

- Exactly three files change: `classification/schema.ts`,
  `classification/agents.ts`, `classification/finding-workflow.ts`. No
  file created, no file deleted.
- `classification/index.ts`'s public door contract is unchanged —
  `agentUndeterminedSchema` is never exported from the door.
- `webSearchFlagSchema`'s own definition (the FINAL, persisted shape) is
  unchanged; only who constructs a value of that shape changes.
- `findingClassificationStep`'s own CODE (try/catch, `log.warn(...)`,
  fallback construction, its own `execute()` body) does not change at
  all. Its doc comment DOES change — a stale reference to "a malformed
  structured-output response" as an example failure is removed, and a
  paragraph is added clarifying that `errorStrategy` was considered and
  not adopted, so this wrapper's job was never narrowed. This is a
  documentation-accuracy update, not a behavior change.

Invariants:

- `classificationResultSchema` (the output `flatten.ts` consumes) is
  byte-for-byte unchanged in shape — this fix only changes how its
  values get assembled inside `combineResultStep`, never its own type.
- `findingClassificationStep`'s manual catch-block fallback (already
  correct, never asked the model for anything) is unchanged.

Assumptions:

- Feature 003's architecture (per-finding nested workflow, `.foreach()`
  fan-out, the three-agent decoupled design, the sourced trade taxonomy)
  is correct and settled — this fix corrects a defect within that
  architecture, not the architecture itself.
- The live eval run's observed failures are the authoritative evidence
  for this fix's root-cause diagnosis (research.md R1); this fix's own
  Validation step re-runs the harness to confirm the defect is actually
  resolved, not merely theoretically addressed.

## Acceptance Coverage

| Criterion | Files | Plan Step | Validation |
|---|---|---|---|
| 1-2 (echo removed) | `schema.ts`, `finding-workflow.ts` | Milestone 1-2 | Concrete Steps step 6 (`pnpm eval:pipeline`) |
| 3 (code assembles context) | `finding-workflow.ts` (`combineResultStep`) | Milestone 2 | Quickstart Scenario 2 |
| 4-5 (errorStrategy not available; existing wrapper retained, unchanged) | `finding-workflow.ts` | Milestone 2 | research.md R3 (revised — compiled-source + type-declaration + doc verification) + Quickstart Scenario 3 |
| 6 (discriminated union reliability) | N/A — settled by re-running the real pipeline | Milestone 4 | Concrete Steps step 6 |
| 7 (no prompt band-aid) | `agents.ts` | Milestone 3 | Direct diff review — no "EXACT OUTPUT SHAPE" block remains |
| 8 (scope boundary) | N/A | — | Concrete Steps step 7 (`git diff --stat`) |
| 9 (no dropped finding) | `finding-workflow.ts` | Milestone 2 | Quickstart Scenario 3 |

## Context and Orientation

- **`src/features/estimate-extraction-pipeline/classification/schema.ts`**:
  owns `webSearchFlagSchema` (the full, persisted "couldn't determine"
  shape), `determinedOr()` (the discriminated-union builder every
  determinable field in this module uses), and the per-finding
  determination schemas (`materialDeterminationSchema`,
  `laborDeterminationSchema`, `classificationResultSchema`). This fix
  adds one new schema (`agentUndeterminedSchema`) and one new optional
  parameter to `determinedOr()`; every existing export keeps its exact
  current shape and default behavior. `determinedOr()`'s new parameter
  is typed `F extends z.core.$ZodTypeDiscriminable` (not the looser
  `z.ZodTypeAny` a first attempt used and `tsc` rejected — see Risks).
- **`src/features/estimate-extraction-pipeline/classification/agents.ts`**:
  the three per-finding agents' own prompt instructions
  (`materialsAgent`/`laborAgent`/`tradeAgent`). Currently contains a
  verbose "EXACT OUTPUT SHAPE" JSON-example block per agent, added
  earlier this session as a prompt-engineering attempt to fix the echo
  problem without actually removing the echo requirement — it did not
  work (a second live eval run still failed, on the echoed fields).
  This fix replaces those blocks with concise prose matching the new,
  smaller schema.
- **`src/features/estimate-extraction-pipeline/classification/finding-workflow.ts`**:
  the per-finding nested workflow and its `findingClassificationStep`
  wrapper. `materialsAgentStep`/`laborAgentStep`/`tradeAgentStep` are
  bare `createStep(agent, { structuredOutput })` compositions;
  `combineResultStep` assembles `classificationResultSchema` from the
  three agents' own results plus `getInitData()`. This fix changes each
  agent step's own `structuredOutput.schema` (to use the new minimal
  flag) only; `combineResultStep` gains the logic to upgrade a minimal
  flag into the full `WebSearchFlag` shape. `findingClassificationStep`
  itself is untouched.
- **`node_modules/@mastra/core/dist/workflows/workflow.d.ts`** (the
  installed package's own type declaration, read directly this pass):
  line 70's `createStep(agent, agentOptions)` overload for structured
  output types `agentOptions.structuredOutput` as exactly `{ schema:
  StandardSchemaWithJSON<TStepOutput> }` — no `errorStrategy`, no
  `fallbackValue`. This is the exact overload
  `materialsAgentStep`/`laborAgentStep`/`tradeAgentStep` resolve to.
- **Mastra's own documentation** (`reference-workflows-step.md`, "Agent
  step options"; `docs-agents-structured-output.md`, "Handle errors" —
  both fetched via the Mastra MCP this pass): the former states the
  entire documented option set for `createStep(agent, {...})`'s
  `structuredOutput` is `{ schema: StandardJSONSchemaV1 }`; the latter
  shows `errorStrategy`/`fallbackValue` exclusively on a direct
  `agent.generate()`/`.stream()` call. Neither page shows `errorStrategy`
  on the bare agent-composition form.
- **`node_modules/zod/v4/classic/schemas.d.ts:490`** and
  **`node_modules/zod/v4/core/api.d.ts:216`**: `z.discriminatedUnion()`
  requires every member of its array argument to satisfy
  `z.core.$ZodTypeDiscriminable` — a type carrying a statically computed
  literal discriminant. A generic type parameter constrained only by the
  looser `z.ZodTypeAny` does not structurally prove this, even when
  every concrete argument actually used (`webSearchFlagSchema`,
  `agentUndeterminedSchema`) does satisfy it individually.

Unfamiliar terms this plan introduces:

- **`agentUndeterminedSchema`**: the minimal `{ status, reason }` shape
  an agent's own structured output may produce for an undetermined
  value — no `searchContext`.

## Directory Map and Modification Table

```text
src/features/estimate-extraction-pipeline/classification/
├── schema.ts               [MODIFY] add agentUndeterminedSchema; determinedOr() gains
│                            an optional second `flagSchema` parameter (defaults to
│                            webSearchFlagSchema, unchanged for every existing call site),
│                            constrained to z.core.$ZodTypeDiscriminable
├── agents.ts                [MODIFY] remove the "EXACT OUTPUT SHAPE" JSON-example
│                            blocks; concise prose describing the minimal flagged shape
└── finding-workflow.ts      [MODIFY] the three per-finding agent step output schemas
                             use agentUndeterminedSchema via determinedOr()'s new
                             parameter (their structuredOutput.schema is the ONLY thing
                             that changes on those three steps — no errorStrategy/
                             fallbackValue, verified not available on this composition
                             form); combineResultStep gains logic to upgrade a minimal
                             flag into the full WebSearchFlag shape using
                             getInitData()/getStepResult() (already used in this file);
                             findingClassificationStep is completely unchanged
```

No file appears more than once above; the same three files are used
verbatim in "Plan of Work" and "Exact File Changes" below.

## Pattern Audit and Evidence Ledger

| Decision | Repository or explicit-user evidence | Constraint learned | Reuse or deviation |
|---|---|---|---|
| Remove `searchContext.finding`/`documentExcerpt`/`partialFindings` from what the agent must produce | Live eval-run log output (read directly this session): every `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED` error occurred inside these ECHOED fields (`materials.0.quantity.searchContext.finding.id: Invalid input`, `partialFindings.materials: Invalid input: expected array, received object`), never in the core `status`/`value`/`reason` fields | Asking a model to reproduce complex input data verbatim as its own output is the actual failure mode, not the discriminated union itself | New decision this fix — feature 003's own draft never had this design (see next row) |
| The removed context belongs in `combineResultStep`, assembled via `getInitData()`/`getStepResult()` | `reference/workflows/step` (fetched feature 003's own session, re-cited here): `execute.getInitData`/`execute.getStepResult`. `finding-workflow.ts`'s own `combineResultStep` (read directly) already calls `getInitData()` to read `finding.id`/`finding.action`/etc. one line above where the flag used to be produced by the model instead | The exact mechanism was already in use in this exact file for the same purpose on the INPUT side (prompt-building `.map()`s); this fix applies it symmetrically on the output side | Reuse of an already-established, already-correct pattern in this file — the original design (feature 003) failed to apply it symmetrically, a real gap now closed |
| `structuredOutput.errorStrategy`/`fallbackValue` is NOT adopted — REVISED from this plan's first version | First version's own evidence (compiled `chunk-PRT2AP4W.cjs`/`chunk-CJAAPSS7.cjs` reading) checked only runtime option-forwarding, never the actual exported TypeScript type. `pnpm exec tsc --noEmit` (Concrete Steps step 2, exactly the check this plan already had in place for a different suspected risk) rejected `errorStrategy`/`fallbackValue` on all three agent steps. Corrected verification: `workflow.d.ts:70`'s `createStep(agent,{...})` overload types `structuredOutput` as `{ schema }` only; Mastra's own `reference-workflows-step.md` documents the same restriction; `docs-agents-structured-output.md`'s "Handle errors" section shows `errorStrategy` only on direct `.generate()`/`.stream()` calls | The bare agent-composition form (`createStep(agent, {...})`) is deliberately narrower than the full `StructuredOutputOptions` type — verifying a feature exists on `StructuredOutputOptionsBase` is not the same as verifying it is reachable through every composition path that embeds it | REVISED — the first version's own verification was incomplete (runtime-only, not type-level); this pass corrects it against the actual contract |
| `findingClassificationStep`'s wrapper is completely unchanged | Since `errorStrategy` is not adopted, nothing about this wrapper's job, scope, or doc comment needs to change — it already catches a structured-output schema-validation failure the same way it catches any other per-finding failure, exactly as in feature 003 | No new resilience mechanism exists to narrow this wrapper's scope against | Reuse — zero changes to this step, code or comment |
| "EXACT OUTPUT SHAPE" prompt band-aid removed, not kept alongside the schema fix | Direct evidence: a second live eval run, with the band-aid ALREADY in place and the schema still requiring the echo, still failed with the same error class — the band-aid did not fix anything on its own. FR-006 requires treating any REMAINING need for such examples as a new, separately justified finding, not silently kept "just in case" | Prompt text cannot substitute for a correct schema design; keeping the band-aid after fixing the schema would be carrying forward evidence of the wrong diagnosis | Removed — replaced with concise prose sized to the schema's own new, smaller surface |
| `determinedOr()`'s new `flagSchema` parameter constrained to `z.core.$ZodTypeDiscriminable`, not `z.ZodTypeAny` | `pnpm exec tsc --noEmit` rejected a first attempt using `F extends z.ZodTypeAny`: `Type 'F' is not assignable to type '$ZodTypeDiscriminable'`. Verified via `node_modules/zod/v4/classic/schemas.d.ts:490` (`discriminatedUnion<Types extends readonly [core.$ZodTypeDiscriminable, ...], ...>`) that this is `z.discriminatedUnion()`'s own actual requirement | A generic type parameter needs a constraint that matches what the function it's passed into actually requires — a broader, more "obviously safe"-looking constraint (`z.ZodTypeAny`) can still be too weak if the consuming function's own type signature is narrower | REVISED — corrects a real generic-signature defect in this plan's first version, caught by `tsc`, not assumed fixed |

## Interfaces and Dependencies

- **`schema.ts`'s new export**: `agentUndeterminedSchema`/`AgentUndetermined` — NOT re-exported from `classification/index.ts` (internal to the folder, used only by `finding-workflow.ts`).
- **`determinedOr()`'s new signature**: `determinedOr<T extends z.ZodTypeAny, F extends z.core.$ZodTypeDiscriminable = typeof webSearchFlagSchema>(valueSchema: T, flagSchema?: F)`. Every existing call site (`materialDeterminationSchema.quantity`, `laborDeterminationSchema.hours`, `classificationResultSchema.trade`) calls it with ONE argument, so the default `flagSchema = webSearchFlagSchema` applies — their own produced types are byte-for-byte unchanged.
- **`finding-workflow.ts`'s three per-finding agent step output schemas**: `materialsStepOutputSchema`/`laborStepOutputSchema`/`tradeStepOutputSchema` change shape (their flag branch is now `agentUndeterminedSchema`, not `webSearchFlagSchema`) — this is an internal detail of the nested workflow never exposed outside this file; `perFindingClassificationWorkflow`'s own `outputSchema` (`classificationResultSchema`, unchanged) and `findingClassificationStep`'s own `outputSchema` (same) are unaffected.
- **No change to** `classification/index.ts`, `classification/workflow.ts`, `classification/flatten.ts`, `pipeline.ts`, `envelope.ts`, or any file outside the three listed.
- **`@mastra/core` `^1.50.1`**: no version change. `structuredOutput.errorStrategy`/`fallbackValue` exist in the installed version (on `StructuredOutputOptionsBase`, consumed by `agent.generate()`/`.stream()`) but are confirmed NOT reachable through the `createStep(agent, {...})` composition form these three steps use — not adopted by this fix.
- **`zod` `^4.x`**: `z.discriminatedUnion()`'s own type signature requires `z.core.$ZodTypeDiscriminable` members — `determinedOr()`'s new generic parameter is constrained accordingly.

## Plan of Work

1. **Schema foundation** — `classification/schema.ts` (modify). Outcome:
   `agentUndeterminedSchema` exists; `determinedOr()`'s new optional
   parameter (constrained to `z.core.$ZodTypeDiscriminable`) is
   backward-compatible with every existing call site.
2. **Composition** — `classification/finding-workflow.ts` (modify).
   Outcome: the three per-finding agent step schemas use the minimal
   flag (their `structuredOutput.schema` is the only thing that
   changes); `combineResultStep` assembles the full `WebSearchFlag`
   itself; `findingClassificationStep` is untouched.
3. **Prompts** — `classification/agents.ts` (modify). Outcome: no
   verbose JSON-example blocks remain; instructions match the schema's
   new, smaller surface.
4. **Validation** — re-run `pnpm eval:pipeline` against the real
   fixture; confirm the primary defect (100% classification failure) no
   longer reproduces, and record whatever remains (if anything) as a
   specific, understood finding, not silently tolerated.

Each milestone is safely ordered: milestone 2 depends on milestone 1's
new export existing; milestone 3 depends on milestone 2's schema change
being the thing its prose now describes; milestone 4 depends on all
three files being in their final state.

## Exact File Changes

### `src/features/estimate-extraction-pipeline/classification/schema.ts`
**Action:** Modify
**Why:** Add the minimal `agentUndeterminedSchema` and let `determinedOr()` accept it as an alternate flag branch, without changing any existing call site's own produced type
**Impact:** `materialDeterminationSchema`, `laborDeterminationSchema`, `classificationResultSchema` — every existing consumer of `determinedOr()` — keep the exact same shape (single-argument calls use the new parameter's default)

```diff
--- a/src/features/estimate-extraction-pipeline/classification/schema.ts
+++ b/src/features/estimate-extraction-pipeline/classification/schema.ts
@@ -48,15 +48,25 @@
 export type ExtentUnit = (typeof EXTENT_UNIT)[number];
 
 /**
- * The shared "couldn't determine" representation, reused identically
- * for material quantity, labor hours, and trade (spec.md Clarifications
- * Q2/Q3). Never a bare null, never a fabricated plausible-sounding
- * value. Carries everything a future (out-of-scope-for-this-pass)
- * web-search resolution step would need without re-deriving anything:
- * the full originating finding, the surrounding parsed-document excerpt
- * near its `pageHint` (captured once via `getInitData()`, not re-fetched
- * later — see finding-workflow.ts), a short machine-readable reason, and
- * whatever else this pass DID determine for the same finding.
+ * The shared "couldn't determine" representation used in the FINAL,
+ * assembled per-finding result (`classificationResultSchema`, and the
+ * `flaggedForWebSearch` array `pricing`/`envelope.ts` consume). Never a
+ * bare null, never a fabricated plausible-sounding value. Carries
+ * everything a future (out-of-scope-for-this-pass) web-search
+ * resolution step would need without re-deriving anything: the full
+ * originating finding, the surrounding parsed-document excerpt near its
+ * `pageHint`, a short machine-readable reason, and whatever else this
+ * pass DID determine for the same finding.
+ *
+ * This full shape is assembled by `finding-workflow.ts`'s own
+ * `combineResultStep` (via `getInitData()`/`getStepResult()`,
+ * mechanisms already used in that same file) — never produced by the
+ * model itself. The agent-facing analog is `agentUndeterminedSchema`
+ * below, which is all an agent's own structured output is ever required
+ * to produce: a live eval run confirmed every agent asked to reproduce
+ * this full shape verbatim failed schema validation on the ECHOED
+ * fields (`searchContext`), never on its own actual judgment
+ * (specs/004-fix-classification-output).
  */
 export const webSearchFlagSchema = z.object({
   status: z.literal('flagged_for_web_search'),
@@ -86,16 +96,46 @@
 export type WebSearchFlag = z.infer<typeof webSearchFlagSchema>;
 
 /**
+ * The MINIMAL "couldn't determine" shape an agent's own structured
+ * output is ever required to produce — its own judgment only, nothing
+ * echoed back. `finding-workflow.ts`'s `combineResultStep` upgrades a
+ * value of this shape into a full `WebSearchFlag` (above) by attaching
+ * context it already possesses via `getInitData()`/`getStepResult()` —
+ * the same mechanism this codebase already uses to build each agent's
+ * own PROMPT, applied symmetrically on the output side
+ * (specs/004-fix-classification-output).
+ */
+export const agentUndeterminedSchema = z.object({
+  status: z.literal('flagged_for_web_search'),
+  reason: z.string().min(1).max(300),
+});
+export type AgentUndetermined = z.infer<typeof agentUndeterminedSchema>;
+
+/**
  * Builds the discriminated "determined OR flagged" union used for every
  * value in this module that can either be resolved or handed off
  * unresolved. One reusable shape — not three separate ad hoc
- * undetermined-handling schemes. Exported (not folder-private) so
- * `finding-workflow.ts` can build each per-step output schema with it.
+ * undetermined-handling schemes. `flagSchema` defaults to the full
+ * `webSearchFlagSchema`, used by `classificationResultSchema`'s own
+ * fields (the FINAL assembled shape). `finding-workflow.ts`'s three
+ * per-finding agent step output schemas pass `agentUndeterminedSchema`
+ * explicitly instead — an agent's own output must never be asked to
+ * reproduce the full shape (specs/004-fix-classification-output).
+ *
+ * `F`'s constraint is `z.core.$ZodTypeDiscriminable` — the exact type
+ * `z.discriminatedUnion()` itself requires each member to satisfy — not
+ * the looser `z.ZodTypeAny`, which does not statically carry the
+ * "has a computed literal discriminant" guarantee a generic parameter
+ * needs here (confirmed via `tsc`: a first attempt using `z.ZodTypeAny`
+ * failed to compile).
  */
-export function determinedOr<T extends z.ZodTypeAny>(valueSchema: T) {
+export function determinedOr<T extends z.ZodTypeAny, F extends z.core.$ZodTypeDiscriminable = typeof webSearchFlagSchema>(
+  valueSchema: T,
+  flagSchema: F = webSearchFlagSchema as unknown as F,
+) {
   return z.discriminatedUnion('status', [
     z.object({ status: z.literal('determined'), value: valueSchema }),
-    webSearchFlagSchema,
+    flagSchema,
   ]);
 }
 
```

#### Reasoning
- `agentUndeterminedSchema` has no `searchContext` — the direct fix for research.md R1's root cause.
- `determinedOr()`'s new parameter defaults to `webSearchFlagSchema`, so every pre-existing single-argument call (`materialDeterminationSchema.quantity`, `laborDeterminationSchema.hours`, `classificationResultSchema.trade`) is byte-for-byte unchanged — only `finding-workflow.ts`'s three NEW two-argument calls use the minimal flag.
- `F`'s constraint is `z.core.$ZodTypeDiscriminable`, not `z.ZodTypeAny` — REVISED from this plan's first version, which `tsc` rejected (`Type 'F' is not assignable to type '$ZodTypeDiscriminable'`). `z.discriminatedUnion()`'s own type signature (`node_modules/zod/v4/classic/schemas.d.ts:490`) requires exactly this constraint.

### `src/features/estimate-extraction-pipeline/classification/agents.ts`
**Action:** Modify
**Why:** Remove the "EXACT OUTPUT SHAPE" verbose JSON-example blocks (a prompt-engineering band-aid that a second live eval run confirmed did NOT fix the actual defect); replace with concise prose matching the schema's new, smaller surface
**Impact:** No behavioral change to what the agents are asked to determine (materials/labor/trade semantics, HARD RULES, grounding requirements are all unchanged) — only the shape guidance shrinks to match `agentUndeterminedSchema`

```diff
--- a/src/features/estimate-extraction-pipeline/classification/agents.ts
+++ b/src/features/estimate-extraction-pipeline/classification/agents.ts
@@ -42,55 +42,15 @@
 - quantity: a real amount + a real unit (ea, lf, sf, or cy), grounded
   either in the finding's own statedQuantity/sourceQuote or in a nearby
   stated measurement in the document excerpt. If the finding or excerpt
-  genuinely gives no real basis for a quantity, flag that material's
-  quantity instead of guessing (see EXACT OUTPUT SHAPE below) — with a
-  specific "reason" (e.g. "no measurement or count stated near this
-  finding") and the full searchContext (finding, documentExcerpt, and
-  whatever this material's name and any partial quantity information
-  you did determine).
+  genuinely gives no real basis for a quantity, return a flagged
+  quantity instead of guessing: { "status": "flagged_for_web_search",
+  "reason": "<specific reason>" } — a short, specific reason, nothing
+  else on that object.
 - amountSource: when quantity is determined, name exactly where the
   number came from (e.g. "sourceQuote states '20 shingles'", "p. 14
   states siding section is 12 linear feet") — never a vague label like
-  "estimated". OMIT this field entirely when quantity is flagged.
+  "estimated". Omit this field entirely when quantity is flagged.
 
-EXACT OUTPUT SHAPE — copy this structure precisely, field names and
-literal string values exactly as shown (case-sensitive):
-
-Determined quantity:
-{
-  "materials": [
-    {
-      "material": "wood siding board",
-      "quantity": { "status": "determined", "value": { "amount": 12, "unit": "sf" } },
-      "amountSource": "p. 14 states the siding section is 12 square feet"
-    }
-  ]
-}
-
-Flagged quantity (no real basis found) — "status" is EXACTLY the string
-"flagged_for_web_search", never "FLAGGED" or any other variant, and the
-"value" wrapper is replaced by "reason"/"searchContext", not combined
-with it:
-{
-  "materials": [
-    {
-      "material": "sliding glass door roller/wheel assembly",
-      "quantity": {
-        "status": "flagged_for_web_search",
-        "reason": "no count of wheels/rollers stated near this finding",
-        "searchContext": {
-          "finding": { "action": "replace", "scope": "fouled sliding glass door wheels", "location": "REAR BASEMENT", "statedQuantity": null, "inspectorHours": null, "sourceQuote": "...", "pageHint": "p. 37" },
-          "documentExcerpt": "...",
-          "partialFindings": {}
-        }
-      }
-    }
-  ]
-}
-
-No materials at all (labor-only finding):
-{ "materials": [] }
-
 HARD RULES
 1. NEVER invent a quantity or unit with no real grounding. Flag instead.
 2. NEVER invent a material that the finding's action/scope doesn't
@@ -98,12 +58,15 @@
 3. An empty materials array is a valid, complete, honest answer — not a
    failure, not something to avoid.
 4. Do not determine labor, hours, or trade — those are separate steps.
-5. NEVER omit the "status" field, and NEVER change its literal value —
-   it must be exactly "determined" or exactly "flagged_for_web_search",
-   nothing else, on every single quantity you emit.
+5. A determined quantity is exactly
+   { "status": "determined", "value": { "amount": <number>, "unit": "<ea|lf|sf|cy>" } };
+   a flagged quantity is exactly
+   { "status": "flagged_for_web_search", "reason": "<reason>" }.
+   Never mix the two shapes, never add other fields, never change the
+   literal "status" value.
 
 OUTPUT FORMAT
-Return JSON matching the EXACT OUTPUT SHAPE above precisely. No
+Return JSON matching the provided structured-output schema exactly. No
 commentary, no preamble, no text outside the JSON.
 `,
   model: pioneerGateway.chat('claude-fable-5'),
@@ -149,60 +112,30 @@
   ...), grounded either in the finding's own inspectorHours (if the
   inspector explicitly stated one) or a reasonable, explicitly-cited
   basis from the document excerpt. If neither the finding nor the
-  excerpt gives a real basis for an hour count, flag hours instead of
-  guessing (see EXACT OUTPUT SHAPE below) — with a specific "reason" and
-  the full searchContext (finding, documentExcerpt, and the laborType
-  you did determine, plus any materials context you were given).
+  excerpt gives a real basis for an hour count, return a flagged hours
+  value instead of guessing: { "status": "flagged_for_web_search",
+  "reason": "<specific reason>" } — a short, specific reason, nothing
+  else on that object.
 - hoursSource: when hours is determined, name exactly where the number
   came from (e.g. "inspectorHours states 1.5", "p. 9 estimates a
   half-day for this scope") — never a vague label like "estimated".
-  OMIT this field entirely when hours is flagged.
+  Omit this field entirely when hours is flagged.
 
-EXACT OUTPUT SHAPE — copy this structure precisely, field names and
-literal string values exactly as shown (case-sensitive). The top-level
-object is always a "labor" key wrapping the details — never a bare
-object without the "labor" wrapper, even when hours is flagged:
-
-Determined hours:
-{
-  "labor": {
-    "laborType": "GFCI receptacle replacement labor",
-    "hours": { "status": "determined", "value": 1.5 },
-    "hoursSource": "inspectorHours states 1.5"
-  }
-}
-
-Flagged hours (no real basis found) — "status" is EXACTLY the string
-"flagged_for_web_search", never "FLAGGED" or any other variant. laborType
-is STILL present and real — it is never dropped just because hours
-couldn't be determined:
-{
-  "labor": {
-    "laborType": "interior door planing/adjustment repair labor",
-    "hours": {
-      "status": "flagged_for_web_search",
-      "reason": "no time estimate, duration, or quantified scope stated near this finding",
-      "searchContext": {
-        "finding": { "action": "repair", "scope": "interior door rubbing floor", "location": "2ND FLOOR FRONT RIGHT BEDROOM", "statedQuantity": null, "inspectorHours": null, "sourceQuote": "...", "pageHint": "p. 37" },
-        "documentExcerpt": "...",
-        "partialFindings": {}
-      }
-    }
-  }
-}
-
 HARD RULES
 1. NEVER invent an hour count with no real grounding. Flag instead.
 2. NEVER let an absent/empty materials context degrade or block your own
    determination — labor-only findings are common and must classify
    exactly as completely as material-and-labor findings.
 3. Do not determine materials or trade — those are separate steps.
-4. NEVER omit the top-level "labor" wrapper or the "status" field inside
-   "hours" — "status" must be exactly "determined" or exactly
-   "flagged_for_web_search", nothing else, every time.
+4. A determined hours value is exactly
+   { "status": "determined", "value": <number> }; a flagged hours value
+   is exactly { "status": "flagged_for_web_search", "reason": "<reason>" }.
+   The top-level response is always a "labor" object wrapping
+   laborType/hours/hoursSource — never a bare object without that
+   wrapper, even when hours is flagged.
 
 OUTPUT FORMAT
-Return JSON matching the EXACT OUTPUT SHAPE above precisely. No
+Return JSON matching the provided structured-output schema exactly. No
 commentary, no preamble, no text outside the JSON.
 `,
   model: pioneerGateway.chat('claude-fable-5'),
@@ -252,42 +185,25 @@
 
 IF NO TRADE FITS
 If, even with full finding + document context, no trade in the list
-above is a real, defensible fit, flag it instead of forcing the
-closest-sounding value (see EXACT OUTPUT SHAPE below) — with a specific
-"reason" and the full searchContext (finding, documentExcerpt, and the
-materials/labor you were given).
+above is a real, defensible fit, return a flagged trade instead of
+forcing the closest-sounding value: { "status": "flagged_for_web_search",
+"reason": "<specific reason>" } — a short, specific reason, nothing else
+on that object.
 
-EXACT OUTPUT SHAPE — copy this structure precisely, field names and
-literal string values exactly as shown (case-sensitive):
-
-Determined trade:
-{ "trade": { "status": "determined", "value": "electrical" } }
-
-Flagged (no trade fits) — "status" is EXACTLY the string
-"flagged_for_web_search", never "FLAGGED" or any other variant:
-{
-  "trade": {
-    "status": "flagged_for_web_search",
-    "reason": "no trade in the taxonomy is a defensible fit for this scope",
-    "searchContext": {
-      "finding": { "action": "evaluate", "scope": "...", "location": "...", "statedQuantity": null, "inspectorHours": null, "sourceQuote": "...", "pageHint": "p. 12" },
-      "documentExcerpt": "...",
-      "partialFindings": {}
-    }
-  }
-}
-
 HARD RULES
 1. NEVER pick a trade independently of the materials/labor you were
    given — the trade must be CONSISTENT with them.
 2. NEVER invent a 24th trade value or force a poor fit. Flag instead.
 3. Do not determine materials, quantities, labor type, or hours — those
    were already determined in earlier steps.
-4. NEVER omit the "status" field, and NEVER change its literal value —
-   it must be exactly "determined" or exactly "flagged_for_web_search".
+4. A determined trade is exactly
+   { "status": "determined", "value": "<one of the trades above>" }; a
+   flagged trade is exactly
+   { "status": "flagged_for_web_search", "reason": "<reason>" }. Never
+   mix the two shapes, never add other fields.
 
 OUTPUT FORMAT
-Return JSON matching the EXACT OUTPUT SHAPE above precisely. No
+Return JSON matching the provided structured-output schema exactly. No
 commentary, no preamble, no text outside the JSON.
 `,
   model: pioneerGateway.chat('claude-fable-5'),
```

#### Reasoning
- FR-006 requires NOT re-adding verbose hand-authored shape examples once the schema itself no longer requires an echo — each agent keeps ONE concise inline example of the two possible literal shapes (determined/flagged), not a full worked example with fabricated finding data, which is normal prompt-writing (describing the schema's own semantics), not the anti-pattern this fix removes.
- The prior band-aid was proven insufficient on its own: a second live eval run, WITH these exact examples already in place and the schema still requiring the echo, still failed with the identical error class — direct evidence the schema (not the prompt) was the defect.

### `src/features/estimate-extraction-pipeline/classification/finding-workflow.ts`
**Action:** Modify
**Why:** The three per-finding agent step schemas swap to the minimal flag; `combineResultStep` assembles the full `WebSearchFlag` itself from data it already has. `errorStrategy`/`fallbackValue` are NOT added — verified not available on this composition form
**Impact:** `perFindingClassificationWorkflow`'s and `findingClassificationStep`'s own `outputSchema` (`classificationResultSchema`) is unchanged; `findingClassificationStep` itself is completely untouched

```diff
--- a/src/features/estimate-extraction-pipeline/classification/finding-workflow.ts
+++ b/src/features/estimate-extraction-pipeline/classification/finding-workflow.ts
@@ -5,9 +5,9 @@
 import { materialsAgent, laborAgent, tradeAgent } from './agents';
 import {
   TRADE,
+  EXTENT_UNIT,
   determinedOr,
-  materialDeterminationSchema,
-  laborDeterminationSchema,
+  agentUndeterminedSchema,
   classificationResultSchema,
 } from './schema';
 import { createModuleLogger } from '../shared/logger';
@@ -50,16 +50,38 @@
   );
 }
 
+/**
+ * These three step output schemas use `agentUndeterminedSchema` (the
+ * MINIMAL flag shape — status + reason, nothing echoed) as
+ * `determinedOr()`'s flag branch, NOT the default full
+ * `webSearchFlagSchema` — an agent's own structured output must never be
+ * asked to reproduce the finding, document excerpt, or partial findings
+ * it was given (specs/004-fix-classification-output). `combineResultStep`
+ * below upgrades a flagged value into the full shape after the fact.
+ */
 const materialsStepOutputSchema = z.object({
-  materials: z.array(materialDeterminationSchema),
+  materials: z.array(
+    z.object({
+      material: z.string().min(1),
+      quantity: determinedOr(
+        z.object({ amount: z.number().positive(), unit: z.enum(EXTENT_UNIT) }),
+        agentUndeterminedSchema,
+      ),
+      amountSource: z.string().min(1).optional(),
+    }),
+  ),
 });
 
 const laborStepOutputSchema = z.object({
-  labor: laborDeterminationSchema,
+  labor: z.object({
+    laborType: z.string().min(1),
+    hours: determinedOr(z.number().multipleOf(0.25).min(0.25), agentUndeterminedSchema),
+    hoursSource: z.string().min(1).optional(),
+  }),
 });
 
 const tradeStepOutputSchema = z.object({
-  trade: determinedOr(z.enum(TRADE)),
+  trade: determinedOr(z.enum(TRADE), agentUndeterminedSchema),
 });
 
 /**
@@ -68,6 +90,14 @@
  * Mastra owns the transport entirely; no hand-rolled
  * `.generate()`/`.stream()` call anywhere in this file
  * (MASTRA-AGENT-WORKFLOW-STANDARD.md Rule 1).
+ *
+ * `structuredOutput.errorStrategy`/`fallbackValue` are deliberately NOT
+ * used here — verified (`node_modules/@mastra/core/dist/workflows/workflow.d.ts:70`,
+ * Mastra's own `reference-workflows-step.md`) not to be exposed on this
+ * exact composition form; only `{ schema }` is. A structured-output
+ * schema-validation failure for any of these three steps is caught by
+ * `findingClassificationStep`'s existing try/catch below, unchanged
+ * (specs/004-fix-classification-output research.md R3).
  */
 const materialsAgentStep = createStep(materialsAgent, {
   structuredOutput: { schema: materialsStepOutputSchema },
@@ -89,9 +119,52 @@
   inputSchema: tradeStepOutputSchema,
   outputSchema: classificationResultSchema,
   execute: async ({ inputData, getInitData, getStepResult }) => {
-    const { finding } = getInitData<z.infer<typeof findingWithDocumentSchema>>();
-    const { materials } = getStepResult(materialsAgentStep);
-    const { labor } = getStepResult(laborAgentStep);
+    const { finding, parsedDocument } = getInitData<z.infer<typeof findingWithDocumentSchema>>();
+    const documentExcerpt = excerptNearPageHint(parsedDocument, finding.pageHint);
+    const { materials: rawMaterials } = getStepResult(materialsAgentStep);
+    const { labor: rawLabor } = getStepResult(laborAgentStep);
+
+    // Whatever THIS pass DID determine, for a future web-search step's
+    // benefit — built here from data already in scope, never asked of
+    // the model itself (specs/004-fix-classification-output).
+    const determinedMaterials: { material: string; quantity: number; unit: (typeof EXTENT_UNIT)[number] }[] = [];
+    for (const m of rawMaterials) {
+      if (m.quantity.status === 'determined') {
+        determinedMaterials.push({
+          material: m.material,
+          quantity: m.quantity.value.amount,
+          unit: m.quantity.value.unit,
+        });
+      }
+    }
+    const partialFindingsValue: {
+      materials?: { material: string; quantity: number; unit: (typeof EXTENT_UNIT)[number] }[];
+      labor?: { laborType: string; hours: number };
+    } = {};
+    if (determinedMaterials.length > 0) partialFindingsValue.materials = determinedMaterials;
+    if (rawLabor.hours.status === 'determined') {
+      partialFindingsValue.labor = { laborType: rawLabor.laborType, hours: rawLabor.hours.value };
+    }
+
+    const toFullFlag = (agentFlag: { status: 'flagged_for_web_search'; reason: string }) => ({
+      status: 'flagged_for_web_search' as const,
+      reason: agentFlag.reason,
+      searchContext: { finding, documentExcerpt, partialFindings: partialFindingsValue },
+    });
+
+    const materials = rawMaterials.map((m) =>
+      m.quantity.status === 'determined'
+        ? { material: m.material, quantity: m.quantity, amountSource: m.amountSource }
+        : { material: m.material, quantity: toFullFlag(m.quantity) },
+    );
+
+    const labor =
+      rawLabor.hours.status === 'determined'
+        ? { laborType: rawLabor.laborType, hours: rawLabor.hours, hoursSource: rawLabor.hoursSource }
+        : { laborType: rawLabor.laborType, hours: toFullFlag(rawLabor.hours) };
+
+    const trade = inputData.trade.status === 'determined' ? inputData.trade : toFullFlag(inputData.trade);
+
     return {
       findingId: finding.id,
       action: finding.action,
@@ -101,7 +174,7 @@
       pageHint: finding.pageHint,
       materials,
       labor,
-      trade: inputData.trade,
+      trade,
     };
   },
 });
@@ -191,18 +264,23 @@
 /**
  * One failure-isolated unit of work per finding — wraps
  * `perFindingClassificationWorkflow` in its own try/catch so a genuine
- * failure (a malformed structured-output response, a transient error
- * surviving all `retries`) for ONE finding never fails the whole
- * `.foreach()` batch in `workflow.ts`. Mirrors
- * `pricing/price-line.ts`'s own already-accepted per-item resilience
- * pattern — a per-item failure degrades to a typed, honest result
- * instead of throwing, AND is logged (matching `price-line.ts`'s own
- * `log.warn(...)` — a per-item failure being silent was a real gap in
- * an earlier draft, not something to leave unfixed just because the
- * caught error is being handled rather than thrown). A caught failure
- * downgrades to the SAME `flagged_for_web_search` shape FR-010 already
- * defines for an honest "couldn't determine" — not a second, competing
- * error path.
+ * failure for ONE finding never fails the whole `.foreach()` batch in
+ * `workflow.ts`. Mirrors `pricing/price-line.ts`'s own already-accepted
+ * per-item resilience pattern — a per-item failure degrades to a typed,
+ * honest result instead of throwing, AND is logged (matching
+ * `price-line.ts`'s own `log.warn(...)`). A caught failure downgrades to
+ * the SAME `flagged_for_web_search` shape FR-010 already defines for an
+ * honest "couldn't determine" — not a second, competing error path.
+ *
+ * This wrapper is UNCHANGED by specs/004-fix-classification-output. It
+ * already catches a structured-output schema-validation failure in any
+ * of the three agent steps above (`perFindingClassificationWorkflow.createRun()/.start()`
+ * surfaces such a failure as a thrown error, same as any other
+ * per-finding failure) — `structuredOutput.errorStrategy`/`fallbackValue`
+ * was considered as an alternative, narrower-scoped mechanism but is not
+ * available on the bare `createStep(agent, {...})` composition form
+ * these three steps use (research.md R3), so this wrapper's job and
+ * scope are exactly what they already were in feature 003.
  */
 export const findingClassificationStep = createStep({
   id: 'classify-finding',
```

#### Reasoning
- `materialsStepOutputSchema`/`laborStepOutputSchema`/`tradeStepOutputSchema` now pass `agentUndeterminedSchema` as `determinedOr()`'s second argument — the direct fix.
- `errorStrategy`/`fallbackValue` are NOT added to any of the three agent steps — REVISED from this plan's first version. Verified via `workflow.d.ts:70` and Mastra's own `reference-workflows-step.md` that this option is not part of the `structuredOutput` type this composition form exposes; only `{ schema }` is. `findingClassificationStep`'s existing try/catch (unchanged, see below) remains the sole resilience mechanism for a structured-output schema-validation failure, exactly as it already was in feature 003.
- `combineResultStep`'s new logic: builds `partialFindingsValue` from whichever of `rawMaterials`/`rawLabor` DID resolve to `'determined'` (computed here, in code, from data already fetched via `getStepResult()` — never asked of the model); `toFullFlag()` is a local closure (not a top-level 4-parameter helper) capturing `finding`/`documentExcerpt`/`partialFindingsValue` from the enclosing scope, upgrading a minimal agent flag into the full `WebSearchFlag` shape `classificationResultSchema` expects.
- `findingClassificationStep`'s own try/catch, `log.warn(...)` call, manual fallback-construction logic, AND its doc comment are all UNCHANGED code — its doc comment is updated only to state plainly that `errorStrategy` was considered and not adopted, so this wrapper's job was never narrowed (a correction from this plan's first version, which had claimed a narrowing that never actually happens now).

## Concrete Steps

All commands run from the repository root
(`/Users/dev/.warp/worktrees/fixpro-app-dashboard/falcon-bighorn`), on
branch `refactor/classification-rebuild`.

1. Apply all three diffs in "Exact File Changes" above (order doesn't
   matter — no two touch the same file, but `schema.ts` should logically
   land first since the other two reference its new export).
2. `pnpm exec tsc --noEmit`
   **Expected**: no errors. This plan's first version reached this exact
   step and surfaced two real defects (`errorStrategy`/`fallbackValue`
   not available on this composition form; `determinedOr()`'s generic
   constraint too loose for `z.discriminatedUnion()`) — both are
   corrected in this revision, verified against the installed package's
   own type declarations and Mastra's own documentation, not merely
   reasoned through again. If this step still surfaces a type error, fix
   it directly in the three listed files — no file outside this plan's
   own list should need touching to resolve it.
3. `pnpm exec eslint src/features/estimate-extraction-pipeline/classification/schema.ts src/features/estimate-extraction-pipeline/classification/agents.ts src/features/estimate-extraction-pipeline/classification/finding-workflow.ts`
   **Expected**: clean.
4. Re-run the one-door boundary grep and the purity grep from
   `AGENTS.md` for `classification/` (unchanged from feature 003's own
   already-updated grep pattern, since this fix doesn't change the
   module's file layout).
   **Expected**: zero results.
5. `pnpm build`
   **Expected**: clean build.
6. `pnpm eval:pipeline`
   **Expected**: at least one real `BillableLine` produced (not every
   finding ending up flagged, as in the pre-fix run). Any remaining
   `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED` is investigated as a
   specific, new finding — not assumed away, not silently tolerated.
7. `git diff --stat`
   **Expected**: only `classification/schema.ts`, `classification/agents.ts`,
   `classification/finding-workflow.ts` appear (plus this feature's own
   `specs/004-fix-classification-output/` documentation) — SC-005/FR-007.

## Validation and Acceptance

- **Success — primary defect fixed** (SC-001/SC-002): step 6 above
  produces at least one real `BillableLine`; the pre-fix baseline (100%
  failure) does not reproduce.
- **Success — honest flagging with attached context, not model-produced**
  (SC-003): for at least one flagged finding in step 6's run, the final
  `flaggedForWebSearch` entry has a non-empty, correct
  `searchContext.finding`/`documentExcerpt` — confirm via a temporary
  log line in `combineResultStep` (or Studio inspection) that the
  underlying agent step's own raw response never contained those
  fields, only `{ status, reason }`.
- **Success — failure isolation still holds** (SC-004): quickstart.md
  Scenario 3 — force a non-schema-validation failure for one finding;
  confirm every other finding in the same run still completes and the
  forced-failure finding still surfaces as `flagged_for_web_search`.
  This is the SAME wrapper feature 003 already established, completely
  unchanged by this fix.
- **Regression — scope boundary held** (SC-005): step 7 above.
- **Regression — legacy behavior**: `classificationResultSchema`'s own
  shape is unchanged, so `flatten.ts`, `envelope.ts`, and every other
  downstream consumer require zero changes — confirmed by their absence
  from step 7's `git diff --stat`.

## Idempotence and Recovery

- No database migration, no generated file, no external state change —
  every change in this plan is a source file edit inside three already-
  existing files. Re-applying an already-applied diff is a no-op check
  (`git apply --check` on an already-applied patch fails cleanly).
- If step 2 (`tsc`) surfaces a type error, fix it in the relevant one of
  the three listed files directly — this plan's own revision history
  (Risks/Decisions, Review Log) records exactly what was already caught
  and corrected once; re-check against that record before assuming a new
  category of error.
- If step 6 (`pnpm eval:pipeline`) still surfaces SOME validation
  failures (even if far fewer than the 100% pre-fix baseline), that is
  expected to be investigated, not treated as this fix having failed
  outright — research.md R4 (the `structuredOutput.model` lever) and
  R5 (the discriminated-union-in-isolation question) are the documented
  next steps if this occurs, not something to guess a new fix for
  without further evidence. Since `errorStrategy` is not in place as a
  backstop, any remaining validation failure surfaces via
  `findingClassificationStep`'s existing try/catch, exactly as it
  already would have in feature 003.

## Risks and Decisions

- **Risk (materialized, corrected this pass)**: this plan's first
  version proposed `structuredOutput.errorStrategy: 'fallback'` +
  `fallbackValue` on each of the three agent steps, based on verification
  that checked the compiled implementation's runtime option-forwarding
  behavior but never the actual exported TypeScript type governing what
  is legal to write at this call site. `pnpm exec tsc --noEmit` — this
  plan's own Concrete Steps step 2 — rejected it during a first
  implementation attempt: `'errorStrategy' does not exist in type '{
  schema: StandardSchemaWithJSON<...> }'`. **Decision** (2026-07-16):
  do not adopt `errorStrategy`/`fallbackValue`. Corrected via
  `node_modules/@mastra/core/dist/workflows/workflow.d.ts:70` and
  Mastra's own `reference-workflows-step.md`/`docs-agents-structured-output.md`
  (fetched via the Mastra MCP), both confirming this option is
  documented and typed only for a direct `agent.generate()`/`.stream()`
  call, never for the bare `createStep(agent, {...})` composition form.
  `findingClassificationStep`'s existing try/catch is retained,
  completely unchanged — it already covers this failure class.
  `plans/MASTRA-AGENT-WORKFLOW-STANDARD.md` Rule 1 does document a
  per-call-control exception (call the agent inside a step's own
  `execute()`, as `pricing/price-line.ts` already does) under which
  `errorStrategy` genuinely would be reachable — this fix does not take
  that path; it was evaluated and not chosen, in favor of the smaller,
  already-proven change.
- **Risk (materialized, corrected this pass)**: `determinedOr()`'s new
  generic parameter was first written as `F extends z.ZodTypeAny`,
  which `tsc` rejected because `z.discriminatedUnion()`'s own type
  signature requires each member to satisfy the narrower
  `z.core.$ZodTypeDiscriminable`. **Decision** (2026-07-16): constrain
  `F extends z.core.$ZodTypeDiscriminable` instead, verified directly
  against `node_modules/zod/v4/classic/schemas.d.ts:490` and
  `node_modules/zod/v4/core/api.d.ts:216`.
- **Risk**: whether `z.discriminatedUnion` itself (independent of the
  echo problem) is reliably produced by this specific gateway/model
  remains genuinely open — no live isolated test of the minimal schema
  was completed during planning (the user directed research to stop at
  the documentation-grounded understanding first). **Decision**: this
  fix does not block on resolving that question in isolation — Concrete
  Steps step 6 (the real eval re-run) is what actually settles it,
  honestly, rather than a planning-time guess in either direction. If it
  turns out to be unreliable, `findingClassificationStep`'s existing
  try/catch (unchanged) is what prevents a crash while that is
  investigated further — not a new mechanism introduced by this fix.

## Review Log

**2026-07-16 — Pass 1 (Scaffold — this pass)**

This is the initial scaffold of a previously-empty plan document, not
yet an independent review pass — per this skill's own mode rules, a
Scaffold pass may not conclude `Prepared`; a later pass must reread the
complete plan fresh and independently re-verify it before that status
is earned.

Checks performed while drafting:
- Read the CURRENT actual state of all three target files directly
  (`schema.ts`, `agents.ts`, `finding-workflow.ts`) before drafting any
  diff — not relying on memory of writing them in the prior session
  turn, since `agents.ts` in particular had already been edited once
  this session (the since-abandoned "EXACT OUTPUT SHAPE" band-aid) and
  the diff needed to remove exactly that content, not guess at it.
- Self-caught and removed, before generating the `finding-workflow.ts`
  diff, a stray dead-code block (an unused, overly-clever conditional
  type declaration immediately voided) left over from an earlier draft
  of `combineResultStep`'s own logic — replaced with the simpler,
  already-adjacent `partialFindingsValue` object the rest of the
  function actually uses.
- Traced `determinedOr()`'s new optional parameter against every
  existing call site in `schema.ts` (`materialDeterminationSchema`,
  `laborDeterminationSchema`, `classificationResultSchema`) to confirm
  each remains a single-argument call, so the default preserves their
  exact existing type — not merely asserted, actually re-read against
  the post-edit file content.
- Verified `errorStrategy`/`fallbackValue`'s exact trigger condition and
  option-forwarding path by reading the compiled implementation
  directly (not the type declarations alone, and not doc prose alone) —
  `chunk-PRT2AP4W.cjs`'s `handleValidationError` and
  `chunk-CJAAPSS7.cjs`'s `createStepFromAgent`, both re-cited here with
  their exact function names and approximate line context.
- Extracted every diff block from this document in file order,
  concatenated into a single patch, and ran `git apply --check <patch>`
  from the repository root: **PASS** (exit 0, no output) — command and
  result recorded here per the Review Gate requirement.
- Re-verified every diff header's `diff --git a/<path> b/<path>` and
  `--- a/<path>` / `+++ b/<path>` lines against its own section
  heading — all 3 match exactly.
- Noted, but did not resolve in this pass (see Risks above): the exact
  TypeScript type-narrowing in `combineResultStep` was not live-compiled
  during planning, per this skill's own constraint. This is recorded as
  an open risk with an explicit first-implementation-step mitigation,
  not silently assumed correct.

No further material issue found while drafting — but per this skill's
own rules, this Scaffold pass may not itself conclude `Prepared`; a
separate review pass is required.

**2026-07-16 — Pass 2 (independent review)**

Reread the complete document fresh from disk, then re-verified against
the current repository and worktree: confirmed branch and clean
worktree state, re-extracted and re-ran `git apply --check` on the
concatenated patch (PASS), re-read `schema.ts`/`finding-workflow.ts`
fresh from disk and confirmed diff context lines matched exactly, and
manually re-traced `combineResultStep`'s type-narrowing against
`webSearchFlagSchema`'s actual definition field-by-field. Concluded
`Prepared — awaiting explicit approval` and the plan was approved by the
user.

**What this pass missed, stated plainly**: manual type-tracing is not a
substitute for actually compiling the code. This pass verified that the
VALUES flowing into `toFullFlag()`/the assembled result structurally
matched the target schemas — it never checked whether
`structuredOutput.errorStrategy`/`fallbackValue` (present since Pass 1,
unchanged through Pass 2) was even a legal property on the
`createStep(agent, {...})` call's own parameter type, nor whether
`determinedOr()`'s new generic constraint (`F extends z.ZodTypeAny`)
actually satisfied `z.discriminatedUnion()`'s own type requirement.
Both were real defects that `tsc` — not manual review — caught on the
very first implementation attempt. This is recorded here without
hedging: the review process, followed correctly per its own rules
(fresh reread, re-run apply-check, independent re-derivation), still
missed two compile-blocking defects, because neither defect was
observable from unified-diff review or type-tracing alone — only actual
compilation surfaces "is this property legal on this exact overload."

**2026-07-16 — Pass 3 (revision after implementation-time discovery)**

Implementation began (`/speckit-implement`) after Pass 2's approval.
`pnpm exec tsc --noEmit` — this plan's own Concrete Steps step 2 —
failed with the two defects described above. Per this skill's own
rule ("if requirements or repository facts change, revise and reapprove
first") and the global instruction that any later change to this
document voids its prior approval, implementation was halted, the
applied patch was reverted (`git apply -R`, confirmed clean via
`git status`), and `.specify/feature.json`'s `plan_approved` was reset
to `false`.

Root-caused both defects (not merely patched around them) via the
Mastra MCP (`mcp__mastra__searchMastraDocs`/`readMastraDocs`, not public
web docs or training-data recall — per this project's own binding
memory on Mastra research) and direct reading of the installed
`@mastra/core` and `zod` packages' own type declarations:
- `errorStrategy`/`fallbackValue`: not part of `createStep(agent,
  {...})`'s own `structuredOutput` type (`workflow.d.ts:70`); documented
  by Mastra only for direct `.generate()`/`.stream()` calls. Presented
  two evidenced options to the user (rewrite the three agent steps to
  call `.generate()` directly under Rule 1's documented exception, vs.
  drop `errorStrategy` and keep the existing unchanged try/catch); user
  selected dropping `errorStrategy` entirely.
- `determinedOr()`'s generic constraint: `F extends z.ZodTypeAny` does
  not satisfy `z.discriminatedUnion()`'s own requirement of
  `z.core.$ZodTypeDiscriminable`; corrected the constraint directly.

Revised `spec.md` (FR-003/FR-004, an Edge Case bullet, the "Fallback
Value" Key Entity, one Assumption), `research.md` (R3, R5's closing
line), `data-model.md` (the `determinedOr()` signature and its
rationale; replaced the `errorStrategy`/`fallbackValue` section and the
"wrapper narrows" section), `plan.md` (Summary, Technical Context,
Constitution Check rows III/IV/V/VI, Project Structure), and `tasks.md`
(T001, T003) to match — the spec-level artifacts, not just this
whiteboard, since the change is to an approved functional requirement
(FR-003), not a cosmetic correction. Regenerated the `schema.ts` and
`finding-workflow.ts` diffs via `scripts/make-diff.sh` against the
corrected scratch content; `agents.ts`'s diff is unchanged (that file
was never affected by either defect) and was regenerated fresh from the
current worktree state to confirm no drift. Concatenated and ran
`git apply --check`: **PASS** (exit 0).

This revision was NOT verified by actually re-applying and
re-compiling during this planning pass — per this skill's own
constraint against touching implementation files during planning, and
because the prior violation of that same discipline (checking runtime
behavior via compiled JS instead of the actual type declaration) is
exactly what caused Pass 1/2's miss in the first place; re-applying
without full confidence would repeat the same category of error in the
opposite direction (asserting "fixed" without full verification). The
evidence for both corrections is instead direct: the exact `.d.ts`
line, the exact Mastra doc section, and the exact `tsc` error message
each defect produced. Concrete Steps step 2 (`tsc --noEmit`) remains the
authoritative, actually-compiling check, run for real during
implementation next.

Per this skill's own rule, a revising pass may not itself conclude
`Prepared` — a further, later pass must independently re-verify this
revision before that status is earned.

**2026-07-16 — Pass 4 (independent review of the revision)**

Reread the complete document fresh from disk in full (not from drafting
memory), section by section, then:

- Independently re-verified, by reading the actual files fresh (not
  trusting Pass 3's own citations): `node_modules/@mastra/core/dist/workflows/workflow.d.ts`
  lines 68-72 confirm the `structuredOutput` type on the agent+structured-output
  `createStep` overload is exactly `{ schema: StandardSchemaWithJSON<TStepOutput> }`.
  `node_modules/zod/v4/classic/schemas.d.ts:490` confirms
  `discriminatedUnion<Types extends readonly [core.$ZodTypeDiscriminable, ...], ...>`.
  `node_modules/zod/v4/core/api.d.ts:213-220` confirms
  `$ZodTypeDiscriminable`'s definition. All three citations are accurate.
- Found and fixed one real inconsistency: the User Contract's
  Constraints section claimed `findingClassificationStep`'s doc comment
  "does not change at all," but the file's own diff clearly modifies
  that comment (removes a stale failure-mode example, adds a
  clarifying paragraph). Corrected the Constraints bullet to state this
  accurately — code unchanged, comment updated for accuracy. This is
  the kind of discrepancy Pass 2 previously missed a different flavor
  of (checking values, not checking claims-about-the-diff against the
  diff itself); this pass specifically cross-checked prose claims
  against the actual diff content, not just the diff against the
  worktree.
- Re-extracted all three diff blocks from the document (after the above
  fix) in file order, concatenated, and ran `git apply --check` from
  the repository root: **PASS** (exit 0). Confirmed the fix to the
  Constraints prose did not touch any diff block (byte-identical to the
  pre-fix concatenated patch).
- Re-read the full `finding-workflow.ts` diff hunk-by-hunk against the
  current worktree file (`git show :src/features/estimate-extraction-pipeline/classification/finding-workflow.ts`
  equivalent — the file as it exists on disk right now, unmodified
  since Pass 3's revert): every removed/context line matches.
- Re-confirmed the branch is `refactor/classification-rebuild` and the
  worktree is otherwise clean (no accidental leftover state from the
  earlier revert).
- Did NOT re-apply and re-compile the diffs during this pass — this
  stays a planning pass, per the skill's own constraint. The honest
  limit of what this pass can verify is: the diffs apply cleanly, their
  content is internally consistent with the prose describing them, and
  every specific citation this revision relies on is accurate as read
  directly from the cited file. Whether the resulting code actually
  compiles is Concrete Steps step 2's job, in implementation, next.

No further material issue found. This document may now conclude
`Prepared`.

## Approval

Implementation must not begin until a `Prepared` plan receives explicit,
unambiguous human approval (via
`/speckit-implementation-planning-approve`) for its exact version. Any
later change to this document voids that approval and requires it
again. **The prior approval of this document is void** — Pass 3 above
changed the resolved design (dropped `errorStrategy`/`fallbackValue`,
corrected `determinedOr()`'s generic constraint) after that approval was
given.

**Status: Prepared — awaiting explicit approval.**
