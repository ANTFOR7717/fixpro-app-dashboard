# REFACTOR(ai-pipeline-mastra-native-realignment)

## Request

Completely redesign and realign the AI pipeline with proper abstractions and
Mastra-latest-first approaches. Constraints, verbatim from the user:

1. **No custom mechanical code in the AI pipeline.** Interpreted (and applied
   throughout this plan) as: deterministic logic is allowed to exist ONLY as
   (a) Zod schema constraints the provider enforces via structured output,
   (b) Mastra workflow primitives (`.branch`, `.foreach`, `.map`, step
   `retries`), and (c) trivial data normalization (rounding, id generation,
   dedup) inside steps. What is BANNED and removed by this plan: keyword-list
   heuristics scanning model output (`AREA_MATERIAL_KEYWORDS`,
   `LENGTH_MATERIAL_KEYWORDS`, `.includes()` plausibility checks), hand-rolled
   JSON fence/brace parsing + `jsonrepair` repair of model text, string-surgery
   "cleaners", and a custom retry-orchestration Processor class re-implementing
   what provider-enforced `response_format` makes unnecessary.
2. **No heavy reliance on AI prompting.** The extractor prompt currently
   teaches unit trade-conventions, costType rules, hours rules, split rules,
   and BAD→GOOD keyword tables. This plan moves every rule that CAN be a
   schema into the schema (discriminated unions, enums, literals, int/min
   bounds) and deletes the prompt text that duplicated it. The prompt keeps
   only what genuinely cannot be typed: grounding rules and field meaning.
3. **Deep research into Mastra workflows and primitives.** Done against the
   installed version and current docs — see "Verified Mastra Surface" below.
   Every primitive this plan uses was verified to exist in `@mastra/core`
   **1.37.1** (the installed version), not assumed from memory.
4. **Output accurate information, scalable, aligned with the v3 prototype**
   (`.prototype/fixpro-report-mock.v3.html`). The v3 prototype declares two
   invariants the current pipeline violates structurally (found in this
   session's audit):
   - *"Labor is always measured in Hours. … HRS never appears on a Material
     row; EA / SF / LF / CY never appear on a Labor row."* — the current
     pipeline does the exact opposite: the guard FORBIDS `hrs` on
     install/replace and clones the physical unit onto the labor line.
   - Labor quantities are fractional quarter-hours (`0.25`, `1.5`, `3.5`,
     `4.5` in the mock) — the current schema (`quantity: z.number().int()`)
     cannot represent a single one of the prototype's own labor rows.

This plan makes those invariants **unrepresentable to violate**: the billable
line becomes a Zod discriminated union where a labor line's `unit` is the
literal `'hrs'` and its quantity is a quarter-hour multiple, and a material
line's unit enum does not contain `'hrs'` at all. No prompt text, no keyword
guard, no retry loop is needed to enforce what the type system now forbids.

5. **No dependencies on systems in the AI process — clean handoff of
   responsibilities.** (Added in review.) The current workflow reads and
   writes the application database directly: `mark-processing.ts`,
   `persist-success.ts`, and `persist-failure.ts` all import `@/db` and
   `@/features/estimate/db/schema`, making the AI pipeline a THIRD-party
   writer to app state and forcing the caller into `ne(status, …)`
   clobber-guards because three writers race for the same row. This revision
   makes the workflow **pure**: input `{estimateRequestId, fileUrl, zipCode}`
   in, `{lines, prices}` out, thrown error on failure. ALL persistence —
   the `processing` flip, the v3 envelope write, the failure message — moves
   to the single caller (`triggerSummarizeEstimate`), which already owns
   revalidation. Dependency rule after this plan: **`src/mastra/**` never
   imports `@/db` or `@/features/**`**; the features layer imports mastra
   contract schemas only (the handoff artifact). Verifiable by grep (see
   Validation Plan).

## Verified Mastra Surface (researched 2026-07-09, against installed 1.37.1)

| Primitive | Verified how | Used for |
|---|---|---|
| `.foreach(step, { concurrency: N })` — maps a step over an array input, output order matches input, one failing iteration fails the workflow | docs (workflows/control-flow) | Per-line pricing fan-out, replacing `price-items.ts`'s hand-rolled `for` loop; `concurrency: 3` |
| `.map(async ({ inputData, getStepResult, getInitData }) => …)` — reshape between steps | docs (workflows/control-flow) | Fan-out to the `.foreach` array; collect back to the persist shape |
| `.branch([[cond, step], …])` — first true condition wins | docs + already used in repo | **Dropped in review**: with persistence moved to the caller, failure routing is the run's own `status: 'failed'` — the pipeline is linear |
| `run.start()` result: `status: 'success' \| 'failed'`, per-step `error` inspectable via `result.steps` | docs (workflows/error-handling) | The caller's single-writer handoff: success → write envelope, failed → write classified error |
| Step-level `retries: N` — re-runs a step **only when `execute` throws** | docs (workflows/error-handling) | Real transport-error retries on extraction (the current `retries: 2`/`retries: 1` are dead config because the steps never throw — verified in this session's audit) |
| `structuredOutput: { schema }` — schema passed via the provider's `response_format`; validation failure with default `errorStrategy: 'strict'` **throws** | docs (agents/structured-output) | Provider-enforced enums/shape make the JSON-repair + guard-retry machinery unnecessary |
| `structuredOutput.jsonPromptInjection: true` — fallback when a provider lacks `response_format` | docs | Documented escape hatch if the Kilo gateway rejects `response_format` (Risk Notes) |
| `createScorer({ id, description, judge: { model, instructions }, type: 'agent' }).analyze(…).generateScore(…).generateReason(…)` + agent `scorers: { key: { scorer, sampling: { type: 'ratio', rate } } }` — runs in background, never blocks the response | verified in installed `node_modules/@mastra/core/dist/evals/base.d.ts` (exports `createScorer`, `MastraScorer`, `ScorerConfig.judge`, `MastraScorerEntry.sampling`) + docs (scorers/overview) | LLM-judge consistency monitor replacing the blocking Pass-B audit call |
| `Mastra({ scorers: { … } })` registration | docs (scorers/overview) | Studio visibility for scorer results |

Version facts: `@mastra/core` 1.37.1, `zod` 4.2.1, `@ai-sdk/openai` 3.0.62,
model gateway `api.kilo.ai` with `openai/gpt-5.4-mini` (both agents).
`@mastra/evals` is NOT installed and NOT needed — `createScorer` ships from
`@mastra/core/evals` in the installed version (verified against the package's
`exports` map: subpath `./evals`).

## What the redesign changes at the contract level (read this first)

**Before (v2 contract):** the model emits near-final billable items
(`quantity`+`unit` doing double duty for materials and labor), a 5-file
guard/processor stack retries the model against keyword heuristics,
`merge-items.ts` clones one item into two identical-unit lines, and a second
blocking LLM pass (`audit-items`) re-reads the whole PDF for completeness.

**After (v3 contract):**

1. The extractor emits **work items** — what the inspector found, with the
   physical extent (`{quantity, unit: ea|lf|sf|cy}`) and, only when the
   inspector explicitly stated hours, `inspectorHours`. It never emits
   `costType`, never emits `hrs` as a unit (not in its enum — structurally
   impossible), never decides splits.
2. A deterministic `expand-lines` step (the ONLY mechanical step, and it is
   pure data-shaping: dedup → stable ids → expansion) turns each work item
   into billable **lines** per `ACTION_COST_PROFILE`:
   - `install`/`replace` → one **material** line (extent qty + physical unit)
     + one **labor** line (`unit: 'hrs'`).
   - `repair`/`service`/`evaluate`/`remove` → one **labor** line
     (`unit: 'hrs'`).
3. Labor hours come from the inspector when stated, otherwise the **pricer
   estimates them** — priced labor is `hourlyRate × hours`, exactly the v3
   mock's `Qty (HRS) × Unit Price = Client Total` arithmetic. The pricer's
   labor response schema (`hourlyRate`, `estimatedHours`) makes "price labor
   by the hour" a type, not a prompt plea.
4. Pricing fans out through `.foreach` with `concurrency: 3` — scalability is
   a Mastra config knob, not a hand-rolled loop.
5. The blocking Pass-B audit is replaced by a **background LLM-judge scorer**
   (`extraction-consistency`) sampled at rate 1.0 — quality is observed on every
   run without a second blocking PDF read in the critical path.
6. The persisted envelope becomes **v3** (`lines` discriminated union +
   `prices`); v1/v2 rows on disk keep parsing and rendering unchanged.
7. The workflow becomes **pure and linear** — no DB imports, no `.branch`,
   no status writes. It either returns `{lines, prices}` or its run fails
   with an inspectable error. `triggerSummarizeEstimate` is the ONLY writer
   of estimate-row state (processing → completed/failed), which deletes the
   three-writer race and its guard conditions outright.

## Directory Map

```text
falcon-bighorn/
├── REFACTOR(ai-pipeline-mastra-native-realignment).md      [CREATE] this plan
├── package.json                                             [MODIFY] drop jsonrepair dependency
└── src/
    ├── mastra/
    │   ├── index.ts                                         [MODIFY] register scorer
    │   ├── config/
    │   │   ├── gateway.ts                                   [CREATE] single Kilo gateway instance (was copy-pasted ×3)
    │   │   └── agent-rules.ts                               [MODIFY] new PricingBasis; drop ACTION_VERBS re-export
    │   ├── agents/
    │   │   ├── billable-item-extractor.schema.ts            [MODIFY] work-item schema; billable-line discriminated union; v3 envelope
    │   │   ├── billable-item-extractor.ts                   [MODIFY] slim prompt; drop guard; attach scorer; shared gateway
    │   │   ├── item-pricer.schema.ts                        [MODIFY] material/labor discriminated pricer responses
    │   │   ├── item-pricer.ts                               [MODIFY] hourly-labor pricing contract; shared gateway
    │   │   └── processors/
    │   │       ├── item-contract-guard.ts                   [DELETE] custom retry orchestration → provider response_format
    │   │       └── item-contract-guard/
    │   │           ├── item-validator.ts                    [DELETE] enum/keyword checks → schema enums + discriminated union
    │   │           ├── item-heuristics.ts                   [DELETE] keyword sets (banned mechanical heuristics)
    │   │           ├── cleaner.ts                           [DELETE] string surgery → renderer already title-cases
    │   │           └── extract-json-from-text.ts            [DELETE] fence/brace/jsonrepair parsing → response_format
    │   ├── scorers/
    │   │   └── extraction-consistency.ts                      [CREATE] background LLM-judge scorer (replaces Pass-B gate)
    │   └── workflows/
    │       ├── summarize-estimate.ts                        [MODIFY] pure linear pipeline: extract → expand → .map → .foreach → .map
    │       ├── lib/
    │       │   └── classify-error.ts                        [DELETE] moved to features layer (it maps errors to USER-facing copy — presentation, not AI)
    │       └── steps/
    │           ├── extract-items.ts                         [MODIFY] throws on failure (real retries; no failed/errorMessage plumbing)
    │           ├── audit-items.ts                           [DELETE] blocking Pass B → background scorer
    │           ├── merge-items.ts                           [DELETE] replaced by expand-lines.ts
    │           ├── expand-lines.ts                          [CREATE] dedup + ids + work-item → line expansion
    │           ├── price-items.ts                           [DELETE] hand-rolled loop → .foreach
    │           ├── price-line.ts                            [CREATE] price ONE line (the .foreach unit)
    │           ├── mark-processing.ts                       [DELETE] DB write inside AI process → caller owns status
    │           ├── persist-success.ts                       [DELETE] DB write inside AI process → caller owns envelope write
    │           └── persist-failure.ts                       [DELETE] DB write inside AI process (+ mirror-schema hack) → caller owns failure write
    ├── features/estimate/
    │   ├── lib/
    │   │   ├── classify-error.ts                            [CREATE] moved verbatim from mastra/workflows/lib
    │   │   ├── envelope.ts                                  [MODIFY] parse v3
    │   │   └── workflow.ts                                  [MODIFY] the single writer: processing → run → completed(envelope) | failed(message)
    │   └── components/
    │       ├── estimate-report.tsx                          [MODIFY] route v3 lines to ItemsSection
    │       └── items-section.tsx                            [MODIFY] v3 copy: "Labor is always measured in Hours."
    └── (unchanged: features/estimate/lib/format.ts — formatUnit/formatItemTitle already render the v3 shapes correctly)
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `src/mastra/agents/billable-item-extractor.schema.ts` | Modify | New model-facing `extractedWorkItemSchema` (extent + inspectorHours; no costType, no hrs unit). New persisted `billableLineSchema` = discriminated union making the v3 invariants unrepresentable to violate. v3 envelope. Old v1/v2 schemas kept for reading old rows. |
| `src/mastra/agents/billable-item-extractor.ts` | Modify | Prompt shrinks to grounding + field meaning; all unit/costType/hours/split prompt-teaching deleted (schema owns it). Guard + `maxProcessorRetries` removed. Background consistency scorer attached. |
| `src/mastra/agents/item-pricer.schema.ts` | Modify | Split into `materialPriceResponseSchema` and `laborPriceResponseSchema` (`hourlyRate` + `estimatedHours`) — hourly labor pricing becomes a type. |
| `src/mastra/agents/item-pricer.ts` | Modify | Prompt rewritten around the two response shapes and three pricing bases. |
| `src/mastra/config/agent-rules.ts` | Modify | `ACTION_COST_PROFILE` unchanged (drives expansion). `PricingBasis` → `material-part-only` \| `labor-install-hourly` \| `labor-all-in-hourly`. `ACTION_VERBS_SET` re-export deleted (only consumer was the deleted validator). |
| `src/mastra/agents/processors/item-contract-guard.ts` + 4 files under `item-contract-guard/` | Delete | The entire custom parse/validate/retry stack. `response_format` enforces shape+enums at the provider; the discriminated union enforces the v3 unit invariants; the one soft rule (scope shape) becomes a drop-and-log filter in `expand-lines`. |
| `src/mastra/scorers/extraction-consistency.ts` | Create | `createScorer` LLM-judge: flags internally inconsistent items (quote doesn't support scope/action/trade) and compound scopes. Background, sampled 1.0 — the Mastra-native replacement for the blocking Pass-B audit, honestly scoped to what a judge without document access can assess. |
| `src/mastra/config/gateway.ts` | Create | One `createOpenAI` Kilo gateway instance. Today the identical 4-line config is copy-pasted in `billable-item-extractor.ts` and `item-pricer.ts` (and would have been a third time in the scorer) — hand-sync slop of the same kind as the Pass A/B duplication. |
| `src/mastra/workflows/steps/extract-items.ts` | Modify | Throws on ANY failure (transport, validation, empty object) so `retries: 2` is real and the run's own `status: 'failed'` is the failure signal. All `failed`/`errorMessage` plumbing deleted — that was persistence-shaped state threaded through AI schemas. |
| `src/mastra/workflows/steps/audit-items.ts` | Delete | Second blocking PDF pass replaced by the scorer. |
| `src/mastra/workflows/steps/merge-items.ts` | Delete | Replaced by `expand-lines.ts` (same dedup, new expansion). |
| `src/mastra/workflows/steps/expand-lines.ts` | Create | Pure step: dedup by quote + structural key, content-addressed ids, drop-and-log invalid scopes, expand work items → discriminated lines with pending labor hours. Exports `roundToQuarter` (single definition, shared with price-line). |
| `src/mastra/workflows/steps/price-items.ts` | Delete | Hand-rolled sequential loop replaced by `.foreach`. |
| `src/mastra/workflows/steps/price-line.ts` | Create | Prices exactly ONE line; the `.foreach` unit of work. Resolves labor hours (`inspector → estimated → fallback 1`). Graceful per-line `lookup-failed` default (docs-endorsed pattern), no dead `retries`. |
| `src/mastra/workflows/steps/mark-processing.ts` | Delete | A DB write inside the AI process. The caller flips `processing` before starting the run and supplies `zipCode` as workflow input (it owns the row). |
| `src/mastra/workflows/steps/persist-success.ts` | Delete | A DB write inside the AI process. Envelope assembly + write move to the caller. |
| `src/mastra/workflows/steps/persist-failure.ts` | Delete | A DB write inside the AI process, plus the mirror-schema hack ("input schema mirrors extract-items' output ... the failure path simply ignores it") that existed only to satisfy `.branch()` wiring. Both dissolve with the branch itself. |
| `src/mastra/workflows/summarize-estimate.ts` | Modify | Pure linear wiring: `extract-items` → `expand-lines` → `.map` fan-out → `.foreach(priceLineStep, { concurrency: 3 })` → `.map` collect. No branch, no DB, output is `{lines, prices}`. |
| `src/mastra/workflows/lib/classify-error.ts` | Delete (move) | It maps gateway errors to USER-FACING English — presentation, not AI processing. Moves verbatim to `src/features/estimate/lib/classify-error.ts` where its output is actually consumed. |
| `src/mastra/index.ts` | Modify | Registers the scorer for Studio visibility. |
| `src/features/estimate/lib/classify-error.ts` | Create | The moved file, unchanged. |
| `src/features/estimate/lib/envelope.ts` | Modify | Adds `'v3'` parse arm. |
| `src/features/estimate/lib/workflow.ts` | Modify | Becomes the SINGLE writer of estimate-row state: reads zipCode, flips `processing`, runs the pure workflow, writes `completed`+envelope or `failed`+classified message. The `ne(status, …)` clobber-guards die with the multi-writer race they existed for. Also fixes the live stuck-on-`processing` bug (non-success today only logs). |
| `src/features/estimate/components/estimate-report.tsx` | Modify | Routes v3 `lines` into `ItemsSection`. |
| `src/features/estimate/components/items-section.tsx` | Modify | Prop type widened to lines; header copy restored to the v3 prototype's "Labor is always measured in Hours." |
| `package.json` | Modify | Remove `jsonrepair` (last consumer deleted). |

## Existing Pattern Audit

- **Named-step wiring diagram.** `summarize-estimate.ts` self-describes as "the
  workflow body is a wiring diagram; adding a stage = one `.then(...)` line."
  The redesign keeps that exact philosophy — every stage remains a named
  exported step; the only new wiring constructs (`.map`, `.foreach`) are
  first-class Mastra primitives from the same `createWorkflow` builder already
  in use.
- **Resilient-step + `.branch()` failure routing — deliberately retired.**
  `extract-items` returns `failed: true` and `.branch()` routes to
  `persist-failure`. This pattern existed to carry a failure INTO the
  workflow so an in-workflow step could write the DB. With persistence moved
  to the caller (review revision), the run's own `failed` status is the
  failure signal, extract-items simply throws (finally engaging the
  `retries` its doc comment already claimed), and the branch plus its
  mirror-schema hack dissolve. The docs' non-fatal-step guidance still
  applies where it belongs: per-line graceful defaults inside
  `price-line.ts`.
- **Graceful per-item pricing degradation.** `price-items.ts` establishes
  "one bad item never poisons the batch" (`lookup-failed` rows). Kept in
  `price-line.ts` — and it is the docs' own recommendation: "catch errors
  within step logic to return graceful defaults." What is dropped is the
  step's dead `retries: 1` (a throw never escapes the catch today).
- **Versioned envelope discrimination.** v1 → v2 already set the precedent:
  new version literal, old schemas stay, reader discriminates. v3 follows it
  exactly (`SUMMARY_ENVELOPE_VERSION_3`, `parseSummaryEnvelope` adds one arm).
- **Deterministic classification lives in `agent-rules.ts`.**
  `ACTION_COST_PROFILE` ("this is deterministic, not a model judgment call")
  already owns the split decision. Unchanged — the expansion step keeps
  reading it. `pricingBasisFor` keeps its shape (pure function of
  action+costType) with renamed bases.
- **Content-addressed ids.** `merge-items.ts`'s sha256 ids and
  `-material`/`-labor` suffixes survive verbatim in `expand-lines.ts` — id
  stability across re-runs is load-bearing for `priceByItemId` joins.
- **Renderer formats defensively.** `format.ts` functions take `string` and
  fall back gracefully on unknown values; both old `BillableItem` and new
  `BillableLine` render through the same functions with zero changes there.
- **Where this plan deliberately BREAKS with existing patterns** (contained
  normalization, per the user's explicit direction):
  1. The guard-retry-with-feedback loop (`ItemContractGuard` +
     `maxProcessorRetries`) is removed rather than preserved, because
     provider-enforced `response_format` makes its parse/enum layers
     redundant, and its remaining semantic layer was keyword heuristics the
     user has banned. The one rule worth keeping (scope shape) moves to the
     same drop-and-log safety net `merge-items.ts` already applies today.
  2. In-workflow persistence (`mark-processing` / `persist-success` /
     `persist-failure`) is removed rather than preserved. It made the AI
     process a DB writer alongside the caller's backstop — three writers,
     one row, guard conditions to referee them. Single-writer-at-the-caller
     is the contained replacement, and the purity gate in the Validation
     Plan keeps it that way mechanically.

## Execution Plan

Steps are ordered so `pnpm exec tsc --noEmit` is clean after step 10 (single
compile gate at the end, matching the repo's established plan style):

1. `src/mastra/agents/billable-item-extractor.schema.ts` — new shapes.
2. `src/mastra/agents/item-pricer.schema.ts` — pricer response split.
3. `src/mastra/config/gateway.ts` (create) and
   `src/mastra/config/agent-rules.ts` — pricing bases; drop verb re-export.
4. `src/mastra/scorers/extraction-consistency.ts` — new scorer.
5. `src/mastra/agents/billable-item-extractor.ts` — slim prompt, scorer on,
   guard off, shared gateway.
6. `src/mastra/agents/item-pricer.ts` — hourly-labor prompt, shared gateway.
7. Delete: `processors/item-contract-guard.ts`, the whole
   `processors/item-contract-guard/` directory, `steps/audit-items.ts`,
   `steps/merge-items.ts`, `steps/price-items.ts`,
   `steps/mark-processing.ts`, `steps/persist-success.ts`,
   `steps/persist-failure.ts`, `workflows/lib/classify-error.ts`.
8. Create `steps/expand-lines.ts`, `steps/price-line.ts`; modify
   `steps/extract-items.ts`.
9. `workflows/summarize-estimate.ts` — pure linear rewire;
   `src/mastra/index.ts` — register scorer.
10. Caller + renderer: create `features/estimate/lib/classify-error.ts`
    (moved file); modify `lib/workflow.ts` (single writer), `lib/envelope.ts`,
    `components/estimate-report.tsx`, `components/items-section.tsx`.
11. `package.json` — remove `jsonrepair`; run `pnpm install`.
12. Validation gates (below), then stop for review.

## File-by-File Changes

### `src/mastra/agents/billable-item-extractor.schema.ts`

**Action:** Modify
**Why:** Make the v3 invariants types instead of prompts: the model-facing
shape can no longer express a costType, an `hrs` physical unit, or a split;
the persisted shape can no longer express a labor line that isn't hours or a
material line that is.
**Impact:** Everything downstream (steps, pricer, renderer) keys off the new
`ExtractedWorkItem` / `BillableLine` types. Old `billableItemSchema` +
v1/v2 envelopes remain exported, used only by the envelope reader.

#### Before

```ts
/**
 * Unit the inspector's count refers to. The report renders this as a chip
 * next to the quantity (e.g. "0.5 CY", "8 SF", "6 HRS").
 *
 * 'sqft' is a legacy alias for 'sf'. It stays in the enum so old persisted
 * envelopes still parse and a model emission of "sqft" doesn't burn a
 * guard retry, but `merge-items.ts` normalizes it to 'sf' before anything
 * is priced or persisted — new data never contains 'sqft'.
 *
 * Labor lines carry the physical unit the labor is measured in ('ea',
 * 'sf', 'lf', ...) unless the inspector explicitly gave hours. The report
 * renders the unit as stored; per-unit labor rates are a standard trade
 * convention and the pricer prices per that unit.
 */
export const UNIT = ['ea', 'lf', 'sf', 'sqft', 'cy', 'hrs'] as const;
```

```ts
  quantity: z.number().int().min(1),

  /**
   * Unit of the count. REQUIRED. Pick the unit the inspector's count
   * refers to. For labor use 'hrs' if the inspector gave hours, else
   * the physical unit the labor is measured in ('sf' for square-footage
   * work, 'lf' for linear-footage work). NEVER invent a unit.
   */
  unit: z.enum(UNIT),
```

```ts
export const extractedItemSchema = billableItemSchema.omit({
  costType: true,
});

export type ExtractedItem = z.infer<typeof extractedItemSchema>;
```

```ts
export const extractedItemGuardSchema = extractedItemSchema.extend({
  trade: z.string(),
  action: z.string(),
  unit: z.string(),
});

export type ExtractedItemGuard = z.infer<typeof extractedItemGuardSchema>;

export const billableExtractionSchema = z.object({
  items: z.array(extractedItemSchema),
});

export type BillableExtraction = z.infer<typeof billableExtractionSchema>;
```

(`TRADE`, `ACTION`, `COST_TYPE`, `billableItemSchema`'s other fields,
`pricedLineItemSchema`, and the v1/v2 envelope schemas are unchanged by this
plan and are elided here.)

#### After

The `UNIT` doc comment and the four blocks above are replaced by the
following (inserted after `COST_TYPE`; `billableItemSchema` itself is left
exactly as-is, re-labeled a legacy read shape in its doc comment):

```ts
/**
 * LEGACY unit enum for v1/v2 envelopes already on disk. New data never
 * uses this — v3 lines are `billableLineSchema` below, where the unit is
 * structural (material: EXTENT_UNIT, labor: literal 'hrs').
 */
export const UNIT = ['ea', 'lf', 'sf', 'sqft', 'cy', 'hrs'] as const;

/**
 * Physical units a MATERIAL extent can be measured in. `hrs` is
 * deliberately absent: hours are not a physical extent, and the extractor
 * is structurally unable to emit them as one. This single enum is what
 * previously required prompt paragraphs, two keyword lists, and two guard
 * checks to approximate.
 */
export const EXTENT_UNIT = ['ea', 'lf', 'sf', 'cy'] as const;
export type ExtentUnit = (typeof EXTENT_UNIT)[number];

/**
 * The model's output contract: a WORK ITEM — what the inspector found and
 * wants done, with its physical extent. Not a billable line: costType,
 * material/labor splitting, and hours-estimation are downstream concerns
 * the model never sees (expand-lines and the pricer own them).
 *
 * Every constraint here is expressible in the provider's response_format
 * JSON schema (enums, ints, min, nullable), so the provider itself
 * enforces the shape — no post-hoc guard, no retry-with-feedback loop.
 */
/**
 * Identity fields shared by the work-item shape and both v3 line shapes.
 * Declared once so the three schemas can never drift on them by hand.
 */
const itemIdentityFields = {
  /** Stable id. Model emits "item-001"-style; expand-lines re-derives content-addressed ids. */
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  /** Short, specific noun phrase naming what is acted on. */
  scope: z.string().min(1),
  /** Verbatim location language from the report. */
  location: z.string().min(1),
  sourceQuote: z.string().min(8).max(500),
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
} as const;

export const extractedWorkItemSchema = z.object({
  ...itemIdentityFields,
  /**
   * Physical extent of the work: how much of the thing there is, in the
   * unit that kind of material is sold/measured in. When the report gives
   * no measurement for a discrete component, `{ quantity: 1, unit: 'ea' }`.
   */
  extent: z.object({
    quantity: z.number().int().min(1),
    unit: z.enum(EXTENT_UNIT),
  }),
  /**
   * Hours ONLY when the inspector explicitly stated them. Null otherwise —
   * the pricer estimates missing hours downstream. Never invented.
   * (Normalized to quarter-hours in expand-lines; kept a plain positive
   * number here so an emission of e.g. 1.3 can't fail strict validation.)
   */
  inspectorHours: z.number().positive().nullable(),
});

export type ExtractedWorkItem = z.infer<typeof extractedWorkItemSchema>;

export const workItemExtractionSchema = z.object({
  items: z.array(extractedWorkItemSchema),
});

export type WorkItemExtraction = z.infer<typeof workItemExtractionSchema>;

/**
 * A persisted v3 billable line. Discriminated union = the v3 prototype's
 * unit discipline as a TYPE:
 *
 *   "every Labor row uses HRS. Material uses the physical unit
 *    (EA / SF / LF / CY). HRS never appears on a Material row; EA / SF /
 *    LF / CY never appear on a Labor row."  — fixpro-report-mock.v3.html
 *
 * A violating line is not invalid data caught by a guard — it is
 * unrepresentable.
 */
export const materialLineSchema = z.object({
  ...itemIdentityFields,
  costType: z.literal('material'),
  quantity: z.number().int().min(1),
  unit: z.enum(EXTENT_UNIT),
});

export const laborLineSchema = z.object({
  ...itemIdentityFields,
  costType: z.literal('labor'),
  /** Hours, in quarter-hour increments — the v3 mock's 0.25 / 1.5 / 3.5 / 4.5. */
  quantity: z.number().multipleOf(0.25).min(0.25),
  unit: z.literal('hrs'),
  /** Where the hours came from: the inspector, the pricer's estimate, or the 1-hour fallback when neither produced a number. */
  hoursSource: z.enum(['inspector', 'estimated', 'fallback']),
});

export const billableLineSchema = z.discriminatedUnion('costType', [
  materialLineSchema,
  laborLineSchema,
]);

export type MaterialLine = z.infer<typeof materialLineSchema>;
export type LaborLine = z.infer<typeof laborLineSchema>;
export type BillableLine = z.infer<typeof billableLineSchema>;
```

And the envelope section gains v3 (v1/v2 schemas untouched above it):

```ts
export const SUMMARY_ENVELOPE_VERSION_3 = 3 as const;

/**
 * v3: discriminated lines + prices. For a labor line, `unitPrice` on the
 * matching `PricedLineItem` is the HOURLY RATE; the report's
 * quantity × unitPrice arithmetic is hours × rate, per the v3 prototype.
 */
export const summaryEnvelopeV3Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_3),
  lines: z.array(billableLineSchema),
  prices: z.array(pricedLineItemSchema),
});

export type SummaryEnvelopeV3 = z.infer<typeof summaryEnvelopeV3Schema>;
```

Deleted outright: `extractedItemSchema`, `ExtractedItem`,
`extractedItemGuardSchema`, `ExtractedItemGuard`, `billableExtractionSchema`,
`BillableExtraction` (consumers are all deleted or rewritten by this plan).
`billableItemSchema` + `BillableItem` + v1/v2 envelope schemas stay for the
reader.

#### Reasoning

- The discriminated union is the centerpiece of the whole plan: three
  keyword-guard checks, two prompt rule-blocks, and the unit-cloning bug in
  `merge-items.ts` all existed to police a boundary Zod can simply draw.
- `inspectorHours` deliberately allows any positive number at the model
  boundary and is quarter-rounded deterministically downstream — putting
  `multipleOf` on the MODEL-facing schema would turn "inspector said ~1.3
  hours" into a hard validation throw for zero user value.
- `extent` defaulting to `{1, 'ea'}` for unmeasured discrete components is
  safe in v3 where it was slop in v2: material lines only exist for
  install/replace (a purchasable part — a receptacle, a water heater), and
  repair-type "1 EA of wood siding" lines can no longer exist because
  labor-only actions produce an hours line, never a physical-unit line.

---

### `src/mastra/agents/item-pricer.schema.ts`

**Action:** Modify
**Why:** "Labor is priced hourly" becomes a response type, not a prompt rule.
**Impact:** `price-line.ts` selects the schema by the line's `costType`.

#### Before

```ts
export const itemPricerResponseSchema = z
  .object({
    unitPrice: z.number().int().min(0).nullable(),
    currency: z.literal('USD'),
    confidence: z.enum(['high', 'medium', 'low']),
    source: z.string().min(1).max(120),
    unavailableReason: z.string().min(1).max(280).nullable(),
  })
  // Mechanical cross-field rule (was prose-only in the agent prompt):
  // exactly one of unitPrice / unavailableReason is non-null. ...
  .superRefine((r, ctx) => {
    if (r.unitPrice === null && r.unavailableReason === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['unavailableReason'],
        message: 'unavailableReason is required when unitPrice is null',
      });
    }
    if (r.unitPrice !== null && r.unavailableReason !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['unavailableReason'],
        message: 'unavailableReason must be null when unitPrice is present',
      });
    }
  });

export type ItemPricerResponse = z.infer<typeof itemPricerResponseSchema>;
```

#### After

```ts
const priceEvidenceFields = {
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1).max(120),
  unavailableReason: z.string().min(1).max(280).nullable(),
} as const;

/** Exactly one of `priced` / `unavailableReason` is non-null. */
function xorUnavailable(
  priced: number | null,
  unavailableReason: string | null,
  ctx: z.RefinementCtx,
): void {
  if (priced === null && unavailableReason === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['unavailableReason'],
      message: 'unavailableReason is required when no price is returned',
    });
  }
  if (priced !== null && unavailableReason !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['unavailableReason'],
      message: 'unavailableReason must be null when a price is returned',
    });
  }
}

/**
 * Response for a MATERIAL line: price of the part per physical unit.
 * Identical semantics to the old v2 response.
 */
export const materialPriceResponseSchema = z
  .object({
    unitPrice: z.number().int().min(0).nullable(),
    ...priceEvidenceFields,
  })
  .superRefine((r, ctx) => xorUnavailable(r.unitPrice, r.unavailableReason, ctx));

export type MaterialPriceResponse = z.infer<typeof materialPriceResponseSchema>;

/**
 * Response for a LABOR line: an HOURLY RATE plus the hours the job takes.
 * `estimatedHours` is REQUIRED whenever a rate is returned — when the
 * inspector already stated hours the caller ignores it, but requiring it
 * unconditionally keeps the schema flat (no cross-request variance) and
 * costs one small number.
 */
export const laborPriceResponseSchema = z
  .object({
    hourlyRate: z.number().int().min(0).nullable(),
    /** Whole-job hours at that rate. Quarter-rounded by the caller. */
    estimatedHours: z.number().positive().max(160).nullable(),
    ...priceEvidenceFields,
  })
  .superRefine((r, ctx) => {
    xorUnavailable(r.hourlyRate, r.unavailableReason, ctx);
    if (r.hourlyRate !== null && r.estimatedHours === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['estimatedHours'],
        message: 'estimatedHours is required when hourlyRate is returned',
      });
    }
  });

export type LaborPriceResponse = z.infer<typeof laborPriceResponseSchema>;
```

`pricedLineItemSchema` / `PricedLineItem` re-exports stay unchanged. The old
`itemPricerResponseSchema` is deleted (sole consumer `price-items.ts` is
deleted).

#### Reasoning

- One agent, two typed contracts selected by a computed fact (`costType`) —
  same "the model is never asked to classify" philosophy the repo already
  applies to costType itself.
- `max(160)` bounds hour estimates to one crew-month — a sanity ceiling the
  provider enforces via response_format, so a hallucinated "2000 hours" fails
  structurally rather than reaching the report.

---

### `src/mastra/config/agent-rules.ts`

**Action:** Modify
**Why:** Pricing bases now describe the v3 money model; the verb re-export's
only consumer (the deleted validator) is gone.
**Impact:** `price-line.ts` consumes `pricingBasisFor`; nothing else changes.

#### Before

```ts
import { ACTION_VERBS } from '../agents/processors/item-contract-guard/item-heuristics';
import type { Action, CostType } from '../agents/billable-item-extractor.schema';
```

```ts
export type PricingBasis =
  | 'material-part-only'
  | 'labor-excluding-part'
  | 'all-in-job';

export function pricingBasisFor(action: Action, costType: CostType): PricingBasis {
  if (ACTION_COST_PROFILE[action] === 'labor-only') return 'all-in-job';
  return costType === 'material' ? 'material-part-only' : 'labor-excluding-part';
}

/**
 * Verbs that the extractor is told to keep out of `scope`. ...
 */
export const ACTION_VERBS_SET: ReadonlySet<string> = ACTION_VERBS;
```

#### After

```ts
import type { Action, CostType } from '../agents/billable-item-extractor.schema';
```

```ts
/**
 * What the pricer's number must cover for one line. Derived
 * deterministically from (action, costType) — never a model judgment:
 *
 *   - 'material-part-only'   — material half of an install/replace pair.
 *     Price the part per physical unit; the sibling labor line covers
 *     installation.
 *   - 'labor-install-hourly' — labor half of an install/replace pair.
 *     HOURLY RATE for installing the sibling part; exclude the part cost.
 *   - 'labor-all-in-hourly'  — labor-only actions (repair / service /
 *     evaluate / remove). There is NO material sibling, so the hourly
 *     rate must be the all-in rate a contractor quotes for that work:
 *     labor PLUS incidental materials (patching compound, sealant,
 *     fasteners) PLUS disposal where the action implies it.
 */
export type PricingBasis =
  | 'material-part-only'
  | 'labor-install-hourly'
  | 'labor-all-in-hourly';

export function pricingBasisFor(action: Action, costType: CostType): PricingBasis {
  if (costType === 'material') return 'material-part-only';
  return ACTION_COST_PROFILE[action] === 'labor-only'
    ? 'labor-all-in-hourly'
    : 'labor-install-hourly';
}
```

(`ACTION_COST_PROFILE` and its doc comment are unchanged; `ACTION_VERBS_SET`
and the heuristics import are deleted; the file-header comment's reference to
item-heuristics re-exporting is updated to match.)

#### Reasoning

- `all-in-job` (a lump job price) is incompatible with the v3 arithmetic
  where every labor total is hours × rate; `labor-all-in-hourly` preserves
  the same underbilling fix (incidental materials fold into the rate) inside
  the hourly model.

---

### `src/mastra/config/gateway.ts`

**Action:** Create
**Why:** The identical `createOpenAI` Kilo config is copy-pasted today at
`billable-item-extractor.ts:5-8` and `item-pricer.ts:4-7`, and the scorer
would have made a third copy — the same hand-sync duplication anti-pattern
this session's audit flagged in the Pass A/B call sites.
**Impact:** Three consumers, one definition; a gateway change (URL, auth,
headers) becomes a one-line edit.

#### After (new file, complete)

```ts
import { createOpenAI } from '@ai-sdk/openai';

/**
 * The single Kilo AI-gateway instance every agent and scorer routes
 * through. Model selection stays at each call site (e.g.
 * `kiloGateway('openai/gpt-5.4-mini')`); transport config lives only here.
 */
export const kiloGateway = createOpenAI({
  apiKey: process.env.KILO_API_KEY!,
  baseURL: 'https://api.kilo.ai/api/gateway',
});
```

In `billable-item-extractor.ts` and `item-pricer.ts`, the local
`const gateway = createOpenAI({ ... })` block and the `createOpenAI` import
are deleted and replaced by:

```ts
import { kiloGateway } from '../config/gateway';
```

with `gateway('openai/gpt-5.4-mini')` becoming
`kiloGateway('openai/gpt-5.4-mini')` at both model sites.

---

### `src/mastra/scorers/extraction-consistency.ts`

**Action:** Create
**Why:** Replace the blocking Pass-B audit LLM call with Mastra's native
background evaluation primitive. Scoped in review to what a judge can
HONESTLY assess: the judge never receives the PDF (only the extractor
does), so it judges the emitted items' internal consistency — not
grounding-against-source, and not completeness (see Risk Notes for the
recall consequence).
**Impact:** New file; attached to the extractor agent; registered on the
Mastra instance. Never blocks or mutates pipeline output.

#### After (new file, complete)

```ts
import { createScorer } from '@mastra/core/evals';
import { z } from 'zod';
import { kiloGateway } from '../config/gateway';

/**
 * Background LLM-judge scorer for the billable-item extractor.
 *
 * Judges what is judgeable WITHOUT the source document (the judge sees
 * only the extractor's emitted items, never the PDF):
 *
 *   1. Internal consistency — does each item's verbatim sourceQuote name
 *      the defect and action the item claims in scope/action/trade, or
 *      was the quote stretched to cover it?
 *   2. Compound scopes — one item naming two distinct physical components
 *      ("trim or wood siding"), a ONE-ITEM-PER-FIX violation. This is the
 *      deleted keyword guard's mixed-material check reborn as observation
 *      instead of gating — and without the substring false-match problem
 *      ("waterproofing" matching "roofing") the keyword approach had.
 *
 * Completeness ("did the extractor MISS defects?") is deliberately NOT
 * judged: it requires document text the scorer does not have. Deferred —
 * see Risk Notes.
 */
const analyzeOutputSchema = z.object({
  /** How many items the judge saw in the extractor's output. */
  itemCount: z.number().int().min(0),
  /** ids whose sourceQuote does not support the item's scope/action/trade. */
  inconsistentItemIds: z.array(z.string()),
  /** ids whose scope names two or more distinct physical components. */
  compoundScopeItemIds: z.array(z.string()),
});

export const extractionConsistencyScorer = createScorer({
  id: 'extraction-consistency',
  name: 'Extraction Consistency',
  description:
    'Judges whether each extracted work item is internally consistent ' +
    '(sourceQuote supports scope/action/trade) and names exactly one ' +
    'physical component.',
  judge: {
    model: kiloGateway('openai/gpt-5.4-mini'),
    instructions:
      'You audit billable work items extracted from a home inspection ' +
      'report. You see ONLY the emitted items, never the source document. ' +
      'You judge two things per item: (1) whether its verbatim sourceQuote ' +
      'names the defect and action the item claims in scope/action/trade, ' +
      'and (2) whether its scope names exactly one physical component. ' +
      'You never judge pricing and never invent defects.',
  },
  type: 'agent',
})
  .analyze({
    description: 'Flag internally inconsistent items and compound scopes',
    outputSchema: analyzeOutputSchema,
    createPrompt: ({ run }) =>
      'ITEMS THE EXTRACTOR EMITTED:\n' +
      JSON.stringify(run.output) +
      '\n\nReturn JSON: { "itemCount": number, "inconsistentItemIds": ' +
      'string[], "compoundScopeItemIds": string[] }. Count every emitted ' +
      'item in itemCount. Flag an id in inconsistentItemIds ONLY when its ' +
      'sourceQuote clearly fails to name the defect or action the item ' +
      'claims. Flag an id in compoundScopeItemIds ONLY when the scope ' +
      'names two or more distinct physical components (e.g. "trim or wood ' +
      'siding") — one component with two symptoms ("peeling and chipping ' +
      'paint") is fine.',
  })
  .generateScore(({ results }) => {
    const { itemCount, inconsistentItemIds, compoundScopeItemIds } =
      results.analyzeStepResult;
    if (itemCount === 0) return 1;
    const flagged = new Set([...inconsistentItemIds, ...compoundScopeItemIds]).size;
    return Math.max(0, 1 - flagged / itemCount);
  })
  .generateReason(({ results, score }) => {
    const { inconsistentItemIds, compoundScopeItemIds } = results.analyzeStepResult;
    return (
      `score=${score.toFixed(2)}; ` +
      `inconsistent=[${inconsistentItemIds.join(', ')}]; ` +
      `compound=[${compoundScopeItemIds.join(', ')}]`
    );
  });
```

#### Reasoning

- `createScorer` + `judge` + `.analyze/.generateScore/.generateReason` is the
  installed 1.37.1 builder surface (verified in
  `dist/evals/base.d.ts`), imported from `@mastra/core/evals` — no new
  dependency.
- The score derives ENTIRELY from the analyze step's typed output —
  including `itemCount`, which the judge counts from the same items it
  reads. An earlier draft cast `run.output` to a guessed shape to count
  items itself; that was a hand-rolled assumption about agent-type scorer
  run data, and it's gone.
- The compound-scope check restores coverage for the defect class the
  deleted `checkMixedMaterialTypeScope` keyword guard caught, as telemetry
  rather than a blocking gate.
- What is deliberately LOST vs. Pass B: missed-item detection and
  re-injection. A completeness judge needs document text; that capability
  arrives with a text-extraction layer (the parked Docling transport plan
  produces exactly the markdown a judge would need) and belongs in this
  same scorer slot when it does. Risk Notes states the interim consequence
  plainly.

---

### `src/mastra/agents/billable-item-extractor.ts`

**Action:** Modify
**Why:** Delete every prompt rule the schema now owns; drop the guard; attach
the scorer.
**Impact:** Prompt shrinks ~45%; agent config loses `outputProcessors` /
`maxProcessorRetries`, gains `scorers`.

#### Before

```ts
import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
import { ItemContractGuard } from './processors/item-contract-guard';
```

```ts
- unit: REQUIRED. One of ea, lf, sf, cy, hrs. Pick the unit REAL
  CONTRACTORS use to quote that TYPE of material or labor — this is a
  fact about the trade, not something you need the report to state
  explicitly. Do NOT default to 'ea' just because no measurement is
  given in the text.
    - AREA-measured materials (siding, drywall, roofing/shingles,
      flooring, insulation, stucco, plaster) -> 'sf', even with no square
      footage stated in the report.
    - LENGTH-measured materials (trim, fascia, soffit, gutter, fencing,
      railing, baseboard) -> 'lf', even with no footage stated.
    - Genuinely discrete, individually-purchased items (a receptacle, a
      breaker, a valve, a damper door, a water heater, a single fixture)
      -> 'ea'. Correct ONLY for something bought and counted as one whole
      unit — never for a material sold by the square or linear foot.
    - Time-based labor with an inspector-STATED hour count -> 'hrs'.
    - 'cy' (cubic yards) for bulk material volume (concrete, fill dirt)
      when the report gives a volume.
  BAD -> GOOD:
    "damaged wood siding" + unit 'ea' -> unit 'sf'
    "loose exterior trim" + unit 'ea' -> unit 'lf'
    "leaning chimney structure" (a whole-structure repair, not sold by
      the foot) -> unit 'ea' is correct here
  If a candidate names TWO different physical components joined by
  "or"/"and" (e.g. "trim or wood siding"), they almost always have
  DIFFERENT correct units — split into TWO separate items, one per
  component, each with its own scope/unit. NEVER emit one item naming two
  different components. NEVER invent a unit the report does not support.
```

```ts
  model: gateway('openai/gpt-5.4-mini'),
  outputProcessors: [new ItemContractGuard()],
  maxProcessorRetries: 3,
});
```

#### After

Imports and config (local gateway block deleted per `config/gateway.ts`):

```ts
import { Agent } from '@mastra/core/agent';
import { kiloGateway } from '../config/gateway';
import { extractionConsistencyScorer } from '../scorers/extraction-consistency';
```

```ts
  model: kiloGateway('openai/gpt-5.4-mini'),
  scorers: {
    consistency: {
      scorer: extractionConsistencyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
});
```

The instructions' `FIELDS YOU MUST PRODUCE PER ITEM` section replaces the
`quantity`/`unit` bullets (everything from `- quantity: REQUIRED.` through the
end of the old `- unit:` bullet) with:

```text
- extent: REQUIRED object { quantity, unit }. The physical extent of the
  work: how much of the thing there is, in the unit that material is sold
  or measured in (ea = discrete purchasable component, lf = linear feet,
  sf = square feet, cy = cubic yards). Count rules, in order:
    1. Specific digit ("3 shingles", "20% of shingles" -> 20): that number.
    2. Written-out number ("two outlets"): that number.
    3. "both" -> 2.
    4. "all" / "every" / "each" / "the remaining" -> 1 (the whole set; the
       contractor prices the full assembly).
    5. No count word for a discrete component -> { quantity: 1, unit: "ea" }.
  Better to overbill than underbill: prefer the higher defensible reading.
  NEVER drop an item because the count is fuzzy. NEVER invent a
  measurement the report does not support.
- inspectorHours: hours as a number ONLY when the inspector explicitly
  stated an hour count for the work. In every other case: null. NEVER
  estimate hours yourself — hour estimation happens downstream.
```

Everything else in the instructions (definition, grounding tests, hard rules
1–7, trade/action/scope/location/sourceQuote/pageHint bullets, output format)
is unchanged except: the scope bullet's BAD→GOOD block stays, and the
`OUTPUT FORMAT` sentence now names `items` of work items rather than billable
items.

#### Reasoning

- The 30-line unit-conventions block existed to stop `'ea'`-slop on labor and
  repair lines. Those lines can no longer carry a physical unit at all, and
  material lines only exist for purchasable parts — the remaining honest
  instruction is one line ("the unit that material is sold or measured in").
- The mixed-component ("trim or wood siding") prompt rule and its two keyword
  guard checks are dropped, not relocated: the existing `ONE ITEM PER FIX`
  hard rule already states the requirement, and the consistency scorer's
  `compoundScopeItemIds` judgment observes violations as they occur —
  without the keyword approach's substring false-matches.
- `maxProcessorRetries` had one purpose — the guard. With provider-enforced
  `response_format` there is no parse/enum failure mode left to retry with
  feedback; genuine validation failure is handled at the workflow layer
  (extract-items → failure branch), where it always ultimately landed anyway.

---

### `src/mastra/agents/item-pricer.ts`

**Action:** Modify
**Why:** The pricer now answers two typed questions — part price per unit, or
hourly rate + hours — under three bases.
**Impact:** Instructions rewritten; agent config (id/name/model) unchanged.

#### Before

```ts
INPUT
The user message names the trade, action, scope, location, quantity, the
unit (ea | lf | sf | cy | hrs), the cost type (labor | material), the
pricingBasis (material-part-only | labor-excluding-part | all-in-job),
the inspector's verbatim sourceQuote, and a zip code. Treat the
sourceQuote as authoritative — it is the inspector's own words. The
unit, costType, and pricingBasis are computed facts; pass unit and
costType through unchanged and obey pricingBasis exactly.
```

```ts
5. The unitPrice is PER UNIT OF QUANTITY. The report multiplies by
   quantity itself. Example: item is "replace 3 shingles", quantity is 3;
   you return the price PER SHINGLE, not for all three.
6. The input tells you pricingBasis. It is computed by the system, not a
   judgment call for you. It says exactly what your number must include:
   - "material-part-only": price ONLY the physical part/materials (what
     it costs to buy the item). A separate labor line covers
     installation — include NO labor charge.
   - "labor-excluding-part": price ONLY the labor to perform the named
     action on this item. A separate material line covers the part —
     include NO part cost.
   - "all-in-job": there is NO other line for this job. Price the
     complete job the way a contractor quotes it: labor PLUS incidental
     materials (patching compound, sealant, fasteners, filters,
     refrigerant) PLUS haul-away/disposal where the action implies it.
   A "replace receptacle" job sends you two separate calls
   (material-part-only for the receptacle, labor-excluding-part for the
   swap). A "repair drywall" job sends you ONE call (all-in-job) and
   your number must cover the mud, tape, and paint touch-up a
   contractor would fold in — never price bare labor for an all-in-job
   line.
```

#### After

```ts
INPUT
The user message names the trade, action, scope, location, the cost type
(labor | material), the pricingBasis, the physical extent of the work,
any inspector-stated hours, the inspector's verbatim sourceQuote, and a
zip code. Treat the sourceQuote as authoritative — it is the inspector's
own words. costType and pricingBasis are computed facts; obey them
exactly. The structured-output schema you are given differs by costType —
match it exactly.
```

```ts
5. MATERIAL lines ("material-part-only"): return unitPrice = the price of
   the part PER PHYSICAL UNIT named in the extent (per shingle, per
   linear foot of lumber, per square foot of drywall). The report
   multiplies by quantity itself. Include NO labor charge — a separate
   labor line covers installation.
6. LABOR lines: return hourlyRate (whole USD per hour for that trade in
   that zip code) AND estimatedHours (how many hours the described work
   takes for the stated extent, using the extent and sourceQuote to judge
   job size). estimatedHours is required whenever you return a rate; if
   inspector-stated hours were provided in the input they take precedence
   downstream, but return your own estimate anyway.
   - "labor-install-hourly": rate for installing the sibling material
     line's part. Include NO part cost.
   - "labor-all-in-hourly": there is NO material sibling. The rate must
     be the all-in rate a contractor quotes for that work: labor PLUS
     incidental materials (patching compound, sealant, fasteners,
     filters) PLUS haul-away/disposal where the action implies it —
     never a bare-labor rate for this basis.
```

(Hard rules 1–4 and 7–8 and the OUTPUT preamble stay; the OUTPUT field list
is updated to describe both response shapes.)

#### Reasoning

- Hours estimation lands here — not in the extractor — because it is a
  pricing-domain judgment (crew productivity for a trade in a market), and
  because the response schema can then REQUIRE it, making "labor priced
  hourly with real hours" structural rather than hoped-for.

---

### Deletions (5 guard files + 6 step files + 1 lib move)

**Action:** Delete
`src/mastra/agents/processors/item-contract-guard.ts`,
`src/mastra/agents/processors/item-contract-guard/item-validator.ts`,
`src/mastra/agents/processors/item-contract-guard/item-heuristics.ts`,
`src/mastra/agents/processors/item-contract-guard/cleaner.ts`,
`src/mastra/agents/processors/item-contract-guard/extract-json-from-text.ts`,
`src/mastra/workflows/steps/audit-items.ts`,
`src/mastra/workflows/steps/merge-items.ts`,
`src/mastra/workflows/steps/price-items.ts`,
`src/mastra/workflows/steps/mark-processing.ts`,
`src/mastra/workflows/steps/persist-success.ts`,
`src/mastra/workflows/steps/persist-failure.ts`,
`src/mastra/workflows/lib/classify-error.ts` (moved, not lost — recreated
byte-identical at `src/features/estimate/lib/classify-error.ts`).

**Why, per file:**
- `item-contract-guard.ts` — custom retry orchestration whose parse gate
  (`extractFirstJsonObject`) and enum gate (`extractedItemGuardSchema`) are
  provider-enforced by `response_format`, and whose semantic gate is the
  deleted keyword validator. Nothing left to orchestrate.
- `item-validator.ts` — `checkEnum` → schema enums; `checkUnitActionCoupling`,
  `checkMaterialUnitPlausibility`, `checkMixedMaterialTypeScope` → the
  discriminated union makes the defect class unrepresentable;
  `checkScopeShape` → survives as the drop-and-log filter in
  `expand-lines.ts` (its logic inlined there — see that file).
- `item-heuristics.ts` — `AREA_MATERIAL_KEYWORDS`/`LENGTH_MATERIAL_KEYWORDS`
  are exactly the banned mechanical heuristics; `ARTICLES`/`ACTION_VERBS`/
  `SENTENCE_PUNCTUATION_RE` move with the scope filter into
  `expand-lines.ts`'s inlined checks (the only remaining consumer).
- `cleaner.ts` — article-stripping/case-fixing duplicates what
  `format.ts`'s renderer-side title-casing already does for display; stored
  scope no longer needs cosmetic surgery.
- `extract-json-from-text.ts` — fence/brace walking + `jsonrepair` exist to
  parse JSON out of prose; `response_format` returns JSON, not prose.
- `audit-items.ts` — blocking Pass B → `extraction-consistency` scorer.
- `merge-items.ts` — replaced by `expand-lines.ts`; its dedup, id generation,
  and scope safety net carry over verbatim; its unit-cloning split (the v3
  violation) does not.
- `price-items.ts` — its loop becomes `.foreach`; its per-item resilience
  moves into `price-line.ts`.
- `mark-processing.ts`, `persist-success.ts`, `persist-failure.ts` — the
  three DB writers inside the AI process. Their responsibilities move to the
  single caller (`workflow.ts` below). `persist-failure` additionally dies
  with the `.branch()` it existed to satisfy — its own doc comment admits the
  mirror-schema hack ("matching the shape keeps the branch wiring
  straightforward … the failure path simply ignores it").
- `workflows/lib/classify-error.ts` — moved to the features layer verbatim
  (recreated byte-identical at `src/features/estimate/lib/classify-error.ts`).
  Its output is user-facing UI copy; producing presentation strings inside
  the AI process was a layering violation in the same family as the DB
  writes.

---

### `src/mastra/workflows/steps/extract-items.ts`

**Action:** Modify
**Why:** With persistence out of the workflow, failure has exactly one honest
signal: **throw**. Mastra retries the step (`retries: 2` becomes real
config), and if all attempts fail, the RUN is `failed` and the caller
persists the classified message. All `failed`/`errorMessage` plumbing —
persistence-shaped state that today threads through four schemas (extract
output, audit input/output, persist-failure input) — is deleted.
**Impact:** Output shrinks to `{ estimateRequestId, zipCode, workItems }`;
no try/catch remains in the step.

#### Before

```ts
import {
  billableExtractionSchema,
  extractedItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import { classifyError } from '../lib/classify-error';
```

```ts
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(extractedItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  retries: 2,
  execute: async ({ inputData, mastra }) => {
    try {
      const agent = mastra.getAgent('billable-item-extractor');
```

```ts
      // structuredOutput populates `result.object` with the validated payload.
      const extraction = result.object;
      if (!extraction) {
        return {
          estimateRequestId: inputData.estimateRequestId,
          fileUrl: inputData.fileUrl,
          zipCode: inputData.zipCode,
          items: [],
          failed: true,
          errorMessage: 'AI returned malformed extraction. Please retry.',
        };
      }

      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        items: extraction.items,
        failed: false,
        errorMessage: null,
      };
    } catch (e) {
      console.error('Workflow step extract-items failed:', e);
      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        items: [],
        failed: true,
        errorMessage: classifyError(e),
      };
    }
  },
});
```

#### After

```ts
import {
  workItemExtractionSchema,
  extractedWorkItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
```

```ts
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    workItems: z.array(extractedWorkItemSchema),
  }),
  retries: 2,
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent('billable-item-extractor');
```

```ts
    // structuredOutput populates `result.object` with the validated payload.
    // Any failure — transport, gateway, schema validation, empty object —
    // THROWS: Mastra's `retries` re-runs the step, and if every attempt
    // fails the run itself is 'failed'; the caller owns persisting that.
    const extraction = result.object;
    if (!extraction) {
      throw new Error('AI returned malformed extraction (no structured object)');
    }

    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      workItems: extraction.items,
    };
  },
});
```

(The `agent.generate` call — user message, PDF file part, RequestContext —
is unchanged apart from `structuredOutput: { schema: workItemExtractionSchema }`.
The step's doc comment is rewritten to the throw semantics above; `fileUrl`
drops out of the output because nothing downstream reads it anymore.)

#### Reasoning

- One failure channel instead of two. Mastra's run status already models
  "this failed and here is the step error" — carrying a parallel `failed`
  boolean through every downstream schema was duplicate state.
- Tradeoff accepted: `retries` cannot discriminate error types, so a 401
  now burns two fast retries before failing (the old design's
  resilient-return skipped them). Rare, cheap, and it buys deleting the
  entire failure-plumbing layer plus the branch plus persist-failure.

---

### `src/mastra/workflows/steps/expand-lines.ts`

**Action:** Create (successor to `merge-items.ts`)
**Why:** The single deterministic step: dedup → scope safety net → stable ids
→ work-item → discriminated-line expansion with the v3 unit discipline.

#### After (new file, complete)

```ts
import { createStep } from '@mastra/core/workflows';
import { createHash } from 'crypto';
import { z } from 'zod';
import {
  type ExtractedWorkItem,
  billableLineSchema,
  extractedWorkItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import { ACTION_COST_PROFILE } from '@/mastra/config/agent-rules';

/**
 * Deterministically turn deduped work items into v3 billable lines.
 *
 * This is the pipeline's ONLY mechanical step, and everything in it is
 * data-shaping (dedup, ids, expansion, quarter-rounding) — no model-output
 * heuristics live here. Split policy comes from ACTION_COST_PROFILE:
 *
 *   install / replace            → material line (extent) + labor line (hrs)
 *   repair / service / evaluate / remove → labor line (hrs) only
 *
 * Labor quantity here is the inspector's hours when stated (quarter-rounded)
 * or a PENDING null resolved by price-line.ts from the pricer's estimate.
 * The v3 unit discipline is carried by the types: a labor line is
 * `unit: 'hrs'` by construction and a material line cannot carry 'hrs'.
 */

/** Pending line = final line with labor hours possibly not yet resolved. */
export const pendingLineSchema = z.discriminatedUnion('costType', [
  billableLineSchema.options[0], // material — always complete here
  billableLineSchema.options[1].extend({
    quantity: z.number().multipleOf(0.25).min(0.25).nullable(),
    hoursSource: z.enum(['inspector', 'estimated', 'fallback']).nullable(),
  }),
]);

export type PendingLine = z.infer<typeof pendingLineSchema>;

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function structuralKey(it: ExtractedWorkItem): string {
  return [it.trade, it.action, norm(it.scope), norm(it.location)].join('|');
}

/** Content-addressable id — stable across re-runs (same scheme as before). */
function generateItemId(it: ExtractedWorkItem): string {
  const seed = `${it.trade}-${it.action}-${it.scope}-${it.location}`.toLowerCase();
  return 'item-' + createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

/**
 * Scope safety net, carried over from merge-items.ts: a bare category word
 * ("Siding") or a full sentence is not a billable scope. Violations are
 * dropped and logged — never rendered on the client-facing report.
 */
function scopeIsRenderable(scope: string): boolean {
  const tokens = scope.trim().split(/\s+/);
  if (tokens.length < 2) return false;
  return !/[.!?]/.test(scope);
}

/** Single definition — price-line.ts imports this rather than re-rolling it. */
export function roundToQuarter(hours: number): number {
  return Math.max(0.25, Math.round(hours * 4) / 4);
}

export const expandLinesStep = createStep({
  id: 'expand-lines',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    workItems: z.array(extractedWorkItemSchema),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    pendingLines: z.array(pendingLineSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    const seenQuotes = new Set<string>();
    const seenKeys = new Set<string>();
    const deduped: ExtractedWorkItem[] = [];
    let droppedDuplicate = 0;

    for (const it of inputData.workItems) {
      const qKey = norm(it.sourceQuote);
      const kKey = structuralKey(it);
      if (seenQuotes.has(qKey) || seenKeys.has(kKey)) {
        droppedDuplicate++;
        continue;
      }
      seenQuotes.add(qKey);
      seenKeys.add(kKey);
      deduped.push(it);
    }

    const renderable = deduped.filter((it) => scopeIsRenderable(it.scope));
    const droppedByScope = deduped.length - renderable.length;

    const pendingLines: PendingLine[] = [];
    let splitCount = 0;

    for (const it of renderable) {
      const id = generateItemId(it);
      const common = {
        trade: it.trade,
        action: it.action,
        scope: it.scope,
        location: it.location,
        sourceQuote: it.sourceQuote,
        pageHint: it.pageHint,
      };
      const inspectorHours =
        it.inspectorHours === null ? null : roundToQuarter(it.inspectorHours);
      const laborLine: PendingLine = {
        ...common,
        id: ACTION_COST_PROFILE[it.action] === 'labor-only' ? id : `${id}-labor`,
        costType: 'labor',
        unit: 'hrs',
        quantity: inspectorHours,
        hoursSource: inspectorHours === null ? null : 'inspector',
      };

      if (ACTION_COST_PROFILE[it.action] === 'material-and-labor') {
        splitCount++;
        pendingLines.push({
          ...common,
          id: `${id}-material`,
          costType: 'material',
          quantity: it.extent.quantity,
          unit: it.extent.unit,
        });
      }
      pendingLines.push(laborLine);
    }

    mastra.getLogger().info('[extraction-quality]', {
      estimateRequestId: inputData.estimateRequestId,
      extractedCount: inputData.workItems.length,
      droppedDuplicate,
      droppedByScope,
      splitCount,
      finalLineCount: pendingLines.length,
    });

    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      pendingLines,
    };
  },
});

// Referenced by summarize-estimate.ts's fan-out .map — one .foreach element.
export const priceLineInputSchema = z.object({
  estimateRequestId: z.string(),
  zipCode: z.string(),
  line: pendingLineSchema,
});
export type PriceLineInput = z.infer<typeof priceLineInputSchema>;
```

#### Reasoning

- Dedup, sha256 ids, split-id suffixes, and the scope safety net are carried
  over from `merge-items.ts` verbatim in behavior — including that a
  labor-only action's single line keeps the UNSUFFIXED id, preserving id
  compatibility for re-runs of existing estimates.
- What is gone is the v3 violation: the labor line is born `unit: 'hrs'`
  instead of inheriting the material's physical unit, and the material line
  never needs an `hrs → ea` coercion because `hrs` can't reach it.

---

### `src/mastra/workflows/steps/price-line.ts`

**Action:** Create (the `.foreach` unit; successor to `price-items.ts`)
**Why:** Price exactly one line with the costType-matched schema; resolve
labor hours (`inspector → estimated → fallback 1`).

#### After (new file, complete)

```ts
import { createStep } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import {
  type BillableLine,
  billableLineSchema,
  pricedLineItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import {
  laborPriceResponseSchema,
  materialPriceResponseSchema,
} from '@/mastra/agents/item-pricer.schema';
import { pricingBasisFor } from '@/mastra/config/agent-rules';
import { priceLineInputSchema, roundToQuarter } from './expand-lines';

/**
 * Price ONE billable line. Runs as the unit of `.foreach(..., { concurrency: 3 })`
 * in summarize-estimate.ts — throughput is a wiring knob there, not loop
 * code here.
 *
 * Resilience: a per-line failure (malformed response, gateway error) records
 * a 'lookup-failed' price and a fallback-complete line instead of throwing,
 * because one failed iteration would fail the whole .foreach and take the
 * other lines down with it. This is the docs' "catch errors within step
 * logic to return graceful defaults" pattern, inherited from price-items.ts.
 *
 * Labor-hours resolution (v3: every labor total is hours × hourly rate):
 *   1. inspector-stated hours (already on the pending line)   → 'inspector'
 *   2. pricer's estimatedHours, quarter-rounded               → 'estimated'
 *   3. neither (unpriced line)                    → 1 hour,     'fallback'
 * A 'fallback' labor line always also carries a null price, so the report
 * shows "Price Unavailable" rather than a fabricated 1-hour total.
 */
export const priceLineStep = createStep({
  id: 'price-line',
  inputSchema: priceLineInputSchema,
  outputSchema: z.object({
    line: billableLineSchema,
    price: pricedLineItemSchema,
  }),
  execute: async ({ inputData, mastra }) => {
    const { line, zipCode, estimateRequestId } = inputData;
    const log = mastra.getLogger();
    const basis = pricingBasisFor(line.action, line.costType);

    const userText =
      'Price ONE billable line. Return JSON matching the schema.\n\n' +
      `zipCode: ${zipCode}\n` +
      `trade: ${line.trade}\n` +
      `action: ${line.action}\n` +
      `scope: ${line.scope}\n` +
      `location: ${line.location}\n` +
      `costType: ${line.costType}\n` +
      `pricingBasis: ${basis}\n` +
      (line.costType === 'material'
        ? `extent: ${line.quantity} ${line.unit}\n`
        : `inspectorHours: ${line.quantity ?? 'none'}\n`) +
      `sourceQuote: ${JSON.stringify(line.sourceQuote)}`;

    try {
      const agent = mastra.getAgent('item-pricer');
      const schema =
        line.costType === 'material'
          ? materialPriceResponseSchema
          : laborPriceResponseSchema;
      const result = await agent.generate(
        [{ role: 'user', content: [{ type: 'text', text: userText }] }],
        {
          structuredOutput: { schema },
          requestContext: new RequestContext([
            ['estimateRequestId', estimateRequestId],
            ['itemId', line.id],
          ]),
        },
      );
      const r = result.object;
      if (!r) throw new Error('pricer returned no structured object');

      if (line.costType === 'material') {
        const m = r as z.infer<typeof materialPriceResponseSchema>;
        return {
          line,
          price: {
            itemId: line.id,
            unitPrice: m.unitPrice,
            currency: m.currency,
            confidence: m.confidence,
            source: m.source,
            unavailableReason: m.unavailableReason,
          },
        };
      }

      const l = r as z.infer<typeof laborPriceResponseSchema>;
      const resolved: BillableLine =
        line.quantity !== null
          ? { ...line, quantity: line.quantity, hoursSource: 'inspector' }
          : l.estimatedHours !== null
            ? { ...line, quantity: roundToQuarter(l.estimatedHours), hoursSource: 'estimated' }
            : { ...line, quantity: 1, hoursSource: 'fallback' };
      return {
        line: resolved,
        price: {
          itemId: line.id,
          unitPrice: l.hourlyRate,
          currency: l.currency,
          confidence: l.confidence,
          source: l.source,
          unavailableReason: l.unavailableReason,
        },
      };
    } catch (e) {
      log.warn('[price-line] per-line failure', {
        estimateRequestId,
        itemId: line.id,
        error: e instanceof Error ? e.message : String(e),
      });
      const fallbackLine: BillableLine =
        line.costType === 'labor'
          ? { ...line, quantity: line.quantity ?? 1, hoursSource: line.quantity !== null ? 'inspector' : 'fallback' }
          : line;
      return {
        line: fallbackLine,
        price: {
          itemId: line.id,
          unitPrice: null,
          currency: 'USD' as const,
          confidence: 'low' as const,
          source: 'lookup-failed',
          unavailableReason: 'Pricing lookup failed; needs contractor quote.',
        },
      };
    }
  },
});
```

#### Reasoning

- `hoursSource` makes estimate provenance auditable in the envelope — the
  report can later distinguish inspector-stated hours from AI-estimated ones
  without a schema change.
- No `retries` on this step: the catch makes a throw unreachable, and this
  plan does not ship dead configuration (the exact defect the audit found in
  the old steps).

---

### `src/mastra/workflows/summarize-estimate.ts`

**Action:** Modify
**Why:** The workflow becomes what its name says and nothing more: the AI
process. Linear, pure, DB-free — its output IS the handoff artifact.

#### Before

```ts
import { markProcessingStep } from './steps/mark-processing';
import { extractItemsStep } from './steps/extract-items';
import { auditItemsStep } from './steps/audit-items';
import { mergeItemsStep } from './steps/merge-items';
import { priceItemsStep } from './steps/price-items';
import { persistSuccessStep } from './steps/persist-success';
import { persistFailureStep } from './steps/persist-failure';
```

```ts
const successPathWorkflow = createWorkflow({
  id: 'summarize-estimate-success-path',
  inputSchema: extractItemsStep.outputSchema,
  outputSchema: persistSuccessStep.outputSchema,
})
  .then(auditItemsStep)
  .then(mergeItemsStep)
  .then(priceItemsStep)
  .then(persistSuccessStep)
  .commit();

export const summarizeEstimateWorkflow = createWorkflow({
  id: 'summarize-estimate',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
  }),
  outputSchema: z.unknown(),
})
  .then(markProcessingStep)
  .then(extractItemsStep)
  .branch([
    [async ({ inputData }) => inputData.failed === true, persistFailureStep],
    [async ({ inputData }) => inputData.failed === false, successPathWorkflow],
  ])
  .commit();
```

#### After (complete new file body below the imports/doc comment)

```ts
import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  billableLineSchema,
  pricedLineItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import { extractItemsStep } from './steps/extract-items';
import { expandLinesStep } from './steps/expand-lines';
import { priceLineStep } from './steps/price-line';

/**
 * The AI process, and ONLY the AI process. Pure and linear:
 *
 *   extract-items  → structured work-item extraction (throws on failure;
 *                    retries: 2)
 *   expand-lines   → deterministic dedup + ids + line expansion
 *   .map           → fan out: one element per pending line
 *   .foreach       → price each line (concurrency: PRICING_CONCURRENCY)
 *   .map           → collect { lines, prices }
 *
 * No DB, no status writes, no presentation strings — the caller
 * (triggerSummarizeEstimate) owns all persistence. Success is this
 * workflow's return value; failure is the run's own 'failed' status.
 */
const PRICING_CONCURRENCY = 3;

export const summarizeEstimateWorkflow = createWorkflow({
  id: 'summarize-estimate',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  outputSchema: z.object({
    lines: z.array(billableLineSchema),
    prices: z.array(pricedLineItemSchema),
  }),
})
  .then(extractItemsStep)
  .then(expandLinesStep)
  .map(async ({ inputData }) =>
    inputData.pendingLines.map((line) => ({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      line,
    })),
  )
  .foreach(priceLineStep, { concurrency: PRICING_CONCURRENCY })
  .map(async ({ inputData }) => ({
    lines: inputData.map((r) => r.line),
    prices: inputData.map((r) => r.price),
  }))
  .commit();
```

#### Reasoning

- The nested success-path workflow, the branch, and both persist steps
  existed to route persistence. With persistence gone, the honest shape is
  five lines of linear wiring.
- Scaling pricing throughput is now literally one number
  (`PRICING_CONCURRENCY`), and the workflow's output schema — not a DB side
  effect — is its contract.
- `estimateRequestId` stays in the input purely as tracing identity
  (RequestContext); the workflow never resolves it against anything.

---

### `src/mastra/index.ts`

**Action:** Modify
**Why:** Register the scorer for Studio visibility.

#### Before

```ts
import { Mastra } from '@mastra/core/mastra';
import { billableItemExtractorAgent } from './agents/billable-item-extractor';
import { itemPricerAgent } from './agents/item-pricer';
import { summarizeEstimateWorkflow } from './workflows/summarize-estimate';

export const mastra = new Mastra({
  agents: {
    'billable-item-extractor': billableItemExtractorAgent,
    'item-pricer': itemPricerAgent,
  },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});
```

#### After

```ts
import { Mastra } from '@mastra/core/mastra';
import { billableItemExtractorAgent } from './agents/billable-item-extractor';
import { itemPricerAgent } from './agents/item-pricer';
import { extractionConsistencyScorer } from './scorers/extraction-consistency';
import { summarizeEstimateWorkflow } from './workflows/summarize-estimate';

export const mastra = new Mastra({
  agents: {
    'billable-item-extractor': billableItemExtractorAgent,
    'item-pricer': itemPricerAgent,
  },
  scorers: { 'extraction-consistency': extractionConsistencyScorer },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});
```

---

### `src/features/estimate/lib/envelope.ts`

**Action:** Modify
**Why:** Parse v3; v1/v2 arms untouched.

#### Before

```ts
import {
  summaryEnvelopeSchema,
  summaryEnvelopeV2Schema,
  type SummaryEnvelope,
  type SummaryEnvelopeV2,
} from '@/mastra/agents/billable-item-extractor.schema';
```

```ts
export type ParsedEnvelope =
  | { kind: 'v1'; envelope: SummaryEnvelope }
  | { kind: 'v2'; envelope: SummaryEnvelopeV2 }
  | { kind: 'unparseable'; raw: string }
  | { kind: 'absent' };
```

```ts
  const v2 = summaryEnvelopeV2Schema.safeParse(json);
  if (v2.success) return { kind: 'v2', envelope: v2.data };
```

#### After

```ts
import {
  summaryEnvelopeSchema,
  summaryEnvelopeV2Schema,
  summaryEnvelopeV3Schema,
  type SummaryEnvelope,
  type SummaryEnvelopeV2,
  type SummaryEnvelopeV3,
} from '@/mastra/agents/billable-item-extractor.schema';
```

```ts
export type ParsedEnvelope =
  | { kind: 'v1'; envelope: SummaryEnvelope }
  | { kind: 'v2'; envelope: SummaryEnvelopeV2 }
  | { kind: 'v3'; envelope: SummaryEnvelopeV3 }
  | { kind: 'unparseable'; raw: string }
  | { kind: 'absent' };
```

```ts
  const v3 = summaryEnvelopeV3Schema.safeParse(json);
  if (v3.success) return { kind: 'v3', envelope: v3.data };

  const v2 = summaryEnvelopeV2Schema.safeParse(json);
  if (v2.success) return { kind: 'v2', envelope: v2.data };
```

(Doc comment gains a `- 'v3'` line describing the discriminated-lines shape.)

---

### `src/features/estimate/components/estimate-report.tsx`

**Action:** Modify
**Why:** Route v3 lines into `ItemsSection`.

#### Before

```ts
  const items = envelope.envelope.items;
  const prices: PricedLineItem[] =
    envelope.kind === 'v2' ? envelope.envelope.prices : [];

  return <ItemsSection items={items} prices={prices} />;
```

#### After

```ts
  const items =
    envelope.kind === 'v3' ? envelope.envelope.lines : envelope.envelope.items;
  const prices: PricedLineItem[] =
    envelope.kind === 'v1' ? [] : envelope.envelope.prices;

  return <ItemsSection items={items} prices={prices} />;
```

---

### `src/features/estimate/components/items-section.tsx`

**Action:** Modify
**Why:** Accept v3 lines; restore the v3 prototype's header copy, which the
current copy silently replaced (found in this session's audit).
**Impact:** Two changes only — the prop type and one sentence. All rendering
already handles the v3 shapes: `formatUnit('hrs')` → "HRS", fractional
quantities render as-is, `formatItemTitle` already suffixes split labor rows.

#### Before

```ts
import type {
  BillableItem,
  PricedLineItem,
} from '@/mastra/agents/billable-item-extractor.schema';

interface ItemsSectionProps {
  items: BillableItem[];
  prices: PricedLineItem[];
}
```

```tsx
          <p className="mt-0.5 text-sm text-muted-foreground">
            Grouped by Trade. Client Total is Quantity × Unit Price. Install
            and Replace Items are Split into Material and Labor Lines.
          </p>
```

#### After

```ts
import type {
  BillableItem,
  BillableLine,
  PricedLineItem,
} from '@/mastra/agents/billable-item-extractor.schema';

/** v3 lines and legacy v1/v2 items render through the same rows. */
type RenderableItem = BillableItem | BillableLine;

interface ItemsSectionProps {
  items: RenderableItem[];
  prices: PricedLineItem[];
}
```

```tsx
          <p className="mt-0.5 text-sm text-muted-foreground">
            Grouped by Trade. Client Total is Quantity × Unit Price. Labor is
            always measured in Hours.
          </p>
```

(`TradeGroup`/`ItemRow` prop types change `BillableItem` → `RenderableItem`;
no other change — both shapes satisfy every field the rows read.)

#### Reasoning

- The restored sentence is verbatim from the v3 prototype header. It is also
  now TRUE for v3 envelopes by construction — the discriminated union is what
  makes the copy honest. (Legacy v2 rows keep rendering their stored units;
  the sentence describes the product rule going forward, exactly as the
  prototype stated it.)

---

### `src/features/estimate/lib/classify-error.ts`

**Action:** Create (moved byte-identical from
`src/mastra/workflows/lib/classify-error.ts`; only the doc comment's second
line changes to name the new caller)

#### After (new file, complete)

```ts
/**
 * Map an unknown error from an AI gateway call to a user-facing message.
 * Used by triggerSummarizeEstimate to persist a human-readable failure.
 */
export function classifyError(e: unknown): string {
  const err = e as { statusCode?: number; code?: string; message?: string } | undefined;
  const status = err?.statusCode;
  if (status === 401 || status === 403) return 'AI service authentication failed. Please retry.';
  if (status === 429) return 'AI service rate-limited. Please retry shortly.';
  if (status && status >= 500) return 'AI service is temporarily unavailable. Please retry.';
  return 'AI processing failed. Please retry.';
}
```

---

### `src/features/estimate/lib/workflow.ts`

**Action:** Modify
**Why:** Becomes the SINGLE writer of estimate-row state — the receiving end
of the clean handoff. Also fixes a live bug: today a run that ends
`status: 'failed'` because a step THREW (rather than branching to
persist-failure) only gets `console.error`d, leaving the row stuck on
`processing` forever.
**Impact:** Complete rewrite of the `after()` body. The multi-writer
`ne(status, 'completed')` clobber-guard disappears because there is nothing
left to race against.

#### Before

```ts
export function triggerSummarizeEstimate({
  estimateRequestId,
  fileUrl,
  errorLabel = "AI Pipeline Error",
}: TriggerSummarizeEstimateParams): void {
  after(async () => {
    try {
      const workflow = mastra.getWorkflow("summarize-estimate");
      const run = await workflow.createRun();
      const result = await run.start({
        inputData: { estimateRequestId, fileUrl },
      });
      if (result.status !== "success") {
        // persistFailureStep already wrote status='failed' + errorMessage.
        console.error(`${errorLabel}: workflow ended non-success:`, result.status);
      }
    } catch (error) {
      console.error(`${errorLabel}:`, error);
      // Backstop: write failed state only if the workflow threw past its own catch.
      // Guarded with status != 'completed' so a late throw cannot clobber a row that
      // persistSuccessStep already wrote successfully.
      await db
        .update(estimateRequestTable)
        .set({ status: "failed", errorMessage: "AI processing failed. Please retry." })
        .where(
          and(
            eq(estimateRequestTable.id, estimateRequestId),
            ne(estimateRequestTable.status, "completed"),
          ),
        );
    }
    revalidatePath("/dashboard");
  });
}
```

#### After

```ts
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { mastra } from "@/mastra";
import {
  SUMMARY_ENVELOPE_KIND,
  SUMMARY_ENVELOPE_VERSION_3,
  type SummaryEnvelopeV3,
} from "@/mastra/agents/billable-item-extractor.schema";
import { estimateRequestTable } from "../db/schema";
import { classifyError } from "./classify-error";

interface TriggerSummarizeEstimateParams {
  estimateRequestId: string;
  fileUrl: string;
  errorLabel?: string;
}

/**
 * The SINGLE writer of estimate-row state. The workflow is pure — it
 * returns { lines, prices } or its run fails — and this function owns the
 * entire persistence lifecycle around it:
 *
 *   processing → run the AI workflow → completed (v3 envelope)
 *                                    | failed   (classified message)
 *
 * Because nothing else writes the row during a run, there is no
 * clobber-race and no status-guard conditions.
 */
export function triggerSummarizeEstimate({
  estimateRequestId,
  fileUrl,
  errorLabel = "AI Pipeline Error",
}: TriggerSummarizeEstimateParams): void {
  after(async () => {
    const rowFilter = eq(estimateRequestTable.id, estimateRequestId);
    try {
      const [row] = await db
        .select({ zipCode: estimateRequestTable.zipCode })
        .from(estimateRequestTable)
        .where(rowFilter);

      await db
        .update(estimateRequestTable)
        .set({ status: "processing", errorMessage: null })
        .where(rowFilter);

      const workflow = mastra.getWorkflow("summarize-estimate");
      const run = await workflow.createRun();
      const result = await run.start({
        inputData: { estimateRequestId, fileUrl, zipCode: row?.zipCode ?? "" },
      });

      if (result.status === "success") {
        const envelope: SummaryEnvelopeV3 = {
          kind: SUMMARY_ENVELOPE_KIND,
          version: SUMMARY_ENVELOPE_VERSION_3,
          lines: result.result.lines,
          prices: result.result.prices,
        };
        await db
          .update(estimateRequestTable)
          .set({
            summary: JSON.stringify(envelope),
            status: "completed",
            errorMessage: null,
          })
          .where(rowFilter);
      } else {
        console.error(`${errorLabel}: workflow ended non-success:`, result.status);
        const stepError =
          result.status === "failed"
            ? Object.values(result.steps).find((s) => s.status === "failed")?.error
            : undefined;
        await db
          .update(estimateRequestTable)
          .set({ status: "failed", errorMessage: classifyError(stepError) })
          .where(rowFilter);
      }
    } catch (error) {
      console.error(`${errorLabel}:`, error);
      await db
        .update(estimateRequestTable)
        .set({ status: "failed", errorMessage: classifyError(error) })
        .where(rowFilter);
    }
    revalidatePath("/dashboard");
  });
}
```

#### Reasoning

- Reading `zipCode` here (one select) replaces the deleted
  `mark-processing` step's read — the caller owns the row, so the AI
  process no longer needs DB access to learn its own input.
- Envelope assembly moved here from `persist-success` — writing
  `summary` is persistence, and persistence is this file's job. The
  envelope TYPE still comes from the mastra schema module: the contract
  crosses the boundary; the database connection does not.
- The failed-arm reads the failing step's `error` from `result.steps`
  (verified result shape, workflows/error-handling docs) so
  `classifyError` can produce the specific rate-limit/auth/5xx message the
  old in-pipeline catch produced.

---

### `package.json`

**Action:** Modify
**Why:** `jsonrepair`'s only consumer (`extract-json-from-text.ts`) is
deleted.

#### Before

```json
    "jsonrepair": "^3.14.0",
```

#### After

Line removed; run `pnpm install` to update the lockfile.

## Validation Plan

Per `AGENTS.md` (project `pnpm lint` is broken under Next 16 and is not the
gate):

1. `pnpm exec tsc --noEmit` — clean. Confirms all deleted modules
   (`group-split-pairs` precedent: the compiler is the deletion auditor) have
   no surviving importers: `item-contract-guard*`, `audit-items`,
   `merge-items`, `price-items`, `mark-processing`, `persist-success`,
   `persist-failure`, `extractedItemSchema`, `itemPricerResponseSchema`.
2. `pnpm exec eslint` on every created/modified file — clean.
3. Repo-wide greps must return zero results:
   `grep -rn "ItemContractGuard\|item-contract-guard\|jsonrepair\|auditItems\|mergeItemsStep\|priceItemsStep\|markProcessingStep\|persistSuccessStep\|persistFailureStep\|extractedItemGuardSchema" src`.
   **Purity gate (the clean-handoff invariant, mechanically checked):**
   `grep -rn "@/db\|@/features" src/mastra` must return zero results — the
   AI process imports no application system. (The reverse direction —
   features importing mastra CONTRACT schemas — is the intended handoff
   artifact and remains.)
4. **Pure-logic checks via `tsx` (no live model):**
   - `expand-lines`: an install work item with extent `{7, 'lf'}` and null
     inspectorHours → exactly 2 lines: material `{quantity: 7, unit: 'lf'}`
     and labor `{quantity: null, unit: 'hrs'}`; a repair item with
     `inspectorHours: 1.3` → 1 labor line `{quantity: 1.25, unit: 'hrs',
     hoursSource: 'inspector'}`; a bare `"Siding"` scope → dropped; duplicate
     sourceQuotes → one survivor; ids stable across two runs of the same
     input.
   - Discriminated union: `billableLineSchema.safeParse` REJECTS a material
     line with `unit: 'hrs'` and a labor line with `unit: 'sf'` — the v3
     invariant test, previously impossible to state.
   - `laborPriceResponseSchema`: rejects `{hourlyRate: 120, estimatedHours:
     null}` and `{hourlyRate: null, unavailableReason: null}`; accepts
     `{hourlyRate: 120, estimatedHours: 1.5, unavailableReason: null, ...}`.
   - `pricingBasisFor` matrix: material/any → `material-part-only`;
     labor/install|replace → `labor-install-hourly`; labor/repair|service|
     evaluate|remove → `labor-all-in-hourly`.
5. **Live QA via `pnpm dev`** (needs `KILO_API_KEY`): upload an inspection
   report containing at least one install/replace and one repair item.
   Confirm on the rendered report:
   - Every LABOR row shows an `HRS` chip with a quarter-hour quantity; every
     MATERIAL row shows `EA`/`SF`/`LF`/`CY` — the v3 unit discipline, end to
     end.
   - A split pair renders as two rows with differentiated titles (material:
     noun phrase; labor: noun phrase + "Installation"/"Replacement").
   - Line totals = quantity × unitPrice; labor totals are hours × rate.
   - An unpriced line renders "Price unavailable" and the totals block counts
     it.
   - Old estimates (v2 rows on disk) still render unchanged, and a v1 row
     still renders items-without-prices.
6. **Failure paths:** kill the network mid-run (or use an invalid
   `KILO_API_KEY`) → the row must end `failed` with a classified message
   written by the CALLER, never stuck on `processing`. Check logs: the
   extract step attempts up to 3 times (1 + `retries: 2`), then the run
   fails and `triggerSummarizeEstimate` writes the row exactly once.
7. **Scorer:** after one successful run, confirm a `[extraction-consistency]`
   scorer result exists (Studio or `mastra_scorers` storage if storage is
   configured; otherwise confirm via logs that the scorer ran and did not
   block the response).

## Risk Notes

- **Recall regression risk from deleting Pass B.** The blocking audit pass
  existed to catch missed items; the scorer observes misses but does not
  repair them. Mitigation: sampling rate 1 means every run is measured —
  if `missedDefects` trends non-empty, the correct fix is extraction prompt/
  model quality (or reinstating a recall pass as its own step), and the
  scorer provides the evidence to decide. This is an explicit, user-aligned
  tradeoff: one blocking LLM pass instead of two.
- **`response_format` support at the Kilo gateway is assumed, not proven.**
  Mastra passes the schema via the provider's `response_format` by default;
  the current pipeline never exercised it (the guard parsed raw text
  instead). If the gateway rejects or mangles it, set
  `structuredOutput.jsonPromptInjection: true` on the two `agent.generate`
  calls — the documented fallback — and expect somewhat weaker conformance.
  Validate in step 5 before merging.
- **`multipleOf(0.25)` and `superRefine` are NOT provider-enforced.** JSON
  schema conversion strips what `response_format` can't express; Zod still
  enforces them at validation time inside `structuredOutput`, where failure
  throws (strict default). `price-line` catches and degrades to
  lookup-failed; `extract-items` lets the throw ride its retries and, if
  exhausted, the run fails and the caller persists the classified message.
  Model-facing schemas deliberately avoid refinements everywhere else.
- **Step retries cannot discriminate error types.** With extract-items
  throwing on every failure, a non-transient error (401 auth, permanent
  schema mismatch) burns its 2 retries before failing. Accepted: rare,
  fast, and it pays for deleting the failed/errorMessage plumbing, the
  branch, and persist-failure in one move.
- **Terminal `.map` assumption.** The workflow ends `.foreach → .map →
  .commit()`. If 1.37.1 rejects `.map` as the terminal node, fold the
  collect into a 10-line `assemble-result` step — one call site, no other
  design impact.
- **Scorer persistence needs storage.** The Mastra instance configures no
  storage; scorer results may only surface in logs until one is added.
  The scorer still runs and never blocks. Adding storage is deliberately out
  of scope.
- **Old in-flight ids.** Content-address inputs are unchanged
  (trade/action/scope/location), so re-running an old estimate produces the
  same base ids as before — but v2 rows are NOT migrated; they render via
  their preserved schemas forever, exactly like the v1 precedent.
- **`.foreach` output-shape assumption.** The collect `.map` assumes
  `.foreach` yields the per-iteration outputs as an ordered array (docs:
  "the order of outputs matches the order of inputs"). If the runtime wraps
  it differently in 1.37.1, the collect `.map` adapts at one call site;
  nothing else depends on the shape.
- **Labor rows for legacy v2 envelopes still show physical units.** By
  design: old data renders as stored; the restored header sentence states the
  v3 product rule. If that mismatch matters for old rows, a re-run of those
  estimates (not a data migration) is the fix.
- **The pricer now shoulders hour estimation.** Bad hour estimates were
  previously impossible (labor was priced per physical unit); now a wildly
  wrong `estimatedHours` inflates a labor total. Bounds: schema caps at 160
  hours, quarter-rounding, `hoursSource: 'estimated'` is persisted for audit,
  and confidence/source render under the existing evidence toggle. Watch
  during live QA.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
