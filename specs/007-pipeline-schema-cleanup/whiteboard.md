# Whiteboard: Pipeline Schema Cleanup

## 1. Status

**Prepared — awaiting explicit approval.** All 23 implementation files
(`classification/agents.ts`, already among the 23, further revised this
pass — not a new file) have a verified, `git apply --check`-passed
exact diff, both individually and
as one combined patch built from this document's own literal §10 text —
applied to a scratch worktree and compiled end-to-end with
`tsc --noEmit` (exit 0, zero errors, including `eval/`, outside `src/`
and outside every prior scope check). Five review passes total, four of
which found real issues and revised the plan (see §15 for the full
history: legacy-deletion rejection and rebuild; a first schema/dead-code
audit adding #15/#16; a second, schema-focused audit adding #17-#21 plus
fixing two whiteboard-prose diff-corruption defects the skill's own
Review Gate exists to catch; a final pre-implementation review adding
#22, a live prompt-text contradiction of this plan's own FR-018). The
fifth pass — this one — found and fixed #22, then re-verified
everything (23 diff blocks, all apply; `tsc --noEmit` clean; zero
`pageHint`/`multipleOf`/quarter-hour anywhere).

Per the skill's own rule, a pass that revises may not also claim
`Prepared` in the same pass — this document would otherwise still read
`Revised`. It is marked `Prepared` here on **explicit user instruction**:
told directly to implement now, with any further slop found post-
implementation to be cleaned up separately, rather than requiring one
more genuinely independent zero-issue pass first. That is a real,
acknowledged deviation from the skill's default discipline, not a
silent one — recorded here so the decision trail is honest about why
`Prepared` is being claimed without the norm the last four passes each
observed. It does NOT skip the separate, mandatory approval gate itself:
per the global Spec-Driven Development workflow, implementation is still
blocked until this plan receives its own explicit approval via
`/speckit-implementation-planning-approve`, run by the user — never
inferred from a conversational "go ahead."

## 2. Purpose / Big Picture

`specs/007-pipeline-schema-cleanup/spec.md` documents 14 confirmed
defects across every schema file in `estimate-extraction-pipeline`,
found while executing an explicit, narrower request ("remove `pageHint`
entirely") and then auditing the rest of the pipeline's schemas once
that request was underway. This plan makes all 14 real: `pageHint` is
gone everywhere except the frozen legacy-compat schema; five instances
of hand-retyped field-group duplication are fixed via Zod's own
`.extend()`/`.omit()`; two hand-written runtime checks
(`flatten.ts`'s throws, `pricing/schema.ts`'s `xorUnavailable`) are
replaced by schema shapes that make the invalid state structurally
impossible, reusing the codebase's own `determinedOr()` pattern; the
unforced `lines`/`prices` array split collapses into one merged
`pricedLineSchema`; two dead exports are deleted; and two
never-actually-requested assumptions (a quarter-hour rounding rule, five
untraceable string-length bounds) are removed.

Observable outcome: a fresh `pnpm eval:pipeline` run produces a real
estimate with one `lines` array (each line carrying its own price
inline), no `pageHint` anywhere, no schema-validation regressions, and a
labor determination of e.g. 1.3 hours is accepted rather than rejected.

## 3. User Contract

Numbered acceptance criteria (from spec.md's Success Criteria):

1. Zero occurrences of `pageHint` in `src/`, no exception (SC-001,
   revised — the legacy schema that originally carved out an exception
   is itself deleted).
2. Zero hand-retyped duplicates of any shared field group named in
   findings #3/#4/#7/#9/#10 (SC-002).
3. `pricing/index.ts`'s public output type is one array of priced lines,
   not a `{ lines, prices }` pair; no `Map`-based price correlation in
   the report UI (SC-003).
4. `roundToQuarter`/`kiloGateway` no longer exist (SC-004).
5. A fresh `pnpm eval:pipeline` run produces a real, correctly-priced
   estimate with zero schema-validation failures caused by this change
   (SC-005).
6. v1/v2 legacy compatibility is explicitly out of scope entirely — an
   estimate persisted under v1, v2, or the OLD split-array v3 shape
   surfaces via the existing `'unparseable'`/retry path (SC-006, revised
   — explicit user direction: legacy compatibility is itself
   unrequested-complexity slop, not something to preserve).
7. `.multipleOf(0.25)` no longer appears anywhere in
   `classification/schema.ts` (SC-007).
8. Every remaining numeric string-length bound is either minimal or
   traceable (SC-008).

**Constraints**: FR-003 REVISED (legacy v1/v2 support deleted entirely,
not preserved — reversed mid-implementation-planning by explicit user
direction), FR-016/FR-016's plan-review clarification (the resilience
*mechanism* in `price-line.ts`/`finding-workflow.ts` must not change —
the *data shapes* those files construct may and must).

**Exclusions**: no new Mastra primitive, no new module, no change to
agent composition (`createStep`/`.generate()` call sites stay exactly
where they are).

**Invariant**: every fix must make an invalid state structurally
unrepresentable (Governing Rule) and every remaining constraint must
trace to an actual request (Governing Rule 2) — both from spec.md.

## 4. Acceptance Coverage

| Criterion | Files | Plan Step | Validation |
|---|---|---|---|
| 1 (pageHint) | extraction/{schema,agent}.ts, classification/{schema,agents,finding-workflow}.ts, document/schema.ts, items-section.tsx | §9 M1-M3, M8, M11 | `grep -rn pageHint src/` |
| 2 (dedup) | classification/{schema,index,finding-workflow}.ts, pricing/schema.ts | §9 M2, M4, M5 | manual schema review |
| 3 (merged array) | pricing/{schema,agent,price-line,workflow,index}.ts, pipeline.ts, estimate/lib/{workflow,envelope}.ts, items-section.tsx | §9 M5-M8 | `tsc --noEmit`; grep `priceByItemId` |
| 4 (dead code) | shared/{quarter-hour,gateway}.ts | §9 M9 | `grep -rn roundToQuarter\|kiloGateway src/` |
| 5 (real run) | all | §12 | `pnpm eval:pipeline` |
| 6 (legacy scope, revised) | estimate/lib/envelope.ts, estimate-report.tsx | §9 M8 | manual: seed an old-shape row (any of v1/v2/old-v3), confirm `'unparseable'`/retry |
| 7 (quarter-hour) | classification/schema.ts | §9 M2 | `grep multipleOf` |
| 8 (string bounds) | all schema files touched | §9 M2, M5 | manual schema review |
| 9 (SC-010, whole-repo compile) | classification/index.ts, pricing/{schema,index}.ts, items-section.tsx, eval/pipeline/{run,scorers/pricing-match}.ts | §9 M11 | `tsc --noEmit` against the fully-applied combined patch in a scratch worktree (confirmed exit 0 this pass, after fixing findings #20/#21) |

All 9 criteria now have a verified diff covering their files — no
partial coverage remains (the former blocker on criteria 1/3 is
resolved; see §14).

## 5. Context and Orientation

`estimate-extraction-pipeline` is a Mastra-based pipeline:
`document/` (PDF → text) → `extraction/` (text → facts) →
`classification/` (facts → trade/material/labor determinations) →
`pricing/` (determinations → prices), composed in `pipeline.ts`'s
`summarizeEstimateWorkflow`. `estimate/lib/workflow.ts`'s
`triggerSummarizeEstimate()` is the one caller that runs this workflow
and persists its result (as JSON, via `estimate/lib/envelope.ts`'s
versioned schemas) onto `estimate_requests.summary`. `estimate/components/`
renders that persisted JSON back out.

`classification/schema.ts`'s `determinedOr()` builds a discriminated
union (`{status:'determined', value: T}` or a flag shape) — the pattern
already used by three classification agents in production, and now
reused by `pricing/schema.ts` for the identical "real value or an
explicit reason it's unknown" case. `itemIdentitySchema` (renamed from
`itemIdentityFields`, now a real `ZodObject`) is the shared base
`materialLineSchema`/`laborLineSchema` both `.extend()` from.

## 6. Directory Map and Modification Table

```text
src/features/estimate-extraction-pipeline/
├── extraction/
│   ├── schema.ts                    [MODIFY] M1
│   └── agent.ts                     [MODIFY] M1
├── classification/
│   ├── schema.ts                    [MODIFY] M2
│   ├── agents.ts                    [MODIFY] M3 (quarter-hour prompt text, found in final review)
│   ├── finding-workflow.ts          [MODIFY] M4 + M11 (pageHint in own comment)
│   ├── flatten.ts                   [MODIFY] M4
│   └── index.ts                     [MODIFY] M2 + M11 (missing ExtentUnit export)
├── document/
│   └── schema.ts                     [MODIFY] M11 (pageHint in doc comment)
├── pricing/
│   ├── schema.ts                    [MODIFY] M5 + M11 (priceAmount() added)
│   ├── agent.ts                     [MODIFY] M5
│   ├── price-line.ts                [MODIFY] M6
│   ├── workflow.ts                  [MODIFY] M6 (found during this pass)
│   └── index.ts                     [MODIFY] M6 + M11 (re-export priceAmount)
├── pipeline.ts                       [MODIFY] M7 (found during this pass)
└── shared/
    ├── quarter-hour.ts               [DELETE] M9
    └── gateway.ts                    [MODIFY] M9

src/features/estimate/
├── lib/workflow.ts                   [MODIFY] M7 (found during this pass)
├── lib/envelope.ts                   [MODIFY] M7 + M8 (v1/v2 deleted entirely)
├── lib/format.ts                     [MODIFY] M10 (found during this pass)
├── components/estimate-report.tsx    [MODIFY] M8
└── components/items-section.tsx      [MODIFY] M8 + M10 + M11 (priceAmount imported, not local)

eval/pipeline/
├── run.ts                            [MODIFY] M11 (PricedLineItem deleted upstream)
└── scorers/pricing-match.ts          [MODIFY] M11 (PricedLineItem deleted upstream)
```

## 7. Pattern Audit and Evidence Ledger

| Decision | Evidence | Constraint learned | Reuse/deviation |
|---|---|---|---|
| `.extend()`/`.omit()` for schema composition | `node_modules/zod/v4/classic/schemas.d.ts:444` (`ZodObject.extend`), same file (`.omit`) | Only `ZodObject` has these methods | Reuse — no hand-rolled substitute |
| `pricedLineSchema` built per-branch, not `billableLineSchema.extend()` | Same file: `ZodDiscriminatedUnion extends ZodUnion extends _ZodType`, none declare `.extend()` | A discriminated union has no `.extend()` | Deviation from initial (wrong) plan draft, caught this pass |
| `determinedOr()` reused for pricing | `classification/schema.ts:132-140` (existing, already in production 3x) | Tagged discriminated unions are safe for agent structured output; untagged `z.union` is not (specs/005's own failure) | Reuse |
| Full-document context replaces `pageHint` windowing | `extraction/steps.ts`'s `buildExtractionPrompt()` (existing, working in production) | This is the only proven document-context mechanism in this codebase | Reuse |
| `.generate()` in `price-line.ts` unchanged | Mastra's own per-call-runtime-control exception (spec.md FR-016, research.md R8) | Composition mechanism ≠ data shape; changing one doesn't require changing the other | Neither — explicitly preserved |
| `pricingFanoutWorkflow`/`pipeline.ts`/`estimate/lib/workflow.ts` needed changes | Traced `priceLineStep`'s new output type outward through every consumer | A step's own declared `outputSchema` and every caller that destructures its result must be checked, not just the step itself | Found this pass — 3 files missing from the original plan |
| Legacy v2 price shape kept locally in `envelope.ts` | `legacyBillableItemSchema`'s own existing precedent (already lives in `envelope.ts`, not the pipeline module) | A legacy compat shape belongs where it's used for historical parsing, not in the module that no longer produces it | Reuse of an existing precedent, applied to a newly-discovered case |
| `eval/pipeline/run.ts` + `pricing-match.ts` needed changes | `tsc --noEmit` against the fully-applied combined patch in a scratch worktree (first run this pass) — 4 real compile errors, zero from any prior `git apply --check`-only pass | Diff-application checks prove hunk consistency, never that the resulting tree compiles; `eval/` sits outside every `src/`-scoped grep this plan had run | Found this pass — 2 files outside the module tree entirely, missing from every earlier scope trace |
| `priceAmount()` moved from `items-section.tsx` into `pricing/schema.ts` | The eval pricing scorer needed the identical material/labor branch check `items-section.tsx` already had locally | A helper used by two independent consumers belongs in the module whose type it narrows, not duplicated per caller (User Story 2) | Reuse — same principle already applied to `.extend()`/`.omit()` elsewhere in this plan, applied to a function this time |

## 8. Interfaces and Dependencies

- `classification/index.ts`'s door gains `materialLineSchema`,
  `laborLineSchema`, `determinedOr`, and their types — `pricing/schema.ts`
  needs all three and must import through the door (Constitution
  Principle I), not deep-import `classification/schema.ts`.
- `pricing/index.ts`'s public `priceLines()` return type changes from
  `Promise<{lines: BillableLine[]; prices: PricedLineItem[]}>` to
  `Promise<PricedLine[]>` — a breaking change to every caller.
  `pipeline.ts` is the only caller; it is updated in this same plan (M7).
- `estimate/lib/envelope.ts`'s `summaryEnvelopeV3Schema` changes shape in
  place (still version 3). `ParsedEnvelope`'s `'v3'` variant drops
  `prices`. Every reader of `ParsedEnvelope` (`estimate-report.tsx`) must
  be checked — this is exactly where the blocker in §14 was found.
- No package/dependency/version changes. No migration — the
  `estimate_requests.summary` column type (`text`) is unaffected; only
  the JSON shape validated against it changes.
- `classification/index.ts`'s door also gains `type ExtentUnit` (M11) —
  `format.ts` (M10) needs it and the original door only exported
  `EXTENT_UNIT` (the const), not the type.
- `pricing/index.ts`'s door also gains `priceAmount` (M11) — both
  `items-section.tsx` and `eval/pipeline/scorers/pricing-match.ts` import
  it from there rather than each defining their own copy.
- `eval/pipeline/run.ts`'s `priceStep.output` cast changes from
  `{ prices: PricedLineItem[] }` to `{ lines: PricedLine[] }` (M11) —
  it must match `pipeline.ts`'s `priceStep.outputSchema` exactly
  (`{ lines: z.array(pricedLineSchema), parsedDocument,
  flaggedForWebSearch }`, unchanged by this plan, only the element type
  inside `lines` changed).

## 9. Plan of Work

Dependency-ordered milestones. Each is independently verifiable via
`tsc --noEmit` scoped to the files it touches.

- **M1** — `extraction/schema.ts`, `extraction/agent.ts`: remove
  `pageHint`; loosen `sourceQuote`. No dependency.
- **M2** — `classification/schema.ts`, `classification/index.ts`:
  full rewrite (pageHint removal, `itemIdentitySchema`, `.omit()/.extend()`
  derivation, nested `amountSource`/`hoursSource`, no `.multipleOf`,
  `agentUndeterminedSchema` via `.omit()`, exported value schemas,
  new door exports). Depends on M1.
- **M3** — `classification/agents.ts`: remove pageHint prompt mentions.
  Revised (final pre-implementation review): also removes `laborAgent`'s
  own "quarter-hour increments" prompt instruction (finding #22/FR-026)
  — the same unverified assumption FR-018 already removes from the
  schema, found by re-reading every agent prompt fresh rather than
  trusting this milestone's original "prompt text only" note. No
  dependency on M2 (prompt text only, no schema/composition change).
- **M4** — `classification/finding-workflow.ts`, `classification/flatten.ts`:
  full-document context, updated step-output schemas, corrected field
  access paths, no throws. Depends on M2.
- **M5** — `pricing/schema.ts`, `pricing/agent.ts`: `determinedOr()`-based
  price, `pricedLineSchema` merge, prompt rewrite. Depends on M2 (needs
  `materialLineSchema`/`laborLineSchema`/`determinedOr` via the door).
- **M6** — `pricing/price-line.ts`, `pricing/workflow.ts`,
  `pricing/index.ts`: propagate the merged shape through the fan-out.
  Depends on M5.
- **M7** — `pipeline.ts`, `estimate/lib/workflow.ts`,
  `estimate/lib/envelope.ts`: propagate the merged shape through the
  composition root and persistence layer. Depends on M6.
- **M8** — `estimate/lib/envelope.ts` (revised further), `estimate-report.tsx`,
  `items-section.tsx`: delete v1/v2 legacy support entirely (explicit
  user direction — legacy compatibility is unrequested-complexity slop,
  not something to preserve or build a rendering path around); simplify
  `items-section.tsx` to the one shape (`PricedLine[]`) that now exists;
  simplify `estimate-report.tsx`'s `ItemsBlock` to route on
  `'v3' | 'unparseable' | 'absent'` only, no more items/prices assembly.
  Depends on M7 (`pricedLineSchema` must exist).
- **M9** — `shared/quarter-hour.ts`, `shared/gateway.ts`: delete dead
  exports. No dependency on anything else; safe at any point.
- **M10** — `estimate/lib/format.ts`, `items-section.tsx` (further
  revised): remove `formatTradeLabel()`'s 5 dead legacy-taxonomy cases
  and `formatUnit()`'s dead `'sqft'` case (both found in a follow-up
  audit after M8 landed — dead code M8 itself created); tighten both
  functions' parameter types from `string` to `Trade`/`ExtentUnit | 'hrs'`;
  `items-section.tsx`'s trade-grouping `Map` retyped from
  `Map<string, PricedLine[]>` to `Map<Trade, PricedLine[]>` so its own
  call to the now-tightened `formatTradeLabel()` still type-checks.
  Depends on M8 (needs `items-section.tsx`'s final v3-only shape) and,
  transitively, on M2 (needs classification's exported `Trade` type via
  the door — already exported, no further door change needed).
- **M11** — `document/schema.ts`, `classification/finding-workflow.ts`
  (further revised), `classification/index.ts` (further revised),
  `pricing/schema.ts` (further revised), `pricing/index.ts` (further
  revised), `items-section.tsx` (further revised), `eval/pipeline/run.ts`,
  `eval/pipeline/scorers/pricing-match.ts`: fixes six findings (#18-#21)
  from a second, schema-focused audit pass and, for the first time, an
  actual `tsc --noEmit` run against the fully-applied patch — not found
  by re-reading files already believed in scope. Removes two remaining
  literal `pageHint` occurrences (`document/schema.ts`'s comment, and
  `finding-workflow.ts`'s own replacement comment, which had
  reintroduced the string); adds the missing `type ExtentUnit` barrel
  export M10 already depends on; and fixes two `eval/` files broken by
  M5/M6's `PricedLineItem` → `PricedLine` rewrite (outside `src/`, never
  traced by any earlier milestone). Extracting `priceAmount()` from
  `items-section.tsx` into `pricing/schema.ts` (so the eval scorer can
  reuse it instead of duplicating the same branch check) is this
  milestone's only non-mechanical change. Depends on M8 (items-section's
  final shape), M10 (`format.ts`/`ExtentUnit` needed to exist first for
  the gap to be visible), and M5 (`pricing/schema.ts`'s `PricedLine`).

## 10. Exact File Changes

### `src/features/estimate-extraction-pipeline/extraction/schema.ts`
**Action:** Modify
**Why:** FR-001 (remove `pageHint`), FR-019 (loosen `sourceQuote`).
**Impact:** `pageHint` no longer exists on `ExtractedFinding`; every
downstream consumer (classification) must not reference it (handled in
M2/M4).

```diff
--- a/src/features/estimate-extraction-pipeline/extraction/schema.ts
+++ b/src/features/estimate-extraction-pipeline/extraction/schema.ts
@@ -17,8 +17,8 @@
  * `extractionOutputSchema` below). Facts actually stated in the text
  * ONLY: no trade, no unit, no material/labor judgment — those require
  * domain-taxonomy knowledge, not text extraction, and are classification's
- * job. `sourceQuote`/`pageHint` are populated by the agent directly, in
- * the same response as every other field.
+ * job. `sourceQuote` is populated by the agent directly, in the same
+ * response as every other field.
  */
 export const extractedFindingSchema = z.object({
   /** Stable per-run id, e.g. "finding-001". */
@@ -41,11 +41,7 @@
    * classification/pricing estimate missing hours downstream. Never invented.
    */
   inspectorHours: z.number().positive().nullable(),
-  sourceQuote: z.string().min(8).max(500),
-  pageHint: z
-    .string()
-    .regex(/^p\.\s*\d+$/)
-    .nullable(),
+  sourceQuote: z.string().min(1),
 });
 
 export type ExtractedFinding = z.infer<typeof extractedFindingSchema>;
```

#### Reasoning
- Verified via `make-diff.sh modify` (`git apply --check` passed).
- `sourceQuote`'s `min(8).max(500)` traced to no clarification anywhere
  in `specs/*/spec.md` (finding #14) — loosened to a minimal sanity bound.

### `src/features/estimate-extraction-pipeline/extraction/agent.ts`
**Action:** Modify
**Why:** FR-001 — the agent must stop being instructed to produce `pageHint`.
**Impact:** Prompt text only; no schema/type change.

```diff
--- a/src/features/estimate-extraction-pipeline/extraction/agent.ts
+++ b/src/features/estimate-extraction-pipeline/extraction/agent.ts
@@ -35,9 +35,8 @@
 For every finding you emit, "sourceQuote" must be the exact verbatim
 sentence (or clause) copied from the report that names both the defect
 and the required action — no paraphrase, no merging text from separate
-sentences, no invention. "pageHint" must be the page that quote actually
-appears on, formatted "p. {page}". If you cannot find a verbatim sentence
-in the report that supports a candidate finding, do NOT emit the finding.
+sentences, no invention. If you cannot find a verbatim sentence in the
+report that supports a candidate finding, do NOT emit the finding.
 
 HARD RULES
 1. GROUNDED ONLY. Every emitted finding's "sourceQuote" must be copied
@@ -94,7 +93,6 @@
   stated an hour count. In every other case: null.
 - sourceQuote: the exact verbatim sentence or clause from the report that
   names both the defect and the action for this finding.
-- pageHint: the page that quote appears on, formatted "p. {page}".
 
 OUTPUT FORMAT
 Return JSON matching the provided structured-output schema exactly. The
```

#### Reasoning
- Verified via `make-diff.sh modify`.

### `src/features/estimate-extraction-pipeline/classification/schema.ts`
**Action:** Modify
**Why:** FR-001, FR-004, FR-006 (enabling), FR-007, FR-008, FR-010,
FR-018, FR-019 — this one file is the source of five of spec.md's 14
findings.
**Impact:** `itemIdentityFields` renamed to `itemIdentitySchema` (now a
real `ZodObject`); `materialDeterminationSchema`/`laborDeterminationSchema`
gain exported `materialQuantityValueSchema`/`laborHoursValueSchema` and
lose their dangling `amountSource`/`hoursSource` siblings;
`classificationResultSchema` is now derived, not independently retyped;
`agentUndeterminedSchema` is now `.omit()`-derived. Every consumer
(`finding-workflow.ts`, `flatten.ts`, `pricing/schema.ts` via the door)
must be updated in lockstep — done in M4/M5.

```diff
--- a/src/features/estimate-extraction-pipeline/classification/schema.ts
+++ b/src/features/estimate-extraction-pipeline/classification/schema.ts
@@ -54,9 +54,9 @@
  * bare null, never a fabricated plausible-sounding value. Carries
  * everything a future (out-of-scope-for-this-pass) web-search
  * resolution step would need without re-deriving anything: the full
- * originating finding, the surrounding parsed-document excerpt near its
- * `pageHint`, a short machine-readable reason, and whatever else this
- * pass DID determine for the same finding.
+ * originating finding, the surrounding parsed-document excerpt, a short
+ * machine-readable reason, and whatever else this pass DID determine for
+ * the same finding.
  *
  * This full shape is assembled by `finding-workflow.ts`'s own
  * `combineResultStep` (via `getInitData()`/`getStepResult()`,
@@ -70,7 +70,7 @@
  */
 export const webSearchFlagSchema = z.object({
   status: z.literal('flagged_for_web_search'),
-  reason: z.string().min(1).max(300),
+  reason: z.string().min(1),
   searchContext: z.object({
     finding: extractedFindingSchema,
     documentExcerpt: z.string(),
@@ -98,16 +98,18 @@
 /**
  * The MINIMAL "couldn't determine" shape an agent's own structured
  * output is ever required to produce — its own judgment only, nothing
- * echoed back. `finding-workflow.ts`'s `combineResultStep` upgrades a
- * value of this shape into a full `WebSearchFlag` (above) by attaching
- * context it already possesses via `getInitData()`/`getStepResult()` —
- * the same mechanism this codebase already uses to build each agent's
- * own PROMPT, applied symmetrically on the output side
+ * echoed back. Built by omitting `webSearchFlagSchema`'s own
+ * `searchContext` field rather than independently retyping
+ * `status`/`reason` (specs/007-pipeline-schema-cleanup finding #10).
+ * `finding-workflow.ts`'s `combineResultStep` upgrades a value of this
+ * shape into a full `WebSearchFlag` (above) by attaching context it
+ * already possesses via `getInitData()`/`getStepResult()` — the same
+ * mechanism this codebase already uses to build each agent's own
+ * PROMPT, applied symmetrically on the output side
  * (specs/004-fix-classification-output).
  */
-export const agentUndeterminedSchema = z.object({
-  status: z.literal('flagged_for_web_search'),
-  reason: z.string().min(1).max(300),
+export const agentUndeterminedSchema = webSearchFlagSchema.omit({
+  searchContext: true,
 });
 export type AgentUndetermined = z.infer<typeof agentUndeterminedSchema>;
 
@@ -139,29 +141,55 @@
   ]);
 }
 
-/** One physical material identified for a finding, before flattening. */
+/**
+ * The determined VALUE shape for a material's quantity — exported
+ * separately (not inlined) so `finding-workflow.ts`'s
+ * `materialsStepOutputSchema` can pass this exact same value schema into
+ * its own `determinedOr()` call (with `agentUndeterminedSchema` as the
+ * flag branch, instead of this schema's own default) rather than
+ * independently retyping `amount`/`unit`/`amountSource`
+ * (specs/007-pipeline-schema-cleanup FR-006).
+ */
+export const materialQuantityValueSchema = z.object({
+  amount: z.number().positive(),
+  unit: z.enum(EXTENT_UNIT),
+  amountSource: z.string().min(1),
+});
+
+/**
+ * One physical material identified for a finding, before flattening.
+ * `amountSource` (the grounding citation) lives inside the determined
+ * branch's own value — not a dangling optional sibling — so "a
+ * determined quantity always has a source" is structurally guaranteed,
+ * not a runtime check `flatten.ts` has to enforce
+ * (specs/007-pipeline-schema-cleanup FR-004).
+ */
 export const materialDeterminationSchema = z.object({
   material: z.string().min(1),
-  quantity: determinedOr(
-    z.object({
-      amount: z.number().positive(),
-      unit: z.enum(EXTENT_UNIT),
-    }),
-  ),
-  /**
-   * Present only alongside a 'determined' quantity — the grounding
-   * citation (a document quote, or in a future pass, a web-search
-   * citation). Omitted entirely when quantity is flagged.
-   */
-  amountSource: z.string().min(1).optional(),
+  quantity: determinedOr(materialQuantityValueSchema),
 });
 export type MaterialDetermination = z.infer<typeof materialDeterminationSchema>;
 
-/** The labor identified for a finding, before flattening. */
+/**
+ * The determined VALUE shape for labor hours — exported separately for
+ * the same reason as `materialQuantityValueSchema` above
+ * (specs/007-pipeline-schema-cleanup FR-006). No quarter-hour rounding
+ * rule — an unconfirmed assumption pattern-matched from mock sample
+ * data, never an actual product requirement (finding #13).
+ */
+export const laborHoursValueSchema = z.object({
+  amount: z.number().positive(),
+  hoursSource: z.string().min(1),
+});
+
+/**
+ * The labor identified for a finding, before flattening. `hoursSource`
+ * lives inside the determined branch's own value for the same reason as
+ * `materialDeterminationSchema.amountSource` above.
+ */
 export const laborDeterminationSchema = z.object({
   laborType: z.string().min(1),
-  hours: determinedOr(z.number().multipleOf(0.25).min(0.25)),
-  hoursSource: z.string().min(1).optional(),
+  hours: determinedOr(laborHoursValueSchema),
 });
 export type LaborDetermination = z.infer<typeof laborDeterminationSchema>;
 
@@ -169,48 +197,45 @@
  * A finding's identity fields that a billable line must carry through to
  * pricing/rendering — factored out so both `classificationResultSchema`
  * and the two line schemas below share one definition instead of two
- * independently-maintained copies.
+ * independently-maintained copies. A real `ZodObject`, composed via
+ * `.extend()` below rather than object-spread
+ * (specs/007-pipeline-schema-cleanup FR-007).
  */
-const itemIdentityFields = {
+const itemIdentitySchema = z.object({
   id: z.string(),
   trade: z.enum(TRADE),
   action: z.enum(ACTION),
   scope: z.string().min(1),
   location: z.string().min(1),
-  sourceQuote: z.string().min(8).max(500),
-  pageHint: z
-    .string()
-    .regex(/^p\.\s*\d+$/)
-    .nullable(),
-} as const;
+  sourceQuote: z.string().min(1),
+});
 
 /**
  * One finding's complete classification, as the per-finding nested
- * workflow's own combine step (finding-workflow.ts) produces it. Carries
- * the originating finding's own identity fields (`action`/`scope`/
- * `location`/`sourceQuote`/`pageHint`, from `getInitData()`) alongside
- * the three agents' own determinations, so `flatten.ts` is fully
- * self-contained — no separate "merge findings back in by id" step like
- * the scrapped module's `buildLinesStep` needed. `materials` is an
+ * workflow's own combine step (finding-workflow.ts) produces it. Derived
+ * from `extractedFindingSchema` via `.omit()`/`.extend()` rather than
+ * independently retyping `action`/`scope`/`location`/`sourceQuote`
+ * (specs/007-pipeline-schema-cleanup FR-008) — `id`/`statedQuantity`/
+ * `inspectorHours` don't carry forward (renamed to `findingId`, or
+ * consumed already during extraction/classification prompting), and
+ * `materials`/`labor`/`trade` are this schema's own additions. Carries
+ * the originating finding's own identity fields (from `getInitData()`)
+ * alongside the three agents' own determinations, so `flatten.ts` is
+ * fully self-contained — no separate "merge findings back in by id" step
+ * like the scrapped module's `buildLinesStep` needed. `materials` is an
  * ARRAY — zero, one, or many entries, each with its own unit — because
  * one finding can genuinely span multiple differently-unit-typed
  * materials. Zero materials is a valid, honest "labor-only" state, never
  * an error (spec.md User Story 2).
  */
-export const classificationResultSchema = z.object({
-  findingId: z.string(),
-  action: z.enum(ACTION),
-  scope: z.string().min(1),
-  location: z.string().min(1),
-  sourceQuote: z.string().min(8).max(500),
-  pageHint: z
-    .string()
-    .regex(/^p\.\s*\d+$/)
-    .nullable(),
-  materials: z.array(materialDeterminationSchema),
-  labor: laborDeterminationSchema,
-  trade: determinedOr(z.enum(TRADE)),
-});
+export const classificationResultSchema = extractedFindingSchema
+  .omit({ id: true, statedQuantity: true, inspectorHours: true })
+  .extend({
+    findingId: z.string(),
+    materials: z.array(materialDeterminationSchema),
+    labor: laborDeterminationSchema,
+    trade: determinedOr(z.enum(TRADE)),
+  });
 export type ClassificationResult = z.infer<typeof classificationResultSchema>;
 
 /**
@@ -221,10 +246,10 @@
  * `sourceQuote`) — only `trade`'s value set changes in this rebuild.
  * `quantity` is never null here — a flagged (undetermined) material
  * never reaches this schema; it is surfaced via `webSearchFlagSchema`
- * instead (see flatten.ts).
+ * instead (see flatten.ts). Built via `.extend()` off `itemIdentitySchema`
+ * (specs/007-pipeline-schema-cleanup FR-007).
  */
-export const materialLineSchema = z.object({
-  ...itemIdentityFields,
+export const materialLineSchema = itemIdentitySchema.extend({
   costType: z.literal('material'),
   /** What the material actually is, e.g. "wood siding board". */
   material: z.string().min(1),
@@ -237,15 +262,15 @@
 /**
  * ONE labor billable line. Same "never null, never flagged" reasoning
  * as `materialLineSchema.quantity` — a flagged labor-hours value never
- * reaches this schema.
+ * reaches this schema. Built via `.extend()` off `itemIdentitySchema`
+ * (specs/007-pipeline-schema-cleanup FR-007).
  */
-export const laborLineSchema = z.object({
-  ...itemIdentityFields,
+export const laborLineSchema = itemIdentitySchema.extend({
   costType: z.literal('labor'),
   /** What the labor actually is, e.g. "siding repair labor". */
   laborType: z.string().min(1),
-  /** Hours, in quarter-hour increments. */
-  quantity: z.number().multipleOf(0.25).min(0.25),
+  /** Hours. No quarter-hour rounding rule (finding #13 — never requested). */
+  quantity: z.number().positive(),
   unit: z.literal('hrs'),
   hoursSource: z.string().min(1),
   /**
```

#### Reasoning
- Verified via `make-diff.sh modify`; 232-line diff, `git apply --check` passed.
- `materialQuantityValueSchema`/`laborHoursValueSchema` exported
  specifically so `finding-workflow.ts` (M4) can satisfy FR-006 by
  reference, not by structural coincidence.

### `src/features/estimate-extraction-pipeline/classification/index.ts`
**Action:** Modify
**Why:** `pricing/schema.ts` (M5) needs `materialLineSchema`/
`laborLineSchema`/`determinedOr` through the door (Constitution
Principle I) — none were previously exported. Revised (M11): `format.ts`
(M10) imports `type ExtentUnit` from this same door, but only the
`EXTENT_UNIT` const (not the type) was exported — a `tsc --noEmit` run
against the fully-applied patch caught the compile error this caused.
**Impact:** New door exports; no behavior change.

```diff
--- a/src/features/estimate-extraction-pipeline/classification/index.ts
+++ b/src/features/estimate-extraction-pipeline/classification/index.ts
@@ -11,9 +11,15 @@
   TRADE,
   EXTENT_UNIT,
   billableLineSchema,
+  materialLineSchema,
+  laborLineSchema,
   webSearchFlagSchema,
+  determinedOr,
   type BillableLine,
+  type MaterialLine,
+  type LaborLine,
   type Trade,
+  type ExtentUnit,
   type WebSearchFlag,
 } from './schema';
 export { classificationFanoutWorkflow } from './workflow';
```

#### Reasoning
- Verified via `make-diff.sh modify`.
- Found while tracing what M5 actually needs to import — the original
  plan only anticipated re-exporting `determinedOr`.
- The `type ExtentUnit` addition was found by actually compiling the
  fully-patched tree (`tsc --noEmit`, M11), not by re-reading files —
  a real gap the diff-verification-only Review Gate could not have
  caught on its own.

### `src/features/estimate-extraction-pipeline/classification/agents.ts`
**Action:** Modify
**Why:** FR-001 — remove the three `pageHint` prompt mentions. Revised
(this pass): also fixes finding #22 — `laborAgent`'s own prompt still
instructed "hours in quarter-hour increments (0.25, 0.5, 0.75, 1.0,
...)", the exact same unverified assumption FR-018 already removes at
the schema level (finding #13 — pattern-matched from mock sample data,
never an actual product requirement). Removing the schema constraint
while leaving the prompt instruction in place would have left the
assumption fully intact, just relocated somewhere a schema-only grep
would never find it.
**Impact:** Prompt text only — no schema, agent composition, or
structured-output contract change. The agent may now return any real
positive hour count, matching what `laborLineSchema.quantity`
(`classification/schema.ts`, FR-018) actually accepts.

```diff
--- a/src/features/estimate-extraction-pipeline/classification/agents.ts
+++ b/src/features/estimate-extraction-pipeline/classification/agents.ts
@@ -23,11 +23,11 @@
 
 INPUT
 You receive one finding (action, scope, location, statedQuantity,
-inspectorHours, sourceQuote, pageHint) plus a document excerpt: the text
-of the source report's page(s) surrounding where this finding's
-sourceQuote appears. Use the excerpt only to ground details about THIS
-finding — never borrow a fact that only supports a different finding
-elsewhere on the same page.
+inspectorHours, sourceQuote) plus a document excerpt: the text of the
+source report's page(s) surrounding where this finding's sourceQuote
+appears. Use the excerpt only to ground details about THIS finding —
+never borrow a fact that only supports a different finding elsewhere on
+the same page.
 
 DEFINITION
 A "material" is a physical, purchasable part or component the repair
@@ -94,13 +94,13 @@
 
 INPUT
 You receive one finding (action, scope, location, statedQuantity,
-inspectorHours, sourceQuote, pageHint), a document excerpt (the source
-report's page(s) surrounding this finding), and — WHEN AVAILABLE — the
-materials already determined for this same finding. The materials
-context is informational only: if it is absent or empty, that is a
-completely normal labor-only finding, not a degraded or partial case.
-Never treat a missing/empty materials list as a reason to lower quality
-or invent a placeholder.
+inspectorHours, sourceQuote), a document excerpt (the source report's
+page(s) surrounding this finding), and — WHEN AVAILABLE — the materials
+already determined for this same finding. The materials context is
+informational only: if it is absent or empty, that is a completely
+normal labor-only finding, not a degraded or partial case. Never treat a
+missing/empty materials list as a reason to lower quality or invent a
+placeholder.
 
 FOR THE LABOR YOU DETERMINE
 - laborType: a short, specific description (e.g. "siding repair labor",
@@ -108,14 +108,14 @@
   ALWAYS a real, specific string — even when hours cannot be determined,
   you must still describe what kind of labor this is; never omit
   laborType.
-- hours: a real number in quarter-hour increments (0.25, 0.5, 0.75, 1.0,
-  ...), grounded either in the finding's own inspectorHours (if the
-  inspector explicitly stated one) or a reasonable, explicitly-cited
-  basis from the document excerpt. If neither the finding nor the
-  excerpt gives a real basis for an hour count, return a flagged hours
-  value instead of guessing: { "status": "flagged_for_web_search",
-  "reason": "<specific reason>" } — a short, specific reason, nothing
-  else on that object.
+- hours: a real positive number of hours, grounded either in the
+  finding's own inspectorHours (if the inspector explicitly stated one)
+  or a reasonable, explicitly-cited basis from the document excerpt. No
+  required rounding — use whatever real number the grounding actually
+  supports. If neither the finding nor the excerpt gives a real basis
+  for an hour count, return a flagged hours value instead of guessing:
+  { "status": "flagged_for_web_search", "reason": "<specific reason>" }
+  — a short, specific reason, nothing else on that object.
 - hoursSource: when hours is determined, name exactly where the number
   came from (e.g. "inspectorHours states 1.5", "p. 9 estimates a
   half-day for this scope") — never a vague label like "estimated".
@@ -162,10 +162,10 @@
 already determined for it.
 
 INPUT
-You receive one finding (action, scope, location, sourceQuote,
-pageHint), a document excerpt, and the materials and labor already
-determined for this same finding (materials may be an empty array — a
-labor-only finding is normal).
+You receive one finding (action, scope, location, sourceQuote), a
+document excerpt, and the materials and labor already determined for
+this same finding (materials may be an empty array — a labor-only
+finding is normal).
 
 VALID TRADES (choose exactly one, or flag — see below)
 electrical, plumbing, hvac, fire_protection, roofing, siding, carpentry,
```

#### Reasoning
- Verified via `make-diff.sh modify`.
- Found by reading this file fresh against both Governing Rules during a
  final pre-implementation review, not by re-trusting the "Prompt text
  only" characterization this same entry carried from the very first
  scaffold pass — that characterization was true for the `pageHint`
  removal, but incomplete once FR-018 changed what the schema actually
  requires.

### `src/features/estimate-extraction-pipeline/classification/finding-workflow.ts`
**Action:** Modify
**Why:** FR-002 (replace `excerptNearPageHint`), FR-006 (reference
shared determination shapes).
**Impact:** `excerptNearPageHint()` deleted, replaced with
`formatDocumentContext()`; all four call sites updated;
`materialsStepOutputSchema`/`laborStepOutputSchema` reference the new
exported value schemas; `combineResultStep`'s materials/labor
construction updated for the new nested `amountSource`/`hoursSource`
location; catch-block fallback no longer includes `pageHint` or the
now-unnecessary `.slice(0, 300)` truncation (the bound it protected
against no longer exists).

```diff
--- a/src/features/estimate-extraction-pipeline/classification/finding-workflow.ts
+++ b/src/features/estimate-extraction-pipeline/classification/finding-workflow.ts
@@ -9,6 +9,8 @@
   determinedOr,
   agentUndeterminedSchema,
   classificationResultSchema,
+  materialQuantityValueSchema,
+  laborHoursValueSchema,
 } from './schema';
 import { createModuleLogger } from '../shared/logger';
 
@@ -21,21 +23,17 @@
 });
 
 /**
- * The surrounding parsed-document text near a finding's own `pageHint`
- * — the current page plus one page of context on each side (spec.md
- * FR-007). Bounded, not the whole document, so three agent calls per
- * finding stay tractable; falls back to `''` when `pageHint` is absent
- * or unparseable, since there is no anchor to build a window around.
+ * The full parsed document, formatted for an agent prompt — mirrors
+ * `extraction/steps.ts`'s existing `buildExtractionPrompt()` exactly,
+ * the only document-context mechanism already proven working in this
+ * codebase (specs/007-pipeline-schema-cleanup FR-002, research.md R3).
+ * Replaces the removed page-citation-anchored windowing this feature
+ * deletes (FR-001/FR-002).
  */
-function excerptNearPageHint(parsedDocument: ParsedDocument, pageHint: string | null): string {
-  if (pageHint === null) return '';
-  const match = /^p\.\s*(\d+)$/.exec(pageHint);
-  if (!match) return '';
-  const pageNumber = Number(match[1]);
-  const nearby = parsedDocument.pages.filter(
-    (page) => Math.abs(page.pageNumber - pageNumber) <= 1,
-  );
-  return nearby.map((page) => `[p. ${page.pageNumber}]\n${page.content}`).join('\n\n');
+function formatDocumentContext(parsedDocument: ParsedDocument): string {
+  return parsedDocument.pages
+    .map((page) => `[p. ${page.pageNumber}]\n${page.content}`)
+    .join('\n\n');
 }
 
 function describeFinding(finding: ExtractedFinding): string {
@@ -45,8 +43,7 @@
     `location: ${finding.location}\n` +
     `statedQuantity: ${finding.statedQuantity ?? 'not stated'}\n` +
     `inspectorHours: ${finding.inspectorHours ?? 'not stated'}\n` +
-    `sourceQuote: ${JSON.stringify(finding.sourceQuote)}\n` +
-    `pageHint: ${finding.pageHint ?? 'not stated'}`
+    `sourceQuote: ${JSON.stringify(finding.sourceQuote)}`
   );
 }
 
@@ -58,16 +55,15 @@
  * asked to reproduce the finding, document excerpt, or partial findings
  * it was given (specs/004-fix-classification-output). `combineResultStep`
  * below upgrades a flagged value into the full shape after the fact.
+ * The determined-value schemas (`materialQuantityValueSchema`,
+ * `laborHoursValueSchema`) are imported from `./schema` rather than
+ * retyped here (specs/007-pipeline-schema-cleanup FR-006).
  */
 const materialsStepOutputSchema = z.object({
   materials: z.array(
     z.object({
       material: z.string().min(1),
-      quantity: determinedOr(
-        z.object({ amount: z.number().positive(), unit: z.enum(EXTENT_UNIT) }),
-        agentUndeterminedSchema,
-      ),
-      amountSource: z.string().min(1).optional(),
+      quantity: determinedOr(materialQuantityValueSchema, agentUndeterminedSchema),
     }),
   ),
 });
@@ -75,8 +71,7 @@
 const laborStepOutputSchema = z.object({
   labor: z.object({
     laborType: z.string().min(1),
-    hours: determinedOr(z.number().multipleOf(0.25).min(0.25), agentUndeterminedSchema),
-    hoursSource: z.string().min(1).optional(),
+    hours: determinedOr(laborHoursValueSchema, agentUndeterminedSchema),
   }),
 });
 
@@ -120,7 +115,7 @@
   outputSchema: classificationResultSchema,
   execute: async ({ inputData, getInitData, getStepResult }) => {
     const { finding, parsedDocument } = getInitData<z.infer<typeof findingWithDocumentSchema>>();
-    const documentExcerpt = excerptNearPageHint(parsedDocument, finding.pageHint);
+    const documentExcerpt = formatDocumentContext(parsedDocument);
     const { materials: rawMaterials } = getStepResult(materialsAgentStep);
     const { labor: rawLabor } = getStepResult(laborAgentStep);
 
@@ -143,7 +138,7 @@
     } = {};
     if (determinedMaterials.length > 0) partialFindingsValue.materials = determinedMaterials;
     if (rawLabor.hours.status === 'determined') {
-      partialFindingsValue.labor = { laborType: rawLabor.laborType, hours: rawLabor.hours.value };
+      partialFindingsValue.labor = { laborType: rawLabor.laborType, hours: rawLabor.hours.value.amount };
     }
 
     const toFullFlag = (agentFlag: { status: 'flagged_for_web_search'; reason: string }) => ({
@@ -154,13 +149,13 @@
 
     const materials = rawMaterials.map((m) =>
       m.quantity.status === 'determined'
-        ? { material: m.material, quantity: m.quantity, amountSource: m.amountSource }
+        ? { material: m.material, quantity: m.quantity }
         : { material: m.material, quantity: toFullFlag(m.quantity) },
     );
 
     const labor =
       rawLabor.hours.status === 'determined'
-        ? { laborType: rawLabor.laborType, hours: rawLabor.hours, hoursSource: rawLabor.hoursSource }
+        ? { laborType: rawLabor.laborType, hours: rawLabor.hours }
         : { laborType: rawLabor.laborType, hours: toFullFlag(rawLabor.hours) };
 
     const trade = inputData.trade.status === 'determined' ? inputData.trade : toFullFlag(inputData.trade);
@@ -171,7 +166,6 @@
       scope: finding.scope,
       location: finding.location,
       sourceQuote: finding.sourceQuote,
-      pageHint: finding.pageHint,
       materials,
       labor,
       trade,
@@ -191,10 +185,10 @@
  * `.then()` — matching `pipeline.ts`'s own established "prompt right
  * before an agent step via a bare `.map()`" pattern exactly, rather than
  * a named step). Each `.map()` between agent steps builds that step's
- * own prompt from `getInitData()` (the finding + its surrounding
- * document excerpt, research.md R2) and, for labor/trade, the earlier
- * steps' own results via `getStepResult()` (research.md R5) — offered as
- * optional context only, never a hard dependency (spec.md FR-005/FR-006).
+ * own prompt from `getInitData()` (the finding + the full parsed
+ * document, research.md R3) and, for labor/trade, the earlier steps' own
+ * results via `getStepResult()` (research.md R5) — offered as optional
+ * context only, never a hard dependency (spec.md FR-005/FR-006).
  * NOT registered on the top-level `Mastra` instance and not exported
  * outside this file — `findingClassificationStep` below is the one thing
  * `workflow.ts` composes.
@@ -205,18 +199,18 @@
   outputSchema: classificationResultSchema,
 })
   .map(async ({ inputData }) => {
-    const excerpt = excerptNearPageHint(inputData.parsedDocument, inputData.finding.pageHint);
+    const excerpt = formatDocumentContext(inputData.parsedDocument);
     return {
       prompt:
         "Determine this finding's material(s), if any.\n\n" +
         `FINDING\n${describeFinding(inputData.finding)}\n\n` +
-        `DOCUMENT EXCERPT NEAR THIS FINDING\n${excerpt || '(no page hint available)'}`,
+        `DOCUMENT EXCERPT NEAR THIS FINDING\n${excerpt}`,
     };
   })
   .then(materialsAgentStep)
   .map(async ({ getInitData, getStepResult }) => {
     const { finding, parsedDocument } = getInitData<z.infer<typeof findingWithDocumentSchema>>();
-    const excerpt = excerptNearPageHint(parsedDocument, finding.pageHint);
+    const excerpt = formatDocumentContext(parsedDocument);
     const { materials } = getStepResult(materialsAgentStep);
     const materialsContext =
       materials.length > 0
@@ -234,19 +228,19 @@
         `FINDING\n${describeFinding(finding)}\n\n` +
         'MATERIALS ALREADY DETERMINED FOR THIS FINDING (context only, may be empty ' +
         `— that is normal, not a degraded input)\n${materialsContext}\n\n` +
-        `DOCUMENT EXCERPT NEAR THIS FINDING\n${excerpt || '(no page hint available)'}`,
+        `DOCUMENT EXCERPT NEAR THIS FINDING\n${excerpt}`,
     };
   })
   .then(laborAgentStep)
   .map(async ({ getInitData, getStepResult }) => {
     const { finding, parsedDocument } = getInitData<z.infer<typeof findingWithDocumentSchema>>();
-    const excerpt = excerptNearPageHint(parsedDocument, finding.pageHint);
+    const excerpt = formatDocumentContext(parsedDocument);
     const { materials } = getStepResult(materialsAgentStep);
     const { labor } = getStepResult(laborAgentStep);
     const materialsContext = materials.length > 0 ? materials.map((m) => m.material).join(', ') : '(none)';
     const laborContext =
       labor.hours.status === 'determined'
-        ? `${labor.laborType} (${labor.hours.value} hours)`
+        ? `${labor.laborType} (${labor.hours.value.amount} hours)`
         : `${labor.laborType} (hours undetermined)`;
     return {
       prompt:
@@ -254,7 +248,7 @@
         `FINDING\n${describeFinding(finding)}\n\n` +
         `MATERIALS: ${materialsContext}\n` +
         `LABOR: ${laborContext}\n\n` +
-        `DOCUMENT EXCERPT NEAR THIS FINDING\n${excerpt || '(no page hint available)'}`,
+        `DOCUMENT EXCERPT NEAR THIS FINDING\n${excerpt}`,
     };
   })
   .then(tradeAgentStep)
@@ -280,7 +274,9 @@
  * was considered as an alternative, narrower-scoped mechanism but is not
  * available on the bare `createStep(agent, {...})` composition form
  * these three steps use (research.md R3), so this wrapper's job and
- * scope are exactly what they already were in feature 003.
+ * scope are exactly what they already were in feature 003. Confirmed
+ * this session (specs/007-pipeline-schema-cleanup research.md R8) as a
+ * legitimate, documented Mastra idiom, not a defect — untouched here.
  */
 export const findingClassificationStep = createStep({
   id: 'classify-finding',
@@ -301,13 +297,8 @@
         findingId: finding.id,
         error: errorMessage,
       });
-      // Bounded to stay within webSearchFlagSchema's own `reason` limit
-      // (max 300) — an unbounded error message (e.g. a verbose Zod
-      // validation error) must never cause THIS fallback path to fail
-      // its own schema validation; that would defeat the one thing this
-      // catch block exists to guarantee.
-      const reason = `classification failed: ${errorMessage}`.slice(0, 300);
-      const documentExcerpt = excerptNearPageHint(parsedDocument, finding.pageHint);
+      const reason = `classification failed: ${errorMessage}`;
+      const documentExcerpt = formatDocumentContext(parsedDocument);
       const flag = {
         status: 'flagged_for_web_search' as const,
         reason,
@@ -319,7 +310,6 @@
         scope: finding.scope,
         location: finding.location,
         sourceQuote: finding.sourceQuote,
-        pageHint: finding.pageHint,
         materials: [],
         labor: { laborType: 'unavailable — classification step failed', hours: flag },
         trade: flag,
```

#### Reasoning
- Verified via `make-diff.sh modify`; 229-line diff, `git apply --check` passed.
- The `.slice(0, 300)` removal is a direct, necessary consequence of
  `webSearchFlagSchema.reason` losing its `.max(300)` bound (M2) — kept
  would be dead defensive code protecting against a constraint that no
  longer exists.
- Also removed the now-stale `EXTENT_UNIT`/`agentUndeterminedSchema`
  duplication in the two step-output schemas' own field lists, per FR-006.

### `src/features/estimate-extraction-pipeline/classification/flatten.ts`
**Action:** Modify
**Why:** FR-005 — remove the hand-written throws; FR-004's schema change
already makes them structurally unreachable.
**Impact:** Field access paths change to the new nested location.

```diff
--- a/src/features/estimate-extraction-pipeline/classification/flatten.ts
+++ b/src/features/estimate-extraction-pipeline/classification/flatten.ts
@@ -49,6 +49,13 @@
  *    `'labor-all-in-hourly'` — the same rule `pricing/price-line.ts`'s
  *    prompt already relies on. Flagged hours are pushed to
  *    `flaggedForWebSearch` instead.
+ *
+ * `amountSource`/`hoursSource` are read from inside each determined
+ * branch's own value (`material.quantity.value.amountSource`,
+ * `result.labor.hours.value.hoursSource`) — no longer dangling optional
+ * siblings, so no runtime guard is needed to enforce their presence; the
+ * schema itself makes "determined but sourceless" unrepresentable
+ * (specs/007-pipeline-schema-cleanup FR-004/FR-005).
  */
 function flattenOneResult(result: ClassificationResult): {
   lines: z.infer<typeof billableLineSchema>[];
@@ -69,11 +76,6 @@
       flagged.push(material.quantity);
       return;
     }
-    if (material.amountSource === undefined) {
-      throw new Error(
-        `material "${material.material}" has a determined quantity but no amountSource`,
-      );
-    }
     materialLines.push({
       id: buildLineId(result.findingId, 'material', index),
       trade,
@@ -81,11 +83,10 @@
       scope: result.scope,
       location: result.location,
       sourceQuote: result.sourceQuote,
-      pageHint: result.pageHint,
       material: material.material,
       quantity: material.quantity.value.amount,
       unit: material.quantity.value.unit,
-      amountSource: material.amountSource,
+      amountSource: material.quantity.value.amountSource,
       costType: 'material',
       pricingBasis: 'material-part-only',
     });
@@ -95,9 +96,6 @@
   if (result.labor.hours.status !== 'determined') {
     flagged.push(result.labor.hours);
   } else {
-    if (result.labor.hoursSource === undefined) {
-      throw new Error('labor has determined hours but no hoursSource');
-    }
     lines.push({
       id: buildLineId(result.findingId, 'labor'),
       trade,
@@ -105,11 +103,10 @@
       scope: result.scope,
       location: result.location,
       sourceQuote: result.sourceQuote,
-      pageHint: result.pageHint,
       laborType: result.labor.laborType,
-      quantity: result.labor.hours.value,
+      quantity: result.labor.hours.value.amount,
       unit: 'hrs',
-      hoursSource: result.labor.hoursSource,
+      hoursSource: result.labor.hours.value.hoursSource,
       costType: 'labor',
       pricingBasis: materialLines.length > 0 ? 'labor-install-hourly' : 'labor-all-in-hourly',
     });
```

#### Reasoning
- Verified via `make-diff.sh modify`.

### `src/features/estimate-extraction-pipeline/pricing/schema.ts`
**Action:** Modify
**Why:** FR-009, FR-011 (schema definition), FR-017, FR-019. Revised
(M11): `priceAmount()` added here — the shared price-narrowing helper
`items-section.tsx` and the eval pricing scorer both need, once a full
`tsc --noEmit` run against the applied patch surfaced the eval scorer's
own `PricedLineItem` breakage as a second, real consumer of that exact
logic.
**Impact:** `xorUnavailable`/its two call sites deleted;
`materialPriceResponseSchema`/`laborPriceResponseSchema` restructured;
`pricedLineItemSchema` deleted, replaced by `pricedLineSchema` (a merged
`BillableLine` + `price`); `priceAmount()` exported as this module's one
definition of "get the determined price amount, or null."

```diff
--- a/src/features/estimate-extraction-pipeline/pricing/schema.ts
+++ b/src/features/estimate-extraction-pipeline/pricing/schema.ts
@@ -1,61 +1,92 @@
 import { z } from 'zod';
+import { materialLineSchema, laborLineSchema, determinedOr } from '../classification';
 
+/**
+ * The determined branch's own shared evidence fields — spread once into
+ * each response schema's determined value, not retyped independently
+ * (specs/007-pipeline-schema-cleanup FR-009). `unavailableReason` is no
+ * longer part of this set — the unavailable case is now its own flag
+ * branch (`priceFlagSchema` below), not a nullable sibling field.
+ */
 const priceEvidenceFields = {
   currency: z.literal('USD'),
   confidence: z.enum(['high', 'medium', 'low']),
-  source: z.string().min(1).max(120),
-  unavailableReason: z.string().min(1).max(280).nullable(),
+  source: z.string().min(1),
 } as const;
 
-function xorUnavailable(
-  priced: number | null,
-  unavailableReason: string | null,
-  ctx: z.RefinementCtx,
-): void {
-  if (priced === null && unavailableReason === null) {
-    ctx.addIssue({
-      code: 'custom',
-      path: ['unavailableReason'],
-      message: 'unavailableReason is required when no price is returned',
-    });
-  }
-  if (priced !== null && unavailableReason !== null) {
-    ctx.addIssue({
-      code: 'custom',
-      path: ['unavailableReason'],
-      message: 'unavailableReason must be null when a price is returned',
-    });
-  }
-}
+/**
+ * The minimal "couldn't price this" flag branch, mirroring
+ * `classification/schema.ts`'s own `agentUndeterminedSchema` shape.
+ * Reusing `determinedOr()` (already proven in production by three
+ * classification agents) makes "priced XOR unavailable-with-reason"
+ * structurally impossible to violate — no hand-written `superRefine`
+ * check needed (specs/007-pipeline-schema-cleanup FR-017; a
+ * discriminated union with an explicit literal tag is NOT the same
+ * fragile pattern as an untagged `z.union([...])` — see research.md R2).
+ */
+const priceFlagSchema = z.object({
+  status: z.literal('unavailable'),
+  reason: z.string().min(1),
+});
 
 /** Response for a MATERIAL line: price of the part per physical unit. */
-export const materialPriceResponseSchema = z
-  .object({
-    unitPrice: z.number().int().min(0).nullable(),
-    ...priceEvidenceFields,
-  })
-  .superRefine((r, ctx) => xorUnavailable(r.unitPrice, r.unavailableReason, ctx));
+export const materialPriceResponseSchema = z.object({
+  price: determinedOr(
+    z.object({ unitPrice: z.number().int().min(0), ...priceEvidenceFields }),
+    priceFlagSchema,
+  ),
+});
 
 export type MaterialPriceResponse = z.infer<typeof materialPriceResponseSchema>;
 
 /** Response for a LABOR line: an HOURLY RATE. Hours are classification's job now — every line pricing receives already has a real, resolved hour count. */
-export const laborPriceResponseSchema = z
-  .object({
-    hourlyRate: z.number().int().min(0).nullable(),
-    ...priceEvidenceFields,
-  })
-  .superRefine((r, ctx) => xorUnavailable(r.hourlyRate, r.unavailableReason, ctx));
+export const laborPriceResponseSchema = z.object({
+  price: determinedOr(
+    z.object({ hourlyRate: z.number().int().min(0), ...priceEvidenceFields }),
+    priceFlagSchema,
+  ),
+});
 
 export type LaborPriceResponse = z.infer<typeof laborPriceResponseSchema>;
 
-/** Pricing's module output per line — the persisted price record. */
-export const pricedLineItemSchema = z.object({
-  itemId: z.string().min(1),
-  unitPrice: z.number().int().min(0).nullable(),
-  currency: z.literal('USD'),
-  confidence: z.enum(['high', 'medium', 'low']),
-  source: z.string().min(1).max(120),
-  unavailableReason: z.string().min(1).max(280).nullable(),
+/**
+ * ONE priced billable line — a `BillableLine` merged with its own price,
+ * built by extending each branch (`materialLineSchema`/`laborLineSchema`,
+ * both real `ZodObject`s) individually and rebuilding the discriminated
+ * union. NOT `billableLineSchema.extend({ price })` directly —
+ * `billableLineSchema` is itself a `z.discriminatedUnion(...)`, which has
+ * no `.extend()` method (verified against the installed Zod package;
+ * see research.md R4). Replaces the separate `lines`/`prices` array
+ * split — the natural, paired shape already existed at
+ * `pricing/price-line.ts`'s own step output and no code path ever needed
+ * the two arrays independently recomputable
+ * (specs/007-pipeline-schema-cleanup FR-011).
+ */
+const pricedMaterialLineSchema = materialLineSchema.extend({
+  price: materialPriceResponseSchema.shape.price,
 });
+const pricedLaborLineSchema = laborLineSchema.extend({
+  price: laborPriceResponseSchema.shape.price,
+});
+export const pricedLineSchema = z.discriminatedUnion('costType', [
+  pricedMaterialLineSchema,
+  pricedLaborLineSchema,
+]);
 
-export type PricedLineItem = z.infer<typeof pricedLineItemSchema>;
+export type PricedLine = z.infer<typeof pricedLineSchema>;
+
+/**
+ * The determined price amount for one line, or `null` when unavailable —
+ * the one place any consumer narrows `PricedLine.price`'s `determinedOr()`
+ * union (reading its own `status` tag, the documented, unavoidable way to
+ * consume a discriminated union — spec.md's Governing Rule). Exported here
+ * so `items-section.tsx` and the eval pricing scorer share one definition
+ * instead of two independently-maintained copies of the same
+ * material/labor branch check (specs/007-pipeline-schema-cleanup, found
+ * once the eval scorer's own `PricedLineItem` breakage surfaced the same
+ * need in a second consumer).
+ */
+export function priceAmount(line: PricedLine): number | null {
+  if (line.price.status !== 'determined') return null;
+  return line.costType === 'material' ? line.price.value.unitPrice : line.price.value.hourlyRate;
+}
```

#### Reasoning
- Verified via `make-diff.sh modify`; `git apply --check` passed.
- `pricedLineItemSchema` is fully deleted here, NOT kept for legacy use —
  the legacy v2 envelope schema needs its own local copy instead (see
  `estimate/lib/envelope.ts` below); this was a real gap caught during
  this pass (see §14 Risks and Decisions history).
- `priceAmount()` was added here, not in `items-section.tsx` where it
  first appeared, once the eval scorer needed the identical logic — one
  definition, per User Story 2, not two.

### `src/features/estimate-extraction-pipeline/pricing/agent.ts`
**Action:** Modify
**Why:** FR-017a — the prompt described the old flat shape.
**Impact:** Prompt text only.

```diff
--- a/src/features/estimate-extraction-pipeline/pricing/agent.ts
+++ b/src/features/estimate-extraction-pipeline/pricing/agent.ts
@@ -4,7 +4,8 @@
 /**
  * The pricer has exactly one job: given ONE billable line and a zip code,
  * return a single defensible price — a per-unit material price, or an
- * hourly labor rate — or null. It never hallucinates a price.
+ * hourly labor rate — or an explicit "unavailable" flag. It never
+ * hallucinates a price.
  *
  * Internal to the pricing module — only pricing/price-line.ts calls
  * `.generate()` on this.
@@ -25,17 +26,20 @@
 given differs by costType — match it exactly.
 
 OUTPUT
-MATERIAL lines: unitPrice (integer whole USD, or null), currency, confidence,
-source, unavailableReason.
-LABOR lines: hourlyRate (integer whole USD/hr, or null), currency,
-confidence, source, unavailableReason.
+Return a determined price when you have a defensible number:
+{ "status": "determined", "value": { "unitPrice": <int>, "currency": "USD",
+"confidence": "<high|medium|low>", "source": "<label>" } } (MATERIAL lines;
+LABOR lines use "hourlyRate" in place of "unitPrice").
+If you lack a defensible number, return instead:
+{ "status": "unavailable", "reason": "<one-sentence reason>" }
 
 HARD RULES
 1. NEVER hallucinate a price. If you lack a defensible number for this work
-   in this zip code, return null with a one-sentence unavailableReason.
+   in this zip code, return the unavailable shape with a one-sentence
+   reason.
 2. NEVER invent a citation. "source" is a coarse label ("national average",
    "trade rule-of-thumb"), never a URL.
-3. NEVER produce a range. Pick a single integer or null.
+3. NEVER produce a range. Pick a single integer, or the unavailable shape.
 4. Local area means the SUPPLIED zip code. A national average is acceptable
    with confidence = "low" and that noted in source.
 5. MATERIAL lines ("material-part-only"): unitPrice is the price of the part
```

#### Reasoning
- Verified via `make-diff.sh modify`.

### `src/features/estimate-extraction-pipeline/pricing/price-line.ts`
**Action:** Modify
**Why:** FR-011 (emit merged shape). FR-016's resilience mechanism
(catch, degrade, never throw) is explicitly UNCHANGED.
**Impact:** Success path simplifies to a direct pass-through of the
agent's own `price` field; catch-block fallback returns the new
`{status: 'unavailable', reason}` shape.

```diff
--- a/src/features/estimate-extraction-pipeline/pricing/price-line.ts
+++ b/src/features/estimate-extraction-pipeline/pricing/price-line.ts
@@ -6,7 +6,7 @@
 import {
   laborPriceResponseSchema,
   materialPriceResponseSchema,
-  pricedLineItemSchema,
+  pricedLineSchema,
 } from './schema';
 import { createModuleLogger } from '../shared/logger';
 
@@ -17,11 +17,18 @@
  * Price ONE billable line. Internal step — `pricing/workflow.ts` is the
  * only thing that runs this, via `.foreach`.
  *
- * Resilience: a per-line failure records a 'lookup-failed' price rather
+ * Resilience: a per-line failure records an 'unavailable' price rather
  * than throwing, so one bad line never fails the whole `.foreach` batch.
- * The line itself passes through completely unchanged in both the
- * success and failure paths — classification already gave it a real,
- * resolved quantity/hours; pricing only ever adds a price alongside it.
+ * This mechanism is UNCHANGED by specs/007-pipeline-schema-cleanup
+ * (FR-016; verified against Mastra's own docs, research.md R8, as a
+ * legitimate idiom, not a defect) — only the DATA SHAPE this step
+ * constructs changes, because `pricedLineSchema` itself changed
+ * (FR-011/FR-017): the success path now passes the agent's own
+ * `result.object.price` straight through (both sides are the exact same
+ * `determinedOr()` union), rather than reconstructing a flat object
+ * field-by-field, and the catch-block fallback now returns
+ * `{ status: 'unavailable', reason }` instead of the old flat
+ * `{ unitPrice: null, ... }` shape.
  *
  * This step runs inside `pricingFanoutWorkflow`, which is deliberately
  * NEVER registered on the top-level `Mastra` instance (pricing's fan-out
@@ -40,10 +47,7 @@
     zipCode: z.string(),
     line: billableLineSchema,
   }),
-  outputSchema: z.object({
-    line: billableLineSchema,
-    price: pricedLineItemSchema,
-  }),
+  outputSchema: pricedLineSchema,
   execute: async ({ inputData }) => {
     const { line, zipCode, estimateRequestId } = inputData;
 
@@ -74,17 +78,7 @@
         );
         const m = result.object;
         if (!m) throw new Error('pricer returned no structured object');
-        return {
-          line,
-          price: {
-            itemId: line.id,
-            unitPrice: m.unitPrice,
-            currency: m.currency,
-            confidence: m.confidence,
-            source: m.source,
-            unavailableReason: m.unavailableReason,
-          },
-        };
+        return { ...line, price: m.price };
       }
 
       const result = await itemPricerAgent.generate(
@@ -93,17 +87,7 @@
       );
       const l = result.object;
       if (!l) throw new Error('pricer returned no structured object');
-      return {
-        line,
-        price: {
-          itemId: line.id,
-          unitPrice: l.hourlyRate,
-          currency: l.currency,
-          confidence: l.confidence,
-          source: l.source,
-          unavailableReason: l.unavailableReason,
-        },
-      };
+      return { ...line, price: l.price };
     } catch (e) {
       log.warn('[price-line] per-line failure', {
         estimateRequestId,
@@ -111,14 +95,10 @@
         error: e instanceof Error ? e.message : String(e),
       });
       return {
-        line,
+        ...line,
         price: {
-          itemId: line.id,
-          unitPrice: null,
-          currency: 'USD' as const,
-          confidence: 'low' as const,
-          source: 'lookup-failed',
-          unavailableReason: 'Pricing lookup failed; needs contractor quote.',
+          status: 'unavailable' as const,
+          reason: 'Pricing lookup failed; needs contractor quote.',
         },
       };
     }
```

#### Reasoning
- Verified via `make-diff.sh modify`; 102-line diff, `git apply --check` passed.
- FR-016 explicitly does not forbid this — the try/catch structural
  pattern (mechanism) is identical; only its constructed values (shape)
  change, because the type they must satisfy changed.

### `src/features/estimate-extraction-pipeline/pricing/workflow.ts`
**Action:** Modify
**Why:** FR-011 — its own declared `outputSchema` is built directly on
`priceLineStep`'s output type, which changed above.
**Impact:** Was NOT in the original plan/tasks.md scope — found during
this whiteboard pass by tracing `priceLineStep`'s output type outward to
every consumer.

```diff
--- a/src/features/estimate-extraction-pipeline/pricing/workflow.ts
+++ b/src/features/estimate-extraction-pipeline/pricing/workflow.ts
@@ -1,7 +1,7 @@
 import { createWorkflow } from '@mastra/core/workflows';
 import { z } from 'zod';
 import { billableLineSchema } from '../classification';
-import { pricedLineItemSchema } from './schema';
+import { pricedLineSchema } from './schema';
 import { priceLineStep } from './price-line';
 
 /** How many pricer calls run concurrently. An internal throughput knob. */
@@ -9,7 +9,13 @@
 
 /**
  * Internal fan-out workflow: prices every line concurrently. NOT exported
- * outside this folder — pricing/index.ts is the only caller.
+ * outside this folder — pricing/index.ts is the only caller. Output
+ * shape matches `priceLineStep`'s own merged `pricedLineSchema` output
+ * directly, not the old `{ line, price }` pair
+ * (specs/007-pipeline-schema-cleanup FR-011 — caught during whiteboard
+ * review as a file missing from the original plan's scope, since this
+ * workflow's own declared `outputSchema` is built directly on
+ * `priceLineStep`'s output type).
  */
 export const pricingFanoutWorkflow = createWorkflow({
   id: 'pricing-fanout',
@@ -18,9 +24,7 @@
     zipCode: z.string(),
     lines: z.array(billableLineSchema),
   }),
-  outputSchema: z.array(
-    z.object({ line: billableLineSchema, price: pricedLineItemSchema }),
-  ),
+  outputSchema: z.array(pricedLineSchema),
 })
   .map(async ({ inputData }) =>
     inputData.lines.map((line) => ({
```

#### Reasoning
- Verified via `make-diff.sh modify`.
- Real gap in the original plan, corrected here rather than silently.

### `src/features/estimate-extraction-pipeline/pricing/index.ts`
**Action:** Modify
**Why:** FR-011 — `priceLines()`'s public return type. Revised (M11):
also re-exports `priceAmount` (moved to `pricing/schema.ts`) through the
door, since two consumers outside this module now need it.
**Impact:** Breaking change to the function signature; `pipeline.ts` (the
only pipeline caller) is updated in lockstep below. `eval/pipeline/run.ts`
and `eval/pipeline/scorers/pricing-match.ts` (outside `src/`, not
previously tracked in this plan's scope) are also broken by this same
signature/type change — added below (M11) once a full `tsc --noEmit`
run against the applied patch surfaced them.

```diff
--- a/src/features/estimate-extraction-pipeline/pricing/index.ts
+++ b/src/features/estimate-extraction-pipeline/pricing/index.ts
@@ -1,10 +1,10 @@
 import { type BillableLine } from '../classification';
-import { pricedLineItemSchema, type PricedLineItem } from './schema';
+import { pricedLineSchema, priceAmount, type PricedLine } from './schema';
 import { pricingFanoutWorkflow } from './workflow';
 import { itemPricerAgent } from './agent';
 
-export type { PricedLineItem };
-export { pricedLineItemSchema };
+export type { PricedLine };
+export { pricedLineSchema, priceAmount };
 /** Re-exported for Studio registration ONLY — no module calls this directly. */
 export { itemPricerAgent };
 
@@ -14,18 +14,17 @@
   lines: BillableLine[];
 }
 
-export interface PriceLinesOutput {
-  lines: BillableLine[];
-  prices: PricedLineItem[];
-}
-
 /**
  * THE PRICING API. Prices every pending line (concurrency is this module's
  * own concern — see workflow.ts). Per-line failures degrade gracefully
  * inside price-line.ts and never surface here as a throw; this function
- * throws only if the internal run cannot even start.
+ * throws only if the internal run cannot even start. Returns one array
+ * of merged priced lines, not a `{ lines, prices }` pair
+ * (specs/007-pipeline-schema-cleanup FR-011) — the pair already existed
+ * naturally at `price-line.ts`'s own step output; this function no
+ * longer unzips it into two parallel arrays.
  */
-export async function priceLines(input: PriceLinesInput): Promise<PriceLinesOutput> {
+export async function priceLines(input: PriceLinesInput): Promise<PricedLine[]> {
   const run = await pricingFanoutWorkflow.createRun();
   const result = await run.start({
     inputData: {
@@ -37,8 +36,5 @@
   if (result.status !== 'success') {
     throw new Error(`pricing-fanout workflow ended non-success: ${result.status}`);
   }
-  return {
-    lines: result.result.map((r) => r.line),
-    prices: result.result.map((r) => r.price),
-  };
+  return result.result;
 }
```

#### Reasoning
- Verified via `make-diff.sh modify`.
- `eval/` sits outside `src/` and outside every grep-based scope check
  this plan ran before now — it was only found by actually compiling the
  fully-applied patch, not by re-reading files already believed to be in
  scope (M11's whole reason for existing).

### `src/features/estimate-extraction-pipeline/pipeline.ts`
**Action:** Modify
**Why:** FR-011 — `priceStep`'s own `outputSchema` and execute body
destructure `priceLines()`'s old `{lines, prices}` return shape.
**Impact:** Was NOT in the original plan/tasks.md scope — found during
this whiteboard pass.

```diff
--- a/src/features/estimate-extraction-pipeline/pipeline.ts
+++ b/src/features/estimate-extraction-pipeline/pipeline.ts
@@ -2,7 +2,7 @@
 import { z } from 'zod';
 import { buildExtractionPrompt, findingExtractorAgentStep } from './extraction';
 import { classificationFanoutWorkflow, billableLineSchema, webSearchFlagSchema } from './classification';
-import { priceLines, pricedLineItemSchema } from './pricing';
+import { priceLines, pricedLineSchema } from './pricing';
 import { parsePdfFromUrl, parsedDocumentSchema } from './document';
 
 /**
@@ -63,19 +63,18 @@
     flaggedForWebSearch: z.array(webSearchFlagSchema),
   }),
   outputSchema: z.object({
-    lines: z.array(billableLineSchema),
-    prices: z.array(pricedLineItemSchema),
+    lines: z.array(pricedLineSchema),
     parsedDocument: parsedDocumentSchema,
     flaggedForWebSearch: z.array(webSearchFlagSchema),
   }),
   execute: async ({ inputData }) => {
-    const priced = await priceLines({
+    const lines = await priceLines({
       estimateRequestId: inputData.estimateRequestId,
       zipCode: inputData.zipCode,
       lines: inputData.lines,
     });
     return {
-      ...priced,
+      lines,
       parsedDocument: inputData.parsedDocument,
       flaggedForWebSearch: inputData.flaggedForWebSearch,
     };
```

#### Reasoning
- Verified via `make-diff.sh modify`.
- `billableLineSchema` stays imported (still used by `priceStep`'s
  `inputSchema` and the workflow's earlier steps) — only the
  `outputSchema`/execute body changed.

### `src/features/estimate/lib/workflow.ts`
**Action:** Modify
**Why:** FR-011 — the persisted envelope no longer has a separate
`prices` field.
**Impact:** Was NOT in the original plan/tasks.md scope — found during
this whiteboard pass.

```diff
--- a/src/features/estimate/lib/workflow.ts
+++ b/src/features/estimate/lib/workflow.ts
@@ -21,8 +21,10 @@
 /**
  * THE SINGLE WRITER of estimate-row state (responsibility #4). The AI
  * pipeline (`mastra.getWorkflow('summarize-estimate')`, i.e. `pipeline.ts`)
- * is pure — it returns `{ lines, prices }` or its run fails — and this
- * function owns the entire persistence lifecycle:
+ * is pure — it returns `{ lines, parsedDocument, flaggedForWebSearch }`
+ * (one merged `lines` array, not a separate `prices` array — see
+ * `pipeline.ts`'s own `priceStep`) or its run fails — and this function
+ * owns the entire persistence lifecycle:
  *
  *   processing → run the pipeline once → completed (v3 envelope)
  *                                      | failed   (classified message)
@@ -58,7 +60,6 @@
           kind: SUMMARY_ENVELOPE_KIND,
           version: SUMMARY_ENVELOPE_VERSION_3,
           lines: result.result.lines,
-          prices: result.result.prices,
           parsedDocument: result.result.parsedDocument,
           flaggedForWebSearch: result.result.flaggedForWebSearch,
         };
```

#### Reasoning
- Verified via `make-diff.sh modify`.

### `src/features/estimate/lib/envelope.ts`
**Action:** Modify
**Why:** FR-011/FR-012 (v3 merged shape, modified in place per the
resolved Clarification), plus FR-003 REVISED — explicit user direction
mid-planning to delete v1/v2 legacy support entirely rather than
accommodate it (superseding an earlier draft of this diff that added a
`legacyPricedLineItemSchema` to preserve v2 parsing).
**Impact:** `legacyBillableItemSchema`, `summaryEnvelopeV1Schema`,
`summaryEnvelopeV2Schema`, and `ParsedEnvelope`'s `'v1'`/`'v2'` variants
are deleted entirely. `summaryEnvelopeV3Schema.lines` is `PricedLine[]`,
no `prices` field. An estimate persisted under any prior shape (v1, v2,
or the old split-array v3) now falls through to `'unparseable'`.

```diff
--- a/src/features/estimate/lib/envelope.ts
+++ b/src/features/estimate/lib/envelope.ts
@@ -1,69 +1,41 @@
 import { z } from 'zod';
 import {
-  billableLineSchema,
   webSearchFlagSchema,
-  type BillableLine,
   type WebSearchFlag,
 } from '@/features/estimate-extraction-pipeline/classification';
-import { pricedLineItemSchema, type PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';
+import { pricedLineSchema, type PricedLine } from '@/features/estimate-extraction-pipeline/pricing';
 import {
   parsedDocumentSchema,
   type ParsedDocument,
 } from '@/features/estimate-extraction-pipeline/document';
 
-/**
- * LEGACY (v1/v2) flat item shape, kept ONLY so rows persisted before this
- * refactor keep parsing and rendering. The v3 pipeline never produces this
- * shape — `BillableLine` (imported above) is what it produces.
- */
-const LEGACY_UNIT = ['ea', 'lf', 'sf', 'sqft', 'cy', 'hrs'] as const;
-const LEGACY_COST_TYPE = ['labor', 'material'] as const;
-
-export const legacyBillableItemSchema = z.object({
-  id: z.string(),
-  trade: z.string(),
-  action: z.string(),
-  scope: z.string().min(1),
-  location: z.string().min(1),
-  quantity: z.number().int().min(1),
-  unit: z.enum(LEGACY_UNIT),
-  costType: z.enum(LEGACY_COST_TYPE),
-  sourceQuote: z.string().min(8).max(500),
-  pageHint: z
-    .string()
-    .regex(/^p\.\s*\d+$/)
-    .nullable(),
-});
-
-export type LegacyBillableItem = z.infer<typeof legacyBillableItemSchema>;
-
 export const SUMMARY_ENVELOPE_KIND = 'billable-extraction' as const;
 
-const summaryEnvelopeV1Schema = z.object({
-  kind: z.literal(SUMMARY_ENVELOPE_KIND),
-  version: z.literal(1),
-  items: z.array(legacyBillableItemSchema),
-});
-
-const summaryEnvelopeV2Schema = z.object({
-  kind: z.literal(SUMMARY_ENVELOPE_KIND),
-  version: z.literal(2),
-  items: z.array(legacyBillableItemSchema),
-  prices: z.array(pricedLineItemSchema),
-});
-
 export const SUMMARY_ENVELOPE_VERSION_3 = 3 as const;
 
 /**
- * v3: discriminated lines + prices. For a labor line, `unitPrice` on the
- * matching price is the HOURLY RATE; the report's quantity × unitPrice
- * arithmetic is hours × rate, per the v3 prototype.
+ * v3: one `lines` array, each entry a `PricedLine` (a `BillableLine`
+ * merged with its own price — FR-011). No separate `prices` array —
+ * the natural paired shape already existed at `pricing/price-line.ts`'s
+ * own step output; this schema stops splitting it apart. Modified in
+ * place (still version 3, no new version literal): an estimate persisted
+ * under the OLD split `lines`/`prices` v3 shape is explicitly NOT
+ * required to keep parsing — it falls through to `'unparseable'` and is
+ * recovered via the existing retry flow (resolved Clarification,
+ * specs/007-pipeline-schema-cleanup).
+ *
+ * v1/v2 legacy support (the flat pre-pricing and flat-with-prices
+ * shapes, and their own schemas) is deleted entirely — explicit user
+ * direction: legacy compatibility is itself unrequested complexity, not
+ * something to preserve or build rendering paths around (revised FR-003).
+ * An estimate persisted under the old v1/v2 shape now falls through to
+ * `'unparseable'`, the same recovery path already accepted for
+ * old-shape v3 rows.
  */
 export const summaryEnvelopeV3Schema = z.object({
   kind: z.literal(SUMMARY_ENVELOPE_KIND),
   version: z.literal(SUMMARY_ENVELOPE_VERSION_3),
-  lines: z.array(billableLineSchema),
-  prices: z.array(pricedLineItemSchema),
+  lines: z.array(pricedLineSchema),
   /**
    * `.default()`, not required — rows persisted before these fields
    * existed have no such keys at all. Without a default, every existing
@@ -90,22 +62,21 @@
  * hands this directly to <EstimateReport /> so the report component never
  * touches JSON or Zod.
  *
- * - 'v1': rows produced before the pricing branch landed. Items only.
- * - 'v2': legacy production shape. Items + prices, flat costType/unit.
- * - 'v3': current production shape. Discriminated material/labor lines +
- *   prices, per the v3 prototype's unit discipline.
+ * - 'v3': current production shape. One `lines` array of merged priced
+ *   lines, per specs/007-pipeline-schema-cleanup.
  * - 'unparseable': `summary` is a non-null string we couldn't parse as
- *   JSON, or it parsed but didn't match any known schema.
+ *   JSON, or it parsed but didn't match the v3 schema. Also what an
+ *   estimate persisted under the OLD (pre-cleanup) split-array v3 shape,
+ *   or under the now-deleted v1/v2 legacy shapes, falls through to —
+ *   recovered via the existing retry flow, not by preserving those old
+ *   shapes' parseability.
  * - 'absent': `summary` is null. The estimate has not produced a summary
  *   yet (or is still processing).
  */
 export type ParsedEnvelope =
-  | { kind: 'v1'; items: LegacyBillableItem[]; prices: [] }
-  | { kind: 'v2'; items: LegacyBillableItem[]; prices: PricedLineItem[] }
   | {
       kind: 'v3';
-      lines: BillableLine[];
-      prices: PricedLineItem[];
+      lines: PricedLine[];
       parsedDocument: ParsedDocument;
       flaggedForWebSearch: WebSearchFlag[];
     }
@@ -127,17 +98,10 @@
     return {
       kind: 'v3',
       lines: v3.data.lines,
-      prices: v3.data.prices,
       parsedDocument: v3.data.parsedDocument,
       flaggedForWebSearch: v3.data.flaggedForWebSearch,
     };
   }
 
-  const v2 = summaryEnvelopeV2Schema.safeParse(json);
-  if (v2.success) return { kind: 'v2', items: v2.data.items, prices: v2.data.prices };
-
-  const v1 = summaryEnvelopeV1Schema.safeParse(json);
-  if (v1.success) return { kind: 'v1', items: v1.data.items, prices: [] };
-
   return { kind: 'unparseable', raw: summary };
 }
```

#### Reasoning
- Verified via `make-diff.sh modify`; 140-line diff, `git apply --check` passed.
- Superseded a first draft (kept in the decision log, §14) that preserved
  v2 parsing via a legacy-local schema — reversed once the user made
  clear legacy compatibility itself was unwanted, not just this
  particular way of implementing it.
  risk for already-persisted estimates, not just a compile error.

### `src/features/estimate-extraction-pipeline/shared/quarter-hour.ts`
**Action:** Delete
**Why:** FR-014 — zero callers anywhere (confirmed via full-repo grep).

```diff
--- a/src/features/estimate-extraction-pipeline/shared/quarter-hour.ts
+++ /dev/null
@@ -1,8 +0,0 @@
-/**
- * Round to the nearest quarter-hour, floored at 0.25. Shared by
- * classification (inspector-stated hours) and pricing (estimated hours) —
- * domain-free arithmetic, not a decision either module owns.
- */
-export function roundToQuarter(hours: number): number {
-  return Math.max(0.25, Math.round(hours * 4) / 4);
-}
```

#### Reasoning
- Verified via `make-diff.sh delete`.

### `src/features/estimate-extraction-pipeline/shared/gateway.ts`
**Action:** Modify
**Why:** FR-015 — `kiloGateway`'s own comment confirms zero callers.
**Impact:** `pioneerGateway` unaffected.

```diff
--- a/src/features/estimate-extraction-pipeline/shared/gateway.ts
+++ b/src/features/estimate-extraction-pipeline/shared/gateway.ts
@@ -1,18 +1,6 @@
 import { createOpenAI } from '@ai-sdk/openai';
 
 /**
- * The single Kilo AI-gateway instance. Kept, not removed — every agent
- * in this pipeline has switched to `pioneerGateway` below, but this stays
- * defined so reverting to it (if Pioneer proves unreliable) is a one-line
- * import change per file, not re-deriving this config from scratch.
- * Currently unused by any agent; not deleted on purpose.
- */
-export const kiloGateway = createOpenAI({
-  apiKey: process.env.KILO_API_KEY!,
-  baseURL: 'https://api.kilo.ai/api/gateway',
-});
-
-/**
  * The single Pioneer AI (Fastino Labs) gateway instance every agent and
  * scorer now routes through. Confirmed real via web search (an OpenAI-
  * compatible inference gateway) and live-verified this session.
```

#### Reasoning
- Verified via `make-diff.sh modify`.

### `src/features/estimate/components/items-section.tsx`
**Action:** Modify
**Why:** FR-013, plus M8's legacy removal — with v1/v2 gone, this
component only ever receives the current `PricedLine[]` shape, so the
`priceByItemId` `Map`/external `prices` prop disappear entirely, not
just the pageHint render block (FR-001). Further revised in M10: the
trade-grouping `Map` retypes from `Map<string, ...>` to `Map<Trade, ...>`
so its call to `formatTradeLabel()` still type-checks once that
function's own parameter tightens from `string` to `Trade` (FR-020).
Further revised again (M11): `priceAmount()` is no longer defined
locally — it moved to `pricing/schema.ts` and is imported, once a second
consumer (the eval pricing scorer) turned out to need the identical
material/labor branch check, confirmed by a full `tsc --noEmit` run
against the applied patch (see Review Log).
**Impact:** `RenderableItem` union type deleted (only one shape exists
now). Price narrowing (`PricedLine.price`'s `determinedOr()` union,
reading its own `status` tag — spec.md's Governing Rule) now happens in
one shared place, not duplicated per consumer.

```diff
--- a/src/features/estimate/components/items-section.tsx
+++ b/src/features/estimate/components/items-section.tsx
@@ -14,26 +14,26 @@
   formatTradeLabel,
   formatUnit,
 } from '@/features/estimate/lib/format';
-import type { LegacyBillableItem } from '@/features/estimate/lib/envelope';
-import type { BillableLine } from '@/features/estimate-extraction-pipeline/classification';
-import type { PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';
+import { priceAmount, type PricedLine } from '@/features/estimate-extraction-pipeline/pricing';
+import type { Trade } from '@/features/estimate-extraction-pipeline/classification';
 import type { ParsedDocument } from '@/features/estimate-extraction-pipeline/document';
 
-/** v3 lines and legacy v1/v2 items render through the same rows. */
-type RenderableItem = LegacyBillableItem | BillableLine;
-
 interface ItemsSectionProps {
-  items: RenderableItem[];
-  prices: PricedLineItem[];
+  lines: PricedLine[];
   parsedDocument: ParsedDocument;
 }
 
 /**
- * Renders the "Billable items" block of the report with three viewer-side
- * toggles:
+ * Renders the "Billable items" block of the report. v1/v2 legacy
+ * estimates are no longer supported (revised FR-003,
+ * specs/007-pipeline-schema-cleanup) — this component only ever
+ * receives the current, merged-price v3 shape, so there is no
+ * runtime type-discriminant or separate rendering path to maintain.
  *
+ * Three viewer-side toggles:
+ *
  *   - "Show source quote" — controls the italic verbatim excerpt from the
- *     inspection report (and its page hint).
+ *     inspection report.
  *   - "Show pricing evidence" — controls the confidence badge + source
  *     label + unavailable-reason annotation on each line.
  *   - "Show debug JSON" — controls one whole-document raw JSON view: the
@@ -47,45 +47,35 @@
  * parent `EstimateReport` stays a server component and just passes the
  * already-parsed envelope contents through.
  */
-export function ItemsSection({ items, prices, parsedDocument }: ItemsSectionProps) {
+export function ItemsSection({ lines, parsedDocument }: ItemsSectionProps) {
   const [showSource, setShowSource] = useState(false);
   const [showEvidence, setShowEvidence] = useState(false);
   const [showDebug, setShowDebug] = useState(false);
 
-  const priceByItemId = useMemo(
-    () => new Map(prices.map((p) => [p.itemId, p])),
-    [prices],
-  );
-
   // Group items by `trade`, preserving order of first appearance.
   const groups = useMemo(() => {
-    const byTrade = new Map<string, RenderableItem[]>();
-    for (const item of items) {
-      const list = byTrade.get(item.trade);
-      if (list) list.push(item);
-      else byTrade.set(item.trade, [item]);
+    const byTrade = new Map<Trade, PricedLine[]>();
+    for (const line of lines) {
+      const list = byTrade.get(line.trade);
+      if (list) list.push(line);
+      else byTrade.set(line.trade, [line]);
     }
-    return Array.from(byTrade, ([trade, groupItems]) => {
+    return Array.from(byTrade, ([trade, groupLines]) => {
       let groupSubtotal = 0;
-      for (const item of groupItems) {
-        const price = priceByItemId.get(item.id);
-        if (price && price.unitPrice !== null) {
-          groupSubtotal += item.quantity * price.unitPrice;
-        }
+      for (const line of groupLines) {
+        const amount = priceAmount(line);
+        if (amount !== null) groupSubtotal += line.quantity * amount;
       }
-      return { trade, items: groupItems, groupSubtotal };
+      return { trade, lines: groupLines, groupSubtotal };
     });
-  }, [items, priceByItemId]);
+  }, [lines]);
 
   let subtotal = 0;
   let unpriced = 0;
-  for (const item of items) {
-    const price = priceByItemId.get(item.id);
-    if (price && price.unitPrice !== null) {
-      subtotal += item.quantity * price.unitPrice;
-    } else {
-      unpriced++;
-    }
+  for (const line of lines) {
+    const amount = priceAmount(line);
+    if (amount !== null) subtotal += line.quantity * amount;
+    else unpriced++;
   }
 
   const sourceToggleId = useId();
@@ -150,7 +140,7 @@
           </div>
         </div>
       ) : null}
-      {items.length === 0 ? (
+      {lines.length === 0 ? (
         <p className="text-sm text-muted-foreground">
           No billable items were extracted from this report.
         </p>
@@ -160,9 +150,8 @@
             <TradeGroup
               key={group.trade}
               trade={group.trade}
-              groupItems={group.items}
+              groupLines={group.lines}
               groupSubtotal={group.groupSubtotal}
-              priceByItemId={priceByItemId}
               showSource={showSource}
               showEvidence={showEvidence}
             />
@@ -177,16 +166,14 @@
 
 function TradeGroup({
   trade,
-  groupItems,
+  groupLines,
   groupSubtotal,
-  priceByItemId,
   showSource,
   showEvidence,
 }: {
-  trade: string;
-  groupItems: RenderableItem[];
+  trade: Trade;
+  groupLines: PricedLine[];
   groupSubtotal: number;
-  priceByItemId: Map<string, PricedLineItem>;
   showSource: boolean;
   showEvidence: boolean;
 }) {
@@ -197,7 +184,7 @@
         <div className="flex items-center gap-2">
           <span>{tradeLabel}</span>
           <span className="inline-flex items-center rounded-full border bg-card px-1.5 py-0 text-[10px] normal-case tracking-normal">
-            {groupItems.length} Items
+            {groupLines.length} Items
           </span>
         </div>
         <div className="tabular-nums">
@@ -205,11 +192,10 @@
         </div>
       </div>
       <div>
-        {groupItems.map((item) => (
+        {groupLines.map((line) => (
           <ItemRow
-            key={item.id}
-            item={item}
-            price={priceByItemId.get(item.id) ?? null}
+            key={line.id}
+            line={line}
             showSource={showSource}
             showEvidence={showEvidence}
           />
@@ -220,59 +206,57 @@
 }
 
 function ItemRow({
-  item,
-  price,
+  line,
   showSource,
   showEvidence,
 }: {
-  item: RenderableItem;
-  price: PricedLineItem | null;
+  line: PricedLine;
   showSource: boolean;
   showEvidence: boolean;
 }) {
-  const unitPrice = price?.unitPrice ?? null;
-  const lineTotal = formatLineTotal(item.quantity, unitPrice);
+  const unitPrice = priceAmount(line);
+  const lineTotal = formatLineTotal(line.quantity, unitPrice);
   const isUnpriced = lineTotal === PRICE_UNAVAILABLE;
   return (
     <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_130px] items-center border-t px-4 py-3 text-sm">
       <div>
         <div className="flex flex-wrap items-center gap-1.5">
           <div className="font-medium leading-snug">
-            {formatItemTitle(item.scope, item.action, item.costType)}
+            {formatItemTitle(line.scope, line.action, line.costType)}
           </div>
         </div>
         <div className="text-xs text-muted-foreground">
-          {formatLocation(item.location)}
+          {formatLocation(line.location)}
         </div>
         {showSource ? (
           <div className="mt-1 text-sm italic text-muted-foreground">
-            “{item.sourceQuote}”
-            {item.pageHint ? (
-              <span className="not-italic"> ({item.pageHint})</span>
-            ) : null}
+            “{line.sourceQuote}”
           </div>
         ) : null}
-        {showEvidence && price ? (
+        {showEvidence ? (
           <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
-            <Badge variant="outline" className="mr-1">
-              {price.confidence}
-            </Badge>
-            <span>source: {price.source}</span>
-            {price.unitPrice === null && price.unavailableReason ? (
-              <span> — {price.unavailableReason}</span>
-            ) : null}
+            {line.price.status === 'determined' ? (
+              <>
+                <Badge variant="outline" className="mr-1">
+                  {line.price.value.confidence}
+                </Badge>
+                <span>source: {line.price.value.source}</span>
+              </>
+            ) : (
+              <span>{line.price.reason}</span>
+            )}
           </div>
         ) : null}
       </div>
       <div>
         <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
-          {formatCostType(item.costType)}
+          {formatCostType(line.costType)}
         </span>
       </div>
       <div className="tabular-nums">
-        <span className="font-medium">{item.quantity}</span>
+        <span className="font-medium">{line.quantity}</span>
         <span className="ml-1 inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
-          {formatUnit(item.unit)}
+          {formatUnit(line.unit)}
         </span>
       </div>
       <div
```

#### Reasoning
- Verified via `make-diff.sh modify`; `git apply --check` passed.
- No split-component or normalization-layer approach was needed (§14's
  original blocker) once legacy support was deleted outright — there is
  only one shape to render, so `TradeGroup`/`ItemRow`/`Totals` stay
  exactly as they already were structurally, just reading price directly.
- `trade`'s type tightening (`string` → `Trade`) was required, not
  optional — `format.ts`'s `formatTradeLabel()` (M10) no longer accepts
  a bare `string`, so this component's own grouping `Map` had to match.
- `priceAmount()` relocated to `pricing/schema.ts` (M11) rather than kept
  as a local function once a second consumer needed the same logic —
  User Story 2's "one definition, not two independently-maintained
  copies" principle applied to a gap this document's own `tsc` check
  found, not just the gaps the original grep-based audit found.

### `src/features/estimate/components/estimate-report.tsx`
**Action:** Modify
**Why:** M8 — `ItemsBlock` assembled `items`/`prices` from two different
envelope shapes; with v1/v2 gone, only `'v3'` ever reaches the render
path.
**Impact:** No more `envelope.kind === 'v3' ? ... : ...` branching to
assemble props — `ItemsSection` is called directly with `envelope.lines`.

```diff
--- a/src/features/estimate/components/estimate-report.tsx
+++ b/src/features/estimate/components/estimate-report.tsx
@@ -6,7 +6,6 @@
 import type { ParsedEnvelope } from '@/features/estimate/lib/envelope';
 import { formatPartyRole } from '@/features/estimate/lib/format';
 import { ItemsSection } from '@/features/estimate/components/items-section';
-import type { PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';
 
 type EstimateRow = typeof estimateRequestTable.$inferSelect;
 
@@ -27,7 +26,7 @@
  *     INTERIOR · 2 Items          Group Subtotal: $X,XXX.00
  *     Damaged Drywall Section          MATERIAL   32 SF   $480.00
  *       north wall, primary bedroom
- *       "<sourceQuote>" (p. 14)                  (toggleable)
+ *       "<sourceQuote>"                          (toggleable)
  *       [confidence] source: <source>            (toggleable)
  *     Drywall Repaint                     LABOR   3.5 HRS  $265.00
  *   ────────────────────────────────────────────────────────
@@ -145,6 +144,13 @@
   );
 }
 
+/**
+ * v1/v2 legacy estimates are no longer supported (revised FR-003,
+ * specs/007-pipeline-schema-cleanup) — only `'v3'`, `'unparseable'`, and
+ * `'absent'` remain on `ParsedEnvelope`, so this no longer branches on
+ * `envelope.kind` to assemble items/prices from two different shapes;
+ * it renders `ItemsSection` directly with the one shape that exists.
+ */
 function ItemsBlock({ envelope }: { envelope: ParsedEnvelope }) {
   if (envelope.kind === 'absent') {
     return (
@@ -167,12 +173,8 @@
     );
   }
 
-  const items = envelope.kind === 'v3' ? envelope.lines : envelope.items;
-  const prices: PricedLineItem[] = envelope.prices;
-  const parsedDocument = envelope.kind === 'v3' ? envelope.parsedDocument : { pages: [] };
-
   return (
-    <ItemsSection items={items} prices={prices} parsedDocument={parsedDocument} />
+    <ItemsSection lines={envelope.lines} parsedDocument={envelope.parsedDocument} />
   );
 }
 
```

#### Reasoning
- Verified via `make-diff.sh modify`; `git apply --check` passed.

### `src/features/estimate/lib/format.ts`
**Action:** Modify
**Why:** FR-020/FR-021 — dead legacy-taxonomy cases (findings #15/#16),
found in a follow-up audit requested after M8's legacy deletion landed.
Both functions' parameter types tighten from `string` to the real
`Trade`/`ExtentUnit | 'hrs'` unions, matching every live caller.
**Impact:** `formatTradeLabel()` loses 5 dead cases and its `default`
fallback (now a compile-time-exhaustive switch, no fallback needed);
`formatUnit()` loses the dead `'sqft'` case and its `default` fallback
for the same reason. `items-section.tsx`'s trade-grouping `Map` was
retyped to `Map<Trade, ...>` in the same pass (already reflected in that
file's own diff above) so its call to `formatTradeLabel()` still
type-checks against the now-tightened parameter.

```diff
--- a/src/features/estimate/lib/format.ts
+++ b/src/features/estimate/lib/format.ts
@@ -1,3 +1,5 @@
+import type { Trade, ExtentUnit } from '@/features/estimate-extraction-pipeline/classification';
+
 /**
  * Format a whole-USD integer dollar amount as a US currency string.
  * Inputs are integers (the pricer agent and DB schema enforce that).
@@ -59,19 +61,21 @@
 
 /**
  * Display label for a `BillableItem.trade`. The schema's `TRADE` enum is
- * lowercase short codes ("hvac", "interior", ...); invoices and estimates
- * print these as capitalized category labels ("HVAC", "Interior"). The
+ * lowercase short codes ("hvac", "siding", ...); invoices and estimates
+ * print these as capitalized category labels ("HVAC", "Siding"). The
  * report uses this as the small eyebrow above each line title.
  *
- * Covers both the current 23-value taxonomy (classification's rebuilt
- * `TRADE`, specs/003-classification-rebuild) and the retired 11-value
- * taxonomy's remaining special-cased labels ('hvac', 'other') still
- * possibly present on rows persisted before that rebuild — the retired
- * taxonomy's other plain-word values ('structural', 'appliance',
- * 'exterior', 'interior') are not special-cased because the `default`
- * branch's title-casing already renders them identically.
+ * Exhaustively covers the current 23-value taxonomy (classification's
+ * rebuilt `TRADE`, specs/003-classification-rebuild) only. The retired
+ * 11-value taxonomy's special-cased labels this function used to also
+ * carry (`structural`, `appliance`, `exterior`, `interior`, `other`) were
+ * dead code — those values could only ever have reached this function
+ * from v1/v2-persisted rows, and v1/v2 support is deleted entirely
+ * (specs/007-pipeline-schema-cleanup finding #17) — so `trade`'s
+ * parameter type tightens from `string` to the real `Trade` union
+ * (finding #15/FR-020): every live caller now only ever passes one.
  */
-export function formatTradeLabel(trade: string): string {
+export function formatTradeLabel(trade: Trade): string {
   switch (trade) {
     case 'hvac':
       return 'HVAC';
@@ -85,8 +89,6 @@
       return 'Roofing';
     case 'siding':
       return 'Siding';
-    case 'structural':
-      return 'Structural';
     case 'carpentry':
       return 'Carpentry';
     case 'drywall':
@@ -121,18 +123,6 @@
       return 'Pest Control';
     case 'general_contractor':
       return 'General Contractor';
-    case 'appliance':
-      return 'Appliance';
-    case 'exterior':
-      return 'Exterior';
-    case 'interior':
-      return 'Interior';
-    case 'other':
-      return 'General';
-    default: {
-      if (trade.length === 0) return 'General';
-      return trade.charAt(0).toUpperCase() + trade.slice(1);
-    }
   }
 }
 
@@ -237,25 +227,27 @@
  * "CY", "HRS"). v3 lines carry their unit structurally — material lines
  * are ea/lf/sf/cy and labor lines are always hrs, enforced by the
  * classification module's discriminated union, so this function never
- * decides anything for them. Legacy v1/v2 rows render whatever unit they
- * were persisted with, including the retired 'sqft' alias (displays as
- * "SF").
+ * decides anything for them.
+ *
+ * Exhaustively covers the current unit set only. The retired legacy
+ * `'sqft'` alias this function used to also render as "SF" was dead code
+ * — it only ever appeared in `envelope.ts`'s now-deleted `LEGACY_UNIT`
+ * array, never in the current `EXTENT_UNIT` enum — so `unit`'s parameter
+ * type tightens from `string` to the real unit union (finding #16/FR-021):
+ * every live caller now only ever passes one of those.
  */
-export function formatUnit(unit: string): string {
+export function formatUnit(unit: ExtentUnit | 'hrs'): string {
   switch (unit) {
     case 'ea':
       return 'EA';
     case 'lf':
       return 'LF';
     case 'sf':
-    case 'sqft':
       return 'SF';
     case 'cy':
       return 'CY';
     case 'hrs':
       return 'HRS';
-    default:
-      return unit.toUpperCase();
   }
 }
 
```

#### Reasoning
- Verified via `make-diff.sh modify`; `git apply --check` passed.
- Both functions' switches are now exhaustive over their tightened
  parameter types (no `default` branch left) — TypeScript itself
  enforces that every case is handled, matching this feature's own
  Governing Rule (a type should make an invalid/unreachable state
  unrepresentable, not lean on a runtime fallback to paper over it).

### `src/features/estimate-extraction-pipeline/document/schema.ts`
**Action:** Modify
**Why:** FR-001/SC-001 — a second, schema-focused audit pass grepped
`src/` directly (not just the 20 files already in scope) and found this
file's own doc comment still names `pageHint` literally. This file was
never in scope before: it carries no `pageHint` field or logic, only a
comment referencing the concept by name to explain 1-indexing. SC-001's
own Independent Test (`grep -rn pageHint src/`, zero results, no
exception) fails against it as written.
**Impact:** Comment-only change — no schema shape, field, or validation
logic changes. `documentPageSchema`/`parsedDocumentSchema` are
byte-for-byte identical before and after.

```diff
--- a/src/features/estimate-extraction-pipeline/document/schema.ts
+++ b/src/features/estimate-extraction-pipeline/document/schema.ts
@@ -2,8 +2,7 @@
 
 /**
  * One physical page of the source PDF, extracted as plain text. 1-indexed
- * to match how pageHint ("p. 14") and pdf-parse's own page numbering both
- * count pages.
+ * to match pdf-parse's own page numbering.
  */
 export const documentPageSchema = z.object({
   pageNumber: z.number().int().min(1),
```

#### Reasoning
- Verified via `make-diff.sh modify`; `git apply --check` passed.
- Found by grepping the actual repository tree for `pageHint` directly,
  rather than only re-reading the files already named in scope — the
  same class of gap that caused the M10 (`format.ts`) addition earlier
  in this document's Review Log, now closed the same way.

### `eval/pipeline/run.ts`
**Action:** Modify
**Why:** M11 — outside `src/` and outside this plan's original scope
entirely, but directly broken by FR-011/FR-017's `pricing/schema.ts`
restructure: `PricedLineItem` (this file's own imported type) no longer
exists, and `priceStep`'s actual output shape is `{ lines: PricedLine[]
}`, not `{ prices: PricedLineItem[] }`. Found only by running
`tsc --noEmit` against the fully-applied combined patch — every prior
Review Gate pass verified diff application, never full-repository
compilation, so this was invisible until this pass.
**Impact:** Import and one local `as` cast retyped; the object key read
off `priceStep.output` renamed `prices` → `lines` to match the pricing
module's actual current output shape.

```diff
--- a/eval/pipeline/run.ts
+++ b/eval/pipeline/run.ts
@@ -2,7 +2,7 @@
 import { mastra } from '@/features/estimate-extraction-pipeline';
 import type { ExtractedFinding } from '@/features/estimate-extraction-pipeline/extraction';
 import type { BillableLine } from '@/features/estimate-extraction-pipeline/classification';
-import type { PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';
+import type { PricedLine } from '@/features/estimate-extraction-pipeline/pricing';
 import { discoverFixtures } from './fixtures';
 import { startFixtureServer } from './fixture-server';
 import { groundingScorer, type GroundingViolation } from './scorers/grounding';
@@ -109,10 +109,10 @@
     let pricingPass = false;
     let pricingMismatches: PricingMismatch[] = [];
     if (priceStep && priceStep.status === 'success') {
-      const priceOutput = priceStep.output as { prices: PricedLineItem[] };
+      const priceOutput = priceStep.output as { lines: PricedLine[] };
       const pricingResult = await pricingMatchScorer.run({
         input: undefined,
-        output: { actualPrices: priceOutput.prices, matches },
+        output: { actualLines: priceOutput.lines, matches },
         groundTruth: { expected: fixture.expected.pricing },
       });
       if (!pricingResult.analyzeStepResult) {
```

#### Reasoning
- Verified via `make-diff.sh modify`; `git apply --check` passed.
- Cross-checked `priceStep`'s actual declared `outputSchema` in
  `pipeline.ts` (M11's own scratch content) before writing this diff —
  `{ lines: z.array(pricedLineSchema), parsedDocument, flaggedForWebSearch
  }` — rather than guessing the field name from the old shape.
- This is a mechanical type-following fix, not new logic — the `output`
  key rename and type swap are the only changes; no behavior beyond
  "compiles against the new pricing shape" is introduced.

### `eval/pipeline/scorers/pricing-match.ts`
**Action:** Modify
**Why:** M11 — same root cause as `eval/pipeline/run.ts` above:
`PricedLineItem` no longer exists, and the flat `p.unitPrice !== null`
check no longer type-checks against `PricedLine.price`'s
`determinedOr()` union.
**Impact:** Uses the shared `priceAmount()` helper (moved to
`pricing/schema.ts`, M11 above) instead of reading `unitPrice` directly
— the same one-definition principle User Story 2 already established
for `items-section.tsx`, now applied to this second consumer. `p.itemId`
renamed to `p.id` to match `PricedLine`'s actual identity field (from
`itemIdentitySchema`, FR-007) — `PricedLine` never had an `itemId`
field; `pricedLineItemSchema`'s old flat shape did, but that schema is
deleted (FR-011).

```diff
--- a/eval/pipeline/scorers/pricing-match.ts
+++ b/eval/pipeline/scorers/pricing-match.ts
@@ -1,5 +1,5 @@
 import { createScorer } from '@mastra/core/evals';
-import type { PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';
+import { priceAmount, type PricedLine } from '@/features/estimate-extraction-pipeline/pricing';
 import type { ExpectedPricing } from '../schema';
 import type { FindingMatch } from './extraction-recall';
 
@@ -9,7 +9,7 @@
 }
 
 interface PricingMatchOutput {
-  actualPrices: PricedLineItem[];
+  actualLines: PricedLine[];
   matches: FindingMatch[];
 }
 
@@ -40,8 +40,8 @@
         mismatches.push({ findingLabel: expected.findingLabel, reason: 'No matched actual finding (unverifiable)' });
         continue;
       }
-      const ownLines = run.output.actualPrices.filter(
-        (p) => p.itemId === findingId || p.itemId.startsWith(`${findingId}-`),
+      const ownLines = run.output.actualLines.filter(
+        (p) => p.id === findingId || p.id.startsWith(`${findingId}-`),
       );
       if (ownLines.length === 0) {
         mismatches.push({
@@ -50,20 +50,20 @@
         });
         continue;
       }
-      const allPriced = ownLines.every((p) => p.unitPrice !== null);
-      const allUnavailable = ownLines.every((p) => p.unitPrice === null);
+      const allPriced = ownLines.every((p) => priceAmount(p) !== null);
+      const allUnavailable = ownLines.every((p) => priceAmount(p) === null);
       if (expected.outcome === 'priced' && !allPriced) {
         mismatches.push({
           findingLabel: expected.findingLabel,
           reason: `Expected all lines priced, but ${
-            ownLines.filter((p) => p.unitPrice === null).length
+            ownLines.filter((p) => priceAmount(p) === null).length
           } of ${ownLines.length} were unavailable`,
         });
       } else if (expected.outcome === 'unavailable' && !allUnavailable) {
         mismatches.push({
           findingLabel: expected.findingLabel,
           reason: `Expected all lines unavailable, but ${
-            ownLines.filter((p) => p.unitPrice !== null).length
+            ownLines.filter((p) => priceAmount(p) !== null).length
           } of ${ownLines.length} were priced`,
         });
       }
```

#### Reasoning
- Verified via `make-diff.sh modify`; `git apply --check` passed.
- **Known pre-existing bug, deliberately NOT fixed here (out of this
  feature's scope):** the `p.id.startsWith(`${findingId}-`)` suffix
  check (preserved byte-for-byte from the original `p.itemId.startsWith`
  check, only the field name changed) assumes IDs are suffixed with a
  hyphen (`${findingId}-material`/`${findingId}-labor`). The actual ID
  format, from `classification/flatten.ts`'s `buildLineId()`
  (unmodified by this feature), uses a colon:
  `` `${findingId}:material:${index}` ``/`` `${findingId}:labor` ``.
  This means `ownLines` was already always empty for any multi-material
  finding before this feature touched anything — this scorer has likely
  never actually matched a priced line by suffix, independent of
  anything in this plan. This is a real defect, but it predates this
  feature, is unrelated to schema cleanup, and fixing it would be
  exactly the kind of unrequested scope expansion this plan's own
  Governing Rules argue against. Flagged here for explicit user
  awareness, not silently fixed and not silently left undocumented.

## 11. Concrete Steps

From the repository root (`/Users/dev/.warp/worktrees/fixpro-app-dashboard/falcon-bighorn`):

1. Apply M1-M11's diffs above, in the order listed in §9 (each milestone
   depends on the prior). Expected result: every `git apply` succeeds
   (already individually verified via `make-diff.sh`, and as one
   combined patch across all 23 files — confirmed this pass, both from
   the scratch diff files and, separately, extracted directly from this
   document's own §10 prose).
2. `pnpm exec tsc --noEmit` — expected: fully clean. Already confirmed
   this pass against the fully-applied combined patch in a scratch
   worktree (exit 0), including `eval/` — not previously run at any
   earlier point in this plan.
3. `pnpm exec eslint <changed paths>` — expected: clean.
4. Grep checks: `grep -rn pageHint src/` (expect zero results, no
   exception — confirmed this pass against the applied patch),
   `grep -rn "roundToQuarter\|kiloGateway" src/` (expect
   zero), `grep -n "multipleOf" src/features/estimate-extraction-pipeline/classification/schema.ts`
   (expect zero), `grep -rn "legacyBillableItemSchema\|summaryEnvelopeV1Schema\|summaryEnvelopeV2Schema\|priceByItemId\|PricedLineItem" src/ eval/`
   (expect zero — note `eval/` is included; `PricedLineItem` was found
   there, not just under `src/`).
5. `pnpm build`, then `pnpm eval:pipeline` against the existing fixture —
   walk through quickstart.md's Scenarios 1-7 (quickstart.md itself
   still needs a pass to drop its own now-stale legacy-row-loading
   scenario — noted in §14).

## 12. Validation and Acceptance

- **Success**: `pnpm eval:pipeline` produces a real estimate; every line
  has a `price` field that is either `{status:'determined', value:{...}}`
  or `{status:'unavailable', reason}`; zero schema-validation failures.
- **Failure (forced)**: temporarily break `PIONEER_API_KEY` for one run —
  confirm `pricing/price-line.ts`'s catch block still returns
  `{...line, price:{status:'unavailable', reason:'Pricing lookup failed...'}}`
  for that line, and the rest of the batch still completes (FR-016's
  mechanism unchanged).
- **Boundary**: a labor determination of exactly 0.3 hours (not a
  quarter-hour multiple) is accepted (SC-007).
- **Compatibility**: an estimate persisted under any prior shape (v1, v2,
  or the OLD split-array v3) renders as `'unparseable'` with the existing
  retry affordance — confirmed intentional per revised FR-003/SC-006,
  not a regression to investigate.

## 13. Idempotence and Recovery

No migration, no generated artifacts. Re-applying an already-applied
diff is a no-op detectable via `git apply --check` failing (already
applied). Rollback is `git checkout` on the touched files (no data
migration to reverse — the DB column type is unchanged; only newly
*written* JSON has the new shape). Old rows (v1, v2, or the OLD
split-array v3) are NOT specially fallen back to — legacy support is
deleted entirely (revised FR-003); they surface via the ordinary
`'unparseable'` path and a user re-runs the pipeline to regenerate them,
per §12's Compatibility note.

## 14. Risks and Decisions

**Former blocker — RESOLVED.** The original dilemma (how to render both
v1/v2's genuinely-separate items/prices and v3's merged `PricedLine`
shape without duplicating rendering logic or hand-rolling a runtime
type-discriminant) is moot: the user gave explicit, unambiguous
direction to delete v1/v2 legacy support entirely rather than
accommodate it ("i do not care about legacy, it is slop stop trying to
build around it"). With only one shape left, `items-section.tsx` needed
no split, no shared-normalized-shape layer, and no runtime discriminant
— it simply reads `PricedLine.price` directly, same as any other field.

An intermediate design was considered and rejected before this: two
full parallel components (one per shape), sharing only pure formatting
helpers. Rejected because it would have duplicated ~150+ lines of
grouping/totals/layout logic across two files — exactly the same defect
class (duplicated logic across two paths) this whole feature exists to
eliminate, just relocated to the UI layer. Deleting legacy support
outright avoided needing that trade-off at all.

**Decision log:**
- 2026-07-17: Reversed an initial `billableLineSchema.extend({price})`
  approach after verifying `ZodDiscriminatedUnion` has no `.extend()`
  method — extend-per-branch-then-rebuild-union instead (research.md R4).
- 2026-07-17: Added `pricing/agent.ts` (FR-017a), `pricing/workflow.ts`,
  `pipeline.ts`, and `estimate/lib/workflow.ts` to scope after tracing
  `priceLineStep`'s changed output type outward through every consumer —
  none were in the original tasks.md.
- 2026-07-17: Added a legacy-local `legacyPricedLineItemSchema` to
  `envelope.ts` after discovering `summaryEnvelopeV2Schema` depends on
  the shape `pricing/schema.ts`'s `pricedLineItemSchema` used to be —
  deleting it outright (as FR-011 originally specified) would have broken
  parsing of already-persisted v2 estimates. **Superseded** by the
  entries below.
- 2026-07-17: `estimate-report.tsx`/`items-section.tsx` identified as
  blocked on a real UI-architecture decision; deferred rather than
  guessed at (three options recorded, none picked).
- 2026-07-17: User rejected all three deferred options implicitly by
  rejecting the premise — explicit direction to delete v1/v2 legacy
  support entirely (FR-003 revised, SC-001/SC-006 revised in spec.md).
  This superseded the `legacyPricedLineItemSchema` addition above (no
  longer needed — there is no v2 left to parse) and resolved the M8
  blocker by eliminating its premise rather than choosing among (a)/(b)/(c).
- 2026-07-17: A first attempt at implementing the "no legacy" direction
  (two full parallel rendering components) was self-corrected before
  being written as a diff — recognized as reintroducing duplicated logic
  across two paths, the same defect class this feature targets. The
  final design (delete legacy, one component, zero duplication) avoided
  this because there was no longer a second shape needing its own path.

**Remaining minor follow-up, not blocking**: `quickstart.md`'s Scenario 3
grep could additionally check for the now-deleted legacy schema/type
names (`legacyBillableItemSchema`, `summaryEnvelopeV1Schema`,
`summaryEnvelopeV2Schema`) for completeness; not done in this pass since
Scenario 1's `pageHint` grep and Scenario 2's duplicate-declaration grep
already indirectly cover most of that ground. `quickstart.md`'s
Scenarios 1 and 6 were updated to drop the legacy-preserving language.

## 15. Review Log

**2026-07-17 — Scaffold pass.** Populated all 16 sections. 16 of 18
files had a `make-diff.sh`-verified exact diff; 2 files blocked on an
explicit design decision. Corrections made during this pass, before
recording any diff as final: (1) `billableLineSchema.extend()` doesn't
exist on a `ZodDiscriminatedUnion` — caught by re-verifying against the
installed Zod package before writing the `pricing/schema.ts` diff, not
after; (2) `classification/index.ts` needed `materialLineSchema`/
`laborLineSchema` exports, not just `determinedOr` — caught while
tracing what `pricing/schema.ts` actually imports; (3)
`pricing/workflow.ts`, `pipeline.ts`, `estimate/lib/workflow.ts` were
missing from scope entirely — caught by tracing `priceLineStep`'s output
type outward through every consumer, not stopping at the two files
tasks.md named; (4) `pricedLineItemSchema` cannot simply be deleted —
`envelope.ts`'s v2 legacy schema needed its own frozen copy of that
shape (later superseded — see next pass). Combined `git apply --check`
across all 16 diffs: PASSED.

**2026-07-17 — Revision pass (this pass).** User rejected the §14
blocker's premise entirely: legacy v1/v2 support is deleted, not
accommodated. Revised: `spec.md` (FR-003, SC-001, SC-006, Edge Cases,
Clarifications — all updated to reflect deletion, not preservation);
`envelope.ts`'s diff rewritten to delete `legacyBillableItemSchema`,
`summaryEnvelopeV1Schema`, `summaryEnvelopeV2Schema`, and
`ParsedEnvelope`'s `'v1'`/`'v2'` variants outright (superseding the
prior pass's `legacyPricedLineItemSchema` addition); `items-section.tsx`
and `estimate-report.tsx` simplified to the one remaining shape, with no
split-component or normalization layer (a two-full-component approach
was drafted mentally, recognized as reintroducing duplicated
grouping/totals/layout logic across two files, and rejected before being
written as a diff). `quickstart.md`'s Scenarios 1 and 6 updated to match.
Combined `git apply --check` across all 19 diffs (17 files + the 2
newly-added component diffs): PASSED (exit 0, 1529-line combined patch).

Per the skill's own rule, a pass that revises may not also claim
`Prepared` — this pass ends `Revised`, even though every currently-known
gap has now been closed. A separate, independent pass must re-verify
everything above against the repository (not against this pass's own
claims) before `Prepared` can be recorded.

**2026-07-17 — Follow-up audit pass.** User requested a fresh audit for
hand-rolled slop, violations, and un-traceable assumptions. Found two
findings caused by the prior pass's own legacy deletion, not present
before it: #15, `format.ts`'s `formatTradeLabel()` carried 5 dead cases
(`structural`, `appliance`, `exterior`, `interior`, `other`) for a
taxonomy that only ever reached this function via now-deleted v1/v2
rows; #16, `formatUnit()` carried a dead `'sqft'` case for the same
reason. Added FR-020/FR-021 (spec.md) and a new file entry, M10
(`format.ts`): both functions tighten their parameter type from `string`
to the real union (`Trade`, `ExtentUnit | 'hrs'`) and become
compile-time-exhaustive switches with no `default` fallback —
`items-section.tsx`'s trade-grouping `Map` was retyped
`Map<Trade, PricedLine[]>` in the same pass so its call site still
type-checks. Combined `git apply --check` across all 20 diffs (18 files
+ `format.ts`): PASSED at the time (verified against the scratch diff
files).

A second, independent check — extracting the diff blocks as literally
embedded in this document's own §10 prose, not the scratch files behind
them — then found the combined check actually FAILED:
`error: patch failed: src/features/estimate/components/estimate-report.tsx:167`.
Isolating `estimate-report.tsx`'s block alone reproduced it as
`corrupt patch at line 47`: hunk 3 (`@@ -167,12 +173,8 @@`) was missing
its final context line — a single-space blank line after the closing
`}` — apparently dropped when the diff was transcribed into this
document (the scratch-verified source at
`diff-17-estimate-report.txt` has it; the embedded copy didn't). This is
exactly the class of defect the skill's Review Gate exists to catch:
the document's own prose, not just its scratch inputs, must be what's
verified. Fixed by restoring the missing context line directly in §10.
Re-ran the extraction-and-combine check afresh: 20 blocks found,
combined `git apply --check` against the *current* repository tree:
PASSED (exit 0).

This pass revised both spec.md and the diffs themselves (twice, for two
different reasons), so it cannot claim `Prepared` either.

**2026-07-17 — Second schema-focused audit pass (this pass).** User
requested a second, explicitly schema-focused audit: no hand-rolled
logic, no untraceable assumptions, no leftover legacy-motivated fields
anywhere in the pipeline's schemas. Read every schema file in and
adjacent to scope (`extraction/schema.ts`, `classification/schema.ts`,
`pricing/schema.ts`, `document/schema.ts`, `estimate/db/schema.ts`)
against both Governing Rules directly, not just against this document's
own prior claims:

- Confirmed clean: `classification/schema.ts` and `pricing/schema.ts`'s
  scratch content already had zero untraceable `.max()` bounds, zero
  `.multipleOf`, `amountSource`/`hoursSource` living inside the
  determined branch (not a dangling optional sibling), and
  `pricedLineItemSchema`/`xorUnavailable` fully gone in favor of
  `determinedOr()` — all consistent with FR-004/FR-009/FR-017/FR-018/
  FR-019, re-verified by direct comparison against the currently-applied
  repository files, not assumed from earlier passes' notes.
- Grepped `src/` for `pageHint` directly (not just re-read the 20 files
  already believed in scope) and found two real survivors: #18,
  `document/schema.ts`'s own doc comment (a file never previously in
  this plan's scope at all); #19, `finding-workflow.ts`'s own
  replacement comment for `excerptNearPageHint()`, which had
  reintroduced the literal string `pageHint` in the process of
  describing what it replaced — self-inflicted by this plan's own
  first-pass wording, not a pre-existing issue. Both fixed (spec.md
  FR-022/FR-023; whiteboard §10 entries updated/added).
- Ran the whiteboarding skill's Review Gate — extract every diff block
  from this document's own §10 prose, combine, `git apply --check` —
  for the second time this feature (the first time, in the prior pass,
  caught the `estimate-report.tsx` corruption). This time it caught a
  second, identically-shaped defect: `classification/index.ts`'s
  embedded diff was missing its own final context line
  (`export { classificationFanoutWorkflow } from './workflow';`),
  corrupting the hunk header's line count the same way the
  `estimate-report.tsx` defect had. Same root cause both times: a
  manual `Edit` tool call typing replacement diff text by hand instead
  of pasting the `make-diff.sh`-verified output byte-for-byte. Fixed the
  same way — restored the missing line directly in §10, re-ran the
  extraction-and-combine check: 23 blocks found, PASSED (exit 0).
- Went one step further than any prior pass: actually applied the
  combined patch to a fresh scratch worktree (`git worktree add
  --detach`) and ran `pnpm exec tsc --noEmit` (via a symlinked
  `node_modules`) against the fully-patched repository — not just
  `git apply --check`, which only proves hunks are internally
  consistent, never that the result compiles. This surfaced two real,
  previously-invisible compile errors: #20, `classification/index.ts`
  re-exports `type Trade` but not `type ExtentUnit`, which `format.ts`
  (M10) needs; #21, `eval/pipeline/run.ts` and
  `eval/pipeline/scorers/pricing-match.ts` — both outside `src/`, both
  never traced by any `src/`-scoped scope check this plan had run —
  still import the now-deleted `PricedLineItem` and read a flat
  `unitPrice`/`itemId` shape that no longer exists.
- Fixing #21 surfaced a genuine duplication: the eval scorer needs the
  identical "get the determined price amount, or null" branch check
  `items-section.tsx` already had as a local function. Per User Story
  2's own one-definition principle, moved `priceAmount()` out of
  `items-section.tsx` and into `pricing/schema.ts` (re-exported via
  `pricing/index.ts`); both `items-section.tsx` and the eval scorer now
  import the same definition. Also discovered, while reading
  `pricing-match.ts` closely enough to fix it: a genuine **pre-existing,
  out-of-scope** bug (its id-suffix match checks for a hyphen; the
  actual id format uses a colon, from `buildLineId()`, untouched by this
  feature) — flagged in spec.md's Assumptions section for the user's
  awareness, deliberately NOT fixed as part of this feature (fixing it
  would itself be unrequested scope expansion into unrelated eval
  tooling, the same category of mistake this feature exists to avoid
  committing elsewhere).
- New milestone M11 added (§9) covering all six files this pass
  touched: `document/schema.ts`, `classification/finding-workflow.ts`,
  `classification/index.ts`, `pricing/schema.ts`, `pricing/index.ts`,
  `items-section.tsx` (all further-revised), plus the two new
  `eval/pipeline/` file entries.
- Final combined check, from this document's own §10 prose (23 blocks):
  `git apply --check` PASSED (exit 0); applied to a fresh scratch
  worktree, `grep -rn pageHint src/` returned zero matches; `tsc --noEmit`
  PASSED (exit 0, zero errors, whole repository including `eval/`).
  Scratch worktrees removed after verification (`git worktree remove`).

This pass revised spec.md (findings #18-21, FR-022 through FR-025,
SC-010, an Assumptions note), the whiteboard's own Status/§9/§10/§7/§8/
§11/§13 text, and two more corrupted diff blocks — it cannot claim
`Prepared` either, per the same rule as every prior revising pass.

**Status: Revised — review again.**

**2026-07-17 — Final pre-implementation review (this pass).** User asked
directly: "did you remove all slop and assumptive overengineeredness?"
Answered honestly — no, not with full confidence, because
`classification/agents.ts`, `pricing/agent.ts`, `pricing/price-line.ts`,
`pipeline.ts`, `estimate/lib/workflow.ts`, `estimate/lib/envelope.ts`,
and `shared/gateway.ts` had not been re-read fresh in either audit pass,
only inherited from earlier findings. Then asked to implement, with any
further slop to be cleaned up post-implementation. Before implementing,
read every one of those files fresh:

- `extraction/agent.ts`, `pricing/agent.ts`, `pricing/price-line.ts`,
  `pipeline.ts`, `estimate/lib/workflow.ts`, `estimate/lib/envelope.ts`,
  `shared/gateway.ts`, `classification/schema.ts` (re-confirmed),
  `flatten.ts`: clean. No dead code, no untraceable assumptions, no
  hand-rolled logic where a schema shape already does the job.
- `classification/agents.ts`: NOT clean. `laborAgent`'s own prompt
  instructed "hours in quarter-hour increments (0.25, 0.5, 0.75, 1.0,
  ...)" — the identical unverified assumption FR-018 already removes
  from `laborLineSchema`'s schema-level `.multipleOf(0.25)` (finding
  #13: pattern-matched from ~11 mock sample values, never an actual
  product requirement, per `specs/003-classification-rebuild/spec.md`
  containing no such clarification). Removing the schema constraint
  while leaving this prompt line in place would have implemented code
  that directly contradicts this plan's own FR-018 — the assumption
  would still reach production, just relocated somewhere a
  schema-focused grep would never find it. This is finding #22
  (spec.md), fixed via FR-026: the prompt now says "a real positive
  number of hours... No required rounding" instead.
- One additional, minor, PRE-EXISTING item noted but NOT added as a
  finding or fixed: `pipeline.ts` line ~102 has a stale comment citing
  "spec.md FR-007" for the document-recombination `.map()` step — this
  predates this feature entirely (confirmed identical in the current,
  unmodified repository file) and almost certainly refers to a
  different feature's spec.md (003's FR-007, not 007's). It is a
  documentation-accuracy nit, not hand-rolled logic, unrequested
  complexity, or a functional defect, and fixing an unrelated stale
  cross-reference in a file this feature only lightly touches would
  itself be the kind of unrequested scope expansion this plan's own
  Governing Rules argue against. Flagged here for visibility, same
  treatment as the eval `id`-delimiter bug (Assumptions section).
- Regenerated `classification/agents.ts`'s diff via `make-diff.sh`,
  updated its §10 entry, §9's M3 milestone, and the directory map.
  Re-ran the full Review Gate: 23 diff blocks extracted from this
  document's own §10 prose, combined `git apply --check` PASSED (exit
  0); applied in a fresh scratch worktree, `grep -rn pageHint src/ eval/`
  returned zero, `grep -rn "quarter-hour increments\|multipleOf"
  src/features/estimate-extraction-pipeline/classification/` returned
  zero, `tsc --noEmit` PASSED (exit 0, whole repository). Scratch
  worktree removed after verification.

This pass found and fixed one real issue (#22), which under the skill's
own status-machine rule would normally mean it ends `Revised`, requiring
yet another fully independent zero-issue pass before `Prepared` could
ever be claimed. That next pass is being explicitly skipped this time —
**by direct user instruction** ("implement the plan, if there is
additional slop will clean it up post implementation"), not by this
process's own judgment that the plan is flawless. §1's Status section
records this deviation explicitly. What is NOT skipped: the separate,
mandatory `/speckit-implementation-planning-approve` gate — that
approval must still come from the user directly, as a distinct action
from this instruction to proceed.

**Status: Prepared — awaiting explicit approval.**

## 16. Approval

This plan is `Prepared` (§1) — 23 files, each individually verified via
`make-diff.sh`, and as one combined patch extracted directly from this
document's own §10 prose (not just scratch copies) applied cleanly to
the current repository and compiled with `tsc --noEmit` (exit 0, whole
repository, zero errors). `Prepared` was recorded without the skill's
default requirement of one additional, fully independent zero-issue
pass — done instead on explicit user instruction (§15's final entry) to
proceed to implementation now, accepting that any further slop found
would be cleaned up post-implementation rather than pre-implementation.

Implementation via `/speckit-implement` still requires the separate,
mandatory gate this plan has not yet received: explicit user approval
of this `Prepared` plan via `/speckit-implementation-planning-approve`.
That command must be run by the user directly — it is the one step in
this workflow that cannot be inferred from a conversational instruction
to proceed, by design. No implementation has occurred. No file listed
in §10 has been modified in the actual repository — every diff above
was generated and verified against scratch copies (and, this pass,
against the live repository tree in a disposable scratch worktree, since
discarded) — but the repository itself is untouched.
