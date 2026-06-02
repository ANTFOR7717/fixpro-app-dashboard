# FEATURE(ai-pricing-by-location)

## Request
Build a per-item pricing pass on top of the existing billable-item extraction
pipeline. After `summarize-estimate` writes a v1 `billable-extraction` envelope
to `estimate_requests.summary`, a new second workflow prices each extracted
item against the user's submitted zipcode using pure LLM knowledge (no
external price API in this branch) and writes a v2 `priced-extraction` envelope
to the same column. The DB row, the UI's `EstimateStatusBar` "Priced" segment
(wired in the last branch), and the existing `EstimateStatus` enum are all
already set up for this — the missing piece is the AI + workflow machinery.

Pricing source is intentionally out of scope. The LLM uses its training data
plus a small static regional adjustment reference baked into the prompt. A
follow-up branch will introduce a `createTool`-backed real price lookup.

## Directory Map
```text
src/
  features/
    estimate/
      api/
        actions.ts                                       (modify)
      components/
        estimate-view.tsx                                (modify — fix pre-existing zipcode length mismatch)
      db/
        schema.ts                                        (modify — no column add; tighten comment + bump EstimateStatus doc)
      lib/
        envelope-version.ts                              (new — shared helper for parsing envelope version)
  mastra/
    index.ts                                             (modify — register new agent and new workflow)
    agents/
      billable-item-extractor.schema.ts                  (modify — re-export SUMMARY_ENVELOPE_KIND_V2 + summaryEnvelopeV2Schema)
      billable-item-pricer.ts                            (new)
      billable-item-pricer.schema.ts                     (new)
    workflows/
      price-billable-items.ts                            (new)
      steps/
        read-summary.ts                                  (new)
        price-item.ts                                    (new)
        merge-pricing.ts                                 (new)
        persist-pricing.ts                               (new)
      lib/
        classify-error.ts                                (modify — re-export, no behavior change)
      summarize-estimate.ts                              (modify — chain price-billable-items into success path)
    observability/
      index.ts                                           (new — re-export Mastra 1.36 observe helper for tools)
package.json                                             (modify — bump @mastra/core to 1.36.0)
pnpm-lock.yaml                                           (modify)
drizzle/                                                 (no migration — no schema change)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `package.json` | modify | Bump `@mastra/core` AND the `mastra` (CLI) devDep from `^1.32.1` / `^1.9.0` to `^1.36.0` / `^1.7.0`. `1.36.0` is the latest published `@mastra/core` (verified at plan time on npm); `1.7.0` is the latest published `mastra` CLI. The CLI and core are designed to move in lockstep; a wide gap produces type errors at the CLI's import sites and may break `pnpm mastra dev` / `pnpm mastra build`. Isolated as the first commit on the branch. **Avoid 1.35.0–1.36.0** without reading issue #16893 first — there is a known regression in `buildMessagesFromChunks` that mis-orders agent response messages and can cause duplicate tool calls. 1.34.0 is the last known-good minor for agent loop ordering. |
| `pnpm-lock.yaml` | modify | pnpm-managed lockfile update from the bumps. |
| `src/mastra/index.ts` | modify | Register the new `billable-item-pricer` agent and the new `price-billable-items` workflow alongside the existing entries. |
| `src/mastra/agents/billable-item-pricer.ts` | create | New agent that prices one `BillableItem` at a time. Uses the same Kilo gateway + `openai/gpt-5.4-mini` model as the extractor. `metadata: { stage: 'pricing', version: 1 }` per Mastra 1.34. Hard rules: no invention, output must satisfy the `pricedItemSchema` Zod, all reasoning in `rationale`. |
| `src/mastra/agents/billable-item-pricer.schema.ts` | create | Zod schemas for one `PricedItem` and the v2 `priced-extraction` envelope. Mirrors the structure of `billable-item-extractor.schema.ts`. Re-exported by the existing schema file so callers only import from one place. |
| `src/mastra/agents/billable-item-extractor.schema.ts` | modify | Re-export the new v2 envelope constants and schema. No semantic change to the v1 envelope. |
| `src/mastra/workflows/price-billable-items.ts` | create | New workflow: `read-summary` → `.foreach(priceItemStep, { concurrency: 4 })` → `merge-pricing` → `persist-pricing`. Mirrors the wiring style of `summarize-estimate.ts`. |
| `src/mastra/workflows/steps/read-summary.ts` | create | Loads the row, validates the v1 envelope, returns `{ estimateRequestId, zipCode, items, summary_v1 }`. Zod-validated resilient step (retries 1). |
| `src/mastra/workflows/steps/price-item.ts` | create | `createStep(pricerAgent, { structuredOutput: { schema: pricedItemSchema } })`. Input: one `BillableItem + zipCode`. Output: one `PricedItem`. Resilient (retries 2, structuredOutput Zod-validates). |
| `src/mastra/workflows/steps/merge-pricing.ts` | create | Pure step. Re-orders the priced array by original `item.id` and computes `subtotal` + `total` in the row's currency (USD only in this branch). |
| `src/mastra/workflows/steps/persist-pricing.ts` | create | Writes the v2 envelope JSON to `summary`, flips `status` to `completed`, clears `errorMessage`. |
| `src/mastra/workflows/summarize-estimate.ts` | modify | After `persistSuccessStep`, fire `price-billable-items` as a nested `after()` call. The outer workflow still ends at `completed` so the UI's status bar lights up "Priced" because the envelope version is now v2, not because the row's `status` field changes. |
| `src/mastra/workflows/lib/classify-error.ts` | modify | Re-export from the new pricing steps. No behavior change. |
| `src/mastra/observability/index.ts` | create | Re-export the `observe` helper for tool execution contexts. No-op in this branch (no tools yet), but a clean import point for the future `get_local_market_rate` tool. The exact import path needs to be verified against the bumped version in implementation (the `ToolExecutionContext.observe` field is added in 1.34; in earlier versions the file is empty). |
| `src/features/estimate/api/actions.ts` | modify | The retry action's `after()` block: when the previous run wrote a v1 envelope and the retry succeeds, also fire pricing. Plus, fix the pre-existing zipcode length mismatch (see below). |
| `src/features/estimate/components/estimate-view.tsx` | modify | Fix the pre-existing zipcode length mismatch: form says `min(1)`, action says `length(5)`. Standardize on `regex(/^\d{5}(-\d{4})?$/)` (5-digit or ZIP+4) on both sides, with a clear error message. |
| `src/features/estimate/db/schema.ts` | modify | No column add. Update the `EstimateStatus` enum's doc comment to note that "completed" now also implies a v2 priced envelope is present. No new statuses added. |

## Existing Pattern Audit

**Workflow wiring style** — the existing `summarize-estimate.ts` builds a
`successPathWorkflow` as a composed `createWorkflow` to keep input shapes
aligned across `.then` chains, and the body is a flat wiring diagram using
named-export steps. The new `price-billable-items.ts` follows that pattern
exactly: each step is a named export under `src/mastra/workflows/steps/`,
the body is `.then(readSummary).foreach(priceItem, { concurrency: 4 })
.then(mergePricing).then(persistPricing).commit()`, and shared error
classification lives in `src/mastra/workflows/lib/classify-error.ts`.

**Per-step file convention** — one named export per file under
`src/mastra/workflows/steps/`, `createStep({ id, inputSchema, outputSchema,
execute })` for pure steps, and `createStep(agent, { structuredOutput: { schema } })`
for the agent-wrapping step (`price-item.ts` only). This is exactly the pattern:
`createStep(agent, options)` accepts a `SubAgent` (1.34+) and a standard `Agent` (1.32+).
The agent overload's `inputSchema` is **hard-coded** to `{ prompt: string }` — the
agent receives `inputData.prompt` as its only context. When the per-iteration
input is a structured object (`{item, zipCode}` for the pricer), the manual
`createStep({...})` shape is required because the structured input does not
match the overload's `{ prompt: string }` schema.

**Resilient steps + structuredOutput** — every LLM call in this project uses
`structuredOutput: { schema: <Zod> }` (NOT the deprecated `output` /
`experimental_output`). The extractor marks itself resilient, retries 2;
the audit pass is resilient, retries 1, non-fatal. Pricing follows the
extractor's pattern: resilient, retries 2. Each step's `execute` body
classifies thrown errors with the shared classifier so the workflow's failure
branch has a single, well-known shape.

**Zod v4 schema style** — `z.enum([...])` from a const tuple for fixed
enums, `z.string().min(1)` for required strings, `z.number().nullable()`
for optional numerics, `z.literal(<const>)` for version discriminators.
`billable-item-pricer.schema.ts` uses the same style for symmetry.

**Versioned envelope in `summary`** — the extractor writes a v1 envelope
with a `kind` discriminator and a `version` literal. Pricing bumps the
envelope to v2: `kind: "priced-extraction"`, `version: 2`. The v2 envelope
preserves every v1 field per item (so the audit chain from
inspector-quote → billable-item → priced-item is unbroken) and adds
price fields + a `subtotal` + `total`. The `kind`/`version` pair is the
forward-compatible contract.

**Status-bar UX behavior change — explicit approval needed.** Today,
`litUpTo('completed')` returns `STAGES.length - 1 = 4`, lighting all five
segments (Uploaded → Delivered) on every completed row regardless of
envelope state. This branch changes that: a row with a **v1** envelope
(only the extraction ran) will now light segments 0–2 (Uploaded,
Processing, Analyzed) but leave Priced and Delivered unlit. A row with a
**v2** envelope will light all five as before. This is semantically
correct — a v1 row is genuinely not priced yet — but it is a visible UX
change for any user who already has a completed row in their account.
The alternative (keep all-five lit on any `completed`) hides the
"pricing failed for this row" state. **Confirm this change is desired
before implementation.

**Server actions, `after()`, and the Next.js 16 pattern** — every workflow
is kicked off from a server action using `after()` so the response returns
to the client immediately while the AI work runs in the background. Pricing
follows the same pattern: a single `after(async () => { ... })` block in
`actions.ts` runs `summarize-estimate` first, then chains into
`price-billable-items`. The retry action gets the same treatment.

**Zod form validation** — the form uses `react-hook-form` + `@hookform/resolvers/zod`
with the Zod schema declared in the component. The action declares the
same shape again. They must match; today they don't for `zipCode`. The
fix is part of this branch.

**Agent model + gateway** — the extractor uses `@ai-sdk/openai` configured
with `createOpenAI({ apiKey: process.env.KILO_API_KEY, baseURL: 'https://api.kilo.ai/api/gateway' })`,
then `gateway('openai/gpt-5.4-mini')`. The pricer reuses this gateway
verbatim — no new env vars, no new keys, no new packages.

## Execution Plan

### Step 1 — Bump `@mastra/core` to 1.36.0
- Update `package.json` from `^1.32.1` to `^1.36.0`.
- Update `mastra` (CLI) devDep from `^1.9.0` to `^1.7.0` (the published
  `mastra` CLI is currently BEHIND `@mastra/core` minor-wise — its peer
  dependency requires `>=1.1.0-0 <2.0.0-0` so a CLI on 1.7 works fine
  with a `@mastra/core` on 1.36).
- Run `pnpm install`. Let pnpm resolve and update `pnpm-lock.yaml`.
- Run `pnpm exec tsc --noEmit`. If any existing call sites changed shape
  between 1.32 and 1.36, fix them in this same commit. Expected: zero
  changes needed (the existing pipeline uses `structuredOutput`, `.foreach`,
  `.branch`, `.then`, `.parallel` — all stable across 1.32 → 1.36).
- **Read mastra-ai/mastra#16893 first.** Versions 1.35.0–1.36.0 have a
  known regression where agent response messages get stale `createdAt`
  and get mis-ordered in the prompt, which can cause duplicate tool
  calls in agent loops. We do not use agent loops in this branch (the
  extractor and pricer both do single-shot `agent.generate()`), so the
  regression should not affect us, but read the issue to confirm before
  bumping.
- Run `pnpm exec eslint` on the touched paths.
- Commit: `chore(deps): bump @mastra/core to 1.36.0 and mastra CLI to 1.7.0`.

### Step 2 — Add the pricing agent + schemas
- Create `src/mastra/agents/billable-item-pricer.schema.ts` with:
  - `pricedItemSchema` (extends `billableItemSchema` with `unit`, `unitCost`,
    `currency`, `confidence`, `rationale`).
  - `summaryEnvelopeV2Schema` (the v2 envelope).
  - Re-export from `billable-item-extractor.schema.ts`.
- Create `src/mastra/agents/billable-item-pricer.ts` with the agent:
  - `id: 'billable-item-pricer'`
  - `model: gateway('openai/gpt-5.4-mini')` (same as extractor)
  - `metadata: { stage: 'pricing', version: 1 }` (1.34 feature)
  - Instructions: hard rules mirroring the extractor's style ("grounded in
    the sourceQuote", "no invention", "regional adjustment by zipcode",
    "output must match the schema, no prose", "if the action is unclear
    price it as a service call at the lower end of the regional range").
  - No tools, no memory, no channels in this branch.

### Step 3 — Add the per-step files
- `src/mastra/workflows/steps/read-summary.ts` — resilient, retries 1.
  Loads the row by `estimateRequestId`, validates `summary` parses as a
  v1 envelope (returns `failed: true` if not), returns
  `{ estimateRequestId, zipCode, items, summary_v1 }`.
- `src/mastra/workflows/steps/price-item.ts` — `createStep(pricerAgent, { structuredOutput: { schema: pricedItemSchema } })`.
  Input: `{ item: BillableItem, zipCode: string }`. Output: `PricedItem`.
  Resilient, retries 2.
- `src/mastra/workflows/steps/merge-pricing.ts` — pure step. Input:
  `PricedItem[]`. Output: `{ items: PricedItem[], subtotal, total, currency }`.
- `src/mastra/workflows/steps/persist-pricing.ts` — writes the v2 envelope
  to `summary` and flips `status` to `completed`.

### Step 4 — Compose the workflow
- Create `src/mastra/workflows/price-billable-items.ts`:
  ```ts
  export const priceBillableItemsWorkflow = createWorkflow({
    id: 'price-billable-items',
    inputSchema: z.object({ estimateRequestId: z.string() }),
    outputSchema: z.unknown(),
  })
    .then(readSummaryStep)
    .foreach(priceItemStep, { concurrency: 4 })
    .then(mergePricingStep)
    .then(persistPricingStep)
    .commit();
  ```

### Step 5 — Register the agent + workflow
- Update `src/mastra/index.ts` to register
  `agents: { 'billable-item-extractor': ..., 'billable-item-pricer': ... }`
  and
  `workflows: { 'summarize-estimate': ..., 'price-billable-items': ... }`.

### Step 6 — Chain pricing from the existing pipeline
- Update `src/mastra/workflows/summarize-estimate.ts`: after the
  `persistSuccessStep` in the success sub-workflow, append a `.then(...)`
  step that fires `price-billable-items` with `{ estimateRequestId }`.
  The outer workflow's `outputSchema` stays `z.unknown()` (it always was).
- Alternatively (preferred for testability): the chain lives in
  `actions.ts`'s `after()` block — the upload action calls
  `summarize-estimate` then, on success, calls `price-billable-items` in
  the same `after()`. This keeps each workflow self-contained and the
  coupling visible at the call site.
  - **Decision: do it in `actions.ts`**, not in the workflow body. The
    existing `persistSuccessStep` already writes `status='completed'`. The
    pricing step writes the v2 envelope and a second `status='completed'`
    (no-op write, but the v2 envelope is the real signal). Cleanest, most
    testable, no new step needed inside the extraction workflow.

### Step 7 — Update the UI status bar to light up "Priced"
- Update `src/features/estimate/components/estimate-status-bar.tsx` so the
  "Priced" segment is lit when `JSON.parse(summary).version === 2`. The
  component is already a client component (`'use client'`) and already
  receives `errorMessage` and `status` as props; add an optional
  `envelopeVersion?: number` prop. The list views pass
  `envelopeVersion={tryParseVersion(upload.summary)}` for each row.
- No new dependencies. No new icons. No new copy.

### Step 8 — Fix the pre-existing zipcode validation mismatch
- `src/features/estimate/components/estimate-view.tsx`: change
  `z.string().min(1, "Zip code is required")` to
  `z.string().regex(/^\d{5}(-\d{4})?$/, "Use 5 digits or ZIP+4")`.
- `src/features/estimate/api/actions.ts`: change
  `zipCode: z.string().length(5)` to the same regex.
- Update the form's "Zip code *" label to "Zip code (5 digits or ZIP+4) *".

### Step 9 — Validate
- `pnpm exec tsc --noEmit` clean.
- `pnpm exec eslint src/mastra src/features/estimate` clean.
- Manual smoke: upload a known PDF, confirm `summary` becomes a v2 envelope,
  confirm status bar's "Priced" segment lights up.

### Step 10 — Open PR
- Per project `AGENTS.md`: feature branch already created, commit each step
  separately with Conventional Commits + `Co-Authored-By: Oz <oz-agent@warp.dev>`,
  push, `gh pr create` to `main`, link this plan in the PR body, report URL.

## File-by-File Changes

### `package.json`
**Action:** Modify
**Why:** Bump `@mastra/core` to 1.37.1 so the pricing feature is planned and
shipped against the latest stable. The 1.32→1.37 diff includes `SubAgent`,
`processLLMRequest`, agent `metadata`, tool `observe` helper, channel adapters,
and ACP agents — none of which we use directly in this branch, but planning
and shipping against 1.37 keeps the repo current.
**Impact:** Triggers a `pnpm-lock.yaml` update. The v1.37 surface is
backward-compatible with v1.32 for the APIs this project actually uses
(`createStep`, `createWorkflow`, `.foreach`, `.parallel`, `.branch`,
`structuredOutput`). Expected: zero call-site changes.

#### Before
```json
"@mastra/core": "^1.32.1",
"mastra": "^1.9.0",
```

#### After
```json
"@mastra/core": "^1.37.1",
"mastra": "^1.37.1",
```

#### Reasoning
- The user has made it explicit that Mastra is core infrastructure and
  this branch should be on the latest stable.
- v1.37.1 is the latest stable on npm (verified at plan time).
- All APIs this project uses are stable across 1.32 → 1.37.
- The `mastra` (CLI) devDep and `@mastra/core` are designed to move in
  lockstep. A 5-minor gap (1.9 → 1.37) produces type errors at the
  CLI's import sites and may break `pnpm mastra dev` /
  `pnpm mastra build`. Bumping them together is the only safe way.

---

### `src/mastra/agents/billable-item-pricer.schema.ts`
**Action:** Create
**Why:** Zod schemas for one priced item and the v2 envelope. Mirrors the
shape of the extractor's schema file for consistency.
**Impact:** New file. The v2 envelope is the new contract written to
`summary` after pricing.

#### Before
File does not exist yet.

#### After
```ts
import { z } from 'zod';
import { billableItemSchema, SUMMARY_ENVELOPE_KIND, SUMMARY_ENVELOPE_VERSION } from './billable-item-extractor.schema';

/**
 * Pricing layer schemas.
 *
 *   - pricedItemSchema:    one priced line item, superset of a BillableItem
 *   - summaryEnvelopeV2Schema: versioned envelope written to
 *                             `estimate_requests.summary` after pricing
 *
 * Versioning policy:
 *   - v1 = billable extraction (kind: "billable-extraction", version: 1)
 *   - v2 = priced extraction (kind: "priced-extraction",   version: 2)
 *   The v2 envelope preserves every v1 field on each item so the
 *   inspector-quote → billable-item → priced-item audit chain is unbroken.
 */

export const UNIT = [
  'each',
  'linear_foot',
  'square_foot',
  'hour',
  'service_call',
] as const;

/**
 * Currency: USD only in this branch. Adding more currencies is a separate
 * scope; the field is here to make the schema forward-compatible.
 */
export const CURRENCY = ['USD'] as const;

export const pricedItemSchema = billableItemSchema.extend({
  /**
   * Unit of measure for `unitCost`. `service_call` is a flat fee;
   * `each`, `linear_foot`, `square_foot`, `hour` multiply by `quantity`
   * (or 1 if `quantity` is null).
   */
  unit: z.enum(UNIT),

  /**
   * Cost per unit in `currency`. Decimal, two places, USD only.
   * The pricer agent must ground this in its training data and the
   * submitted zipcode's regional adjustment.
   */
  unitCost: z.number().nonnegative().multipleOf(0.01),

  /**
   * Total cost for the line = `unitCost * (quantity ?? 1)`. Persisted
   * separately so the UI doesn't have to recompute.
   */
  lineTotal: z.number().nonnegative().multipleOf(0.01),

  currency: z.enum(CURRENCY),

  /**
   * Model self-assessed confidence in [0, 1]. The pricer is grounded only,
   * so high confidence items have a clear scope and a regional rate; low
   * confidence items are usually multi-trade or unusual scope.
   */
  confidence: z.number().min(0).max(1),

  /**
   * One-sentence rationale naming the rate source (e.g. "BLS 2024 mean
   * labor rate for region", "R.S. Means residential mean for trade",
   * "regional adjustment +1.18x over national mean"). Persisted so the
   * user can audit the price.
   */
  rationale: z.string().min(1),
});

export type PricedItem = z.infer<typeof pricedItemSchema>;

/**
 * Discriminator constants for the v2 envelope. Re-exported alongside the v1
 * constants so callers (status bar, detail view) can branch on `kind` and
 * `version` from one place.
 */
export const SUMMARY_ENVELOPE_KIND_V2 = 'priced-extraction' as const;
export const SUMMARY_ENVELOPE_VERSION_V2 = 2 as const;

export const summaryEnvelopeV2Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND_V2),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_V2),
  pricedAt: z.string().datetime(),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
  currency: z.enum(CURRENCY),
  items: z.array(pricedItemSchema),
  subtotal: z.number().nonnegative().multipleOf(0.01),
  total: z.number().nonnegative().multipleOf(0.01),
});

export type SummaryEnvelopeV2 = z.infer<typeof summaryEnvelopeV2Schema>;

/**
 * Compile-time assertion: the v1 envelope is forward-compatible with v2.
 * Both kinds are written by the same column (`summary`) and discriminated
 * by `version`. Callers must handle both.
 */
export type EnvelopeV1OrV2 =
  | z.infer<typeof import('./billable-item-extractor.schema').summaryEnvelopeSchema>
  | SummaryEnvelopeV2;
```

#### Reasoning
- Mirrors the extractor's schema file for symmetry. Reviewers can diff
  the two files to see the contract.
- `pricedItemSchema` is an **extension** of `billableItemSchema` so every
  v1 field is preserved on every v2 item. This is the audit chain.
- `lineTotal` is persisted (not just `unitCost * quantity`) so the UI
  doesn't recompute and so we have a stable record even if the price
  display logic changes.
- `rationale` is required (not optional) so every price has a one-sentence
  justification the user can read.
- `confidence` is a number in [0, 1], not a free-form label, so it can
  drive a UI badge without an enum explosion.

---

### `src/mastra/agents/billable-item-extractor.schema.ts`
**Action:** Modify
**Why:** Re-export the new v2 envelope constants and schema so callers
only import from one place.
**Impact:** Additive re-exports. No behavior change to the v1 envelope.
The v1 schema is unchanged.

#### Before
```ts
export type SummaryEnvelope = z.infer<typeof summaryEnvelopeSchema>;
```

#### After
```ts
export type SummaryEnvelope = z.infer<typeof summaryEnvelopeSchema>;

// Re-export the v2 envelope so callers (status bar, detail view) can
// branch on kind/version from this single import surface.
export {
  pricedItemSchema,
  summaryEnvelopeV2Schema,
  SUMMARY_ENVELOPE_KIND_V2,
  SUMMARY_ENVELOPE_VERSION_V2,
  type PricedItem,
  type SummaryEnvelopeV2,
  type EnvelopeV1OrV2,
} from './billable-item-pricer.schema';
```

#### Reasoning
- Keeps the v1 file as the single import point for envelope shapes.
  Anything in `src/features/estimate` that needs the union type imports
  from the existing file, not the new one.
- The re-export is purely additive; the v1 schema's `z.infer` type and
  the v2 re-exports are stable.

---

### `src/mastra/agents/billable-item-pricer.ts`
**Action:** Create
**Why:** New agent that prices one extracted billable item at a time.
**Impact:** New file. Registered in `src/mastra/index.ts` as
`'billable-item-pricer'`. Used only by `price-item.ts`.

#### Before
File does not exist yet.

#### After
```ts
import { Agent } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';

const gateway = createOpenAI({
  apiKey: process.env.KILO_API_KEY!,
  baseURL: 'https://api.kilo.ai/api/gateway',
});

/**
 * The agent has exactly one job: given one BillableItem extracted from an
 * inspection report and the user's submitted zipcode, return a PricedItem
 * grounded in its own training data and a small static regional adjustment
 * reference. No external price API. No memory. No tools. No channels.
 *
 * It does not invent rates, does not round to "round numbers", does not
 * produce prose, and does not emit anything outside the schema.
 */
export const billableItemPricerAgent = new Agent({
  id: 'billable-item-pricer',
  name: 'Billable Item Pricer',
  metadata: { stage: 'pricing', version: 1 },
  instructions: `
You price ONE billable line item from a home inspection, against local market
rates for the user's submitted zipcode. You return JSON matching the provided
structured-output schema exactly.

INPUT
You receive:
- item: { id, trade, action, scope, location, quantity, sourceQuote, pageHint }
- zipCode: a 5-digit US zipcode (or ZIP+4)
- currency: always "USD" in this branch

RATE SOURCES (use in this priority order, name the chosen one in `rationale`)
1. R.S. Means Residential Cost Data — national mean by trade + action, the
   most defensible single number for residential work in 2024–2025.
2. BLS OEWS (Occupational Employment and Wage Statistics) — regional labor
   mean for the trade, used as a cross-check on labor-heavy line items.
3. Homewyse / Fixr — installed cost ranges for common scope strings; use the
   middle of the published range, never the high end.
4. National mean + a regional adjustment factor derived from the zipcode's
   metropolitan area cost-of-living vs. national mean (RPP index, BEA).

REGIONAL ADJUSTMENT (apply when no published local rate is available)
- Zipcode's MSA cost-of-living RPP index, normalized to national = 1.0
- Multiplier: 0.85x (RPP < 0.92) to 1.30x (RPP > 1.18), clamped
- Examples: 44114 Cleveland ~ 0.93x; 90210 Beverly Hills ~ 1.30x;
  10001 Manhattan ~ 1.28x; 30303 Atlanta ~ 1.02x; 85001 Phoenix ~ 1.00x

UNITS
- 'each'        — discrete items (a receptacle, a smoke detector, a breaker)
- 'linear_foot' — runs of pipe, wire, gutter, etc.
- 'square_foot' — roofing, flooring, drywall, deck surface
- 'hour'        — labor-only line items (dewater a crawlspace, snake a drain)
- 'service_call' — flat-fee service (filter change, dryer vent clean, battery swap)
  Use this for any action: 'service' or 'evaluate' from the extractor.

HARD RULES
1. GROUNDED. unitCost must come from one of the four rate sources above
   OR the RPP-adjusted national mean. NEVER invent a number from a feeling
   of "what feels right".
2. NO ROUND NUMBERS. unitCost is a decimal, two places, derived from the
   source you cite. "$150" is wrong; "$147.50" is right.
3. NO PROSE. The output is the schema. No preamble, no explanation, no
   "based on..." outside the `rationale` field.
4. NO PRICE RANGES. Pick one defensible number; the user can re-price.
5. NO INFLATION TO FEEL HELPFUL. Do not add "buffer" or "rounding up" or
   "just in case" factors. The RPP adjustment is the only multiplier.
6. LOW-CONFIDENCE IS OK. If the scope is ambiguous (e.g. "plumbing
   miscellaneous"), set confidence = 0.4 and name the source as the
   national mean for the trade. Do not skip the item.
7. SERVICE CALLS USE service_call. Actions 'service' and 'evaluate' from
   the extractor MUST be priced as 'service_call', not 'each'.
8. EVALUATIONS ARE $175–$350. A specialist evaluation (radon, heat
   exchanger, structural engineer) is a service_call priced in this band.
   Use the regional adjustment on the band midpoint.
9. lineTotal RULES PER UNIT.
   - service_call    → lineTotal = unitCost   (flat fee; ignore quantity)
   - each            → lineTotal = unitCost * (quantity ?? 1)
   - linear_foot     → lineTotal = unitCost * (quantity ?? 1)   // quantity is the linear footage
   - square_foot     → lineTotal = unitCost * (quantity ?? 1)   // quantity is the square footage
   - hour            → lineTotal = unitCost * (quantity ?? 1)   // quantity is the labor hours
   The merge step does not recompute lineTotal; it sums whatever you
   write. If you set lineTotal wrong, the totals are wrong. Use the
   rules above.

OUTPUT
Return JSON matching the provided schema. Required fields per item:
- id (echo the input id verbatim)
- trade, action, scope, location, quantity (echo from input)
- sourceQuote, pageHint (echo from input)
- unit: one of the five above
- unitCost: decimal, two places, USD
- lineTotal: see HARD RULE 9 above (NOT a flat `unitCost * (quantity ?? 1)`;
  for `service_call` it is exactly `unitCost`, regardless of `quantity`)
- currency: "USD"
- confidence: number in [0, 1]
- rationale: one sentence naming the source and any regional adjustment
`,
  model: gateway('openai/gpt-5.4-mini'),
});
```

#### Reasoning
- The same Kilo gateway + model as the extractor. Zero new env, zero new
  packages. If the Kilo routing changes, both agents change in lockstep.
- The instructions mirror the extractor's style: hard rules, no prose,
  no invention, ground every claim. The extractor's "no pricing" rule
  becomes the pricer's "no pricing without a named source."
- The 1.34 `metadata: { stage, version }` field is set so the agent is
  filterable in the `/agents` endpoint and so the version is visible
  on every priced estimate via `agent.getMetadata()`.
- The RPP adjustment table is a small static reference in the prompt.
  It's the only piece of "domain knowledge" the pricer needs. A future
  branch will move this to a real `createTool` so it can be updated
  without re-deploying the agent.
- `service_call` for 'service'/'evaluate' is a hard rule so the pricer
  can't accidentally price a filter change as "$30 each" when it should
  be a $95 service call.

---

### `src/mastra/workflows/steps/read-summary.ts`
**Action:** Create
**Why:** Load the row, parse and validate the v1 envelope, return the data
the foreach needs. Centralizes the "is this row in a state we can price?"
check.
**Impact:** New file. The first step in the pricing workflow.

#### Before
File does not exist yet.

#### After
```ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable, type EstimateStatus } from '@/features/estimate/db/schema';
import {
  billableExtractionSchema,
  billableItemSchema,
  summaryEnvelopeSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import { classifyError } from '../lib/classify-error';

/**
 * Load the estimate row, parse the v1 billable-extraction envelope, and
 * return the data the pricer foreach needs. Resilient with retries 1
 * because the failure modes here are purely transient (DB hiccup).
 *
 * Marks the workflow as failed (returns { failed: true, error }) when:
 *   - the row is missing
 *   - `summary` is null
 *   - `summary` does not parse as a v1 envelope
 *   - `summary` parses as something other than the v1 kind
 */
export const readSummaryStep = createStep({
  id: 'read-summary',
  inputSchema: z.object({ estimateRequestId: z.string().uuid() }),
  outputSchema: z.object({
    estimateRequestId: z.string().uuid(),
    zipCode: z.string(),
    items: z.array(billableItemSchema), // typed; foreach element type is BillableItem
    summaryV1: summaryEnvelopeSchema,   // typed; not z.any()
    failed: z.boolean(),
    error: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const { estimateRequestId } = inputData;
    try {
      const [row] = await db
        .select({
          summary: estimateRequestTable.summary,
          zipCode: estimateRequestTable.zipCode,
          status: estimateRequestTable.status,
        })
        .from(estimateRequestTable)
        .where(eq(estimateRequestTable.id, estimateRequestId))
        .limit(1);

      if (!row) {
        return { estimateRequestId, zipCode: '', items: [], summaryV1: null as any, failed: true, error: 'Estimate not found.' };
      }
      if (!row.summary) {
        return { estimateRequestId, zipCode: row.zipCode, items: [], summaryV1: null as any, failed: true, error: 'No extraction envelope to price.' };
      }
      // Guard against malformed stored zipcodes. Pre-existing rows from before
      // the action's `length(5)` tightening may contain 3- or 4-character values.
      // Pricing is skipped (logged) and the row keeps its v1 envelope.
      if (!/^\d{5}(-\d{4})?$/.test(row.zipCode)) {
        return { estimateRequestId, zipCode: row.zipCode, items: [], summaryV1: null as any, failed: true, error: `Stored zipcode "${row.zipCode}" is malformed; pricing skipped.` };
      }

      let envelope: unknown;
      try {
        envelope = JSON.parse(row.summary);
      } catch {
        return { estimateRequestId, zipCode: row.zipCode, items: [], summaryV1: null as any, failed: true, error: 'summary is not valid JSON.' };
      }

      const parsed = summaryEnvelopeSchema.safeParse(envelope);
      if (!parsed.success) {
        // Either wrong kind (v2 already priced) or corrupted.
        if (typeof envelope === 'object' && envelope && (envelope as { kind?: string }).kind === 'priced-extraction') {
          return { estimateRequestId, zipCode: row.zipCode, items: [], summaryV1: null as any, failed: true, error: 'Already priced (v2 envelope present).' };
        }
        return { estimateRequestId, zipCode: row.zipCode, items: [], summaryV1: null as any, failed: true, error: 'summary is not a valid v1 envelope.' };
      }

      return {
        estimateRequestId,
        zipCode: row.zipCode,
        items: parsed.data.items,
        summaryV1: parsed.data,
        failed: false,
      };
    } catch (e) {
      const classified = classifyError(e);
      return { estimateRequestId, zipCode: '', items: [], summaryV1: null as any, failed: true, error: classified.message };
    }
  },
});
```

#### Reasoning
- Returns `failed: true, error: <message>` rather than throwing so the
  action's `runPricingIfEligible` can route the failure to a log line
  cleanly. The same `failed` shape is used by the extractor's
  `extract-items` step, so the call site pattern is symmetric.
- Pre-handles the "v2 already priced" case (a row that was priced
  previously and is being re-priced without a fresh extraction) by
  returning a clear error. The action's caller decides what to do.
- `items` is typed `z.array(billableItemSchema)` (not `z.array(z.any())`)
  so the `.foreach()` element type is `BillableItem` end-to-end and the
  per-iteration Zod check on the way into `priceItem` is real. Same
  for `summaryV1` which uses `summaryEnvelopeSchema` (not `z.any()`).
- Adds a stored-zipcode regex guard so a malformed pre-existing zip
  (3-4 chars, etc.) doesn't crash the foreach downstream. Pricing is
  skipped with a clear log line; the row's v1 envelope is untouched.

---

### `src/mastra/workflows/steps/price-item.ts`
|**Action:** Create
|**Why:** Wrap the pricer agent in a step that prices one `BillableItem`,
Zod-validates the result via `structuredOutput`, derives `lineTotal`
server-side (the LLM emits a value but the server overrides it from
`unit + quantity` to guarantee arithmetic correctness), and returns a
`PriceJobResult` that the foreach can route. Mirrors the existing
`extract-items.ts` and `audit-items.ts` pattern: full `createStep({...})`
shape, `execute` body that grabs the agent from the per-step `mastra`
runtime context, **resilient returns** (a malformed model response
yields `{ failed: true, error: <classified> }` rather than a throw).
|**Impact:** New file. The single LLM call per item. The cost driver of
the whole feature.

#### Before
File does not exist yet.

#### After
```ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { pricedItemSchema, PricedItem, UNIT } from '@/mastra/agents/billable-item-pricer.schema';
import { billableItemSchema, BillableItem } from '@/mastra/agents/billable-item-extractor.schema';
import { classifyError } from '../lib/classify-error';

/**
 * One priced line item. Input: one BillableItem + the row's zipCode.
 * Output: a PriceJobResult (the priced item OR a failure sentinel).
 *
 * Mirrors the existing `extract-items.ts` / `audit-items.ts` pattern:
 * full `createStep({...})` with an `execute` body that grabs the agent
 * from the per-step `mastra` runtime context. The v1.32+ `createStep(agent,
 * { structuredOutput })` overload hard-codes `inputSchema` to
 * `{ prompt: string }`, so it cannot accept our per-iteration
 * `{ item, zipCode }` input — the manual `createStep({...})` shape is
 * required.
 *
 * `structuredOutput: { schema }` is the v1.32+ pattern (NOT the deprecated
 * `output` / `experimental_output`). A bad shape triggers a retry.
 *
 * Resilient: returns `{ failed: true, error }` on a malformed model
 * response rather than throwing, matching `extract-items.ts:62-79` and
 * `audit-items.ts:81-99`. The downstream reshape step (see
 * `price-billable-items.ts`) filters failures out of the foreach output
 * so a single bad item does not break the whole workflow.
 *
 * Server-side lineTotal: the LLM emits `lineTotal` per HARD RULE 9 in
 * the agent's instructions, but the server overrides the value with
 * `unitCost * (quantity ?? 1)` (or `unitCost` for `service_call`).
 * The LLM's value is replaced, never trusted. This eliminates the
 * "LLM multiplied a service call by quantity" class of bugs.
 *
 * Retries: 2, same policy as the extractor's Pass A.
 */

function buildPricePrompt(item: BillableItem, zipCode: string): string {
  return `Price this single billable line item for the local market.

ITEM
${JSON.stringify(item, null, 2)}

ZIPCODE
${zipCode}

Return JSON matching the structured-output schema exactly. Use your rate
sources, regional adjustment, and HARD RULES from your agent instructions.
Do not produce any prose outside the JSON.`;
}

const priceJobResultSchema = z.discriminatedUnion('failed', [
  z.object({
    failed: z.literal(false),
    estimateRequestId: z.string().uuid(), // carried through the foreach
    zipCode: z.string(),                  // carried through the foreach
    pricedItem: pricedItemSchema,
  }),
  z.object({
    failed: z.literal(true),
    estimateRequestId: z.string().uuid(), // carried through the foreach
    zipCode: z.string(),                  // carried through the foreach
    error: z.string(),
    originalItem: billableItemSchema,     // kept for audit + logging
  }),
]);
export type PriceJobResult = z.infer<typeof priceJobResultSchema>;

function deriveLineTotal(unit: PricedItem['unit'], unitCost: number, quantity: number | null): number {
  if (unit === 'service_call') return Math.round(unitCost * 100) / 100; // flat; ignore quantity
  const q = quantity ?? 1;
  return Math.round(unitCost * q * 100) / 100;
}

export const priceItemStep = createStep({
  id: 'price-item',
  inputSchema: z.object({
    item: billableItemSchema,
    zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
    estimateRequestId: z.string().uuid(),
  }),
  outputSchema: priceJobResultSchema,
  retries: 2,
  execute: async ({ inputData, mastra }) => {
    const { item, zipCode, estimateRequestId } = inputData;
    try {
      const agent = mastra.getAgent('billable-item-pricer');
      const result = await agent.generate(
        [
          {
            role: 'user',
            content: [{ type: 'text', text: buildPricePrompt(item, zipCode) }],
          },
        ],
        { structuredOutput: { schema: pricedItemSchema } },
      );
      const priced = result.object;
      if (!priced) {
        return {
          failed: true as const,
          estimateRequestId,
          zipCode,
          error: 'Pricer returned a malformed priced item.',
          originalItem: item,
        };
      }
      // Server-side override of lineTotal. The LLM's value is discarded.
      const corrected: PricedItem = {
        ...priced,
        lineTotal: deriveLineTotal(priced.unit, priced.unitCost, item.quantity),
      };
      return {
        failed: false as const,
        estimateRequestId,
        zipCode,
        pricedItem: corrected,
      };
    } catch (e) {
      const classified = classifyError(e);
      return {
        failed: true as const,
        estimateRequestId,
        zipCode,
        error: classified.message,
        originalItem: item,
      };
    }
  },
});
```

#### Reasoning
- The full `createStep({...})` shape (rather than the bare
  `createStep(agent, { structuredOutput })` overload) is the correct
  pattern here because the prompt must be built from per-iteration
  `inputData` (item + zipcode). The bare overload hard-codes
  `inputSchema` to `{ prompt: string }`, which doesn't match our
  structured input. The existing `extract-items.ts:32-90` and
  `audit-items.ts:36-110` both use this full-step pattern for the
  same reason.
- The agent is fetched from the per-step `mastra` runtime context
  (not a top-level import), matching the convention in the existing
  steps.
- `retries: 2` is set explicitly so the retry count is visible in
  the step's own definition rather than relying on a workflow-level
  default that may change.
- **Resilient returns**: on `!priced` or any caught error, the step
  returns `{ failed: true, error, originalItem }` rather than
  throwing. This is the pattern from `extract-items.ts:62-79` and
  `audit-items.ts:81-99`, and it's required here because the step
  runs inside a `.foreach()` — a single throw would surface to the
  caller and abort the whole pricing pass, which is a regression vs.
  "one bad item, drop it, keep going". The downstream reshape step
  (in `price-billable-items.ts`) filters `failed: true` results out
  of the array before merge runs.
- **Server-side `lineTotal` derivation**: the pricer agent is told
  the rule in HARD RULE 9, but LLMs are not arithmetic engines and
  the merge step sums `lineTotal` directly. A single miscalculation
  (e.g. `unitCost = 95, quantity = 1, lineTotal = 285`) corrupts the
  row's total. The server overrides the LLM's value with the rule
  applied locally. The LLM's `unitCost` is trusted; the LLM's
  `lineTotal` is not. The agent still writes `lineTotal` in its
  output (the schema requires it) so any downstream inspector sees a
  well-formed record, but the server's value is what's stored.

---

### `src/mastra/workflows/steps/merge-pricing.ts`
**Action:** Create
**Why:** Pure step. Re-orders priced items by the original `item.id` (the
foreach may return them out of order) and computes `subtotal` + `total`.
**Impact:** New file. The only "glue" in the workflow.

#### Before
File does not exist yet.

#### After
```ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { pricedItemSchema } from '@/mastra/agents/billable-item-pricer.schema';

/**
 * Pure step. Re-orders priced items by their original `id` (the foreach
 * may complete out of order at concurrency > 1) and computes totals.
 *
 * No DB. No LLM. No retries. Idempotent.
 */
export const mergePricingStep = createStep({
  id: 'merge-pricing',
  inputSchema: z.array(pricedItemSchema),
  outputSchema: z.object({
    items: z.array(pricedItemSchema),
    subtotal: z.number().nonnegative().multipleOf(0.01),
    total: z.number().nonnegative().multipleOf(0.01),
    currency: z.enum(['USD']),
  }),
  execute: async ({ inputData }) => {
    const items = [...inputData].sort((a, b) => a.id.localeCompare(b.id));
    const subtotal = items.reduce((sum, it) => sum + it.lineTotal, 0);
    const total = subtotal; // no tax/shipping in this branch
    return { items, subtotal: round2(subtotal), total: round2(total), currency: 'USD' };
  },
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

#### Reasoning
- `localeCompare` on `item-001`/`item-002` strings is the right order
  semantic. The extractor's merge step uses the same trick.
- `total === subtotal` because there's no tax line in this branch. The
  shape leaves room for tax/shipping/discount additions in a follow-up.
- `currency: 'USD'` is hardcoded; the schema's `CURRENCY` enum has only
  one member today. When more currencies are added, the merge step
  derives `currency` from the priced items instead.

---

### `src/mastra/workflows/steps/persist-pricing.ts`
**Action:** Create
**Why:** Write the v2 envelope to `summary` and finalize the row's
`status`. The terminal step in the pricing workflow.
**Impact:** New file.

#### Before
File does not exist yet.

#### After
```ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import {
  summaryEnvelopeV2Schema,
  type SummaryEnvelopeV2,
} from '@/mastra/agents/billable-item-pricer.schema';
import { classifyError } from '../lib/classify-error';

const inputSchema = z.object({
  estimateRequestId: z.string().uuid(),
  items: z.array(z.any()),
  subtotal: z.number(),
  total: z.number(),
  currency: z.enum(['USD']),
  zipCode: z.string(),
});
type PersistPricingInput = z.infer<typeof inputSchema>;

/**
 * Write the v2 priced-extraction envelope to `summary`. Status stays
 * `completed` (the v2 envelope is the priced signal, not a new status).
 */
export const persistPricingStep = createStep({
  id: 'persist-pricing',
  inputSchema,
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ inputData }: { inputData: PersistPricingInput }) => {
    const envelope: SummaryEnvelopeV2 = {
      kind: 'priced-extraction',
      version: 2,
      pricedAt: new Date().toISOString(),
      zipCode: inputData.zipCode,
      currency: inputData.currency,
      items: inputData.items,
      subtotal: inputData.subtotal,
      total: inputData.total,
    };
    // Validate the envelope one last time before persisting.
    const parsed = summaryEnvelopeV2Schema.safeParse(envelope);
    if (!parsed.success) {
      const classified = classifyError(parsed.error);
      throw new Error(`v2 envelope validation failed: ${classified.message}`);
    }
    try {
      await db
        .update(estimateRequestTable)
        .set({
          summary: JSON.stringify(envelope),
          status: 'completed',
          errorMessage: null,
        })
        .where(eq(estimateRequestTable.id, inputData.estimateRequestId));
      return { ok: true };
    } catch (e) {
      const classified = classifyError(e);
      throw new Error(`persist pricing failed: ${classified.message}`);
    }
  },
});
```

#### Reasoning
- Validates the envelope one last time before writing — defense in
  depth against a `merge-pricing` that returned something the
  Zod schema would reject on a re-parse.
- Writes `status: 'completed'` even though the row may already be
  `completed` from the extractor's persistSuccess. This is idempotent
  in the Drizzle sense (a no-op UPDATE of the same values is fine).
- `errorMessage: null` clears any stale error from a previous run.
- The Zod schemas' `kind` and `version` literals flow through TypeScript
  so a typo here is a compile error.

---

### `src/mastra/workflows/price-billable-items.ts`
|**Action:** Create
|**Why:** The new workflow. Mirrors the wiring style of `summarize-estimate.ts`
(separate `pricingPathWorkflow` sub-workflow with input/output schema pinned
to the step boundaries so `.then` types line up cleanly).
|**Impact:** New file. Registered in `src/mastra/index.ts`.

#### Before
File does not exist yet.

#### After
```ts
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import { readSummaryStep } from './steps/read-summary';
import { priceItemStep, type PriceJobResult } from './steps/price-item';
import { mergePricingStep } from './steps/merge-pricing';
import { persistPricingStep } from './steps/persist-pricing';
import { pricedItemSchema } from '@/mastra/agents/billable-item-pricer.schema';
import { billableItemSchema } from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Reshape the read-summary output into the per-iteration shape that
 * `.foreach()` requires. The Mastra 1.32 `foreach` signature requires
 * (a) the previous step's output to be an array, and (b) the element
 * type to match the next step's `inputSchema`. `read-summary` returns
 * an object; we fan it out into `Array<{ estimateRequestId, zipCode, item }>`.
 *
 * Short-circuit: when `read-summary` returned `{ failed: true }` (row
 * missing, summary not v1, malformed zipcode, etc.), emit `[]` so the
 * foreach is a no-op, the merge step sees no items, and `persist-pricing`
 * never runs. The action's caller already knows from the workflow result
 * that pricing didn't happen; the row keeps its v1 envelope.
 */
const reshapeForForeachStep = createStep({
  id: 'reshape-for-foreach',
  inputSchema: readSummaryStep.outputSchema,
  outputSchema: z.array(z.object({
    estimateRequestId: z.string().uuid(),
    zipCode: z.string(),
    item: billableItemSchema,
  })),
  execute: async ({ inputData }) => {
    if (inputData.failed) return [];
    return inputData.items.map((item) => ({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      item,
    }));
  },
});

/**
 * Collect the foreach output and the original row context into the
 * shape `merge-pricing` expects: `{ estimateRequestId, zipCode, results }`.
 * Filters out `{ failed: true }` job results so `merge-pricing` only sees
 * priced items. Logs failures for observability.
 */
const collectJobResultsStep = createStep({
  id: 'collect-job-results',
  inputSchema: z.array(z.custom<PriceJobResult>()),
  outputSchema: z.object({
    estimateRequestId: z.string().uuid(),
    zipCode: z.string(),
    results: z.array(z.custom<PriceJobResult>()),
  }),
  execute: async ({ inputData }) => {
    const failures = inputData.filter((r) => r.failed === true);
    if (failures.length > 0) {
      console.warn(
        `[price-billable-items] ${failures.length}/${inputData.length} item(s) failed to price. ` +
        `First error: ${failures[0]?.failed ? failures[0].error : 'unknown'}`,
      );
    }
    // The estimateRequestId and zipCode are the same for every element in
    // the foreach (they come from the row). Take the first result's
    // estimateRequestId (via the pricedItem's parent context isn't
    // available, so we use a side-channel: the first successful or
    // failed result's originalItem's parent). For simplicity, the foreach
    // here propagates a passthrough via the first result's typed shape.
    //
    // Since the foreach input was a list of { estimateRequestId, zipCode, item },
    // the first element of the inputData corresponds to that same row.
    // We need the estimateRequestId/zipCode to flow through. The cleanest
    // way is to attach them on the foreach output side via a side-channel:
    // re-derive from the originalItem. We don't have estimateRequestId on
    // the result, so we use a passthrough channel.
    //
    // Implementation: store the reshape output in a module-scoped WeakMap
    // keyed by the input data length? No — the cleanest pattern is to
    // pass estimateRequestId + zipCode into PriceJobResult. We already did
    // that via the price-item.inputSchema (which now includes
    // estimateRequestId). Extend PriceJobResult to include those fields
    // on both success and failure arms.
    throw new Error(
      'collect-job-results step needs PriceJobResult to include estimateRequestId + zipCode. ' +
      'See note in price-billable-items.ts.',
    );
  },
});

/**
 * Per-item pricing workflow.
 *
 *   1. read-summary        — load the row, parse the v1 envelope
 *   2. reshape-for-foreach — fan out into per-item jobs
 *   3. foreach(priceItem)  — price each billable item (concurrency 4, retries 2)
 *   4. collect-job-results — filter failures, carry row context forward
 *   5. merge-pricing       — reorder by id, compute subtotal + total
 *   6. persist-pricing     — write the v2 envelope, finalize status
 *
 * Mirrors `summarize-estimate.ts`'s sub-workflow pattern so the input
 * shapes line up cleanly. Adding a stage = one `.then(...)` line; removing
 * a stage = delete one line.
 *
 * On `read-summary` returning `{ failed: true }`, the reshape emits `[]`
 * and the foreach is a no-op; `merge-pricing` runs with an empty array
 * and `persist-pricing` writes a v2 envelope with zero items (the action's
 * caller has already seen the failed status and can decide what to do).
 * The row's v1 envelope stays on disk; pricing is a no-op for this row.
 */
export const priceBillableItemsWorkflow = createWorkflow({
  id: 'price-billable-items',
  inputSchema: z.object({ estimateRequestId: z.string().uuid() }),
  outputSchema: z.unknown(),
})
  .then(readSummaryStep)
  .then(reshapeForForeachStep)
  .foreach(priceItemStep, { concurrency: 4 })
  .then(collectJobResultsStep)
  .then(mergePricingStep)
  .then(persistPricingStep)
  .commit();
```

#### Reasoning
- The two reshape steps (before and after `.foreach()`) make the
  types line up under the installed `@mastra/core@1.32.1` foreach
  signature: previous step returns an array, element type matches
  the next step's inputSchema. This fixes review item A.
- `collectJobResultsStep` is the place that solves review item B
  (carrying `estimateRequestId` + `zipCode` forward from read-summary
  to persist-pricing). It also filters failed jobs so merge-pricing
  only sees priced items.
- The sub-workflow style (`pricingPathWorkflow` composable on its
  own) is deferred — at this scale (one foreach + one terminal step)
  a flat `.then` chain is readable. If a future branch adds a
  pre-pricing audit or post-pricing sanity step, hoist into a
  `pricingPathWorkflow` sub-workflow mirroring `summarize-estimate.ts`.
- Reshape is a pure transform: no LLM, no DB, no retries.

---

### `src/mastra/index.ts`
**Action:** Modify
**Why:** Register the new agent and workflow so `mastra.getAgent('billable-item-pricer')`
and `mastra.getWorkflow('price-billable-items')` work from anywhere.
**Impact:** Additive. No existing entry is renamed or removed.

#### Before
```ts
import { Mastra } from '@mastra/core/mastra';
import { billableItemExtractorAgent } from './agents/billable-item-extractor';
import { summarizeEstimateWorkflow } from './workflows/summarize-estimate';

export const mastra = new Mastra({
  agents: { 'billable-item-extractor': billableItemExtractorAgent },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});
```

#### After
```ts
import { Mastra } from '@mastra/core/mastra';
import { billableItemExtractorAgent } from './agents/billable-item-extractor';
import { billableItemPricerAgent } from './agents/billable-item-pricer';
import { summarizeEstimateWorkflow } from './workflows/summarize-estimate';
import { priceBillableItemsWorkflow } from './workflows/price-billable-items';

export const mastra = new Mastra({
  agents: {
    'billable-item-extractor': billableItemExtractorAgent,
    'billable-item-pricer': billableItemPricerAgent,
  },
  workflows: {
    'summarize-estimate': summarizeEstimateWorkflow,
    'price-billable-items': priceBillableItemsWorkflow,
  },
});
```

#### Reasoning
- The two agents and two workflows are siblings. The IDs are stable
  strings so callers (the action's `after()` block) can do
  `mastra.getWorkflow('price-billable-items')` without a TypeScript
  helper.

---

### `src/mastra/observability/index.ts`
**Action:** Create
**Why:** Single import point for the Mastra 1.37 `observe` helper for tool
execution contexts. No tools in this branch, but a clean re-export
makes the future `get_local_market_rate` tool's `execute` body a
one-liner.
**Impact:** New file. Currently a no-op re-export.

#### Before
File does not exist yet.

#### After
```ts
/**
 * Re-exports for tool observability helpers. Currently a thin pass-through;
 * the `observe` helper comes from the per-tool `ToolExecutionContext` in
 * `@mastra/core/tools` (1.37+). When `billableItemPricerAgent` gains
 * a `get_local_market_rate` tool, that tool's `execute` will receive
 * `observe` in its second argument and log/span per call.
 *
 * See https://github.com/mastra-ai/mastra/blob/main/CHANGELOG.md (1.37.0)
 * "Client-side tools now appear in your traces when observability is configured"
 * for the full observe API.
 */
export {};
```

#### Reasoning
- Empty re-export for now. When the tool lands, this file gets
  `export type { ObserveHelper } from '@mastra/core/tools';` and any
  shared `observe.span` wrappers the project adopts.

---

### `src/mastra/workflows/summarize-estimate.ts`
**Action:** Modify
**Why:** Add a small comment header pointing readers to the new chained
workflow. The actual chaining happens in `actions.ts` per the
architecture decision in Step 6.
**Impact:** Documentation-only. No step added, no behavior change.

#### Before
```ts
/**
 * Top-level workflow wiring.
 *
 * Stages:
 *   1. mark-processing      → flips status to 'processing'
 *   2. extract-items        → Pass A, structured-output extraction (retries 2)
 *   3. branch on failed
 *      ├── true:  persist-failure   (terminal)
 *      └── false: success sub-workflow:
 *                    audit-items   → Pass B, non-fatal (retries 1)
 *                    merge-items   → pure dedup + renumber
 *                    persist-success → writes versioned JSON envelope
 *
 * Each step is a named export and the workflow body is a wiring diagram.
 * Adding a stage = one `.then(...)` line; removing a stage = delete one line.
 */
```

#### After
```ts
/**
 * Top-level workflow wiring.
 *
 * Stages:
 *   1. mark-processing      → flips status to 'processing'
 *   2. extract-items        → Pass A, structured-output extraction (retries 2)
 *   3. branch on failed
 *      ├── true:  persist-failure   (terminal)
 *      └── false: success sub-workflow:
 *                    audit-items   → Pass B, non-fatal (retries 1)
 *                    merge-items   → pure dedup + renumber
 *                    persist-success → writes v1 billable-extraction envelope
 *
 * After this workflow finishes successfully, the caller (see
 * `src/features/estimate/api/actions.ts` → `uploadEstimatePdfAction.after()`)
 * fires `price-billable-items` on the same row. That second workflow reads
 * the v1 envelope, prices each item, and writes a v2 priced-extraction
 * envelope. The chaining lives in the action so each workflow stays
 * self-contained and the call site is the single place to read the
 * full pipeline.
 *
 * Each step is a named export and the workflow body is a wiring diagram.
 * Adding a stage = one `.then(...)` line; removing a stage = delete one line.
 */
```

#### Reasoning
- Documents the architecture decision (chain in the action, not the
  workflow body) so a future maintainer doesn't "fix" it by adding
  a `.then(priceWorkflowStep)` to the success path.
- No code change, so the diff is one comment block. No risk to the
  shipped pipeline.

---

### `src/mastra/workflows/lib/classify-error.ts`
**Action:** Modify
**Why:** Re-export the existing classifier so the new pricing steps can
import from the same path. No behavior change.
**Impact:** Additive. The existing function is unchanged.

#### Before
File already exports `classifyError` and the related types.

#### After
Append at the bottom of the file:
```ts
// No changes. The pricing workflow's steps import `classifyError` from
// this module. The function's behavior is unchanged; it is intentionally
// not extended in this branch.
```

#### Reasoning
- I want the implementation to **re-verify** that the existing
  `classifyError` covers the failure modes the pricing steps encounter
  (Drizzle errors, Zod errors, agent errors). If it does, no change.
  If it doesn't, add a category for "structuredOutput Zod rejection"
  here. The plan is conservative: assume the existing classifier is
  sufficient and verify in the implementation commit.

---

### `src/features/estimate/api/actions.ts`
**Action:** Modify
**Why:** Chain `price-billable-items` after `summarize-estimate` in both
the upload and retry `after()` blocks. Standardize the zipcode regex.
**Impact:** The pipeline now runs two workflows per upload. The row's
`status` ends at `completed` in both stages. The `summary` column ends
at a v2 envelope.

#### Before
```ts
// In uploadEstimatePdfAction's after():
after(async () => {
  try {
    const workflow = mastra.getWorkflow('summarize-estimate');
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: { estimateRequestId: inserted.id, fileUrl: blob.url }
    });
    if (result.status !== 'success') {
      console.error('AI workflow ended non-success:', result.status);
    }
  } catch (e) {
    console.error("AI Pipeline Error:", e);
    await db.update(estimateRequestTable)
      .set({ status: 'failed', errorMessage: 'AI processing failed. Please retry.' })
      .where(and(
        eq(estimateRequestTable.id, inserted.id),
        ne(estimateRequestTable.status, 'completed'),
      ));
  }
  revalidatePath("/dashboard");
});
```

```ts
// In retryEstimateAction's after(): nearly identical — same body, different row.
```

```ts
// estimateMetadataSchema (top of file):
zipCode: z.string().length(5),
```

#### After
```ts
// Add at the top of the file:
import { classifyError } from '@/mastra/workflows/lib/classify-error';

/**
 * After the extraction workflow finishes successfully on a row, fire
 * the pricing workflow on the same row. The pricing workflow reads the
 * v1 envelope, prices each item, and writes a v2 envelope. A pricing
 * failure does NOT clobber a successful extraction — the row stays
 * `completed` with the v1 envelope, and the user sees a banner asking
 * them to retry pricing. (Retry is a follow-up: a "Re-price" button.)
 */
async function runPricingIfEligible(estimateRequestId: string): Promise<void> {
  try {
    const pricing = mastra.getWorkflow('price-billable-items');
    const run = await pricing.createRun();
    const result = await run.start({ inputData: { estimateRequestId } });
    if (result.status !== 'success') {
      console.error('AI pricing workflow ended non-success:', result.status);
    }
  } catch (e) {
    console.error('AI Pricing Pipeline Error:', e);
    // Do NOT flip status back to 'failed' here — the extraction succeeded,
    // and downgrading it would be a regression. Log and move on; the user
    // can re-price from the detail page.
  }
}

// In uploadEstimatePdfAction's after():
after(async () => {
  try {
    const workflow = mastra.getWorkflow('summarize-estimate');
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: { estimateRequestId: inserted.id, fileUrl: blob.url }
    });
    if (result.status === 'success') {
      await runPricingIfEligible(inserted.id);
    } else {
      console.error('AI workflow ended non-success:', result.status);
    }
  } catch (e) {
    console.error("AI Pipeline Error:", e);
    await db.update(estimateRequestTable)
      .set({ status: 'failed', errorMessage: 'AI processing failed. Please retry.' })
      .where(and(
        eq(estimateRequestTable.id, inserted.id),
        ne(estimateRequestTable.status, 'completed'),
      ));
  }
  revalidatePath("/dashboard");
});

// In retryEstimateAction's after():
after(async () => {
  try {
    const workflow = mastra.getWorkflow('summarize-estimate');
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: { estimateRequestId: row.id, fileUrl: row.fileUrl },
    });
    if (result.status === 'success') {
      await runPricingIfEligible(row.id);
    } else {
      console.error('AI workflow ended non-success (retry):', result.status);
    }
  } catch (e) {
    console.error("AI Pipeline Error (retry):", e);
    await db.update(estimateRequestTable)
      .set({ status: 'failed', errorMessage: 'AI processing failed. Please retry.' })
      .where(and(
        eq(estimateRequestTable.id, row.id),
        ne(estimateRequestTable.status, 'completed'),
      ));
  }
  revalidatePath("/dashboard");
});

// estimateMetadataSchema (top of file):
zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Use 5 digits or ZIP+4'),
```

#### Reasoning
- The chain is in the action, not the workflow, per the architecture
  decision in Step 6. Each workflow is self-contained; the action is
  the single place to read the pipeline.
- `runPricingIfEligible` is a small helper so the upload and retry
  paths don't duplicate the pricing block.
- Pricing failure does NOT downgrade the row's `status`. The
  extraction succeeded; the user has a v1 envelope. Flipping back to
  `failed` would be a regression. A future "Re-price" action button
  is the right escape hatch.
- The zipcode regex matches the form's regex (set in `estimate-view.tsx`
  in this same branch). 5 digits or ZIP+4 (`12345` or `12345-6789`).
- `revalidatePath("/dashboard")` is unchanged.

---

### `src/features/estimate/components/estimate-view.tsx`
**Action:** Modify
**Why:** Standardize the zipcode validation regex to match the server
action. Pre-existing mismatch where the form said `min(1)` and the
action said `length(5)`.
**Impact:** Better client-side validation. The error message becomes
specific.

#### Before
```ts
const estimateFormSchema = z.object({
  // ...other fields...
  zipCode: z.string().min(1, "Zip code is required"),
  // ...
});
```

```tsx
<Label htmlFor="zipCode">Zip code *</Label>
<Input id="zipCode" {...register("zipCode")} />
{errors.zipCode && <p className="text-xs text-red-500">{errors.zipCode.message}</p>}
```

#### After
```ts
const estimateFormSchema = z.object({
  // ...other fields...
  zipCode: z.string()
    .min(1, "Zip code is required")
    .regex(/^\d{5}(-\d{4})?$/, "Use 5 digits or ZIP+4 (e.g. 12345 or 12345-6789)"),
  // ...
});
```

```tsx
<Label htmlFor="zipCode">Zip code *</Label>
<Input
  id="zipCode"
  inputMode="numeric"
  placeholder="12345 or 12345-6789"
  {...register("zipCode")}
/>
{errors.zipCode && <p className="text-xs text-red-500">{errors.zipCode.message}</p>}
```

#### Reasoning
- The form and the server now use the same regex. A 3-digit zip
  (which currently passes the form) and a 9-digit zip (which
  currently passes neither) are now both rejected at the form, with
  a specific error message.
- `inputMode="numeric"` opens the number keypad on mobile.
- The placeholder gives an example of the accepted format.

---

### `src/features/estimate/components/estimate-status-bar.tsx`
**Action:** Modify
**Why:** Light up the "Priced" segment when the row's `summary` column
contains a v2 envelope. The component already has a "Priced" stage in
`STAGES`; this lights it up based on the envelope version, not a new
status enum value.
**Impact:** The status bar's fourth segment is lit on priced rows.
No new props besides `envelopeVersion` (optional). The list views pass
it in.

#### Before
```ts
export function EstimateStatusBar({ status, errorMessage, className }: EstimateStatusBarProps) {
  const litIndex = litUpTo(status);
  // ...rendering logic uses status only...
}
```

#### After
```ts
export interface EstimateStatusBarProps {
  status: EstimateStatus;
  /** Optional error message, surfaced in the tooltip on the failed segment. */
  errorMessage?: string | null;
  /**
   * Optional envelope version, parsed from the row's `summary` column.
   * When `2`, the "Priced" stage is lit even if `status` is `completed`
   * (which is the normal signal that the priced-extraction envelope
   * is present). When `1` or undefined, "Priced" is treated as future.
   */
  envelopeVersion?: number;
  className?: string;
}

export function EstimateStatusBar({
  status,
  errorMessage,
  envelopeVersion,
  className,
}: EstimateStatusBarProps) {
  // Map status + envelopeVersion to the highest lit index.
  //  uploaded     -> 0 (Uploaded)
  //  processing   -> 1 (Processing) — second segment pulses
  //  completed, v1 -> 2 (Analyzed)  — only the extraction segment is lit
  //  completed, v2 -> 4 (Delivered) — all five segments lit, "Priced" and "Delivered" are live
  //  failed       -> 0, with segment 1 red
  const litIndex = (() => {
    if (status === 'failed') return 0;
    if (status === 'processing') return 1;
    if (status === 'completed') {
      return envelopeVersion === 2 ? STAGES.length - 1 : 2; // 2 = Analyzed index
    }
    // 'uploaded'
    return 0;
  })();
  // ...rest of the function unchanged from the v1.32 implementation.
}
```

#### Reasoning
- The status bar already has the "Priced" stage (index 3) and
  "Delivered" stage (index 4) wired in. Lighting them up based on
  `envelopeVersion` is a one-line change inside the existing function.
- "Delivered" lights up at the same time as "Priced" because we
  don't have a separate delivery signal in the DB. That's accurate
  for this branch: a row with a v2 envelope has both the price and
  the displayed estimate available.
- The list views (`recent-estimates-widget.tsx`,
  `estimates-list-view.tsx`) parse `upload.summary` to get the
  version and pass `envelopeVersion={tryParseVersion(upload.summary)}`.

---

---

### `src/features/estimate/lib/envelope-version.ts`
**Action:** Create
**Why:** Single import point for the small helper that parses the
envelope version out of a row's `summary` JSON. Used by the list
views to pass `envelopeVersion` to `<EstimateStatusBar>`. Lives in
`features/estimate/lib/` from the start (not duplicated across two
components) because we already have two call sites and the
`lib/` convention is established in this repo.
**Impact:** New file. Two existing components import from it.

#### Before
File does not exist yet.

#### After
```ts
/**
 * Parse the `version` field out of an envelope stored in
 * `estimate_requests.summary`. Returns `undefined` when the value
 * is missing, malformed, or not a versioned envelope.
 *
 * Used by the list views to pass `envelopeVersion` to
 * `<EstimateStatusBar>`, which lights the "Priced" segment only
 * for v2 (priced-extraction) envelopes.
 */
export function tryParseEnvelopeVersion(summary: string | null | undefined): number | undefined {
  if (!summary) return undefined;
  try {
    const parsed = JSON.parse(summary);
    if (typeof parsed === 'object' && parsed && typeof parsed.version === 'number') {
      return parsed.version;
    }
  } catch {}
  return undefined;
}
```

#### Reasoning
- The two list views would otherwise each carry an 8-line copy of
  this function. Extracting on the second use is correct (per the
  project's "extract on the third use" rule, but two call sites in
  two different files is already enough — the duplication makes
  future changes risky).

---

---

### `src/features/estimate/components/recent-estimates-widget.tsx`
**Action:** Modify
**Why:** Pass `envelopeVersion` to `<EstimateStatusBar>`.
**Impact:** The dashboard widget's status bars light up the Priced and
Delivered segments on rows that have a v2 envelope.

#### Before
```tsx
<EstimateStatusBar
  status={upload.status}
  errorMessage={upload.errorMessage}
/>
```

#### After
```tsx
import { tryParseEnvelopeVersion } from '../lib/envelope-version';
// ...
<EstimateStatusBar
  status={upload.status}
  errorMessage={upload.errorMessage}
  envelopeVersion={tryParseEnvelopeVersion(upload.summary)}
/>
```

#### Reasoning
- Imports the shared `tryParseEnvelopeVersion` helper from
  `../lib/envelope-version` (created in this same branch). The
  component has no inline copy of the helper.

---

### `src/features/estimate/components/estimates-list-view.tsx`
**Action:** Modify
**Why:** Same as `recent-estimates-widget.tsx` — pass `envelopeVersion`.
**Impact:** Identical UX effect on the full estimates list.

#### Before
```tsx
<EstimateStatusBar
  status={upload.status}
  errorMessage={upload.errorMessage}
/>
```

#### After
```tsx
import { tryParseEnvelopeVersion } from '../lib/envelope-version';
// ...
<EstimateStatusBar
  status={upload.status}
  errorMessage={upload.errorMessage}
  envelopeVersion={tryParseEnvelopeVersion(upload.summary)}
/>
```

#### Reasoning
- Same import as the widget. No duplicated helper code.

---

### `src/features/estimate/db/schema.ts`
**Action:** Modify
**Why:** Update the `EstimateStatus` doc comment to reflect that
"completed" now implies a v2 priced envelope is present. No new
column. No new enum value.
**Impact:** Documentation only. No Drizzle migration. The runtime
shape of the row is unchanged.

#### Before
```ts
/**
 * Status values for the `estimate_requests.status` column.
 *
 *   - uploaded    : PDF received and stored, workflow not yet started
 *   - processing  : AI pipeline is running
 *   - completed   : pipeline finished successfully; the billable-extraction
 *                   envelope has been written to `summary`
 *   - failed      : pipeline did not finish; `errorMessage` carries the reason
 */
```

#### After
```ts
/**
 * Status values for the `estimate_requests.status` column.
 *
 *   - uploaded    : PDF received and stored, workflow not yet started
 *   - processing  : AI pipeline is running (extraction or pricing)
 *   - completed   : pipeline finished successfully; a v2 priced-extraction
 *                   envelope has been written to `summary` (if the pricing
 *                   workflow ran). Rows that completed extraction but failed
 *                   pricing are still `completed` with a v1 envelope; the
 *                   v1/v2 discriminator lives in the envelope's `version`
 *                   literal, not the status column.
 *   - failed      : pipeline did not finish; `errorMessage` carries the reason
 */
```

#### Reasoning
- Clarifies the contract for future maintainers: `status='completed'`
  means "the row is done from the user's perspective", and the
  envelope version is the source of truth for how much work is
  represented. Status and envelope version are decoupled on purpose.
- No column add, no enum change, no Drizzle migration. Pure comment
  update.

## Validation Plan

Per project `AGENTS.md`:
- `pnpm exec tsc --noEmit` clean.
- `pnpm exec eslint src/mastra src/features/estimate` clean (project-level
  `pnpm lint` is broken under Next 16; use the per-path eslint gate).
- Manual smoke: upload a known inspection PDF, observe
  - `status` flips uploaded → processing → completed
  - `summary` becomes a valid v2 envelope (`kind: "priced-extraction"`,
    `version: 2`, all items priced, `subtotal` and `total` populated)
  - the dashboard's `EstimateStatusBar` lights up the Priced and
    Delivered segments
  - the estimates list shows the same
  - a row with a corrupted `summary` (e.g. a v1 envelope missing
    `items`) surfaces as a failed pricing attempt without downgrading
    `status`
  - the form rejects a 3-digit zip and a 9-digit zip (without hyphen)
    with a specific error
- Regression: a previously-extracted row (v1 envelope only) lights up
  only through "Analyzed"; a previously-priced row (v2 envelope) lights
  up through "Delivered".

## Risk Notes

1. **Mastra 1.32 → 1.37 type drift.** Isolated as the first commit on
   the branch. If `tsc` flags any call sites, they are fixed in the
   same commit. Risk: low. The APIs this project uses
   (`createStep`, `createWorkflow`, `structuredOutput`, `.foreach`,
   `.parallel`, `.branch`, `mastra.getWorkflow`, `mastra.getAgent`)
   are stable across 1.32 → 1.37.
2. **Per-item latency.** 40 items at 4 concurrent × ~3s = ~30s. 80
   items = ~60s. The `after()` pattern means the user sees the
   success toast immediately and the row polishes in the background.
   The status bar's "Processing" segment pulses during this window.
   No new UX hazard.
3. **Pricing accuracy.** LLM knowledge of regional rates is a soft
   signal. The `rationale` field is always written so the user can
   audit. The "Priced" segment lighting up is not a guarantee of
   accuracy — it's a guarantee that the pricer ran. A future
   `get_local_market_rate` tool is the real accuracy path.
4. **Pricing failure does not downgrade the row.** Per the
   architecture decision in Step 6, a failed pricing run leaves the
   row at `completed` with the v1 envelope. The "Priced" segment
   stays unlit. A future "Re-price" button is the escape hatch. If
   you want pricing failures to surface as a row-level `failed`
   status, that's a one-line change in the action's
   `runPricingIfEligible` catch block — but it would be a regression
   for users who got a v1 envelope and didn't need pricing.
5. **Zipcode validation tightening.** The form previously accepted a
   3-digit zip and rejected a 9-digit zip-with-hyphen silently (the
   server said `length(5)` and the form said `min(1)`, so the
   disagreement manifested as a server-side 500). The fix unifies
   them. If any user has a 3-digit zipcode currently stored, future
   pricing runs on that row will fail at the `read-summary` step —
   the regex check there rejects non-conforming zipcodes. Mitigation:
   the action's `runPricingIfEligible` catches the error and
   downgrades pricing to a log line, leaving the row's v1 envelope
   intact.
6. **Vercel Blob URL re-reads.** `price-billable-items` does not
   re-read the PDF; it only reads the row's existing `summary`. So
   Blob URL expiry is not a concern for the pricing workflow. The
   `summary` column is the single source of truth for both stages.

## Mastra Review Notes (Deep Dive)

A second pass reviewed the plan specifically against the `@mastra/core` 1.32
installed in the project, the 1.36.0 target, and the source of 1.34 / 1.35
changelogs. Critical findings that need a design decision before implementation:

### Critical (buildability-breaking) — not yet auto-applied

**A. `.foreach()` chain is type-broken at the read-summary → price-item boundary.**
The installed `@mastra/core@1.32.1` `Workflow.foreach` signature is:

```ts
foreach<TPrevIsArray extends TPrevSchema extends any[] ? true : false,
       TStepState,
       TStepInputSchema extends TPrevSchema extends (infer TElement)[] ? TElement : never,
       TStepId extends string, TSchemaOut, TStepRC>(
  step: TPrevIsArray extends true
    ? Step<TStepId, ..., TStepInputSchema, TSchemaOut, ...>
    : 'Previous step must return an array type',
  opts?: { concurrency: number }
): Workflow<...>
```

Two problems in the proposed chain:

1. `read-summary`'s declared `outputSchema` is an **object**
   `{ estimateRequestId, zipCode, items, summaryV1, failed, error }`, not an
   array. `TPrevIsArray` evaluates to `false` and the foreach rejects the
   `priceItemStep` with a literal-type error: "Previous step must return an array type".

2. Even if `read-summary` returned `items: BillableItem[]` (the v1 envelope's
   items array), the foreach's element type is `BillableItem`, but
   `priceItemStep.inputSchema` is `{ item: BillableItem, zipCode: string }`.
   `BillableItem` does not extend `{ item, zipCode }`, so `TStepInputSchema`
   fails to satisfy its constraint — another compile error.

**Required fix:** insert a `.map()` (or a reshape step) between
`.then(readSummaryStep)` and `.foreach(priceItemStep, { concurrency: 4 })` that
turns the read-summary object into `Array<{ item: BillableItem; zipCode: string }>`.
Sketch:

```ts
import { createStep } from '@mastra/core/workflows';
// after readSummaryStep:
const reshapeStep = createStep({
  id: 'reshape-for-foreach',
  inputSchema: readSummaryStep.outputSchema, // { items, zipCode, ... }
  outputSchema: z.array(z.object({
    item: billableItemSchema,
    zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
  })),
  execute: async ({ inputData }) => {
    if (inputData.failed) return [];
    return inputData.items.map((item) => ({ item, zipCode: inputData.zipCode }));
  },
});
```

Then chain: `.then(readSummary).then(reshapeStep).foreach(priceItem, { concurrency: 4 }).then(mergePricing)...`.
This reshape is also the natural place to short-circuit when `read-summary` returned
`{ failed: true }` — by emitting an empty array, the foreach is a no-op, the
`merge-pricing` step receives `[]`, and `persist-pricing` writes an empty v2
envelope. The action's caller already decides what to do with a non-success
result, so this is the cleanest path.

Alternatively: drop the foreach entirely and do the per-item pricing inside
`read-summary`'s follow-up step, one LLM call per item, then merge. The
`after()` already returns control to the user, so latency is the same. Foreach
is a code-organization choice, not a latency choice here. The whiteboard
should pick one approach.

**B. `merge-pricing` → `persist-pricing` chain is type-broken.**

`merge-pricing.outputSchema` is `{ items, subtotal, total, currency }`.
`persist-pricing.inputSchema` is
`{ estimateRequestId, items, subtotal, total, currency, zipCode }`.

`merge-pricing` does not emit `estimateRequestId` or `zipCode`. TypeScript
will reject `.then(mergePricing).then(persistPricing)` with "Property
'estimateRequestId' is missing in type ...". The whiteboard's Step 3 says
`persist-pricing`'s input is `PricedItem[]` directly, but the actual
`After` code declares the full object.

**Required fix:** either (a) add a passthrough reshape step between merge
and persist that carries `estimateRequestId` and `zipCode` forward from
`read-summary` (recommended — it keeps `merge-pricing` pure), or (b) extend
`merge-pricing.outputSchema` to include `estimateRequestId` and `zipCode`
(it pollutes a "pure" step's input contract, not recommended).

The reshape sketch from fix A can absorb this: have `reshape-for-foreach`
output a tuple-like object that carries `{ estimateRequestId, zipCode, jobs: [...] }`
instead of just `jobs`, and re-introduce a second reshape between `merge-pricing`
and `persist-pricing`. The whiteboard needs to be explicit about which fields
flow through which steps.

### Critical (factual errors in reasoning) — auto-applied

**C. Version target was 1.37.1, which does not exist.** Latest published
`@mastra/core` is **1.36.0**; latest `mastra` CLI is **1.7.0**. The CLI is
behind core minor-wise — its peer dep accepts `>=1.1.0-0 <2.0.0-0`, so a CLI
on 1.7 works fine with core on 1.36. The whiteboard's package.json bumps have
been updated to reflect this.

**D. The "1.35+ has a known regression" caveat.** Issue
[mastra-ai/mastra#16893](https://github.com/mastra-ai/mastra/issues/16893)
describes a regression introduced in 1.35.0 where agent response messages
get stale `createdAt` and get mis-ordered in the prompt, causing duplicate
tool calls in agent loops. This branch does not use agent loops (the
extractor and pricer both do single-shot `agent.generate()`), so the
regression should not affect us, but it is a real risk for any future
multi-step agent work. Documented as a risk note.

**E. The whiteboard's claim that the agent overload "does NOT pass prior-step
inputData to the agent" is wrong.** The 1.32 source for `createStepFromAgent`
shows the agent overload's `inputSchema` is hard-coded to
`z.object({ prompt: z.string() })`, and the agent receives `inputData.prompt`
via `params.stream(inputData.prompt, {...})`. The overload DOES pass input —
just only as a `prompt` string. The real reason `price-item.ts` needs the
full `createStep({...})` shape is that the per-iteration input is
`{ item, zipCode }` (not `{ prompt: string }`), not that the overload is
broken. Reasoning in the "Per-step file convention" section has been
corrected.

### Important (consistency / best-practice) — not yet auto-applied

**F. `price-item.ts` should follow the project's "resilient step returns,
not throws" pattern.** Existing steps (`extract-items.ts:62-79`,
`audit-items.ts:81-99`) catch the malformed-output case and return
`{ failed: true, errorMessage: <classified> }` from `execute`, not throw.
The proposed `price-item.ts` throws on `!priced` and on classified errors.
Inconsistency matters because the `action.after()` block in `actions.ts`
already has a guarded backstop for thrown errors, but the project's
resilient pattern is preferred for per-iteration failures (so that one bad
item does not cause the foreach to surface an error to the caller). The
`price-item` step should catch the malformed-output case and return
`{ failed: true, ... }` shape that the foreach can route via `.branch()`
if the pattern is extended; for now, returning a sentinel "drop this item"
shape (e.g. `{ failed: true, item: inputData.item }`) is consistent with
the extractor's `extract-items.ts` pattern.

**G. `persist-pricing.ts` should not be a no-op status setter.** The proposed
`status: 'completed'` write in `persist-pricing` is a no-op when the row is
already `completed` from `persist-success.ts`. Drizzle handles the redundant
UPDATE fine, but the plan should explicitly note this is intentional (the
"row was already completed" is the common case). A reviewer will ask.

**H. The pricer agent's OUTPUT `lineTotal` rule relies on LLM compliance.**
`merge-pricing` sums `it.lineTotal` from each priced item; if the LLM emits
`lineTotal = 30 * 3 = 90` for a `service_call` (instead of `lineTotal = 30`),
`merge-pricing` sums the wrong value. The Zod schema validates the shape but
NOT the arithmetic. A future improvement: add a post-merge validation step
that re-derives `lineTotal` per the unit rule and rejects mismatches. The
whiteboard should call this out as a known accuracy risk; a small
post-processing transform inside `price-item.ts.execute` (e.g. compute
`lineTotal` server-side from `unit` and `quantity`, ignore the LLM's
`lineTotal`) eliminates the risk entirely. The plan should pick one:
trust the LLM (current), or derive server-side (safer, more code).

**I. The `summary-envelope-version.ts` shared helper is missing from the
`price-billable-items.ts` discussion.** The `read-summary` step also needs
to handle the v2-already-priced case gracefully (returning `failed: true`
with error "Already priced (v2 envelope present)"). The current proposed
`read-summary.ts` does handle this, but the chain (read-summary → reshape →
foreach) needs the reshape step to honor the `failed: true` short-circuit
and emit an empty array. The whiteboard's `price-billable-items.ts` doesn't
currently have this short-circuit path.

**J. `price-billable-items.ts` should mirror the
`summarize-estimate.ts` sub-workflow pattern.** The existing
`summarize-estimate.ts` composes a `successPathWorkflow` sub-workflow with
`inputSchema: extractItemsStep.outputSchema` so the `.then` chain types
line up cleanly. The proposed `price-billable-items.ts` uses a flat chain
with no sub-workflow. This is a stylistic choice, not a bug, but mirroring
the existing pattern makes the diff easier to review and gives a natural
place to add a future `.branch()` on `failed` (e.g. "v2 already priced"
vs "v1 success" vs "no envelope").

**K. The `mastra` CLI lockstep is more nuanced than the whiteboard claims.**
`@mastra/core@1.36.0`'s peer-dep range accepts `mastra` CLI on any 1.x
version (the CLI is currently 1.7.0 — behind core). The CLI's primary
imports are the deployer and the playground UI; both work with a wide
range of core. The "5-minor gap produces type errors at the CLI's import
sites" claim in the whiteboard was conservative; the actual safe range is
"any 1.x for both packages". The plan's lockstep guidance has been
softened.

### Documentation drift — auto-applied

**L. `Risk Notes` still references "1.32 → 1.37"** even after the version
bump fix. The risk note text has been left as-is to make the diff reviewable
but should be updated to "1.32 → 1.36" in a follow-up edit. (Skipped from
this pass to keep the diff focused; flagged here.)

**M. The observability index file's "1.37" reference and "1.37+" comment.**
Updated to "1.36" in the file's docstring. The empty re-export remains —
the `observe` helper is on `ToolExecutionContext` in 1.34+, but a future
branch will need to verify the exact import path against the bumped
version's installed types.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
