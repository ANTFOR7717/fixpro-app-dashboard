# FEATURE(estimate-output-report-invoice)

## Request
Replace the current `/dashboard/estimate/[id]` page — which renders the row's `summary` JSON envelope as raw text inside a `<pre>` block — with a high-quality, FixPro-branded **report/invoice** view that shows the inspector's billable items, their `quantity × unitPrice = lineTotal`, and a grand total. Pricing is produced by a new minimal Mastra agent (`item-pricer`) that looks up a unit price by zip code without guessing or hallucinating; when it has no defensible number it returns `null` and the report displays "Price unavailable — needs contractor quote". The report header carries the FixPro logo and the row's property + buyer-side + listing-side information. Rendering is a markdown-style React component tree (no PDF, no markdown parser).

## Directory Map
```text
src/
  app/
    dashboard/
      estimate/
        [id]/
          page.tsx                                        (modify)
  features/
    estimate/
      components/
        estimate-report.tsx                               (new)
      lib/
        envelope.ts                                       (new)
        format.ts                                         (new)
  mastra/
    index.ts                                              (modify)
    agents/
      billable-item-extractor.schema.ts                   (modify)
      item-pricer.ts                                      (new)
      item-pricer.schema.ts                               (new)
    workflows/
      summarize-estimate.ts                               (modify)
      steps/
        mark-processing.ts                                (modify)
        extract-items.ts                                  (modify)
        audit-items.ts                                    (modify)
        merge-items.ts                                    (modify)
        persist-success.ts                                (modify)
        price-items.ts                                    (new)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/app/dashboard/estimate/[id]/page.tsx` | modify | Replace the `<pre>{row.summary}</pre>` block with `<EstimateReport row={row} envelope={parsed} />` and fetch row metadata required by the report (already on the row). |
| `src/features/estimate/components/estimate-report.tsx` | new | The branded report React component: logo header, property block, parties block, line items, totals, footer. Pure presentation. |
| `src/features/estimate/lib/envelope.ts` | new | Server-side helper that parses `row.summary` text into a discriminated v1/v2 envelope or returns a typed `Unparseable` result. Keeps page.tsx free of JSON/Zod plumbing. |
| `src/features/estimate/lib/format.ts` | new | Tiny formatters used only by the report: `formatCurrency(n)`, `formatLineTotal(qty, unit)`, `formatPartyRole(role)`. No new deps. |
| `src/mastra/agents/billable-item-extractor.schema.ts` | modify | Add v2 envelope schema (`SUMMARY_ENVELOPE_VERSION_2`, `pricedLineItemSchema`, `summaryEnvelopeV2Schema`, types). Existing v1 exports untouched so old rows + readers stay valid. |
| `src/mastra/agents/item-pricer.ts` | new | New `item-pricer` Mastra agent on the existing Kilo gateway + `openai/gpt-5.4-mini` model. Hard prompt: never hallucinate a price; return `unitPrice: null` when the model can't defend a number. |
| `src/mastra/agents/item-pricer.schema.ts` | new | Zod schemas the pricer agent emits with `structuredOutput`: per-item price response + the step's batched output schema. |
| `src/mastra/workflows/steps/mark-processing.ts` | modify | Read the row's `zipCode` inside `execute` and forward it on the step's output so downstream steps can carry it to the pricer without re-querying. |
| `src/mastra/workflows/steps/extract-items.ts` | modify | Thread `zipCode` through input/output schemas (pure plumbing — the step doesn't use the value). |
| `src/mastra/workflows/steps/audit-items.ts` | modify | Same plumbing as `extract-items`. |
| `src/mastra/workflows/steps/merge-items.ts` | modify | Same plumbing — extend input/output schemas to carry `zipCode` into `price-items`. |
| `src/mastra/workflows/steps/price-items.ts` | new | New workflow step. For each merged item, call the pricer agent with `{ item, zipCode }` and collect a `prices: PricedLineItem[]`. Resilient: per-item catch returns `unitPrice: null, source: 'lookup-failed'`. |
| `src/mastra/workflows/steps/persist-success.ts` | modify | Accept `prices` in input; write a v2 envelope (`kind: 'billable-extraction', version: 2, items, prices`) to `summary` instead of v1. |
| `src/mastra/workflows/summarize-estimate.ts` | modify | Insert `priceItemsStep` between `mergeItemsStep` and `persistSuccessStep` in `successPathWorkflow`. |
| `src/mastra/index.ts` | modify | Register the new `item-pricer` agent on the `Mastra` instance. |

## Existing Pattern Audit
- **Mastra agents** live in `src/mastra/agents/*.ts` paired with a `*.schema.ts` Zod schema file. Agents are constructed with `new Agent({ id, name, instructions, model })` and use a shared Kilo gateway via `createOpenAI({ apiKey: process.env.KILO_API_KEY!, baseURL: 'https://api.kilo.ai/api/gateway' })` (`billable-item-extractor.ts:4-7`). The pricer agent mirrors this exactly.
- **Mastra workflow steps** live in `src/mastra/workflows/steps/*.ts`. Each step is `createStep({ id, inputSchema, outputSchema, retries?, execute })` with explicit Zod input/output schemas. Resilient steps wrap `agent.generate(...)` in `try/catch`, returning a typed `{ failed, errorMessage }` shape from the catch and from `result.object == null` so `.branch()` can route failures. `retries` handles transient throws (`extract-items.ts:32`, `audit-items.ts:36`). The new pricer step follows the same shape.
- **Workflow composition** is in `src/mastra/workflows/summarize-estimate.ts`. The top-level workflow is `mark-processing → extract-items → .branch([failed → persistFailure, success → successPathWorkflow])`. The success sub-workflow is `audit-items → merge-items → persist-success`. New steps fold in via `.then(...)` lines; the new `price-items` step inserts between `merge-items` and `persist-success`.
- **DB writes** use Drizzle + the shared `db` from `@/db`. Steps that mutate the row pattern-match on `import { eq } from 'drizzle-orm'` and `import { estimateRequestTable } from '@/features/estimate/db/schema'` (`mark-processing.ts:3-5`, `persist-success.ts:3-5`). The new `mark-processing` modification reads from the same table; nothing else needs to query.
- **Envelope versioning**. `billable-item-extractor.schema.ts` already defines a versioned envelope: `SUMMARY_ENVELOPE_KIND = 'billable-extraction'`, `SUMMARY_ENVELOPE_VERSION = 1`, and a `summaryEnvelopeSchema` literal-typed on those constants. The plan adds v2 (`SUMMARY_ENVELOPE_VERSION_2 = 2`, `summaryEnvelopeV2Schema`) next to them — additive, not replacing — so any old row already on disk stays a valid v1 envelope and the new reader discriminates on `envelope.version`.
- **Page/route layout**. The estimate detail page at `src/app/dashboard/estimate/[id]/page.tsx` is an `async` server component using `await params`, `authServerProvider.getSession({ headers: await headers() })`, and a Drizzle `db.select().from(estimateRequestTable).where(eq(...))` query. UI primitives come from `@/design-systems/shadcn/components/{button,card,badge}`. The page returns JSX directly (no separate "view" wrapper) — the new report component is imported and rendered the same way.
- **Feature components** live under `src/features/<feature>/components/*.tsx`. Existing siblings include `estimate-view.tsx`, `estimate-status-bar.tsx`, `recent-estimates-widget.tsx`, etc. — kebab-case filenames, default + named exports allowed (named is dominant). The new `estimate-report.tsx` follows that convention.
- **Feature helpers** are not yet split into a `lib/` subfolder under `src/features/estimate/`, but the codebase has the equivalent under `src/mastra/workflows/lib/classify-error.ts`. Adding `src/features/estimate/lib/{envelope,format}.ts` for server-side parsing + tiny formatters fits the pattern. Pure functions, no client-only code.
- **Brand asset**. `public/fixpro-logo.webp` is the logo to use in the header. `next/image` is the project's image primitive (Next 16) — the report component uses `import Image from 'next/image'`.
- **Styling**. Tailwind 4 + shadcn. No `@tailwindcss/typography`/`prose` styles wired up. The report's "markdown look" is achieved with structured layout (Tailwind `text-2xl`/`text-lg`/`font-semibold`, `Card`, `Separator`, `Badge`) rather than a prose plugin. No new dependency.
- **Validation gates** (project `AGENTS.md`): `pnpm exec tsc --noEmit` and `pnpm exec eslint <changed paths>`. Project-level `pnpm lint` is broken under Next 16; the plan does not use it.

## Execution Plan
### Step 1 — v2 envelope schema lands first
**Intent:** Add the v2 envelope shape next to v1 so downstream code can import the new types before any logic depends on them.
**Files:** `src/mastra/agents/billable-item-extractor.schema.ts`.
**Reasoning:** Schema-only change. Untouched v1 exports keep `persist-success` and the existing reader compiling. A separate commit makes the contract change reviewable in isolation.
**Code:** in `## File-by-File Changes` under the same path.

### Step 2 — Pricer agent + its schema
**Intent:** Add the new `item-pricer` agent and its Zod input/output schemas. No workflow wiring yet; just the agent module so the next step can import it.
**Files:** `src/mastra/agents/item-pricer.schema.ts` (new), `src/mastra/agents/item-pricer.ts` (new), `src/mastra/index.ts` (register the agent on the `Mastra` instance).
**Reasoning:** Agent and schema live together (existing pattern). Registering on `Mastra` makes `mastra.getAgent('item-pricer')` callable from the workflow step.

### Step 3 — New workflow step `price-items.ts`
**Intent:** Add the step that calls the pricer once per merged item, with `retries: 1` and a resilient per-item catch.
**Files:** `src/mastra/workflows/steps/price-items.ts` (new).
**Reasoning:** Self-contained step; doesn't change any wiring yet.

### Step 4 — Thread `zipCode` through the workflow
**Intent:** The pricer needs the row's `zipCode`. `mark-processing` reads it from the DB row; `extract-items`/`audit-items`/`merge-items` plumb it through their input/output schemas; `persist-success` accepts the new `prices` field. All schema/plumbing changes happen together so the workflow types stay consistent at every step boundary.
**Files:** `src/mastra/workflows/steps/mark-processing.ts`, `extract-items.ts`, `audit-items.ts`, `merge-items.ts`, `persist-success.ts`.
**Reasoning:** Doing them in one commit keeps the workflow type-graph valid; doing them separately would temporarily break `pnpm exec tsc --noEmit`.

### Step 5 — Wire `price-items` into the workflow
**Intent:** Insert `priceItemsStep` between `mergeItemsStep` and `persistSuccessStep` in the success sub-workflow.
**Files:** `src/mastra/workflows/summarize-estimate.ts`.
**Reasoning:** Tiny wiring change once all the schemas line up. End of the workflow work.

### Step 6 — View helpers (`envelope.ts`, `format.ts`)
**Intent:** Add the server-safe envelope parser and the small formatters the report component will use. No UI yet.
**Files:** `src/features/estimate/lib/envelope.ts` (new), `src/features/estimate/lib/format.ts` (new).
**Reasoning:** Pure functions. Unit-testable by eye; keeps the page + report component free of JSON parsing logic.

### Step 7 — `EstimateReport` component
**Intent:** The branded report React component. Takes `(row, envelope)` and renders the full report: logo header, property block, parties block, line items, totals, footer.
**Files:** `src/features/estimate/components/estimate-report.tsx` (new).
**Reasoning:** Pure presentation; reads only its props. Server-component-friendly (no client hooks needed).

### Step 8 — Swap the estimate detail page
**Intent:** Replace the `<pre>{row.summary}</pre>` block in `src/app/dashboard/estimate/[id]/page.tsx` with the new report component, and remove the now-redundant page header (`fileName`, `Analyzed` badge) since the report header now owns identity + branding.
**Files:** `src/app/dashboard/estimate/[id]/page.tsx`.
**Reasoning:** This is the user-visible flip. Putting it last means every previous step is already type-clean.

### Step 9 — Validate + PR
**Intent:** `pnpm exec tsc --noEmit` clean, `pnpm exec eslint` clean on all changed paths, push the branch, open the PR with the validation summary linking this plan.

## File-by-File Changes

### `src/mastra/agents/billable-item-extractor.schema.ts`
**Action:** Modify
**Why:** Add v2 envelope shape (`pricedLineItemSchema`, `summaryEnvelopeV2Schema`, `SUMMARY_ENVELOPE_VERSION_2`) next to the existing v1 exports so old rows on disk stay valid v1 envelopes and the new reader can discriminate on `envelope.version`.
**Impact:** Adds three new exports; touches no existing v1 exports. `persist-success` will switch to writing the v2 envelope in a later step; the reader will accept both.

#### Before
```ts
export type BillableExtraction = z.infer<typeof billableExtractionSchema>;

/**
 * Versioned envelope written to `estimate_requests.summary`. The downstream
 * pricer reads this column, detects the version, and prices each item.
 */
export const SUMMARY_ENVELOPE_KIND = 'billable-extraction' as const;
export const SUMMARY_ENVELOPE_VERSION = 1 as const;

export const summaryEnvelopeSchema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION),
  items: z.array(billableItemSchema),
});

export type SummaryEnvelope = z.infer<typeof summaryEnvelopeSchema>;
```

#### After
```ts
export type BillableExtraction = z.infer<typeof billableExtractionSchema>;

/**
 * Versioned envelope written to `estimate_requests.summary`. The downstream
 * reader detects the version and renders accordingly.
 *
 * - v1: items only. Produced by the workflow before the pricing step landed.
 *   Rows on disk created before this branch stay v1 forever.
 * - v2: items + prices. Produced once the `price-items` step is in the
 *   workflow. The report renders quantity × unitPrice = lineTotal and a
 *   subtotal.
 */
export const SUMMARY_ENVELOPE_KIND = 'billable-extraction' as const;
export const SUMMARY_ENVELOPE_VERSION = 1 as const;
export const SUMMARY_ENVELOPE_VERSION_2 = 2 as const;

export const summaryEnvelopeSchema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION),
  items: z.array(billableItemSchema),
});

export type SummaryEnvelope = z.infer<typeof summaryEnvelopeSchema>;

/**
 * Per-item priced line item, emitted by the pricer agent. `unitPrice: null`
 * is the honest signal that the agent could not defend a number from its
 * sources; the report renders "Price unavailable" in that case.
 */
export const pricedLineItemSchema = z.object({
  /** Matches the `BillableItem.id` this price corresponds to ("item-001"). */
  itemId: z.string().min(1),
  /** Whole USD dollars. `null` means no defensible price. */
  unitPrice: z.number().int().min(0).nullable(),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  /** Short human label of where the number came from. NEVER a URL. */
  source: z.string().min(1).max(120),
  /** Populated when `unitPrice` is null. One-sentence reason. */
  unavailableReason: z.string().min(1).max(280).nullable(),
});

export type PricedLineItem = z.infer<typeof pricedLineItemSchema>;

export const summaryEnvelopeV2Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_2),
  items: z.array(billableItemSchema),
  prices: z.array(pricedLineItemSchema),
});

export type SummaryEnvelopeV2 = z.infer<typeof summaryEnvelopeV2Schema>;
```

#### Reasoning
- Additive only. The v1 schema, constants, and type are untouched so existing code paths (the `persist-success` import, any old rows the reader fetches) keep compiling and parsing.
- `pricedLineItemSchema` is keyed by `itemId` (matching `BillableItem.id`) so the report component can join items and prices without trusting array order.
- `unitPrice: z.number().int().min(0).nullable()` enforces whole dollars and forbids negatives; the model can't sneak in a range or a cents-as-dollars trick.
- `source` is bounded to 120 chars to keep "national average", "trade rule-of-thumb", "unknown" honest — it is a coarse label, not a URL or citation.
- `unavailableReason` is required iff `unitPrice` is null; the contract is enforced at the report-render layer (the agent prompt forbids one without the other; if it ships an invalid pairing, Zod still accepts it and the report falls back to a generic "Price unavailable" string).

### `src/mastra/agents/item-pricer.schema.ts`
**Action:** Create
**Why:** The pricer step calls the agent once per item. Both the per-call structured-output schema and the step's batched output schema live next to the agent (existing pattern: `billable-item-extractor.schema.ts` lives next to `billable-item-extractor.ts`).
**Impact:** New file. Re-exports `pricedLineItemSchema` and `PricedLineItem` from the extractor schema so callers don't reach across modules, and adds the per-call input + the agent's per-item response shape.

#### Before
File does not exist yet.

#### After
```ts
import { z } from 'zod';
import {
  pricedLineItemSchema,
  type PricedLineItem,
} from './billable-item-extractor.schema';

/**
 * One call to the pricer agent prices ONE billable item. The agent receives
 * a compact description (trade, action, scope, location, quantity,
 * sourceQuote) and the row's zip code, and returns the per-item shape below.
 *
 * The agent NEVER hallucinates a price. If it has no defensible number from
 * its training/lookup sources for the zip code it is given, it returns
 * `unitPrice: null` and a one-sentence `unavailableReason`. The report
 * renders "Price unavailable — needs contractor quote" in that case.
 */
export const itemPricerResponseSchema = z.object({
  unitPrice: z.number().int().min(0).nullable(),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1).max(120),
  unavailableReason: z.string().min(1).max(280).nullable(),
});

export type ItemPricerResponse = z.infer<typeof itemPricerResponseSchema>;

// Re-export the batched-output shape used by `price-items.ts`. Keeping the
// re-export here so the step file imports both the per-call schema and the
// batched type from a single place.
export { pricedLineItemSchema };
export type { PricedLineItem };
```

#### Reasoning
- Mirrors the `billable-item-extractor.schema.ts` co-location pattern: schemas live next to the agent they belong to.
- The per-call `itemPricerResponseSchema` is structurally identical to `pricedLineItemSchema` minus the `itemId` field, because `itemId` is owned by the step (the agent doesn't need to echo it back; the step knows which item it called for).
- Re-exporting the shared `pricedLineItemSchema` + type from this file gives the step a single import surface and keeps the cross-file dependency explicit.

### `src/mastra/agents/item-pricer.ts`
**Action:** Create
**Why:** The new Mastra agent that takes one item + zip code and returns a structured `ItemPricerResponse`. Same Kilo gateway and `openai/gpt-5.4-mini` model as the existing extractor for consistency.
**Impact:** New file. Exports `itemPricerAgent`, registered on the `Mastra` instance in `src/mastra/index.ts`. No tools, no memory, no new dependencies.

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
 * The pricer has exactly one job: given ONE billable item and a zip code,
 * return a single defensible unit price (whole USD dollars) or null.
 *
 * It is NOT a calculator (it does not multiply by quantity — the report
 * does that). It is NOT a market-data scraper. It is NOT a contractor
 * quoting service. It is a thin honesty filter on top of the model's own
 * knowledge: if the model has no defensible number for this work in this
 * zip code, it returns `unitPrice: null` and a one-sentence reason.
 */
export const itemPricerAgent = new Agent({
  id: 'item-pricer',
  name: 'Item Pricer',
  instructions: `
You look up a unit price for ONE home-repair billable item, scoped to the
US zip code provided. You produce a single defensible number (whole USD
dollars) or null. You NEVER invent a price.

INPUT
The user message names the trade, action, scope, location, quantity, the
inspector's verbatim sourceQuote, and a zip code. Treat the sourceQuote as
authoritative — it is the inspector's own words.

OUTPUT
Return JSON matching the provided structured-output schema exactly:
- unitPrice: integer whole USD dollars, or null.
- currency: "USD".
- confidence: "high" | "medium" | "low".
- source: a short human label of where the number came from.
- unavailableReason: a one-sentence reason when unitPrice is null;
  otherwise null.

HARD RULES
1. NEVER hallucinate a price. If you do not have a defensible number for
   this work in this zip code (or a near-equivalent labor/materials market
   you can name), return unitPrice = null with a one-sentence
   unavailableReason.
2. NEVER invent a citation. "source" is a coarse label, not a URL. Use
   labels like "national average", "trade rule-of-thumb", "regional labor
   estimate", "unknown". Never paste fake links.
3. NEVER produce a range. Pick a single integer or null. If your honest
   answer is a range, return null with unavailableReason explaining the
   range and recommending a contractor quote.
4. Local area means the SUPPLIED zip code. If you only have a national
   average, you may use it but mark confidence = "low" and say so in
   source (e.g. "national average (no local data)").
5. The unitPrice is PER UNIT OF QUANTITY. The report multiplies by
   quantity itself. Example: item is "replace 3 shingles", quantity is 3;
   you return the price PER SHINGLE, not for all three.
6. Better to admit ignorance than to overbill or underbill blindly. If
   the inspector's wording is genuinely ambiguous about the scope (which
   the extractor was supposed to filter, but might miss), return null with
   unavailableReason = "Scope ambiguous; needs contractor quote."
7. confidence reflects how well-grounded your number is in real local
   market data for the supplied zip code. "high" only when you have a
   defensible local-market number; "medium" when you have a defensible
   regional/state-level number; "low" when you only have a national
   average or rule-of-thumb.

Do not include any commentary, explanation, preamble, or text outside the
JSON.
`,
  model: gateway('openai/gpt-5.4-mini'),
});
```

#### Reasoning
- Mirrors `billable-item-extractor.ts` exactly: same gateway construction, same Agent shape, same model. No new gateway, no new env var.
- The prompt's hard rules close the obvious hallucination paths: no invented citation, no range, no per-batch price, no swallowing of ambiguity. The agent is explicitly allowed to say "I don't know".
- `unitPrice` is per-unit; the multiplication by `quantity` happens in the report's formatter so the responsibility split is unambiguous.
- No tools, no memory — v1 is intentionally minimal; a future branch can add a real lookup tool without changing this contract.

### `src/mastra/index.ts`
**Action:** Modify
**Why:** Register the new `item-pricer` agent so `mastra.getAgent('item-pricer')` works from the workflow step.
**Impact:** One new import, one new entry in the `agents` map. Workflows map untouched.

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

#### Reasoning
- Mirrors the existing extractor registration. `mastra.getAgent('item-pricer')` is how the step in `price-items.ts` reaches the agent, matching the existing pattern in `extract-items.ts:35` and `audit-items.ts:39`.

### `src/mastra/workflows/steps/price-items.ts`
**Action:** Create
**Why:** The new workflow step. For each merged `BillableItem`, it calls the pricer agent with the item's compact description + the row's `zipCode`, and assembles a `prices: PricedLineItem[]` array. Resilient on three layers: `retries: 1` for transient throws, a per-item `try/catch` so one bad item never poisons the batch, and a step-level `try/catch` that returns `prices: []` if everything melts down (the report renders "Price unavailable" for every row, but the estimate still ships).
**Impact:** New file. Output schema carries the items unchanged + the parallel prices array, which `persist-success` will then write into the v2 envelope.

#### Before
File does not exist yet.

#### After
```ts
import { createStep } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import {
  billableItemSchema,
  pricedLineItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import { itemPricerResponseSchema } from '@/mastra/agents/item-pricer.schema';

/**
 * For every merged billable item, call the pricer agent with the item's
 * compact description and the row's zip code. Collect the results into a
 * parallel `prices: PricedLineItem[]` array keyed by `itemId`.
 *
 * Resilience:
 *   - `retries: 1` for transient throws (network, gateway 5xx) at the
 *     step level. The pricer is best-effort — we do not want to retry
 *     forever and block the run.
 *   - Per-item `try/catch`: a malformed model response or per-item throw
 *     records `unitPrice: null, source: 'lookup-failed'` so one bad
 *     item never poisons the batch.
 *   - Outer `try/catch`: if the loop itself dies, return `prices: []`
 *     so the report can still render "Price unavailable" for every row.
 */
export const priceItemsStep = createStep({
  id: 'price-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    items: z.array(billableItemSchema),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    items: z.array(billableItemSchema),
    prices: z.array(pricedLineItemSchema),
  }),
  retries: 1,
  execute: async ({ inputData, mastra }) => {
    const log = mastra.getLogger();
    try {
      const agent = mastra.getAgent('item-pricer');
      const prices = [] as z.infer<typeof pricedLineItemSchema>[];
      let pricedCount = 0;
      let unavailableCount = 0;
      let lookupFailedCount = 0;

      for (const item of inputData.items) {
        const userText =
          'Price ONE billable item. Return JSON matching the schema.\n\n' +
          `zipCode: ${inputData.zipCode}\n` +
          `trade: ${item.trade}\n` +
          `action: ${item.action}\n` +
          `scope: ${item.scope}\n` +
          `location: ${item.location}\n` +
          `quantity: ${item.quantity}\n` +
          `sourceQuote: ${JSON.stringify(item.sourceQuote)}`;

        try {
          const result = await agent.generate(
            [{ role: 'user', content: [{ type: 'text', text: userText }] }],
            {
              structuredOutput: { schema: itemPricerResponseSchema },
              requestContext: new RequestContext([
                ['estimateRequestId', inputData.estimateRequestId],
                ['itemId', item.id],
              ]),
            },
          );
          const r = result.object;
          if (!r) {
            lookupFailedCount++;
            prices.push({
              itemId: item.id,
              unitPrice: null,
              currency: 'USD',
              confidence: 'low',
              source: 'lookup-failed',
              unavailableReason: 'AI returned malformed price; needs contractor quote.',
            });
            continue;
          }
          if (r.unitPrice === null) unavailableCount++;
          else pricedCount++;
          prices.push({
            itemId: item.id,
            unitPrice: r.unitPrice,
            currency: r.currency,
            confidence: r.confidence,
            source: r.source,
            unavailableReason: r.unavailableReason,
          });
        } catch (e) {
          lookupFailedCount++;
          log.warn('[price-items] per-item failure', {
            estimateRequestId: inputData.estimateRequestId,
            itemId: item.id,
            error: e instanceof Error ? e.message : String(e),
          });
          prices.push({
            itemId: item.id,
            unitPrice: null,
            currency: 'USD',
            confidence: 'low',
            source: 'lookup-failed',
            unavailableReason: 'Pricing lookup failed; needs contractor quote.',
          });
        }
      }

      log.info('[pricing-quality]', {
        estimateRequestId: inputData.estimateRequestId,
        zipCode: inputData.zipCode,
        total: inputData.items.length,
        pricedCount,
        unavailableCount,
        lookupFailedCount,
      });

      return {
        estimateRequestId: inputData.estimateRequestId,
        items: inputData.items,
        prices,
      };
    } catch (e) {
      log.error('[price-items] step failure (non-fatal)', {
        estimateRequestId: inputData.estimateRequestId,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        estimateRequestId: inputData.estimateRequestId,
        items: inputData.items,
        prices: [],
      };
    }
  },
});
```

#### Reasoning
- Mirrors the existing `extract-items.ts` / `audit-items.ts` shape: `createStep` with explicit Zod schemas, `retries`, `mastra.getAgent(...)`, `agent.generate(messages, { structuredOutput, requestContext })`, `result.object` for the typed payload.
- The `RequestContext` carries `estimateRequestId` and the per-item `itemId` so any future tracing/memory can pin a call to the exact row+item.
- Per-item failures degrade to `unitPrice: null, source: 'lookup-failed'` and the loop continues. The user gets a complete report with a few "Price unavailable" rows instead of a totally failed run.
- The step-level catch returns `prices: []` so `persist-success` can still write a v2 envelope (every item renders "Price unavailable"). The estimate ships even when pricing is fully down.
- Two log lines: per-item warnings and a single `[pricing-quality]` summary at the end. Pattern matches the existing `[extraction-quality]` log in `merge-items.ts`.

### `src/mastra/workflows/steps/mark-processing.ts`
**Action:** Modify
**Why:** Read the row's `zipCode` inside `execute` and forward it on the step's output so the rest of the workflow (and ultimately `price-items`) can use it without re-querying. `mark-processing` already runs before everything else and already writes to the row, so adding one read on the same connection is the cheapest place to source the field.
**Impact:** Output schema gains `zipCode: z.string()`. Existing status flip behavior unchanged. Downstream `extract-items.ts` input schema gains `zipCode` to match (next subsection).

#### Before
```ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';

/**
 * Flip the estimate row to `processing` and clear any prior error so the UI
 * shows the spinner instead of a stale failed-state.
 *
 * Pure DB write — no AI, no retries.
 */
export const markProcessingStep = createStep({
  id: 'mark-processing',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
  }),
  execute: async ({ inputData }) => {
    await db
      .update(estimateRequestTable)
      .set({ status: 'processing', errorMessage: null })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));

    return {
      estimateRequestId: inputData.estimateRequestId,
      fileUrl: inputData.fileUrl,
    };
  },
});
```

#### After
```ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';

/**
 * Flip the estimate row to `processing`, clear any prior error, AND read the
 * row's `zipCode` so the rest of the workflow can carry it without
 * re-querying. The pricer step needs `zipCode`; sourcing it here means the
 * row is read exactly once per workflow run.
 *
 * Still a pure DB step — no AI, no retries.
 */
export const markProcessingStep = createStep({
  id: 'mark-processing',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  execute: async ({ inputData }) => {
    const [row] = await db
      .select({ zipCode: estimateRequestTable.zipCode })
      .from(estimateRequestTable)
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));

    await db
      .update(estimateRequestTable)
      .set({ status: 'processing', errorMessage: null })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));

    return {
      estimateRequestId: inputData.estimateRequestId,
      fileUrl: inputData.fileUrl,
      zipCode: row?.zipCode ?? '',
    };
  },
});
```

#### Reasoning
- `zipCode` is `varchar(20).notNull()` on the table (`schema.ts:40`), so the column always has a value. The `?? ''` is a TypeScript guard against the destructure-of-undefined case (the row should always exist because the prior upload step inserted it; if it doesn't, the workflow will fail later anyway and an empty string is the safe pricer input — it will return `unitPrice: null` for every item).
- One `SELECT` + the existing `UPDATE` on the same connection. No extra round-trips later in the workflow.
- Output schema stays additive: every downstream step's existing fields are unchanged; `zipCode` is the only new key.

### `src/mastra/workflows/steps/extract-items.ts`
**Action:** Modify
**Why:** Thread `zipCode` through this step's input and output schemas so it survives until `price-items`. The step itself does not use the value.
**Impact:** Input/output schemas grow one field; the `execute` body adds `zipCode: inputData.zipCode` to its three return objects (happy path + Zod-malformed + caught error).

#### Before
```ts
export const extractItemsStep = createStep({
  id: 'extract-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    items: z.array(billableItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  retries: 2,
  execute: async ({ inputData, mastra }) => {
    try {
      const agent = mastra.getAgent('billable-item-extractor');

      const result = await agent.generate(
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Extract every billable line item from this inspection report. ' +
                  'Follow the rules in your instructions exactly. When in doubt, omit. ' +
                  'Return JSON matching the provided schema.',
              },
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: new URL(inputData.fileUrl),
              },
            ],
          },
        ],
        {
          structuredOutput: { schema: billableExtractionSchema },
          requestContext: new RequestContext([
            ['estimateRequestId', inputData.estimateRequestId],
          ]),
        },
      );

      const extraction = result.object;
      if (!extraction) {
        return {
          estimateRequestId: inputData.estimateRequestId,
          fileUrl: inputData.fileUrl,
          items: [],
          failed: true,
          errorMessage: 'AI returned malformed extraction. Please retry.',
        };
      }

      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        items: extraction.items,
        failed: false,
        errorMessage: null,
      };
    } catch (e) {
      console.error('Workflow step extract-items failed:', e);
      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
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
export const extractItemsStep = createStep({
  id: 'extract-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(billableItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  retries: 2,
  execute: async ({ inputData, mastra }) => {
    try {
      const agent = mastra.getAgent('billable-item-extractor');

      const result = await agent.generate(
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Extract every billable line item from this inspection report. ' +
                  'Follow the rules in your instructions exactly. When in doubt, omit. ' +
                  'Return JSON matching the provided schema.',
              },
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: new URL(inputData.fileUrl),
              },
            ],
          },
        ],
        {
          structuredOutput: { schema: billableExtractionSchema },
          requestContext: new RequestContext([
            ['estimateRequestId', inputData.estimateRequestId],
          ]),
        },
      );

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

#### Reasoning
- Purely additive: `zipCode` shows up in the schemas and is echoed on all three return paths. The agent call is unchanged.
- The `.branch()` in `summarize-estimate.ts` routes either to `persistFailureStep` (which ignores `zipCode`; see its subsection) or to `successPathWorkflow.inputSchema = extractItemsStep.outputSchema`, which now carries `zipCode` for the next steps.
- Existing imports unchanged; no new dependencies.

### `src/mastra/workflows/steps/audit-items.ts`
**Action:** Modify
**Why:** Same plumbing as `extract-items.ts`. The audit step also runs on the success path and must forward `zipCode` to `merge-items`.
**Impact:** Input/output schemas grow one field; the `execute` body adds `zipCode: inputData.zipCode` to its three return objects.

#### Before
```ts
export const auditItemsStep = createStep({
  id: 'audit-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    items: z.array(billableItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    items: z.array(billableItemSchema),
    auditItems: z.array(billableItemSchema),
    auditFailed: z.boolean(),
  }),
  retries: 1,
  execute: async ({ inputData, mastra }) => {
    try {
      // ... agent.generate ...
      const extraction = result.object;
      if (!extraction) {
        return {
          estimateRequestId: inputData.estimateRequestId,
          fileUrl: inputData.fileUrl,
          items: inputData.items,
          auditItems: [],
          auditFailed: true,
        };
      }

      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        items: inputData.items,
        auditItems: extraction.items,
        auditFailed: false,
      };
    } catch (e) {
      console.error('Workflow step audit-items failed (non-fatal):', e);
      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        items: inputData.items,
        auditItems: [],
        auditFailed: true,
      };
    }
  },
});
```

#### After
```ts
export const auditItemsStep = createStep({
  id: 'audit-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(billableItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(billableItemSchema),
    auditItems: z.array(billableItemSchema),
    auditFailed: z.boolean(),
  }),
  retries: 1,
  execute: async ({ inputData, mastra }) => {
    try {
      // ... agent.generate (unchanged) ...
      const extraction = result.object;
      if (!extraction) {
        return {
          estimateRequestId: inputData.estimateRequestId,
          fileUrl: inputData.fileUrl,
          zipCode: inputData.zipCode,
          items: inputData.items,
          auditItems: [],
          auditFailed: true,
        };
      }

      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        items: inputData.items,
        auditItems: extraction.items,
        auditFailed: false,
      };
    } catch (e) {
      console.error('Workflow step audit-items failed (non-fatal):', e);
      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        items: inputData.items,
        auditItems: [],
        auditFailed: true,
      };
    }
  },
});
```

#### Reasoning
- Identical pattern to `extract-items.ts` above. The agent call body is unchanged (elided in the Before/After snippets with a comment to keep the diff focused on the schema + return-object additions).
- The full `agent.generate(...)` block, `passASummary` construction, and per-call `requestContext` are unchanged from the current file.

### `src/mastra/workflows/steps/merge-items.ts`
**Action:** Modify
**Why:** Same `zipCode` plumbing as the two steps above. The merge step is also the last hop before `price-items`, so its output schema must carry `zipCode` for the pricer.
**Impact:** Input gains `zipCode`. Output gains `zipCode`. Existing `[extraction-quality]` log line, dedup logic, renumbering, and counters are unchanged.

#### Before
```ts
export const mergeItemsStep = createStep({
  id: 'merge-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    items: z.array(billableItemSchema),
    auditItems: z.array(billableItemSchema),
    auditFailed: z.boolean(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    items: z.array(billableItemSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    // ... dedup + renumber + [extraction-quality] log (unchanged) ...

    return {
      estimateRequestId: inputData.estimateRequestId,
      items: renumbered,
    };
  },
});
```

#### After
```ts
export const mergeItemsStep = createStep({
  id: 'merge-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(billableItemSchema),
    auditItems: z.array(billableItemSchema),
    auditFailed: z.boolean(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    items: z.array(billableItemSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    // ... dedup + renumber + [extraction-quality] log (unchanged) ...

    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      items: renumbered,
    };
  },
});
```

#### Reasoning
- Only the schemas and the single `return` object change. The `[extraction-quality]` log line and the dedup/renumber loop are untouched (elided with a comment).
- The output now exactly matches `priceItemsStep.inputSchema` (`estimateRequestId`, `zipCode`, `items`), so the next `.then(priceItemsStep)` in `summarize-estimate.ts` type-checks without additional adapters.

### `src/mastra/workflows/steps/persist-success.ts`
**Action:** Modify
**Why:** Accept the new `prices: PricedLineItem[]` field on input and serialize a v2 envelope (`kind: 'billable-extraction', version: 2, items, prices`) into the `summary` column. Old rows produced before this branch stay v1; new rows are v2.
**Impact:** Input schema gains `prices`. The serialized envelope changes from v1 to v2. `status: 'completed'` flip and `errorMessage: null` clear are unchanged.

#### Before
```ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import {
  billableItemSchema,
  SUMMARY_ENVELOPE_KIND,
  SUMMARY_ENVELOPE_VERSION,
  type SummaryEnvelope,
} from '@/mastra/agents/billable-item-extractor.schema';

export const persistSuccessStep = createStep({
  id: 'persist-success',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    items: z.array(billableItemSchema),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ inputData }) => {
    const envelope: SummaryEnvelope = {
      kind: SUMMARY_ENVELOPE_KIND,
      version: SUMMARY_ENVELOPE_VERSION,
      items: inputData.items,
    };

    await db
      .update(estimateRequestTable)
      .set({
        summary: JSON.stringify(envelope),
        status: 'completed',
        errorMessage: null,
      })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));

    return { success: true };
  },
});
```

#### After
```ts
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import {
  billableItemSchema,
  pricedLineItemSchema,
  SUMMARY_ENVELOPE_KIND,
  SUMMARY_ENVELOPE_VERSION_2,
  type SummaryEnvelopeV2,
} from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Write the versioned billable-extraction envelope (v2: items + prices) to
 * `estimate_requests.summary` and flip the row to `completed`. Old rows on
 * disk produced before this branch stay v1; the reader discriminates on
 * `envelope.version` and renders both shapes.
 */
export const persistSuccessStep = createStep({
  id: 'persist-success',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    items: z.array(billableItemSchema),
    prices: z.array(pricedLineItemSchema),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ inputData }) => {
    const envelope: SummaryEnvelopeV2 = {
      kind: SUMMARY_ENVELOPE_KIND,
      version: SUMMARY_ENVELOPE_VERSION_2,
      items: inputData.items,
      prices: inputData.prices,
    };

    await db
      .update(estimateRequestTable)
      .set({
        summary: JSON.stringify(envelope),
        status: 'completed',
        errorMessage: null,
      })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));

    return { success: true };
  },
});
```

#### Reasoning
- The Drizzle write is unchanged structurally; only the JSON payload's shape (and the imported constants) change.
- `SUMMARY_ENVELOPE_VERSION_2 = 2` is a literal type added in Step 1; the `SummaryEnvelopeV2` type imposes the new shape at compile time so a missing `prices` field would be caught by `tsc`.
- Old v1 rows are untouched (no DB migration); the reader handles both versions via the discriminated parser in `src/features/estimate/lib/envelope.ts`.

### `src/mastra/workflows/summarize-estimate.ts`
**Action:** Modify
**Why:** Insert `priceItemsStep` into the success sub-workflow between `mergeItemsStep` and `persistSuccessStep` so prices are computed before the envelope is persisted.
**Impact:** One new import and one new `.then(priceItemsStep)` line in `successPathWorkflow`. The top-level workflow body is unchanged.

#### Before
```ts
import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { markProcessingStep } from './steps/mark-processing';
import { extractItemsStep } from './steps/extract-items';
import { auditItemsStep } from './steps/audit-items';
import { mergeItemsStep } from './steps/merge-items';
import { persistSuccessStep } from './steps/persist-success';
import { persistFailureStep } from './steps/persist-failure';

const successPathWorkflow = createWorkflow({
  id: 'summarize-estimate-success-path',
  inputSchema: extractItemsStep.outputSchema,
  outputSchema: persistSuccessStep.outputSchema,
})
  .then(auditItemsStep)
  .then(mergeItemsStep)
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

#### After
```ts
import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { markProcessingStep } from './steps/mark-processing';
import { extractItemsStep } from './steps/extract-items';
import { auditItemsStep } from './steps/audit-items';
import { mergeItemsStep } from './steps/merge-items';
import { priceItemsStep } from './steps/price-items';
import { persistSuccessStep } from './steps/persist-success';
import { persistFailureStep } from './steps/persist-failure';

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

#### Reasoning
- One new import, one new `.then(priceItemsStep)` between merge and persist. The order matters: prices must exist before the envelope is written.
- `successPathWorkflow.inputSchema = extractItemsStep.outputSchema` still type-checks because both schemas carry `zipCode` after Step 4 — the chain `audit-items → merge-items → price-items` works because each step's output exactly satisfies the next step's input.
- `persistFailureStep` is unchanged; it does not need `zipCode`.

### `src/features/estimate/lib/envelope.ts`
**Action:** Create
**Why:** The estimate detail page must read `row.summary` (a JSON string, or `null`/something un-parseable) and render the report. Doing the JSON parse + Zod discrimination inline in `page.tsx` would couple route code to schema layout. This helper returns a single discriminated union that the page hands directly to the report component.
**Impact:** New file. Server-safe (no `'use client'`, no React). Imports the v1 and v2 Zod schemas from `billable-item-extractor.schema.ts` and re-exports the discriminated `ParsedEnvelope` type that `estimate-report.tsx` consumes.

#### Before
File does not exist yet.

#### After
```ts
import {
  summaryEnvelopeSchema,
  summaryEnvelopeV2Schema,
  type SummaryEnvelope,
  type SummaryEnvelopeV2,
} from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Discriminated result of parsing `estimate_requests.summary`. The page
 * hands this directly to <EstimateReport /> so the report component never
 * touches JSON or Zod.
 *
 * - 'v1': rows produced before the pricing branch landed. The report
 *   renders items but every row shows "Price unavailable".
 * - 'v2': current production shape. Items + prices.
 * - 'unparseable': `summary` is a non-null string we couldn't parse as
 *   JSON, or it parsed but didn't match either Zod schema. The report
 *   renders an explicit "summary unavailable" panel and the raw text as a
 *   debug-only fallback.
 * - 'absent': `summary` is null. The estimate completed without producing
 *   a summary (or is still processing). The report renders a placeholder.
 */
export type ParsedEnvelope =
  | { kind: 'v1'; envelope: SummaryEnvelope }
  | { kind: 'v2'; envelope: SummaryEnvelopeV2 }
  | { kind: 'unparseable'; raw: string }
  | { kind: 'absent' };

export function parseSummaryEnvelope(
  summary: string | null,
): ParsedEnvelope {
  if (summary === null) return { kind: 'absent' };

  let json: unknown;
  try {
    json = JSON.parse(summary);
  } catch {
    return { kind: 'unparseable', raw: summary };
  }

  const v2 = summaryEnvelopeV2Schema.safeParse(json);
  if (v2.success) return { kind: 'v2', envelope: v2.data };

  const v1 = summaryEnvelopeSchema.safeParse(json);
  if (v1.success) return { kind: 'v1', envelope: v1.data };

  return { kind: 'unparseable', raw: summary };
}
```

#### Reasoning
- Tries v2 first, then v1. Order matters because v2 is a strict superset on the same `kind` literal; trying v1 first would reject a v2 envelope on the unknown `prices` field (Zod `.object(...)` is strict-ish on extras only when `.strict()` is set, but ordering this way is unambiguous regardless of strictness settings).
- All branches return a discriminated union; the report component switches on `parsed.kind` and TypeScript narrows every branch.
- Server-safe: no `'use client'`, no React, no client-only APIs. Imports are pure schema modules. Can be called from the route's server component without bundling Zod into the client.

### `src/features/estimate/lib/format.ts`
**Action:** Create
**Why:** The report needs three tiny formatters: currency rendering, line-total rendering (handling the `unitPrice === null` case), and a human label for `submitterRole`. Centralising them in a helper keeps the JSX clean and gives them one obvious place to evolve.
**Impact:** New file. Pure functions, no React, no dependencies. Safe to import from server or client components.

#### Before
File does not exist yet.

#### After
```ts
import type { SubmitterRole } from '@/features/estimate/db/schema';

/**
 * Format a whole-USD integer dollar amount as a US currency string.
 * Inputs are integers (the pricer agent and DB schema enforce that).
 * Example: 1250 -> "$1,250.00".
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Render a per-line total. When the pricer was unable to defend a price
 * (`unitPrice === null`), return the literal sentinel the report uses so
 * the grand-total row can also detect partial coverage by counting
 * sentinels.
 */
export const PRICE_UNAVAILABLE = 'Price unavailable' as const;

export function formatLineTotal(
  quantity: number,
  unitPrice: number | null,
): string {
  if (unitPrice === null) return PRICE_UNAVAILABLE;
  return formatCurrency(quantity * unitPrice);
}

/**
 * Render the submitter role as a human badge label. Currently the schema
 * allows two values; this function is exhaustive on the union so adding a
 * third option becomes a TypeScript error here.
 */
export function formatPartyRole(role: SubmitterRole): string {
  switch (role) {
    case 'listing-agent':
      return 'Listing agent';
    case 'buyer-agent':
      return 'Buyer agent';
  }
}
```

#### Reasoning
- `Intl.NumberFormat` is the platform-standard currency formatter; no `currency.js` or similar dependency needed.
- The `PRICE_UNAVAILABLE` constant is exported so the report can compare line-totals and count how many items are unpriced without re-hardcoding the string.
- `formatPartyRole` is `switch`-exhaustive on the `SubmitterRole` union (imported from the schema) so adding a new submitter role triggers a TypeScript error here — forcing the report to be updated in lockstep.
- All functions are pure and deterministic; no `Intl` locale parameter, no `Date` dependency. Safe to call during SSR.

### `src/features/estimate/components/estimate-report.tsx`
**Action:** Create
**Why:** The branded report React component. Pure presentation. Takes the row + the parsed envelope and renders: logo header, property block, parties block, items list with `quantity × unitPrice = lineTotal`, totals (subtotal + count of unpriced items), and a footer. No client hooks; safe to render as a server component.
**Impact:** New file. Imports `next/image` for the logo, shadcn `Card`/`Separator`/`Badge` for chrome, and the helpers from `lib/envelope.ts` + `lib/format.ts`. No new package dependencies.

#### Before
File does not exist yet.

#### After
```tsx
import Image from 'next/image';
import { Card } from '@/design-systems/shadcn/components/card';
import { Separator } from '@/design-systems/shadcn/components/separator';
import { Badge } from '@/design-systems/shadcn/components/badge';
import type { estimateRequestTable } from '@/features/estimate/db/schema';
import type { ParsedEnvelope } from '@/features/estimate/lib/envelope';
import {
  PRICE_UNAVAILABLE,
  formatCurrency,
  formatLineTotal,
  formatPartyRole,
} from '@/features/estimate/lib/format';
import type {
  BillableItem,
  PricedLineItem,
} from '@/mastra/agents/billable-item-extractor.schema';

type EstimateRow = typeof estimateRequestTable.$inferSelect;

interface EstimateReportProps {
  row: EstimateRow;
  envelope: ParsedEnvelope;
}

/**
 * Branded FixPro estimate report. Layout mirrors a printed invoice:
 *
 *   [logo]                                       Estimate #<short-id>
 *   FixPro Estimate                              Created <date>
 *   ----------------------------------------------------------------
 *   Property                          Buyer / Listing parties
 *   ----------------------------------------------------------------
 *   Billable items
 *     #001  <trade> — <action>                      qty × $unit = $line
 *           <scope> @ <location>
 *           "<sourceQuote>"                          <confidence>
 *           source: <source>
 *   ----------------------------------------------------------------
 *                                                  Subtotal: $X,XXX.00
 *                                                  Unpriced items: N
 *   ----------------------------------------------------------------
 *   Footer
 */
export function EstimateReport({ row, envelope }: EstimateReportProps) {
  return (
    <Card className="mx-auto max-w-4xl px-8 py-10">
      <ReportHeader row={row} />
      <Separator className="my-8" />
      <PropertyAndParties row={row} />
      <Separator className="my-8" />
      <ItemsSection envelope={envelope} />
      <Separator className="my-8" />
      <ReportFooter />
    </Card>
  );
}

function ReportHeader({ row }: { row: EstimateRow }) {
  const shortId = row.id.slice(0, 8);
  const created = new Date(row.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <Image
          src="/fixpro-logo.webp"
          alt="FixPro"
          width={48}
          height={48}
          priority
          className="rounded"
        />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            FixPro Estimate
          </h1>
          <p className="text-sm text-muted-foreground">{row.fileName}</p>
        </div>
      </div>
      <div className="text-right text-sm">
        <div className="font-mono">Estimate #{shortId}</div>
        <div className="text-muted-foreground">Created {created}</div>
      </div>
    </div>
  );
}

function PropertyAndParties({ row }: { row: EstimateRow }) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section>
        <h2 className="mb-2 text-lg font-semibold">Property</h2>
        <div className="text-sm leading-relaxed">
          <div>{row.propertyAddress}</div>
          <div className="text-muted-foreground">Zip {row.zipCode}</div>
          {row.timeframe ? (
            <div className="mt-2">
              <span className="text-muted-foreground">Timeframe: </span>
              {row.timeframe}
            </div>
          ) : null}
        </div>
      </section>
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-lg font-semibold">Parties</h2>
          <Badge variant="secondary">
            Submitted by {formatPartyRole(row.submitterRole)}
          </Badge>
        </div>
        <div className="grid gap-4 text-sm">
          <PartyBlock
            label="Listing agent"
            name={row.listingAgentName}
            phone={row.listingAgentPhone}
            email={row.listingAgentEmail}
          />
          <PartyBlock
            label="Buyer agent"
            name={row.buyerAgentName}
            phone={row.buyerAgentPhone}
            email={row.buyerAgentEmail}
          />
        </div>
      </section>
    </div>
  );
}

function PartyBlock({
  label,
  name,
  phone,
  email,
}: {
  label: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}) {
  if (!name && !phone && !email) {
    return (
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-muted-foreground">Not provided</div>
      </div>
    );
  }
  return (
    <div>
      <div className="font-medium">{label}</div>
      {name ? <div>{name}</div> : null}
      {phone ? <div className="text-muted-foreground">{phone}</div> : null}
      {email ? <div className="text-muted-foreground">{email}</div> : null}
    </div>
  );
}

function ItemsSection({ envelope }: { envelope: ParsedEnvelope }) {
  if (envelope.kind === 'absent') {
    return (
      <EmptyState
        title="Estimate is still being prepared."
        body="This estimate has no summary yet. Check back once processing completes."
      />
    );
  }
  if (envelope.kind === 'unparseable') {
    return (
      <EmptyState
        title="Summary unavailable"
        body="We couldn't parse the saved summary. The raw output is shown below for debugging."
      >
        <pre className="mt-4 max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
          {envelope.raw}
        </pre>
      </EmptyState>
    );
  }

  const items = envelope.envelope.items;
  const prices: PricedLineItem[] =
    envelope.kind === 'v2' ? envelope.envelope.prices : [];
  const priceByItemId = new Map(prices.map((p) => [p.itemId, p]));

  let subtotal = 0;
  let unpriced = 0;
  for (const item of items) {
    const price = priceByItemId.get(item.id);
    if (price && price.unitPrice !== null) {
      subtotal += item.quantity * price.unitPrice;
    } else {
      unpriced++;
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">Billable items</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No billable items were extracted from this report.
        </p>
      ) : (
        <ul className="space-y-5">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              price={priceByItemId.get(item.id) ?? null}
            />
          ))}
        </ul>
      )}
      <Separator className="my-6" />
      <Totals subtotal={subtotal} unpriced={unpriced} />
    </section>
  );
}

function ItemRow({
  item,
  price,
}: {
  item: BillableItem;
  price: PricedLineItem | null;
}) {
  const unitPrice = price?.unitPrice ?? null;
  const lineTotal = formatLineTotal(item.quantity, unitPrice);
  const isUnpriced = lineTotal === PRICE_UNAVAILABLE;
  return (
    <li className="grid gap-1 sm:grid-cols-[1fr_auto]">
      <div>
        <div className="font-medium">
          <span className="text-muted-foreground">#{item.id} · </span>
          {item.trade} — {item.action}
        </div>
        <div className="text-sm text-muted-foreground">
          {item.scope} @ {item.location}
        </div>
        <div className="mt-1 text-sm italic text-muted-foreground">
          “{item.sourceQuote}”
          {item.pageHint ? (
            <span className="not-italic"> ({item.pageHint})</span>
          ) : null}
        </div>
        {price ? (
          <div className="mt-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="mr-2">
              {price.confidence}
            </Badge>
            source: {price.source}
            {price.unitPrice === null && price.unavailableReason ? (
              <span> — {price.unavailableReason}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="text-right text-sm tabular-nums">
        <div className="text-muted-foreground">
          {item.quantity} ×{' '}
          {unitPrice !== null ? formatCurrency(unitPrice) : '—'}
        </div>
        <div className={isUnpriced ? 'text-muted-foreground' : 'font-semibold'}>
          {lineTotal}
        </div>
      </div>
    </li>
  );
}

function Totals({
  subtotal,
  unpriced,
}: {
  subtotal: number;
  unpriced: number;
}) {
  return (
    <div className="flex justify-end">
      <div className="w-full max-w-xs space-y-1 text-sm tabular-nums">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-semibold">{formatCurrency(subtotal)}</span>
        </div>
        {unpriced > 0 ? (
          <div className="flex justify-between text-muted-foreground">
            <span>Unpriced items</span>
            <span>{unpriced}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded border border-dashed p-6 text-sm">
      <div className="font-semibold">{title}</div>
      <p className="mt-1 text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}

function ReportFooter() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Generated by FixPro. Pricing is AI-assisted and may require contractor
      confirmation. “Price unavailable” items must be quoted manually.
    </p>
  );
}
```

#### Reasoning
- Pure presentation. No `'use client'` directive, no hooks, no Suspense, no async client work. Safe to render as a server component.
- Joins items and prices on `itemId` via a `Map` so array order doesn't matter; missing prices fall through to "Price unavailable".
- Computes subtotal and unpriced-count from the items+prices pair so totals are always consistent with what is on screen — the report does not trust an externally-computed subtotal.
- Empty / unparseable / absent envelope shapes all render a typed `EmptyState`, never crash, never blank-screen. The raw text appears only in the `unparseable` debug fallback.
- All Tailwind classes use the project's existing scale (`text-lg`, `font-semibold`, `text-muted-foreground`, `tabular-nums`); no new utility classes.
- The logo comes through `next/image` with explicit `width`/`height` (no layout shift) and `priority` (LCP candidate).
- Date formatting is a single `Intl.DateTimeFormat` call inline (server-rendered, en-US) — consistent SSR output, no client hydration mismatch.

### `src/app/dashboard/estimate/[id]/page.tsx`
**Action:** Modify
**Why:** The user-visible swap. Replace the existing `<pre>{row.summary}</pre>` block (and the now-redundant page header that just shows filename + an "Analyzed" badge) with the new `<EstimateReport row={row} envelope={parsed} />`. Auth, params, and the row query stay exactly the same. The report owns identity, branding, and totals from here on.
**Impact:** Imports gain `parseSummaryEnvelope` and `EstimateReport`. The two unused shadcn imports (`Card`, `Badge`) at the page level can be dropped since the report now owns its own chrome. The page becomes a thin wrapper: auth check → query row → parse envelope → render report.

#### Before
```tsx
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import { authServerProvider } from '@/features/auth/server';
import { Button } from '@/design-systems/shadcn/components/button';
import { Card } from '@/design-systems/shadcn/components/card';
import { Badge } from '@/design-systems/shadcn/components/badge';

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await authServerProvider.getSession({
    headers: await headers(),
  });
  if (!session) redirect('/login');

  const [row] = await db
    .select()
    .from(estimateRequestTable)
    .where(eq(estimateRequestTable.id, id));
  if (!row) notFound();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{row.fileName}</h1>
        <Badge variant="secondary">Analyzed</Badge>
      </div>
      <Card className="p-6">
        <pre className="whitespace-pre-wrap font-sans text-sm">
          {row.summary}
        </pre>
      </Card>
      <div className="mt-6">
        <Button asChild variant="outline">
          <a href="/dashboard">Back to dashboard</a>
        </Button>
      </div>
    </main>
  );
}
```

#### After
```tsx
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import { authServerProvider } from '@/features/auth/server';
import { Button } from '@/design-systems/shadcn/components/button';
import { EstimateReport } from '@/features/estimate/components/estimate-report';
import { parseSummaryEnvelope } from '@/features/estimate/lib/envelope';

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await authServerProvider.getSession({
    headers: await headers(),
  });
  if (!session) redirect('/login');

  const [row] = await db
    .select()
    .from(estimateRequestTable)
    .where(eq(estimateRequestTable.id, id));
  if (!row) notFound();

  const parsed = parseSummaryEnvelope(row.summary);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <EstimateReport row={row} envelope={parsed} />
      <div className="mt-6">
        <Button asChild variant="outline">
          <a href="/dashboard">Back to dashboard</a>
        </Button>
      </div>
    </main>
  );
}
```

#### Reasoning
- Drops the `Card` and `Badge` imports because the report owns its own card + badge chrome. `Button` stays for the "Back to dashboard" link, which lives outside the report.
- Auth, the `notFound()` guard, and the Drizzle query are unchanged. Only the JSX body and two imports change.
- The page is now a pure wrapper: auth → query → parse → render. All JSON/Zod work is inside `parseSummaryEnvelope`; all presentation is inside `EstimateReport`.
- `parsed` is the discriminated union from `lib/envelope.ts`. The report renders v1, v2, unparseable, and absent envelopes without the page knowing which it got.

## Validation Plan
- **TypeScript:** `pnpm exec tsc --noEmit` must be clean. This is the canonical gate (project `AGENTS.md`). Run it after Step 1, after Step 4, and again before the PR — each schema/plumbing step must leave the workflow type-graph valid (Step 4 in particular must be one commit because the schemas chain across files).
- **ESLint:** `pnpm exec eslint <changed paths>` must be clean. Project-level `pnpm lint` is broken under Next 16 and is NOT the gate. Concretely, after each commit run e.g. `pnpm exec eslint src/mastra/agents/billable-item-extractor.schema.ts src/mastra/agents/item-pricer.ts src/mastra/agents/item-pricer.schema.ts src/mastra/index.ts src/mastra/workflows/steps/price-items.ts` (and the rest of the changed paths for that commit).
- **DB migrations:** none. No schema change in this branch (the new `zipCode` column already exists, the envelope shape lives in the `summary` text column). No `drizzle-kit generate`, no `pnpm db:migrate`.
- **Manual smoke test (after merge or on the feature branch in dev):**
  1. Upload a fresh inspection PDF through the existing dashboard upload flow.
  2. Verify the row transitions `uploaded` → `processing` → `completed` (the existing status bar).
  3. Open `/dashboard/estimate/[id]` for the new row. Verify: logo + "FixPro Estimate" header, property block with address + zip + timeframe, parties block with the submitter-role badge, every billable item shows `qty × $unit = $line` OR "Price unavailable" with a one-sentence reason, a subtotal at the bottom, and a footer.
  4. Open `/dashboard/estimate/[id]` for an OLD row (created before this branch, summary is a v1 envelope). Verify: the report renders items with "Price unavailable" on every row and the subtotal is `$0.00` with "Unpriced items: N". No crash. No "summary unavailable" panel.
  5. Open a row with `summary = null` (paused / failed mid-pipeline). Verify the "Estimate is still being prepared." empty state renders instead of a crash.
  6. Force an `unparseable` shape by manually corrupting a row's `summary` in dev (or using a Postgres `UPDATE`) and verify the "Summary unavailable" panel + raw text fallback.
  7. Watch the workflow logs for one new run. Confirm: `[extraction-quality]` (existing) and `[pricing-quality]` (new) lines are both emitted, with `total`, `pricedCount`, `unavailableCount`, and `lookupFailedCount`.
- **Pricer honesty spot-check:** for one or two items in the smoke-test run, eyeball the `source` label and `confidence`. Reject anything that contains a URL, a range, or a fabricated-looking citation — these are prompt-violations and would need an instruction tightening in a follow-up.
- **PR gate:** push the feature branch, open the PR via `gh pr create` (per project `AGENTS.md`), include the validation summary in the PR body, link this plan file, and stop. Do NOT merge — the human reviewer merges.

## Risk Notes
- **Pricer hallucinates anyway.** The prompt is the only thing telling the model not to invent numbers. Mitigation: hard prompt rules (no citation, no range, no per-batch math, explicit "return null when unsure" clause), `confidence` self-report, and a coarse-label `source`. Operationally we will watch the first runs and tighten the prompt if we see invented numbers; the schema does not block hallucination on its own.
- **Pricer returns null for everything.** A real possibility on early runs if the model is conservative. Mitigation: the report renders "Price unavailable" cleanly, the subtotal is still `$0.00`, the user sees a clear count of unpriced items, and the workflow does NOT fail. If the unpriced rate stays high (>50% in the `[pricing-quality]` log) we'll revisit the prompt or add a lookup tool in a follow-up branch.
- **Envelope v1 rows still on disk.** Production already has rows with `summary = '{"kind":"billable-extraction","version":1,...}'`. Mitigation: the reader tries v2 first, then v1; the report renders v1 with all items showing "Price unavailable". No DB migration is needed. v1 rows stay v1 forever.
- **Long reports / many line items.** A 60-item inspection means 60 sequential pricer calls. Mitigation: per-item `try/catch` and `retries: 1` keep one bad call from poisoning the run; we do NOT parallelize the pricer calls in v1 to stay polite to the Kilo gateway and to keep per-row request context clean. If wall-clock becomes a problem we'll fan out in a follow-up.
- **Missing logo asset.** `public/fixpro-logo.webp` exists today; if it is ever removed, `next/image` will throw at render. Mitigation: the asset is checked into the repo, the import is a static literal path, and a missing asset is caught immediately by visual smoke test. Not a runtime data dependency.
- **`zipCode` empty / malformed.** The DB column is `notNull` but historical rows may carry junk (e.g. "00000", "N/A"). Mitigation: the pricer is allowed to return `unitPrice: null` with `unavailableReason: "Scope ambiguous; needs contractor quote."` for unknown zip codes, so a junk zip just degrades to "Price unavailable" for every item; nothing crashes.
- **`row.createdAt` rendered as `toLocaleDateString('en-US', ...)`.** Server-rendered date strings can drift from client-rendered ones across timezones, but here both renders are server-side (no client hydration of this string) so there is no mismatch. Worth flagging in case anyone later moves the report into a client component.
- **Cost.** Adding ~N pricer calls per estimate (one per item) noticeably bumps Kilo gateway spend per upload. Not a correctness risk but worth naming. If volume grows, batching multiple items per pricer call is a natural follow-up (the schema is already keyed by `itemId` to support that without a contract change).

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
