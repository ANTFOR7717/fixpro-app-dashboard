# REFACTOR(pipeline-responsibility-modules)

## Request

Break the AI pipeline (`src/mastra/**`) into its core responsibilities as
**completely separate folders/modules with zero shared responsibility**,
where each module exposes **exactly one typed entry-point function** that
every other module (and the caller) invokes like an API — input in, typed
output or a thrown error out — even though the call is in-process. No
module imports another module's internal files. No shared mutable state.
Each module's output/contract is explicitly documented at its one door.

**This supersedes `REFACTOR(ai-pipeline-mastra-native-realignment).md`**
(unapproved, unexecuted). That document's research and design decisions are
folded in here as prior art, not re-derived from scratch:

- Verified Mastra 1.37.1 primitives (structured output throws by default,
  step `retries` re-run on throw, `.foreach(step, {concurrency})`,
  `createScorer` from `@mastra/core/evals`, nested workflows as steps).
- The v3-prototype-aligned discriminated union (`materialLineSchema` /
  `laborLineSchema`) that makes "labor is always HRS, quarter-hour
  quantities, material is never HRS" unrepresentable to violate.
- The corrected, PDF-blind scorer design (judges internal consistency and
  compound scopes — not grounding-against-source or completeness, since the
  judge never receives the document).
- The single-writer persistence principle (the AI process never touches the
  database; the caller does).

**What THIS document adds** that the prior draft did not have: the prior
draft organized files by **Mastra primitive kind** (`agents/`,
`workflows/steps/`, `scorers/`, `config/`) — extraction and pricing logic
were split across two folders each, and nothing stopped one file from
reaching into another's internals. This plan reorganizes by
**responsibility**, with an enforced single door per responsibility:

| # | Responsibility | Contract (the "API") | Lives in |
|---|---|---|---|
| 1 | **Extraction** | `extractWorkItems(input) -> { workItems }`, throws on failure | `src/features/estimate-extraction-pipeline/extraction/` |
| 2 | **Classification/Expansion** | `classifyLines(workItems) -> { lines }`, pure, never throws on valid input | `src/features/estimate-extraction-pipeline/classification/` |
| 3 | **Pricing** | `priceLines(lines, zipCode) -> { lines, prices }`, throws only on catastrophic failure | `src/features/estimate-extraction-pipeline/pricing/` |
| 4 | **Persistence/Delivery** | owns the DB row lifecycle end-to-end; calls the pipeline once | `src/features/estimate/lib/workflow.ts` (a sibling feature — confirmed correct, not moved) |

`src/features/estimate-extraction-pipeline/pipeline.ts` is the
**composition root** — not a 5th responsibility. It is pure wiring: three
Mastra steps, each one a one-line adapter calling exactly one module's
function, `.then()`-chained. It contains zero business logic, matching the
repo's own existing "the workflow body is a wiring diagram" philosophy
(`summarize-estimate.ts`'s current doc comment).

**Why `src/features/estimate-extraction-pipeline/` and not `src/mastra/`:**
this whole subtree — reading a PDF, classifying the work, pricing it — is a
FEATURE of the app (the thing that turns an inspection report into a priced
estimate), not generic framework plumbing. `src/mastra/` today reads as "the
Mastra-specific stuff," which is exactly the wrong frame: Mastra is the
library this feature happens to be built with, the same way `src/features/
estimate/` uses Drizzle without being named after it. Every other feature in
this repo (`auth/`, `contacts/`, `dashboard/`, `estimate/`) already lives
under `src/features/`; this one should too, as a sibling to `estimate/`
(which owns the report UI, the DB row, and responsibility #4) rather than
nested inside it (it is not a sub-concern of `estimate/` — it is the thing
`estimate/` calls).

**Tooling consequence, verified before committing to this move:** the
`mastra` CLI (`pnpm mastra dev` / `pnpm mastra build`, referenced in prior
plans in this repo) defaults to locating the `Mastra` instance at
`src/mastra/index.ts`. Confirmed via the CLI reference and local-dev docs
that a custom location is a first-class, documented option: `mastra dev
--dir <path>` / `mastra build --dir <path>` point the CLI at any directory
containing `index.ts` ([CLI commands](https://mastra.ai/reference/cli/mastra),
[Adding to an Existing Project](https://mastra.ai/en/docs/local-dev/add-to-existing-project)).
This plan adds two `package.json` scripts
(`mastra:dev`/`mastra:build`) that bake in `--dir
src/features/estimate-extraction-pipeline`, so the CLI stays a one-word
command instead of a flag every dev has to remember — see the `package.json`
file-by-file entry.

## Verified Mastra Surface (carried over, re-confirmed against installed 1.37.1)

| Primitive | Used for |
|---|---|
| `createStep({ retries, execute })` — re-runs `execute` only when it throws | `pipeline.ts`'s `extract` step: `retries: 2` around a single-attempt `extractWorkItems()` call |
| `createWorkflow(...).then(...).commit()` | `pipeline.ts` (3-step linear chain); `pricing/workflow.ts` (internal, not exported) |
| `.foreach(step, { concurrency: N })` | `pricing/workflow.ts`'s internal per-line fan-out — an implementation detail of the pricing module, invisible to its one public function |
| `structuredOutput: { schema }` via `agent.generate()`, throws on validation failure (default `errorStrategy: 'strict'`) | Both `extraction/agent.ts` and `pricing/agent.ts` calls |
| `createScorer({ judge: { model, instructions } }).analyze(...).generateScore(...).generateReason(...)`, background, non-blocking | `extraction/scorer.ts` |
| `run.start()` → `{ status: 'success' | 'failed', result, steps }` | Consumed once, by the caller (`features/estimate/lib/workflow.ts`), never inside the pipeline itself |

Versions: `@mastra/core` 1.37.1, `zod` 4.2.1, `@ai-sdk/openai` 3.0.62. No new
dependency (`@mastra/core/evals` ships `createScorer` in the installed
version).

## Directory Map

```text
falcon-bighorn/
├── REFACTOR(pipeline-responsibility-modules).md            [CREATE] this plan
├── package.json                                            [MODIFY] remove jsonrepair; add mastra:dev/mastra:build scripts
└── src/
    ├── mastra/                                             [gone entirely once the moves below land — nothing remains under this path]
    │   ├── index.ts                                        [DELETE] → src/features/estimate-extraction-pipeline/index.ts
    │   ├── agents/                                          [DELETE all 4 files] logic redistributed into the new extraction/ and pricing/
    │   │   ├── billable-item-extractor.schema.ts             [DELETE]
    │   │   ├── billable-item-extractor.ts                    [DELETE]
    │   │   ├── item-pricer.schema.ts                         [DELETE]
    │   │   ├── item-pricer.ts                                [DELETE]
    │   │   └── processors/                                   [DELETE directory, 5 files] entire ItemContractGuard stack — superseded by structured-output + the discriminated union (see prior draft's reasoning, unchanged)
    │   ├── config/
    │   │   └── agent-rules.ts                                [DELETE] split: gateway -> shared/gateway.ts, ACTION_COST_PROFILE/pricingBasisFor -> classification/rules.ts
    │   └── workflows/                                        [DELETE directory, 7 files] all logic redistributed below
    │       ├── summarize-estimate.ts                         [DELETE] → pipeline.ts
    │       ├── lib/classify-error.ts                         [DELETE] → src/features/estimate/lib/classify-error.ts (presentation copy, not AI)
    │       └── steps/                                        [DELETE directory, 6 files] extract-items, audit-items, merge-items, price-items, mark-processing, persist-success, persist-failure
    └── features/
        ├── estimate-extraction-pipeline/                     [NEW feature folder — sibling to estimate/, not nested inside it]
        │   ├── index.ts                                      [CREATE] Mastra registration (Studio) — moved+adapted from src/mastra/index.ts; also the mastra CLI's --dir entry point
        │   ├── pipeline.ts                                   [CREATE] composition root: 3-step linear wiring only
        │   ├── shared/
        │   │   ├── gateway.ts                                [CREATE] one Kilo AI-gateway instance (infra, not a responsibility)
        │   │   └── quarter-hour.ts                            [CREATE] roundToQuarter(hours) — stateless numeric utility both classification and pricing need
        │   ├── extraction/
        │   │   ├── schema.ts                                  [CREATE] ExtractedWorkItem contract (model-facing + module output)
        │   │   ├── agent.ts                                   [CREATE] billable-item-extractor Agent + prompt
        │   │   ├── scorer.ts                                  [CREATE] extraction-consistency LLM-judge (PDF-blind, scoped honestly)
        │   │   └── index.ts                                   [CREATE] ONE DOOR: extractWorkItems(input) -> { workItems }; re-exports ExtractedWorkItem type + the Agent (Studio registration only)
        │   ├── classification/
        │   │   ├── schema.ts                                  [CREATE] BillableLine / PendingLine discriminated union (the v3 unit-discipline contract)
        │   │   ├── rules.ts                                   [CREATE] ACTION_COST_PROFILE, PricingBasis, pricingBasisFor — deterministic policy, no I/O
        │   │   └── index.ts                                   [CREATE] ONE DOOR: classifyLines(workItems) -> { lines }; re-exports BillableLine/PendingLine/PricingBasis types
        │   └── pricing/
        │       ├── schema.ts                                  [CREATE] MaterialPriceResponse / LaborPriceResponse + PricedLineItem contract
        │       ├── agent.ts                                   [CREATE] item-pricer Agent + prompt
        │       ├── price-line.ts                              [CREATE] internal Mastra step: price ONE line (never exported outside the folder)
        │       ├── workflow.ts                                [CREATE] internal Mastra workflow: .foreach(price-line, {concurrency:3}) (never exported outside the folder)
        │       └── index.ts                                   [CREATE] ONE DOOR: priceLines(lines, zipCode, estimateRequestId) -> { lines, prices }; re-exports PricedLineItem type + the Agent (Studio registration only)
        └── estimate/                                         [existing feature — responsibility #4 lives here, unmoved]
            ├── lib/
            │   ├── classify-error.ts                          [CREATE] moved verbatim (presentation-facing error copy)
            │   ├── envelope.ts                                [MODIFY] NOW OWNS the versioned persistence-envelope schemas (v1/v2/v3 + legacy BillableItem) — responsibility #4's data format, not the AI pipeline's; moved out of the deleted billable-item-extractor.schema.ts
            │   └── workflow.ts                                [MODIFY] the single writer: reads zip, flips processing, calls the pipeline once, persists completed(envelope)/failed(message)
            ├── db/
            │   └── (unchanged — estimateRequestTable)
            └── components/
                ├── estimate-report.tsx                        [MODIFY] route v3 lines; import BillableLine from '@/features/estimate-extraction-pipeline/classification', PricedLineItem from '@/features/estimate-extraction-pipeline/pricing'
                └── items-section.tsx                          [MODIFY] v3 copy restored; prop type imports from the module doors
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `src/features/estimate-extraction-pipeline/shared/gateway.ts` | Create | One Kilo gateway instance. Today copy-pasted in 2 agent files (would be 3 with the scorer). Infra, not a responsibility — the one sanctioned exception to "no shared code," documented below. |
| `src/features/estimate-extraction-pipeline/shared/quarter-hour.ts` | Create | `roundToQuarter` is pure math both `classification` (rounding inspector-stated hours) and `pricing` (rounding the pricer's estimated hours) need. Neither module "owns" quarter-hour rounding as a responsibility — it is domain-free arithmetic, so it lives beside the gateway, not inside either module (which would force the other to import a sibling's internals to reach it). |
| `src/features/estimate-extraction-pipeline/extraction/schema.ts` | Create | The extraction module's entire data contract: what the model may emit (`extractedWorkItemSchema`) and the module's return type. Nothing outside `extraction/` may construct or depend on shapes not exported from `extraction/index.ts`. |
| `src/features/estimate-extraction-pipeline/extraction/agent.ts` | Create | The `Agent` instance + prompt. Internal — only `extraction/index.ts` calls it directly; the feature's `index.ts` imports the Agent instance ONLY via `extraction/index.ts`'s re-export (Studio registration is the one sanctioned reason to reach an Agent instance from outside). |
| `src/features/estimate-extraction-pipeline/extraction/scorer.ts` | Create | Background LLM-judge, honestly scoped to what a PDF-blind judge can assess (internal consistency + compound scopes). Internal — registered via `extraction/index.ts`'s re-export. |
| `src/features/estimate-extraction-pipeline/extraction/index.ts` | Create | THE DOOR. `extractWorkItems(input): Promise<{ workItems }>` — one call to the agent, one attempt, throws on any failure. No retry logic here (that is `pipeline.ts`'s job, an orchestration concern). |
| `src/features/estimate-extraction-pipeline/classification/schema.ts` | Create | `materialLineSchema` / `laborLineSchema` / `billableLineSchema` (discriminated union) / `pendingLineSchema` — the v3 unit-discipline contract as a type. This is classification's output; pricing and the caller import it ONLY via `classification/index.ts`. |
| `src/features/estimate-extraction-pipeline/classification/rules.ts` | Create | `ACTION_COST_PROFILE`, `PricingBasis`, `pricingBasisFor` — deterministic policy tables. Internal to classification (pricing needs `pricingBasisFor`'s OUTPUT, not the table — see index.ts). |
| `src/features/estimate-extraction-pipeline/classification/index.ts` | Create | THE DOOR. `classifyLines(workItems): { lines: PendingLine[] }` — pure function: dedup, content-addressed ids, scope safety net, material/labor expansion. Also re-exports `pricingBasisFor` as part of the module's public API (pricing needs to ask "what basis applies to this line" — a question about classification's own domain rules, not pricing's). |
| `src/features/estimate-extraction-pipeline/pricing/schema.ts` | Create | `materialPriceResponseSchema` / `laborPriceResponseSchema` (model-facing) and `pricedLineItemSchema` (module output). |
| `src/features/estimate-extraction-pipeline/pricing/agent.ts` | Create | The pricer `Agent` instance + prompt. Internal. |
| `src/features/estimate-extraction-pipeline/pricing/price-line.ts` | Create | Internal Mastra step: price exactly one line, resolve labor hours, graceful per-line degradation. Never imported outside `pricing/`. |
| `src/features/estimate-extraction-pipeline/pricing/workflow.ts` | Create | Internal Mastra workflow: `.foreach(priceLineStep, { concurrency: 3 })`. Never imported outside `pricing/` — this is HOW pricing achieves throughput, which is nobody else's business. |
| `src/features/estimate-extraction-pipeline/pricing/index.ts` | Create | THE DOOR. `priceLines(lines, zipCode, estimateRequestId): Promise<{ lines: BillableLine[], prices: PricedLineItem[] }>` — runs the internal workflow, returns the assembled result. Throws only if the internal run cannot even start. |
| `src/features/estimate-extraction-pipeline/pipeline.ts` | Create | Composition root. Three `createStep`s, each a one-line adapter calling one module's door function; `.then().then().then().commit()`. Zero business logic — if you need to understand what a stage DOES, you read that module's `index.ts`, never `pipeline.ts`. |
| `src/features/estimate-extraction-pipeline/index.ts` | Create | Mastra registration (Studio) — moved and adapted from `src/mastra/index.ts`. Also the mastra CLI's `--dir` entry point (see `package.json`). |
| `src/mastra/index.ts` | Delete | Superseded by `src/features/estimate-extraction-pipeline/index.ts`. |
| `src/mastra/agents/**` (4 files) | Delete | Superseded: extraction logic → the new `extraction/`, pricing logic → the new `pricing/`. |
| `src/mastra/agents/processors/**` (5 files) | Delete | `ItemContractGuard` stack — superseded by provider-enforced `response_format` + the discriminated union (unchanged reasoning from the prior draft). |
| `src/mastra/config/agent-rules.ts` | Delete | Split: gateway → `shared/gateway.ts`; `ACTION_COST_PROFILE`/`pricingBasisFor` → `classification/rules.ts` (classification OWNS the split/pricing-basis policy — it is a classification decision, not a cross-cutting config). |
| `src/mastra/workflows/**` (7 files) | Delete | `summarize-estimate.ts` → `pipeline.ts`; `lib/classify-error.ts` → features layer (presentation copy); the 6 step files' logic is redistributed into the 3 module folders. |
| `src/features/estimate/lib/classify-error.ts` | Create | Moved verbatim. It maps a gateway error to USER-FACING English — that is a presentation concern of responsibility #4, not the AI process. |
| `src/features/estimate/lib/envelope.ts` | Modify | Now owns the versioned persistence envelope (`v1`/`v2`/`v3` schemas, `SUMMARY_ENVELOPE_KIND`/`VERSION`, legacy `billableItemSchema`/`BillableItem`). These describe HOW THE APP STORES a result — responsibility #4's format, not the AI pipeline's contract. Moving them out of the (deleted) `billable-item-extractor.schema.ts` is itself a boundary fix this exercise surfaces. |
| `src/features/estimate/lib/workflow.ts` | Modify | The single writer: reads `zipCode`, flips `processing`, calls the pipeline exactly once, persists `completed`(envelope) or `failed`(classified message). Unchanged in spirit from the prior draft; import paths updated to the new feature location. |
| `src/features/estimate/components/estimate-report.tsx` | Modify | Routes v3 `lines` into `ItemsSection`; type imports come from `@/features/estimate-extraction-pipeline/classification` and `.../pricing` (the doors), never from a deleted path. |
| `src/features/estimate/components/items-section.tsx` | Modify | v3 header copy restored ("Labor is always measured in Hours"); prop types import `BillableLine` from `@/features/estimate-extraction-pipeline/classification`. |
| `src/features/estimate/lib/format.ts` | Modify (imports only) | Its functions are unchanged; only the `BillableItem`/`BillableLine` type imports move to `@/features/estimate/lib/envelope` (legacy) and `@/features/estimate-extraction-pipeline/classification` (v3) respectively. |
| `package.json` | Modify | Remove `jsonrepair` (last consumer deleted with the guard stack); add `mastra:dev`/`mastra:build` scripts pointing `--dir` at the new feature folder. |

## Existing Pattern Audit

- **"Workflow body is a wiring diagram."** `summarize-estimate.ts`'s own doc
  comment already states this ideal. `pipeline.ts` is what finally makes it
  literally true — every line in it is either an import or a
  `.then(step)` call; all logic lives one level down, in a module.
- **Deterministic classification already centralized.** `ACTION_COST_PROFILE`'s
  existing doc comment: "this is deterministic, not a model judgment call."
  Unchanged in substance — it just moves from a shared `config/` folder into
  the one module (`classification/`) that actually owns the decision it
  drives, instead of living in a folder every other file was free to import.
- **Content-addressed ids, dedup, scope safety net.** Carried over verbatim
  from the prior draft's `expand-lines.ts` design into
  `classification/index.ts` — same sha256 id scheme, same
  `-material`/`-labor` suffixes, same drop-and-log scope filter.
- **Versioned envelope precedent (v1 → v2 → v3).** Already established:
  new version literal, old schemas stay, reader discriminates. This plan
  keeps that precedent AND relocates it to where it belongs (the persistence
  layer) — the relocation doesn't change the discrimination logic itself.
- **Where this plan deliberately introduces a NEW pattern** (per the user's
  explicit direction, contained and documented, not a silent third
  convention): **the one-door module.** No file in `extraction/`,
  `classification/`, or `pricing/` except `index.ts` may be imported from
  outside that folder. This is new to the repo (nothing today enforces
  folder boundaries), so it needs an explicit, mechanically-checked rule —
  see the Validation Plan's import-boundary grep. Two narrow, explicitly
  labeled exceptions:
  1. **`shared/`** — stateless, business-free infrastructure (a gateway
     client, a rounding function). If `shared/` ever grows a second
     unrelated concern or gains business logic, that is the signal to
     stop and split it — not to keep adding to it.
  2. **Agent/Scorer instances re-exported for Studio registration.**
     The feature's own `index.ts` needs the actual `Agent`/`MastraScorer`
     objects to register them. Each module's `index.ts` re-exports its own
     instance for exactly this purpose — documented inline as "registration
     export, not for other modules to call directly." No module ever calls
     another module's agent instance; only
     `estimate-extraction-pipeline/index.ts` touches these re-exports, and
     only to register them.
- **Feature-folder placement, not framework placement.** This plan moves the
  entire subtree from `src/mastra/` (framework-named) to
  `src/features/estimate-extraction-pipeline/` (responsibility-named),
  matching the repo's existing convention that every feature — `auth/`,
  `contacts/`, `dashboard/`, `estimate/` — lives under `src/features/`. The
  internal module-folder structure (`extraction/`, `classification/`,
  `pricing/`, `shared/`, `pipeline.ts`) is unaffected by this move; only the
  parent directory and absolute (`@/...`) import specifiers change. Relative
  imports between sibling/child files inside the subtree (`'../extraction'`,
  `'./agent'`, `'../shared/gateway'`) are identical before and after — moving
  a subtree wholesale doesn't perturb paths relative to itself.

## Execution Plan

1. `src/features/estimate-extraction-pipeline/shared/gateway.ts`,
   `.../shared/quarter-hour.ts`.
2. `.../extraction/schema.ts` → `agent.ts` → `scorer.ts` → `index.ts`.
3. `.../classification/schema.ts` → `rules.ts` → `index.ts`.
4. `.../pricing/schema.ts` → `agent.ts` → `price-line.ts` →
   `workflow.ts` → `index.ts`.
5. `.../pipeline.ts`.
6. `.../index.ts` — register `pipeline`, the extraction Agent + scorer, the
   pricing Agent (via each module's re-exports). This is the new Mastra CLI
   entry point.
7. Delete `src/mastra/index.ts`, `src/mastra/agents/**`,
   `src/mastra/config/agent-rules.ts`, `src/mastra/workflows/**` (the
   directory ceases to exist once these are gone).
8. `src/features/estimate/lib/classify-error.ts` (create, moved),
   `src/features/estimate/lib/envelope.ts` (owns the versioned schemas now),
   `src/features/estimate/lib/workflow.ts` (single writer, new import
   paths).
9. `src/features/estimate/components/estimate-report.tsx`,
   `src/features/estimate/components/items-section.tsx`,
   `src/features/estimate/lib/format.ts` (import-path-only change).
10. `package.json` — remove `jsonrepair`; add `mastra:dev`/`mastra:build`
    scripts; `pnpm install`.
11. Validation gates (below), then stop for review.

## File-by-File Changes

### `src/features/estimate-extraction-pipeline/shared/gateway.ts`

**Action:** Create
**Why:** One Kilo gateway config instead of a copy in every file that needs
a model.

#### After (new file, complete)

```ts
import { createOpenAI } from '@ai-sdk/openai';

/**
 * The single Kilo AI-gateway instance every agent and scorer routes
 * through. This is infrastructure (a transport client), not a pipeline
 * responsibility — it carries no business logic and holds no state a
 * module's output depends on. Model selection stays at each call site
 * (e.g. `kiloGateway('openai/gpt-5.4-mini')`); only transport config
 * (URL, auth) lives here.
 */
export const kiloGateway = createOpenAI({
  apiKey: process.env.KILO_API_KEY!,
  baseURL: 'https://api.kilo.ai/api/gateway',
});
```

---

### `src/features/estimate-extraction-pipeline/shared/quarter-hour.ts`

**Action:** Create
**Why:** Quarter-hour rounding is pure arithmetic needed by both
`classification` (inspector-stated hours) and `pricing` (estimated hours).
Putting it inside either module would force the other to reach past that
module's one door to get at an internal helper.

#### After (new file, complete)

```ts
/**
 * Round to the nearest quarter-hour, floored at 0.25. Shared by
 * classification (inspector-stated hours) and pricing (estimated hours) —
 * domain-free arithmetic, not a decision either module owns.
 */
export function roundToQuarter(hours: number): number {
  return Math.max(0.25, Math.round(hours * 4) / 4);
}
```

---

### `src/features/estimate-extraction-pipeline/extraction/schema.ts`

**Action:** Create
**Why:** Extraction's entire data contract in one file: what the model may
emit, and what the module hands back.

#### After (new file, complete)

```ts
import { z } from 'zod';

export const TRADE = [
  'electrical',
  'plumbing',
  'hvac',
  'roofing',
  'structural',
  'carpentry',
  'masonry',
  'appliance',
  'exterior',
  'interior',
  'other',
] as const;

export const ACTION = [
  'repair',
  'replace',
  'install',
  'remove',
  'service',
  'evaluate',
] as const;

export type Trade = (typeof TRADE)[number];
export type Action = (typeof ACTION)[number];

/**
 * Physical units a MATERIAL extent can be measured in. `hrs` is
 * deliberately absent — hours are not a physical extent, and the model is
 * structurally unable to emit them as one. This is the extraction half of
 * the v3 unit-discipline contract; `classification/schema.ts` holds the
 * other half (a labor line's unit is always the literal `'hrs'`).
 */
export const EXTENT_UNIT = ['ea', 'lf', 'sf', 'cy'] as const;
export type ExtentUnit = (typeof EXTENT_UNIT)[number];

/**
 * The model's output contract: a WORK ITEM — what the inspector found and
 * wants done, with its physical extent. Not a billable line: costType,
 * material/labor splitting, and hours-estimation are downstream concerns
 * (classification and pricing) the model never sees.
 */
export const extractedWorkItemSchema = z.object({
  /** Stable per-run id, e.g. "item-001". classification re-derives content-addressed ids. */
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  /** Short, specific noun phrase naming what is acted on. */
  scope: z.string().min(1),
  /** Verbatim location language from the report. */
  location: z.string().min(1),
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
   * pricing estimates missing hours downstream. Never invented.
   */
  inspectorHours: z.number().positive().nullable(),
  /** Verbatim excerpt from the report that anchors this item. */
  sourceQuote: z.string().min(8).max(500),
  /** Page hint, strict "p. 14" format. Null when the source shows none. */
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
});

export type ExtractedWorkItem = z.infer<typeof extractedWorkItemSchema>;

export const workItemExtractionSchema = z.object({
  items: z.array(extractedWorkItemSchema),
});

export type WorkItemExtraction = z.infer<typeof workItemExtractionSchema>;
```

#### Reasoning

- Identical in substance to the prior draft's schema section — relocated
  wholesale into the module that owns it, with no other module's types
  mixed in.

---

### `src/features/estimate-extraction-pipeline/extraction/agent.ts`

**Action:** Create
**Why:** The extractor `Agent` + its prompt, scoped to fields the schema
can't type (grounding, field meaning). Internal to the module.

#### After (new file, complete)

```ts
import { Agent } from '@mastra/core/agent';
import { kiloGateway } from '../shared/gateway';
import { extractionConsistencyScorer } from './scorer';

/**
 * The agent has exactly one job: read an inspection PDF and emit every
 * BILLABLE WORK ITEM the inspector explicitly identifies, so downstream
 * modules can classify and price each one. It does not summarize, advise,
 * prioritize, split into material/labor, or estimate hours or cost.
 *
 * Internal to the extraction module — only extraction/index.ts calls
 * `.generate()` on this. The feature's own index.ts imports this instance
 * ONLY via extraction/index.ts's re-export, for Studio registration.
 */
export const billableItemExtractorAgent = new Agent({
  id: 'billable-item-extractor',
  name: 'Billable Item Extractor',
  instructions: `
You read a home inspection PDF and emit a flat list of BILLABLE WORK ITEMS so
downstream systems can classify and price each one against local market data.

DEFINITION
A "billable item" is a discrete action a contractor would quote: a repair,
replacement, installation, removal, service call, or specialist evaluation
that the inspector explicitly recommends, OR that the inspector explicitly
states is defective and needs work. If the inspector did not call for an
action and did not flag a defect, it is NOT a billable item. Background
descriptions, condition observations, age statements, system overviews, and
code-of-the-day commentary are NOT billable items.

GROUNDING TESTS (apply to every candidate item before you emit it)
A. The Ctrl-F test. Pretend the contractor never reads the report — they
   only see your "sourceQuote". If a contractor reads just that one
   string out of context, can they tell exactly what defect to fix and
   where it is? If not, the quote is too vague or too long. Go back to the
   report and pick a tighter, still-verbatim excerpt that names both the
   defect and the action in the same sentence.
B. The contractor-work-order test. The same "sourceQuote" string should be
   pasteable into a contractor's work order as the job description, with
   "scope" and "location" already filled in. If a contractor would scratch
   their head at the quote, the item is not ready to emit.

HARD RULES
1. GROUNDED ONLY. Every emitted item must quote the inspector's exact wording
   in "sourceQuote". No paraphrase, no merging of separate sentences, no
   inference. If you cannot quote the inspector for an item, do not emit it.
2. ONE ITEM PER FIX. If the inspector lists two distinct fixes (e.g. "replace
   the angle stop AND re-secure the supply line"), emit TWO items. If a
   candidate would name two different physical components (e.g. "trim or
   wood siding"), split into two items, one per component.
3. NO PROSE, NO NARRATIVE, NO DESCRIPTIONS. Do not describe the home, the
   property, the roof's overall condition, system overviews, brand histories,
   or code background. If a sentence is descriptive rather than actionable,
   skip it.
4. NO ADVICE, NO PRIORITIZATION, NO SEVERITY. Do not add "recommended",
   "urgent", "consider", or any judgment the inspector did not write.
5. NO PRICING, EVER, AND NO HOUR ESTIMATION. No dollars, no ranges, no
   "market rate", no "typical cost". `inspectorHours` is filled ONLY when
   the inspector explicitly stated an hour count — never your own estimate.
6. WHEN UNSURE, OMIT. But "unsure" means the sentence is DESCRIPTIVE rather
   than actionable. It does NOT mean "I'm not sure which trade would do it"
   — use "other" in that case. A real billable item with an awkward trade
   classification is still billable.
7. NO INVENTION of trades, parts, quantities, scope, or location wording.
   Only emit fields the inspector wrote or which are directly and obviously
   implied by the inspector's verbatim wording.

FIELDS YOU MUST PRODUCE PER ITEM
- id: stable per-run identifier like "item-001", "item-002" in order.
- trade: one of electrical, plumbing, hvac, roofing, structural, carpentry,
  masonry, appliance, exterior, interior, other. Pick the trade that would
  actually do the work. Use "other" freely when the work is real but doesn't
  fit cleanly into a single trade.
- action: one of repair, replace, install, remove, service, evaluate.
  "service" is for recurring maintenance the inspector explicitly called out
  (filter changes, dryer vent cleaning). "evaluate" is for specialist
  inspections (heat exchanger leak test, permit verification).
- scope: a short noun phrase naming the item. Be specific enough that a
  contractor knows exactly what to quote.
  NEVER emit a bare trade-category word as scope — "siding", "foundation",
  "chimney", "receptacles", "plumbing", "roof" are NOT valid scope on
  their own. Find the actual noun phrase from the inspector's sentence.
  BAD -> GOOD:
    "siding" -> "loose siding panel" / "damaged siding board"
    "foundation" -> "foundation moisture intrusion" / "foundation crack"
    "chimney" -> "leaning chimney structure" / "chimney movement"
    "receptacles" -> "loose wall receptacle" / "ungrounded receptacle"
  If the report's wording is genuinely too vague to produce a real noun
  phrase, omit the item rather than emit a one-word category label.
- location: verbatim location language from the report. e.g. "Kitchen",
  "Roof — north slope", "Basement — northeast corner".
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
  estimate hours yourself.
- sourceQuote: a verbatim excerpt from the report that anchors this item.
  Must be between 8 and 500 characters. Pick the SHORTEST verbatim excerpt
  that still names both the defect and the action in the same sentence.
- pageHint: page number in the strict format "p. 14". Copy it from the page
  header in the source text. NEVER guess — return null if none is shown.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly. The
schema contains a single field "items" which is an array of work items. If
the report contains no billable items, return { "items": [] }.

Do not include any commentary, explanation, preamble, or text outside the
JSON.
`,
  model: kiloGateway('openai/gpt-5.4-mini'),
  scorers: {
    consistency: {
      scorer: extractionConsistencyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
});
```

#### Reasoning

- The unit-conventions paragraph that used to teach material-type → unit
  mapping is gone: the schema's `EXTENT_UNIT` enum plus one line
  ("the unit that material is sold or measured in") is now sufficient,
  because a physical unit is all this field can ever be. No prompt
  paragraph is doing the type system's job anymore.

---

### `src/features/estimate-extraction-pipeline/extraction/scorer.ts`

**Action:** Create
**Why:** Background LLM-judge, scoped to exactly what a judge without
document access can honestly assess.

#### After (new file, complete)

```ts
import { createScorer } from '@mastra/core/evals';
import { z } from 'zod';
import { kiloGateway } from '../shared/gateway';

/**
 * Background LLM-judge scorer for the billable-item extractor.
 *
 * Judges what is judgeable WITHOUT the source document (the judge sees
 * only the extractor's emitted items, never the PDF):
 *
 *   1. Internal consistency — does each item's verbatim sourceQuote name
 *      the defect and action the item claims in scope/action/trade?
 *   2. Compound scopes — one item naming two distinct physical components
 *      ("trim or wood siding"), a ONE-ITEM-PER-FIX violation.
 *
 * Completeness ("did the extractor MISS defects?") is NOT judged here — it
 * requires the source document, which this scorer does not receive. That
 * capability belongs in this same slot once a text-extraction layer exists
 * to hand the judge that text (see the parked Docling transport plan).
 */
const analyzeOutputSchema = z.object({
  itemCount: z.number().int().min(0),
  inconsistentItemIds: z.array(z.string()),
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

- `itemCount` comes entirely from the judge's own read of `run.output` —
  no cast or shape assumption is made about the run-data type on the
  scoring side.

---

### `src/features/estimate-extraction-pipeline/extraction/index.ts`

**Action:** Create
**Why:** THE DOOR. The only file any other module or the pipeline may
import from this folder.

#### After (new file, complete)

```ts
import { RequestContext } from '@mastra/core/request-context';
import { billableItemExtractorAgent } from './agent';
import { workItemExtractionSchema, type ExtractedWorkItem } from './schema';

export type { ExtractedWorkItem };
/** Re-exported for Studio registration ONLY — no module calls this directly. */
export { billableItemExtractorAgent };

export interface ExtractWorkItemsInput {
  estimateRequestId: string;
  fileUrl: string;
}

export interface ExtractWorkItemsOutput {
  workItems: ExtractedWorkItem[];
}

/**
 * THE EXTRACTION API. Reads one inspection PDF, returns every grounded
 * billable work item the inspector identifies.
 *
 * ONE ATTEMPT. Throws on any failure — malformed structured output, empty
 * response, transport error. Retrying is an orchestration decision
 * (`pipeline.ts`'s `retries: 2` on the step that wraps this call), not
 * something this function decides for itself.
 */
export async function extractWorkItems(
  input: ExtractWorkItemsInput,
): Promise<ExtractWorkItemsOutput> {
  const result = await billableItemExtractorAgent.generate(
    [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Extract every billable work item from this inspection report. ' +
              'Follow the rules in your instructions exactly. When in doubt, omit. ' +
              'Return JSON matching the provided schema.',
          },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: new URL(input.fileUrl),
          },
        ],
      },
    ],
    {
      structuredOutput: { schema: workItemExtractionSchema },
      requestContext: new RequestContext([
        ['estimateRequestId', input.estimateRequestId],
      ]),
    },
  );

  const extraction = result.object;
  if (!extraction) {
    throw new Error('Extraction returned no structured object');
  }
  return { workItems: extraction.items };
}
```

#### Reasoning

- Every export here is either the one function, its input/output types, or
  an instance re-exported explicitly for registration. Nothing else is
  reachable from outside this folder.

---

### `src/features/estimate-extraction-pipeline/classification/schema.ts`

**Action:** Create
**Why:** The v3 unit-discipline invariant as a discriminated union, plus the
pending (labor-hours-not-yet-resolved) shape pricing consumes.

#### After (new file, complete)

```ts
import { z } from 'zod';
import { TRADE, ACTION, EXTENT_UNIT } from '../extraction/schema';

const itemIdentityFields = {
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  sourceQuote: z.string().min(8).max(500),
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
} as const;

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
  hoursSource: z.enum(['inspector', 'estimated', 'fallback']),
});

/**
 * A v3 billable line. Discriminated union = the v3 prototype's unit
 * discipline as a TYPE: "every Labor row uses HRS ... HRS never appears
 * on a Material row; EA/SF/LF/CY never appear on a Labor row." A violating
 * line is unrepresentable, not merely invalid.
 */
export const billableLineSchema = z.discriminatedUnion('costType', [
  materialLineSchema,
  laborLineSchema,
]);

export type MaterialLine = z.infer<typeof materialLineSchema>;
export type LaborLine = z.infer<typeof laborLineSchema>;
export type BillableLine = z.infer<typeof billableLineSchema>;

/**
 * A labor line whose hours are not yet resolved (null = pricing must
 * resolve them). Material lines are always complete leaving classification.
 * This is classification's OUTPUT to pricing — pricing's input type.
 */
export const pendingLaborLineSchema = laborLineSchema.extend({
  quantity: z.number().multipleOf(0.25).min(0.25).nullable(),
  hoursSource: z.enum(['inspector', 'estimated', 'fallback']).nullable(),
});

export const pendingLineSchema = z.discriminatedUnion('costType', [
  materialLineSchema,
  pendingLaborLineSchema,
]);

export type PendingLaborLine = z.infer<typeof pendingLaborLineSchema>;
export type PendingLine = z.infer<typeof pendingLineSchema>;
```

#### Reasoning

- Importing `TRADE`/`ACTION`/`EXTENT_UNIT` from `../extraction/schema`
  looks like it crosses the one-door rule — it does not: those are enum
  VALUE lists (data, not logic), and `extraction/schema.ts` is imported
  here directly because classification is the one place allowed to depend
  on extraction's OUTPUT shape by construction (it is extraction's direct
  downstream consumer). The rule is "don't reach into a module's internals
  from OUTSIDE its consumer relationship" — classification consuming
  extraction's declared output contract is exactly the relationship the
  whole plan is built to allow, not an exception to it. (If this reads as
  uncomfortable, the alternative — redeclaring `TRADE`/`ACTION` a second
  time here — is the actual anti-pattern: hand-duplicated enums that WILL
  drift. `pipeline.ts` and the caller still only ever import from
  `extraction/index.ts` and `classification/index.ts`, never `schema.ts`
  directly.)

---

### `src/features/estimate-extraction-pipeline/classification/rules.ts`

**Action:** Create
**Why:** Deterministic split/pricing-basis policy, owned by classification
because classification is what applies it.

#### After (new file, complete)

```ts
import type { Action } from '../extraction/schema';
import type { CostType } from './schema-types';

/**
 * Whether an action implies ONLY labor, or BOTH a material purchase and
 * labor to install/replace it. Deterministic, not a model judgment call:
 * `repair`, `service`, `evaluate`, `remove` never involve buying a new
 * part; `install`/`replace` always do.
 */
export const ACTION_COST_PROFILE: Readonly<Record<Action, 'labor-only' | 'material-and-labor'>> = {
  repair: 'labor-only',
  service: 'labor-only',
  evaluate: 'labor-only',
  remove: 'labor-only',
  install: 'material-and-labor',
  replace: 'material-and-labor',
};

/**
 * What the pricer's number must cover for one line. Derived
 * deterministically from (action, costType):
 *
 *   - 'material-part-only'   — material half of an install/replace pair.
 *     Price the part per physical unit; the sibling labor line covers
 *     installation.
 *   - 'labor-install-hourly' — labor half of an install/replace pair.
 *     HOURLY RATE for installing the sibling part; exclude the part cost.
 *   - 'labor-all-in-hourly'  — labor-only actions. No material sibling, so
 *     the hourly rate must be the all-in rate a contractor quotes: labor
 *     PLUS incidental materials PLUS disposal where the action implies it.
 */
export type PricingBasis = 'material-part-only' | 'labor-install-hourly' | 'labor-all-in-hourly';

export function pricingBasisFor(action: Action, costType: CostType): PricingBasis {
  if (costType === 'material') return 'material-part-only';
  return ACTION_COST_PROFILE[action] === 'labor-only'
    ? 'labor-all-in-hourly'
    : 'labor-install-hourly';
}
```

Add to `classification/schema.ts` (small addition, not a new file) a
`schema-types.ts`-free alternative: **simpler** — declare `CostType`
directly in `schema.ts` instead of a separate file:

```ts
// In classification/schema.ts, near the top, after the imports:
export const COST_TYPE = ['labor', 'material'] as const;
export type CostType = (typeof COST_TYPE)[number];
```

(and `rules.ts`'s import becomes `import type { CostType } from './schema';`
— the `schema-types.ts` mentioned above is NOT created; this note replaces
it with the simpler single-file placement.)

#### Reasoning

- `pricingBasisFor` is a pure function of two enums — no I/O, no
  side-effect, safe to call from `pricing/` as classification's declared
  API (re-exported through `classification/index.ts`, never imported from
  `rules.ts` directly).

---

### `src/features/estimate-extraction-pipeline/classification/index.ts`

**Action:** Create
**Why:** THE DOOR. Pure, deterministic dedup + expansion; the only
consumer-facing surface of classification.

#### After (new file, complete)

```ts
import { createHash } from 'crypto';
import type { ExtractedWorkItem } from '../extraction';
import {
  billableLineSchema,
  pendingLineSchema,
  type BillableLine,
  type PendingLine,
} from './schema';
import { ACTION_COST_PROFILE, pricingBasisFor, type PricingBasis } from './rules';
import { roundToQuarter } from '../shared/quarter-hour';

export type { BillableLine, PendingLine, PricingBasis };
export { pricingBasisFor };
export { billableLineSchema, pendingLineSchema };

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function structuralKey(it: ExtractedWorkItem): string {
  return [it.trade, it.action, norm(it.scope), norm(it.location)].join('|');
}

/** Content-addressable id — stable across re-runs of the same input. */
function generateItemId(it: ExtractedWorkItem): string {
  const seed = `${it.trade}-${it.action}-${it.scope}-${it.location}`.toLowerCase();
  return 'item-' + createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

/**
 * Scope safety net: a bare category word ("Siding") or a full sentence is
 * not a billable scope. Violations are dropped, never rendered.
 */
function scopeIsRenderable(scope: string): boolean {
  const tokens = scope.trim().split(/\s+/);
  if (tokens.length < 2) return false;
  return !/[.!?]/.test(scope);
}

export interface ClassifyLinesOutput {
  lines: PendingLine[];
}

/**
 * THE CLASSIFICATION API. Deterministic: dedup work items, drop unrenderable
 * scopes, assign stable ids, split install/replace into material+labor per
 * ACTION_COST_PROFILE. Pure — no I/O, no AI, never throws on valid input.
 */
export function classifyLines(workItems: readonly ExtractedWorkItem[]): ClassifyLinesOutput {
  const seenQuotes = new Set<string>();
  const seenKeys = new Set<string>();
  const deduped: ExtractedWorkItem[] = [];

  for (const it of workItems) {
    const qKey = norm(it.sourceQuote);
    const kKey = structuralKey(it);
    if (seenQuotes.has(qKey) || seenKeys.has(kKey)) continue;
    seenQuotes.add(qKey);
    seenKeys.add(kKey);
    deduped.push(it);
  }

  const renderable = deduped.filter((it) => scopeIsRenderable(it.scope));
  const lines: PendingLine[] = [];

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
    const inspectorHours = it.inspectorHours === null ? null : roundToQuarter(it.inspectorHours);
    const isSplit = ACTION_COST_PROFILE[it.action] === 'material-and-labor';

    if (isSplit) {
      lines.push({
        ...common,
        id: `${id}-material`,
        costType: 'material',
        quantity: it.extent.quantity,
        unit: it.extent.unit,
      });
    }
    lines.push({
      ...common,
      id: isSplit ? `${id}-labor` : id,
      costType: 'labor',
      unit: 'hrs',
      quantity: inspectorHours,
      hoursSource: inspectorHours === null ? null : 'inspector',
    });
  }

  return { lines };
}
```

#### Reasoning

- `billableLineSchema` is re-exported here (not defined here) so `pricing/`
  and the caller import the TYPE from classification's one door, never from
  `classification/schema.ts` directly.
- `import type { ExtractedWorkItem } from '../extraction'` — resolves to
  `extraction/index.ts` (the barrel), not `extraction/schema.ts`. This is
  the mechanically-checkable form of the one-door rule: the import
  specifier is the folder, never a deeper path.

---

### `src/features/estimate-extraction-pipeline/pricing/schema.ts`

**Action:** Create
**Why:** Pricing's model-facing response contract and its module output
type (`PricedLineItem`).

#### After (new file, complete)

```ts
import { z } from 'zod';

const priceEvidenceFields = {
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1).max(120),
  unavailableReason: z.string().min(1).max(280).nullable(),
} as const;

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

/** Response for a MATERIAL line: price of the part per physical unit. */
export const materialPriceResponseSchema = z
  .object({
    unitPrice: z.number().int().min(0).nullable(),
    ...priceEvidenceFields,
  })
  .superRefine((r, ctx) => xorUnavailable(r.unitPrice, r.unavailableReason, ctx));

export type MaterialPriceResponse = z.infer<typeof materialPriceResponseSchema>;

/** Response for a LABOR line: an HOURLY RATE plus the hours the job takes. */
export const laborPriceResponseSchema = z
  .object({
    hourlyRate: z.number().int().min(0).nullable(),
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

/** Pricing's module output per line — the persisted price record. */
export const pricedLineItemSchema = z.object({
  itemId: z.string().min(1),
  unitPrice: z.number().int().min(0).nullable(),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1).max(120),
  unavailableReason: z.string().min(1).max(280).nullable(),
});

export type PricedLineItem = z.infer<typeof pricedLineItemSchema>;
```

---

### `src/features/estimate-extraction-pipeline/pricing/agent.ts`

**Action:** Create
**Why:** The pricer `Agent` + prompt. Internal to the module.

#### After (new file, complete)

```ts
import { Agent } from '@mastra/core/agent';
import { kiloGateway } from '../shared/gateway';

/**
 * The pricer has exactly one job: given ONE billable line and a zip code,
 * return a single defensible price — a per-unit material price, or an
 * hourly labor rate plus the hours the job takes — or null. It never
 * hallucinates a price.
 *
 * Internal to the pricing module — only pricing/price-line.ts calls
 * `.generate()` on this.
 */
export const itemPricerAgent = new Agent({
  id: 'item-pricer',
  name: 'Item Pricer',
  instructions: `
You price ONE billable line from a home-repair estimate, scoped to the US
zip code provided. You NEVER invent a price.

INPUT
The user message names the trade, action, scope, location, the cost type
(labor | material), the pricingBasis, the physical extent of the work, any
inspector-stated hours, the inspector's verbatim sourceQuote, and a zip
code. Treat the sourceQuote as authoritative. costType and pricingBasis are
computed facts; obey them exactly. The structured-output schema you are
given differs by costType — match it exactly.

OUTPUT
MATERIAL lines: unitPrice (integer whole USD, or null), currency, confidence,
source, unavailableReason.
LABOR lines: hourlyRate (integer whole USD/hr, or null), estimatedHours
(number, required whenever hourlyRate is returned), currency, confidence,
source, unavailableReason.

HARD RULES
1. NEVER hallucinate a price. If you lack a defensible number for this work
   in this zip code, return null with a one-sentence unavailableReason.
2. NEVER invent a citation. "source" is a coarse label ("national average",
   "trade rule-of-thumb"), never a URL.
3. NEVER produce a range. Pick a single integer or null.
4. Local area means the SUPPLIED zip code. A national average is acceptable
   with confidence = "low" and that noted in source.
5. MATERIAL lines ("material-part-only"): unitPrice is the price of the part
   PER PHYSICAL UNIT named in the extent. Include NO labor charge.
6. LABOR lines: hourlyRate is a whole-USD-per-hour rate for that trade in
   that zip code; estimatedHours is how many hours the described work takes
   for the stated extent. If inspector-stated hours were provided in the
   input, return your own estimate anyway — the caller decides which to use.
   - "labor-install-hourly": rate for installing the sibling material
     line's part. Include NO part cost.
   - "labor-all-in-hourly": no material sibling — the rate must be the
     all-in rate a contractor quotes: labor PLUS incidental materials PLUS
     haul-away/disposal where the action implies it.
7. Better to admit ignorance than overbill or underbill blindly.
8. confidence reflects how well-grounded your number is: "high" only for a
   defensible local-market number; "medium" regional/state; "low" national
   average or rule-of-thumb.

Do not include any commentary, explanation, preamble, or text outside the
JSON.
`,
  model: kiloGateway('openai/gpt-5.4-mini'),
});
```

---

### `src/features/estimate-extraction-pipeline/pricing/price-line.ts`

**Action:** Create
**Why:** Prices exactly one line. Internal — never imported outside
`pricing/`; `pricing/workflow.ts` is its only caller.

#### After (new file, complete)

```ts
import { createStep } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { billableLineSchema, pendingLineSchema, type BillableLine } from '../classification';
import { itemPricerAgent } from './agent';
import {
  laborPriceResponseSchema,
  materialPriceResponseSchema,
  pricedLineItemSchema,
} from './schema';
import { roundToQuarter } from '../shared/quarter-hour';
import { pricingBasisFor } from '../classification';

/**
 * Price ONE billable line. Internal step — `pricing/workflow.ts` is the
 * only thing that runs this, via `.foreach`.
 *
 * Resilience: a per-line failure records a 'lookup-failed' price and a
 * fallback-complete line rather than throwing, so one bad line never fails
 * the whole `.foreach` batch.
 *
 * Labor-hours resolution: inspector-stated (already on the pending line) →
 * pricer's estimatedHours, quarter-rounded → neither present → 1 hour
 * fallback with a null price (never a fabricated total).
 */
export const priceLineStep = createStep({
  id: 'price-line',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    line: pendingLineSchema,
  }),
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
      const schema =
        line.costType === 'material' ? materialPriceResponseSchema : laborPriceResponseSchema;
      const result = await itemPricerAgent.generate(
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
          ? {
              ...line,
              quantity: line.quantity ?? 1,
              hoursSource: line.quantity !== null ? 'inspector' : 'fallback',
            }
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

- `import { billableLineSchema, pendingLineSchema, pricingBasisFor } from '../classification'`
  — every classification symbol pricing needs comes through classification's
  ONE door (`index.ts`'s re-exports), never `classification/schema.ts` or
  `classification/rules.ts` directly. This file is the concrete proof the
  boundary holds even where two modules must share a type.

---

### `src/features/estimate-extraction-pipeline/pricing/workflow.ts`

**Action:** Create
**Why:** The concurrency fan-out — internal, invisible outside `pricing/`.

#### After (new file, complete)

```ts
import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { billableLineSchema, pendingLineSchema } from '../classification';
import { pricedLineItemSchema } from './schema';
import { priceLineStep } from './price-line';

/** How many pricer calls run concurrently. An internal throughput knob. */
const PRICING_CONCURRENCY = 3;

/**
 * Internal fan-out workflow: prices every pending line concurrently. NOT
 * exported outside this folder — pricing/index.ts is the only caller.
 */
export const pricingFanoutWorkflow = createWorkflow({
  id: 'pricing-fanout',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    lines: z.array(pendingLineSchema),
  }),
  outputSchema: z.array(
    z.object({ line: billableLineSchema, price: pricedLineItemSchema }),
  ),
})
  .map(async ({ inputData }) =>
    inputData.lines.map((line) => ({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      line,
    })),
  )
  .foreach(priceLineStep, { concurrency: PRICING_CONCURRENCY })
  .commit();
```

---

### `src/features/estimate-extraction-pipeline/pricing/index.ts`

**Action:** Create
**Why:** THE DOOR. Runs the internal fan-out, returns the assembled result.

#### After (new file, complete)

```ts
import { billableLineSchema, pendingLineSchema, type BillableLine, type PendingLine } from '../classification';
import { pricedLineItemSchema, type PricedLineItem } from './schema';
import { pricingFanoutWorkflow } from './workflow';
import { itemPricerAgent } from './agent';

export type { PricedLineItem };
export { pricedLineItemSchema, billableLineSchema };
/** Re-exported for Studio registration ONLY — no module calls this directly. */
export { itemPricerAgent };

export interface PriceLinesInput {
  estimateRequestId: string;
  zipCode: string;
  lines: PendingLine[];
}

export interface PriceLinesOutput {
  lines: BillableLine[];
  prices: PricedLineItem[];
}

/**
 * THE PRICING API. Prices every pending line (concurrency is this module's
 * own concern — see workflow.ts). Per-line failures degrade gracefully
 * inside price-line.ts and never surface here as a throw; this function
 * throws only if the internal run cannot even start.
 */
export async function priceLines(input: PriceLinesInput): Promise<PriceLinesOutput> {
  const run = await pricingFanoutWorkflow.createRun();
  const result = await run.start({
    inputData: {
      estimateRequestId: input.estimateRequestId,
      zipCode: input.zipCode,
      lines: input.lines,
    },
  });
  if (result.status !== 'success') {
    throw new Error(`pricing-fanout workflow ended non-success: ${result.status}`);
  }
  return {
    lines: result.result.map((r) => r.line),
    prices: result.result.map((r) => r.price),
  };
}
```

#### Reasoning

- Everything pricing needs from classification (`billableLineSchema`,
  `pendingLineSchema`, the `BillableLine`/`PendingLine` types) is imported
  from `'../classification'` — the barrel — in every file across this
  module, never from a deeper path.

---

### `src/features/estimate-extraction-pipeline/pipeline.ts`

**Action:** Create
**Why:** The composition root. Pure wiring — three one-line adapter steps.

#### After (new file, complete)

```ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractWorkItems } from './extraction';
import { extractedWorkItemSchema } from './extraction/schema';
import { classifyLines, billableLineSchema, pendingLineSchema } from './classification';
import { priceLines } from './pricing';
import { pricedLineItemSchema } from './pricing/schema';

/**
 * The composition root. Every stage below is a one-line adapter calling
 * exactly one module's door function — this file contains NO business
 * logic. To understand what a stage DOES, read that module's index.ts.
 */

const extractStep = createStep({
  id: 'extract',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    workItems: z.array(extractedWorkItemSchema),
  }),
  retries: 2,
  execute: async ({ inputData }) => {
    const { workItems } = await extractWorkItems({
      estimateRequestId: inputData.estimateRequestId,
      fileUrl: inputData.fileUrl,
    });
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      workItems,
    };
  },
});

const classifyStep = createStep({
  id: 'classify',
  inputSchema: extractStep.outputSchema,
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    lines: z.array(pendingLineSchema),
  }),
  execute: async ({ inputData }) => {
    const { lines } = classifyLines(inputData.workItems);
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines,
    };
  },
});

const priceStep = createStep({
  id: 'price',
  inputSchema: classifyStep.outputSchema,
  outputSchema: z.object({
    lines: z.array(billableLineSchema),
    prices: z.array(pricedLineItemSchema),
  }),
  execute: async ({ inputData }) =>
    priceLines({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines: inputData.lines,
    }),
});

export const summarizeEstimateWorkflow = createWorkflow({
  id: 'summarize-estimate',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  outputSchema: priceStep.outputSchema,
})
  .then(extractStep)
  .then(classifyStep)
  .then(priceStep)
  .commit();
```

#### Reasoning

- Note the import shape: `extractWorkItems` from `./extraction` (the door),
  but `extractedWorkItemSchema` from `./extraction/schema` — this ONE
  exception is necessary because `createStep`'s `outputSchema` needs the
  Zod schema value, not just the inferred type, to build the adapter step's
  own schema. This is a data-shape import (identical in kind to
  classification importing extraction's enums), not a logic reach-through —
  `pipeline.ts` never calls anything in `extraction/agent.ts` or
  `extraction/scorer.ts`. If this exception is judged too permissive on
  review, the alternative is exporting `extractedWorkItemSchema` from
  `extraction/index.ts` too (trivial one-line addition); left as a call for
  the approval pass rather than assumed.

---

### `src/features/estimate-extraction-pipeline/index.ts`

**Action:** Create (moved and adapted from `src/mastra/index.ts`, which is
deleted — see Deletions)
**Why:** Registers the pipeline + module Agents/scorer for Studio. This file
is also the Mastra CLI's entry point once `--dir` targets this folder (see
`package.json`).

#### Before (the file being replaced, at its old path `src/mastra/index.ts`)

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

#### After (new file, complete, at `src/features/estimate-extraction-pipeline/index.ts`)

```ts
import { Mastra } from '@mastra/core/mastra';
import { billableItemExtractorAgent } from './extraction';
import { itemPricerAgent } from './pricing';
import { summarizeEstimateWorkflow } from './pipeline';

/**
 * Registration only. This is the one file in the codebase allowed to
 * import an Agent instance from a module other than the module that owns
 * it — because registering with Studio is Mastra's own framework
 * boundary, not a peer-module dependency. Nothing here calls `.generate()`
 * on either agent; that only ever happens inside extraction/index.ts and
 * pricing/price-line.ts respectively.
 */
export const mastra = new Mastra({
  agents: {
    'billable-item-extractor': billableItemExtractorAgent,
    'item-pricer': itemPricerAgent,
  },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});
```

Every consumer of `mastra` (currently `src/features/estimate/lib/workflow.ts`,
the only caller) updates its import from `'@/mastra'` to
`'@/features/estimate-extraction-pipeline'` — see that file's section below.

---

### Deletions

**Action:** Delete
`src/mastra/index.ts` (superseded by
`src/features/estimate-extraction-pipeline/index.ts`),
`src/mastra/agents/billable-item-extractor.schema.ts`,
`src/mastra/agents/billable-item-extractor.ts`,
`src/mastra/agents/item-pricer.schema.ts`,
`src/mastra/agents/item-pricer.ts`,
`src/mastra/agents/processors/item-contract-guard.ts`,
`src/mastra/agents/processors/item-contract-guard/item-validator.ts`,
`src/mastra/agents/processors/item-contract-guard/item-heuristics.ts`,
`src/mastra/agents/processors/item-contract-guard/cleaner.ts`,
`src/mastra/agents/processors/item-contract-guard/extract-json-from-text.ts`,
`src/mastra/config/agent-rules.ts`,
`src/mastra/workflows/summarize-estimate.ts`,
`src/mastra/workflows/lib/classify-error.ts`,
`src/mastra/workflows/steps/extract-items.ts`,
`src/mastra/workflows/steps/audit-items.ts`,
`src/mastra/workflows/steps/merge-items.ts`,
`src/mastra/workflows/steps/price-items.ts`,
`src/mastra/workflows/steps/mark-processing.ts`,
`src/mastra/workflows/steps/persist-success.ts`,
`src/mastra/workflows/steps/persist-failure.ts`.

**Where each one's logic went:** covered file-by-file above and in the
Modification Table; no logic is discarded, only relocated (except the
`ItemContractGuard` stack and the `failed`/`errorMessage` plumbing, which
are superseded outright — reasoning carried over unchanged from the prior
draft: provider-enforced `response_format` + the discriminated union make
the guard's parse/enum/keyword layers redundant, and throw-based failure
replaces the boolean-flag plumbing).

---

### `src/features/estimate/lib/classify-error.ts`

**Action:** Create (moved verbatim from the deleted
`src/mastra/workflows/lib/classify-error.ts`)

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

### `src/features/estimate/lib/envelope.ts`

**Action:** Modify
**Why:** Now owns the versioned PERSISTENCE format — moved out of the
deleted `billable-item-extractor.schema.ts`, because how the app stores a
result is responsibility #4's concern, not the AI pipeline's.

#### Before

```ts
import {
  summaryEnvelopeSchema,
  summaryEnvelopeV2Schema,
  type SummaryEnvelope,
  type SummaryEnvelopeV2,
} from '@/mastra/agents/billable-item-extractor.schema';

export type ParsedEnvelope =
  | { kind: 'v1'; envelope: SummaryEnvelope }
  | { kind: 'v2'; envelope: SummaryEnvelopeV2 }
  | { kind: 'unparseable'; raw: string }
  | { kind: 'absent' };

export function parseSummaryEnvelope(summary: string | null): ParsedEnvelope {
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

#### After

```ts
import { z } from 'zod';
import { billableLineSchema, type BillableLine } from '@/features/estimate-extraction-pipeline/classification';
import { pricedLineItemSchema, type PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';

/**
 * LEGACY (v1/v2) flat item shape, kept ONLY so rows persisted before this
 * refactor keep parsing and rendering. The v3 pipeline never produces this
 * shape — `BillableLine` (imported above) is what it produces.
 */
const LEGACY_UNIT = ['ea', 'lf', 'sf', 'sqft', 'cy', 'hrs'] as const;
const LEGACY_COST_TYPE = ['labor', 'material'] as const;

export const legacyBillableItemSchema = z.object({
  id: z.string(),
  trade: z.string(),
  action: z.string(),
  scope: z.string().min(1),
  location: z.string().min(1),
  quantity: z.number().int().min(1),
  unit: z.enum(LEGACY_UNIT),
  costType: z.enum(LEGACY_COST_TYPE),
  sourceQuote: z.string().min(8).max(500),
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
});

export type LegacyBillableItem = z.infer<typeof legacyBillableItemSchema>;

export const SUMMARY_ENVELOPE_KIND = 'billable-extraction' as const;

const summaryEnvelopeV1Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(1),
  items: z.array(legacyBillableItemSchema),
});

const summaryEnvelopeV2Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(2),
  items: z.array(legacyBillableItemSchema),
  prices: z.array(pricedLineItemSchema),
});

export const SUMMARY_ENVELOPE_VERSION_3 = 3 as const;

/**
 * v3: discriminated lines + prices. For a labor line, `unitPrice` on the
 * matching price is the HOURLY RATE; the report's quantity × unitPrice
 * arithmetic is hours × rate, per the v3 prototype.
 */
export const summaryEnvelopeV3Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_3),
  lines: z.array(billableLineSchema),
  prices: z.array(pricedLineItemSchema),
});

export type SummaryEnvelopeV3 = z.infer<typeof summaryEnvelopeV3Schema>;

export type ParsedEnvelope =
  | { kind: 'v1'; items: LegacyBillableItem[]; prices: [] }
  | { kind: 'v2'; items: LegacyBillableItem[]; prices: PricedLineItem[] }
  | { kind: 'v3'; lines: BillableLine[]; prices: PricedLineItem[] }
  | { kind: 'unparseable'; raw: string }
  | { kind: 'absent' };

export function parseSummaryEnvelope(summary: string | null): ParsedEnvelope {
  if (summary === null) return { kind: 'absent' };

  let json: unknown;
  try {
    json = JSON.parse(summary);
  } catch {
    return { kind: 'unparseable', raw: summary };
  }

  const v3 = summaryEnvelopeV3Schema.safeParse(json);
  if (v3.success) return { kind: 'v3', lines: v3.data.lines, prices: v3.data.prices };

  const v2 = summaryEnvelopeV2Schema.safeParse(json);
  if (v2.success) return { kind: 'v2', items: v2.data.items, prices: v2.data.prices };

  const v1 = summaryEnvelopeV1Schema.safeParse(json);
  if (v1.success) return { kind: 'v1', items: v1.data.items, prices: [] };

  return { kind: 'unparseable', raw: summary };
}
```

#### Reasoning

- `ParsedEnvelope`'s shape changed from `{ kind, envelope }` to a flattened
  `{ kind, items|lines, prices }` so `estimate-report.tsx` no longer needs
  a `.envelope.items`-vs-`.envelope.lines` branch — the discrimination
  happens once, here, and the renderer just reads `items`/`lines`/`prices`
  uniformly per arm.

---

### `src/features/estimate/components/estimate-report.tsx`

**Action:** Modify
**Why:** Read the flattened `ParsedEnvelope` arms; route v3 `lines`.

#### Before

```ts
  const items = envelope.envelope.items;
  const prices: PricedLineItem[] =
    envelope.kind === 'v2' ? envelope.envelope.prices : [];

  return <ItemsSection items={items} prices={prices} />;
```

#### After

```ts
  const items = envelope.kind === 'v3' ? envelope.lines : envelope.items;
  const prices = envelope.prices;

  return <ItemsSection items={items} prices={prices} />;
```

(Import of `PricedLineItem` changes to
`import type { PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';`.)

---

### `src/features/estimate/components/items-section.tsx`

**Action:** Modify
**Why:** Accept v3 lines; restore the v3 prototype's header copy.

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
import type { LegacyBillableItem } from '@/features/estimate/lib/envelope';
import type { BillableLine } from '@/features/estimate-extraction-pipeline/classification';
import type { PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';

/** v3 lines and legacy v1/v2 items render through the same rows. */
type RenderableItem = LegacyBillableItem | BillableLine;

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
no other change — every field both shapes carry is what the rows already
read.)

---

### `src/features/estimate/lib/format.ts`

**Action:** Modify (types only — no function bodies change)
**Why:** Its type imports point at deleted modules.

Any `import type { BillableItem } from '@/mastra/agents/billable-item-extractor.schema'`
(if present) becomes `import type { LegacyBillableItem } from './envelope'` /
`import type { BillableLine } from '@/features/estimate-extraction-pipeline/classification'` as needed by
each function's parameter type. No formatting LOGIC changes — `formatUnit`,
`formatItemTitle`, `formatScope`, `formatLocation`, `formatTradeLabel`,
`formatCostType` already operate on primitive `string` parameters, not on
the item type itself, so this file likely needs zero edits; verify with a
grep for the deleted import path during implementation.

---

### `src/features/estimate/lib/workflow.ts`

**Action:** Modify
**Why:** The single writer — updated to call `mastra.getWorkflow('summarize-estimate')`
(now `pipeline.ts`'s export) and to build the v3 envelope from the new
`envelope.ts` exports.

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
        console.error(`${errorLabel}: workflow ended non-success:`, result.status);
      }
    } catch (error) {
      console.error(`${errorLabel}:`, error);
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
import { mastra } from "@/features/estimate-extraction-pipeline";
import {
  SUMMARY_ENVELOPE_KIND,
  SUMMARY_ENVELOPE_VERSION_3,
  type SummaryEnvelopeV3,
} from "@/features/estimate/lib/envelope";
import { estimateRequestTable } from "../db/schema";
import { classifyError } from "./classify-error";

interface TriggerSummarizeEstimateParams {
  estimateRequestId: string;
  fileUrl: string;
  errorLabel?: string;
}

/**
 * THE SINGLE WRITER of estimate-row state (responsibility #4). The AI
 * pipeline (`mastra.getWorkflow('summarize-estimate')`, i.e. `pipeline.ts`)
 * is pure — it returns `{ lines, prices }` or its run fails — and this
 * function owns the entire persistence lifecycle:
 *
 *   processing → run the pipeline once → completed (v3 envelope)
 *                                      | failed   (classified message)
 *
 * Nothing else writes this row during a run.
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

---

### `package.json`

**Action:** Modify
**Why:** `jsonrepair`'s only consumer (the deleted guard stack) is gone; the
Mastra CLI needs to be told its entry point moved.

Remove the `"jsonrepair": "^3.14.0",` line. Add two scripts (verified
`--dir` flag usage against the CLI reference — see the Request section):

```json
    "mastra:dev": "mastra dev --dir src/features/estimate-extraction-pipeline",
    "mastra:build": "mastra build --dir src/features/estimate-extraction-pipeline",
```

Run `pnpm install` after removing `jsonrepair`.

## Validation Plan

1. `pnpm exec tsc --noEmit` — clean. Confirms every deleted path
   (`src/mastra/**` in its entirety) has no surviving importer.
2. `pnpm exec eslint` on every created/modified file — clean.
3. **One-door boundary gate (mechanically enforced):**
   ```sh
   PKG=src/features/estimate-extraction-pipeline
   # Only index.ts (or the bare folder specifier) may be imported from
   # outside a module. Any hit below is a boundary violation.
   grep -rn "from '.*\/extraction\/\(schema\|agent\|scorer\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/extraction/"
   grep -rn "from '.*\/classification\/\(schema\|rules\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/classification/"
   grep -rn "from '.*\/pricing\/\(schema\|agent\|price-line\|workflow\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/pricing/"
   ```
   All three must return zero results.
4. **Purity gate (unchanged principle, updated to the feature's new path):**
   `grep -rn "@/db\|@/features/estimate/" src/features/estimate-extraction-pipeline`
   must return zero results — the AI process still imports neither the
   database nor its sibling feature; the dependency runs one way only
   (`estimate` → `estimate-extraction-pipeline`, via the module doors).
5. **Repo-wide dead-path grep:**
   `grep -rn "@/mastra\b\|from ['\"]\.\./\.\./mastra\|ItemContractGuard\|jsonrepair" src`
   must return zero results — confirms no leftover reference to the old
   `src/mastra` location or the deleted guard/repair packages.
6. **Pure-logic checks via `tsx` (no live model):**
   - `classifyLines`: an install work item with extent `{7, 'lf'}` and null
     `inspectorHours` → exactly 2 lines (material `{7, 'lf'}`, labor
     `{null, 'hrs'}`); a repair item with `inspectorHours: 1.3` → 1 labor
     line `{1.25, 'hrs', hoursSource: 'inspector'}`; a bare `"Siding"` scope
     → dropped; duplicate sourceQuotes → one survivor; ids stable across two
     calls with the same input.
   - `billableLineSchema.safeParse` REJECTS a material line with
     `unit: 'hrs'` and a labor line with `unit: 'sf'`.
   - `pricingBasisFor` matrix: material/any → `material-part-only`;
     labor/install|replace → `labor-install-hourly`; labor/repair|service|
     evaluate|remove → `labor-all-in-hourly`.
7. **Live QA via `pnpm dev`** (needs `KILO_API_KEY`): upload a report with
   at least one install/replace and one repair item. Confirm: every LABOR
   row shows `HRS` with a quarter-hour quantity; every MATERIAL row shows
   `EA`/`SF`/`LF`/`CY`; a split pair renders as two differentiated rows;
   line totals = quantity × unitPrice; an unpriced line shows "Price
   unavailable"; old v1/v2 rows on disk still render unchanged.
8. **Failure path:** invalid `KILO_API_KEY` → the `extract` step retries
   (check logs: up to 3 attempts), the run fails, and
   `triggerSummarizeEstimate` writes `failed` with a classified message —
   confirm the row never sticks on `processing`.

## Risk Notes

- **The `extraction/schema` and `classification/schema` cross-imports.**
  Documented at each call site above: classification importing extraction's
  enum lists, and `pipeline.ts` importing `extractedWorkItemSchema`
  directly for step-schema construction, are the two places this plan
  accepts a schema-value import deeper than a module's `index.ts`. Both are
  DATA-shape dependencies between a module and its direct, declared
  downstream consumer — not a reach into unrelated internals. If review
  wants zero exceptions, the fix is one line each (re-export the schema
  value from the upstream module's `index.ts` too); flagged as a call for
  the approval pass rather than silently resolved.
- **Recall regression (carried over, unchanged).** The consistency scorer
  cannot detect missed defects (no document access). Completeness arrives
  with a text-extraction layer in a future scorer revision.
- **`response_format` support at the Kilo gateway is assumed, not proven**
  (carried over, unchanged) — validate live in step 7 before merging;
  `structuredOutput.jsonPromptInjection: true` is the documented fallback.
- **`.foreach` terminal shape inside `pricingFanoutWorkflow`.** Assumes
  `.foreach`'s output is directly usable as the workflow's `outputSchema`
  array; if 1.37.1 wraps it differently, the fix is confined to
  `pricing/workflow.ts` — no other module is affected.
- **Step retries can't discriminate error types** (carried over, unchanged
  tradeoff) — a non-transient failure burns its 2 retries before the run
  fails; accepted in exchange for one clean failure channel.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
