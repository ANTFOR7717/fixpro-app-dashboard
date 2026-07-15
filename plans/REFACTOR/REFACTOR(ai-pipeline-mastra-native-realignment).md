# REFACTOR(ai-pipeline-mastra-native-realignment)

> **Replanned 2026-07-10** against `main` after
> `REFACTOR(pipeline-responsibility-modules).md` merged (PR #22), then
> revised again after a second review pass that (a) reversed one of its
> own proposed deltas for contradicting the codebase's own type
> philosophy, (b) replaced a documentation-only workaround with a real
> SDK-native fix once actually verified against the installed
> `@mastra/core` package instead of assumed, and (c) caught two more
> stale/dead artifacts. See "Reversed from the prior revision" below for
> what changed and why.

## Request

Close the gaps between what the original mastra-native realignment set out
to do and what the responsibility-modules refactor actually shipped.
Standing constraints, unchanged: no hand-rolled mechanical code, no
duplication, no scope creep, no God functions, no invented "consistency"
that costs the architecture precision it already has.

## Current State — what already landed (do not re-plan, do not re-implement)

Everything below shipped to `main` in PR #22 and is live-verified working
(a real estimate ran end-to-end: extraction, classification, pricing,
persistence, rendering):

| Original realignment goal | Landed as |
|---|---|
| v3 unit discipline as a type (labor = literal `'hrs'`, quarter-hours; material = `ea/lf/sf/cy`, never `hrs`) | `classification/schema.ts` discriminated union |
| Model emits WORK ITEMS (extent + inspectorHours; no costType, no hrs) | `extraction/schema.ts` + slimmed prompt in `extraction/agent.ts` |
| Hourly labor pricing (hourlyRate + required estimatedHours) | `pricing/schema.ts` split responses + `pricing/price-line.ts` hours resolution (`inspector → estimated → fallback 1`) |
| Delete ItemContractGuard stack, keyword heuristics, jsonrepair parsing | Deleted; provider `response_format` + the union supersede them |
| Delete blocking Pass-B audit; background LLM-judge scorer instead | `extraction/scorer.ts` (`extraction-consistency`, PDF-blind, honestly scoped) |
| Single-writer persistence; pipeline never touches the DB | `features/estimate/lib/workflow.ts` owns the full row lifecycle |
| `.foreach(concurrency)` pricing fan-out | `pricing/workflow.ts` (internal, unexported) |
| One Kilo gateway instance | `shared/gateway.ts` |
| v3 envelope + v1/v2 legacy parsing | `features/estimate/lib/envelope.ts` |
| Throw-on-failure extraction with real step retries | `extraction/index.ts` (one attempt, throws) + `pipeline.ts` (`retries: 2`) |

**Live-verified facts recorded for future plans** (confirmed on a real run
or against the installed package — not assumed):

1. `response_format` structured output WORKS through the Kilo gateway —
   the prior revision's biggest open risk is closed.
2. Steps of an internal workflow run standalone via `.createRun()` (never
   registered on the `Mastra` instance) receive **`undefined`** as their
   `mastra` execute-context — `mastra.getLogger()` there crashed in
   production before the try/catch could contain it.
3. **`createLogger({ name, level?, transports? })` from
   `@mastra/core/logger` constructs a `ConsoleLogger` with zero external
   dependency** (verified against `node_modules/@mastra/core/dist/logger/
   default-logger.d.ts`) — same `.warn(message, ...args)` shape a step's
   injected `mastra.getLogger()` returns. This is the SDK-native way to
   log from code that never gets an execute-context, and is what this
   plan uses (see Delta 3) — `console.warn` was a workaround, not the
   right answer.
4. **`@mastra/core/utils`'s full export list has no id-generation, hash,
   or dedup primitive** (verified: `checkEvalStorageFields,
   createMastraProxy, deepEqual, deepMerge, delay, ensureSerializable,
   ensureToolProperties, generateEmptyFromSchema, getNestedValue,
   isCoreMessage, isUiMessage, isZodType, makeCoreTool, makeCoreToolV5,
   maskStreamTags, omitKeys, parseFieldKey, parseSqlIdentifier,
   removeUndefinedValues, resolveSerializedZodOutput, safeStringify,
   selectFields, setNestedValue, getZodDef, getZodTypeName, isZodArray,
   isZodObject, fetchWithRetry` — generic object/schema utilities, none of
   them id/hash/dedup). `classification/index.ts`'s sha256 content-address
   ids, dedup sets, and scope filter have no SDK equivalent to replace
   them with; they are genuinely "trivial data normalization," the one
   category of hand-written code this project's own constraint sanctions.

## Reversed from the prior revision (read before implementing)

- **Dropped: widening `envelope.ts`'s v1 `prices` type from `[]` to
  `PricedLineItem[]`.** On review this was backwards: a v1 envelope
  predates pricing existing at all, so a v1 row carrying prices is
  impossible, and the literal `[]` type makes that invalid state
  unrepresentable — exactly the philosophy the classification
  discriminated union is built on. "Consistency with v2/v3" was a style
  argument against the architecture's own principle for zero benefit
  (`[]` already satisfies `PricedLineItem[]` at every call site). Not
  reintroduced; recorded so it isn't proposed again.
- **Replaced: "document `console.warn` as the accepted workaround" →
  "use the SDK's own logger primitive."** The prior revision treated the
  unregistered-workflow no-context problem as something to route around
  with a plain `console.warn` plus an AGENTS.md warning label. That was
  under-researched — `@mastra/core/logger` ships exactly the class
  (`ConsoleLogger`, via `createLogger`) this needs, with no dependency on
  workflow registration. Delta 3 below replaces `console.warn` with it.

## The remaining deltas (this plan's entire scope)

1. **Close the two "documented exception" deep imports — zero-exception
   one-door boundary — and remove one dead re-export found in the same
   sweep.** The landed plan allowed `pipeline.ts` and
   `classification/{schema,rules}.ts` to import `extraction/schema.ts`
   directly, flagging the fix as "one line each: re-export the schema
   value from the upstream module's `index.ts`." Apply exactly that fix.
   Separately: `pricing/index.ts` re-exports `billableLineSchema` — a
   *classification*-owned contract — through pricing's door, and nothing
   anywhere imports it from there (every real consumer, including
   `envelope.ts`, already goes through `classification`'s own door). A
   second door to the same contract is the mirror image of the deep-import
   problem this delta fixes; delete the dead re-export.
2. **Register the consistency scorer on the `Mastra` instance.** The
   original plan registered it; the responsibility-modules implementation
   dropped it. Without registration, Studio cannot list the scorer or its
   results. One import, one config key.
3. **Replace `console.warn` in `pricing/price-line.ts` with the SDK's own
   logger primitive.** New file `shared/logger.ts` wraps
   `createLogger` from `@mastra/core/logger` in a one-line factory
   (`createModuleLogger(name)`); `price-line.ts` constructs one named
   logger at module scope and calls `.warn(...)` on it — same call
   shape as before, same console visibility your review said is good,
   now through the actual SDK class instead of a bare global. The
   internal fan-out workflow itself stays unregistered (see Pattern
   Audit for why that's still correct) — this delta fixes HOW it logs
   without exposing pricing's private implementation detail on the
   Mastra instance.
4. **Fix two stale/false artifacts.** `format.ts`'s `formatUnit` comment
   cites the deleted `merge-items.ts` and argues the PRE-v3 rationale
   ("the removed prototype rule that forced HRS … misstated those
   rates") — the opposite of the v3 invariant the type system now
   enforces. `estimate-report.tsx`'s header doc comment still sketches
   the pre-v3 layout with a verb-prefixed title ("Replace damaged
   drywall section") that matches neither the current noun-title
   convention nor the trade-grouped grid actually rendered. Both get
   rewritten to describe what the code does today.
5. **Realign `AGENTS.md`'s stack guidance** — without creating a new
   staleness trap. It still instructs "resilient-step returns + `.branch()`
   for failure routing" (deliberately retired) and names
   `@mastra/core@1.32.x` (installed: 1.37.1). The rewrite:
   - States the one-door/purity rules and the failure model, with the
     three boundary/purity greps **inlined directly in AGENTS.md** rather
     than referenced by this plan document's filename — plan documents
     are session artifacts that get archived or superseded (this file is
     itself the second revision of one); permanent agent guidance must
     not depend on a transient doc still existing at a stable path.
   - States the Mastra version as "see `package.json`" instead of a
     version string, so the NEXT bump doesn't recreate the exact
     staleness this delta is fixing.
   - Records the SDK-native-logger rule (`createModuleLogger`, not
     `console.*`, not `mastra.getLogger()`) for any future code that runs
     outside a registered step's context.

Explicitly **out of scope** (considered, rejected — see Pattern Audit):
widening `envelope.ts`'s v1 `prices` type (reversed above), Mastra storage
for scorer persistence, a recall/completeness judge (needs document text —
parked with the Docling plan), CI automation of the boundary greps, and
any restructuring of working modules.

## Directory Map

```text
falcon-bighorn/
├── REFACTOR(ai-pipeline-mastra-native-realignment).md      [REWRITE] this document
├── AGENTS.md                                                [MODIFY] stack guidance realigned; greps inlined; version unpinned
└── src/features/
    ├── estimate-extraction-pipeline/
    │   ├── extraction/index.ts                              [MODIFY] door exports schema value + enums + Action type + scorer
    │   ├── classification/schema.ts                         [MODIFY] import enums via '../extraction' (the door)
    │   ├── classification/rules.ts                          [MODIFY] import Action type via '../extraction' (the door)
    │   ├── pipeline.ts                                      [MODIFY] import extractedWorkItemSchema via './extraction' (the door)
    │   ├── pricing/index.ts                                 [MODIFY] delete dead billableLineSchema re-export
    │   ├── pricing/price-line.ts                            [MODIFY] createModuleLogger(...) replaces mastra.getLogger()/console.warn
    │   ├── shared/logger.ts                                 [CREATE] SDK-native logger factory (createLogger wrapper)
    │   └── index.ts                                         [MODIFY] register the consistency scorer
    └── estimate/
        ├── lib/format.ts                                    [MODIFY] formatUnit doc comment rewritten to v3 truth
        └── components/estimate-report.tsx                  [MODIFY] header doc comment rewritten to v3 truth
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `extraction/index.ts` | Modify | The door carries extraction's COMPLETE public contract: add `TRADE`, `ACTION`, `EXTENT_UNIT`, `extractedWorkItemSchema`, `type Action`, and the scorer instance (registration-only export, same convention as the agent). |
| `classification/schema.ts` | Modify | One import specifier: `'../extraction/schema'` → `'../extraction'`. |
| `classification/rules.ts` | Modify | Same, for `type Action`. |
| `pipeline.ts` | Modify | Fold `extractedWorkItemSchema` into the existing `'./extraction'` import; delete the deep-path line. |
| `pricing/index.ts` | Modify | Delete the `billableLineSchema` re-export — dead door, zero consumers; classification's own door is the one true source. |
| `shared/logger.ts` | Create | `createModuleLogger(name)` — one-line wrapper around `@mastra/core/logger`'s `createLogger`. The SDK-native answer to "code with no execute-context needs to log." |
| `pricing/price-line.ts` | Modify | `const log = createModuleLogger('pricing-fanout');` at module scope, replacing the removed `mastra.getLogger()` call; `console.warn` in the catch block becomes `log.warn`. |
| `index.ts` (feature) | Modify | `scorers: { 'extraction-consistency': extractionConsistencyScorer }` + import via the extraction door. |
| `features/estimate/lib/format.ts` | Modify | Rewrite `formatUnit`'s doc comment: v3 units are structural; legacy rows render as persisted (incl. retired `sqft` alias → "SF"). No code change. |
| `features/estimate/components/estimate-report.tsx` | Modify | Rewrite the header ASCII sketch: noun-titled rows, trade grouping, no verb prefix. No code change. |
| `AGENTS.md` | Modify | Mastra bullet rewritten: versionless, inlined greps, throw-not-branch failure model, SDK-native-logger rule. `mastra:dev`/`mastra:build` added to Useful commands. |
| this document | Rewrite | Delta plan, revised twice (see header + Reversed section). |

## Existing Pattern Audit

- **The zero-exception fix is the landed plan's own prescription.**
  `REFACTOR(pipeline-responsibility-modules).md` Risk Notes: "If review
  wants zero exceptions, the fix is one line each (re-export the schema
  value from the upstream module's `index.ts`)." Delta 1 executes that
  documented option.
- **Dead re-exports are a boundary violation in the opposite direction.**
  The whole point of "one door per module" is that a contract has exactly
  one legitimate import path. `pricing/index.ts` re-exporting
  classification's `billableLineSchema` created a SECOND legitimate-looking
  path to the same contract that nothing used — verified by grep
  (`grep -rn "from '@/features/estimate-extraction-pipeline/pricing'" src`
  shows only `PricedLineItem`/`pricedLineItemSchema` consumers). Deleting
  it is enforcing the same rule Delta 1 enforces, just on the export side
  instead of the import side.
- **Registration-export convention already exists.** `extraction/index.ts`
  already re-exports the Agent "for Studio registration ONLY"; the scorer
  joins the same labeled convention.
- **Why `pricingFanoutWorkflow` still stays unregistered.** Registering it
  on the `Mastra` instance would give its steps a real execute-context
  (solving the logger problem a different way) but exposes pricing's
  private fan-out mechanism on the shared instance surface — independently
  listable and invokable in Studio, visible to every other module. That
  trade is worse than the one this plan makes: a five-line logger factory
  keeps the fan-out exactly as private as the one-door design requires
  while still using the SDK's own logger class rather than a bare global.
- **No import cycle is created by widening the extraction door.**
  `classification → extraction/index → {agent, scorer, schema}`; nothing
  in `extraction/` imports `classification/`. Transitively constructing
  the Agent + scorer at import time is safe without env vars — verified
  empirically: the existing pure-logic `tsx` checks already load
  `classification/index` (which loads the extraction door) with no
  `KILO_API_KEY` in the process env, and pass (`createOpenAI`/`new
  Agent`/`createScorer` construct lazily; only `.generate()` needs the
  key). This is also not a new pattern: `envelope.ts` on `main` today
  already imports through the *pricing* door, transitively constructing
  the pricer Agent on every report-page render, and that renders fine —
  widening the extraction door the same way is consistent with what's
  already shipped and working, not a novel risk.
- **Doc comments are load-bearing in this repo** — they routinely record
  why decisions were made (`ACTION_COST_PROFILE`, `formatItemTitle`,
  `price-line.ts`'s context note). That convention is exactly why a
  comment now ARGUING AGAINST the enforced v3 invariant (`format.ts`) or
  sketching a layout the code no longer renders (`estimate-report.tsx`)
  must be corrected rather than left to mislead the next reader.
- **Considered and rejected, with reasons (scope discipline):**
  - Widening `envelope.ts`'s v1 `prices` type — reversed above; recorded
    here so a future pass doesn't re-propose it as a "consistency" fix.
  - Splitting `price-line.ts`'s `execute` into per-costType helper
    functions: each branch has exactly one call site; the function is
    cohesive (price one line); extraction would add indirection, not
    clarity. Not a God function — it does one thing with a discriminated
    branch.
  - Mastra storage so scorer results persist to `mastra_scorers`: new
    infrastructure, unrelated to alignment; the scorer runs and logs
    without it (accepted limitation, carried in Risk Notes).
  - CI-enforcing the boundary/purity greps: a tooling change; the
    Validation Plan greps remain the gate until the user asks for CI.

## Execution Plan

1. `shared/logger.ts` — create.
2. `pricing/price-line.ts` — swap logger source.
3. `pricing/index.ts` — delete the dead re-export.
4. `extraction/index.ts` — widen the door.
5. `classification/schema.ts`, `classification/rules.ts`, `pipeline.ts` —
   retarget the three deep imports to the door.
6. `index.ts` (feature) — register the scorer.
7. `format.ts`, `estimate-report.tsx` — doc-comment truth fixes.
8. `AGENTS.md` — guidance realignment.
9. Validation gates (below), then stop for review.

## File-by-File Changes

### `src/features/estimate-extraction-pipeline/shared/logger.ts`

**Action:** Create

#### After (new file, complete)

```ts
import { createLogger } from '@mastra/core/logger';

/**
 * SDK-native logger for code that does NOT run inside a registered
 * workflow step — namely pricing's internal, deliberately-unregistered
 * fan-out (see pricing/workflow.ts). A registered step gets a working
 * `mastra` execute-context for free; this covers the one place in the
 * pipeline that doesn't have one, without registering that internal
 * workflow just to get a logger (see the plan's Pattern Audit for why
 * that trade is worse).
 *
 * A factory, not a shared singleton, so each caller gets its own named
 * logger component instead of every unrelated caller sharing one label.
 */
export function createModuleLogger(name: string) {
  return createLogger({ name });
}
```

---

### `src/features/estimate-extraction-pipeline/pricing/price-line.ts`

**Action:** Modify

#### Before

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
```

```ts
 * This step runs inside `pricingFanoutWorkflow`, which is deliberately
 * NEVER registered on the top-level `Mastra` instance (pricing's fan-out
 * is its own private implementation detail — see workflow.ts). Confirmed
 * live: the `mastra` context Mastra injects into a step's `execute` is
 * `undefined` for steps of an unregistered/standalone workflow run via
 * `.createRun()` directly. This step therefore never reads `mastra` from
 * its execute context — it uses plain `console.warn` for the one thing
 * that would otherwise have needed it (logging a per-line failure).
 */
export const priceLineStep = createStep({
```

```ts
  execute: async ({ inputData }) => {
    const { line, zipCode, estimateRequestId } = inputData;
    const basis = pricingBasisFor(line.action, line.costType);
```

```ts
    } catch (e) {
      console.warn('[price-line] per-line failure', {
```

#### After

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
import { createModuleLogger } from '../shared/logger';

/** Module-scoped: constructed once, not per line priced. */
const log = createModuleLogger('pricing-fanout');
```

```ts
 * This step runs inside `pricingFanoutWorkflow`, which is deliberately
 * NEVER registered on the top-level `Mastra` instance (pricing's fan-out
 * is its own private implementation detail — see workflow.ts). Confirmed
 * live: the `mastra` context Mastra injects into a step's `execute` is
 * `undefined` for steps of an unregistered/standalone workflow run via
 * `.createRun()` directly. This step therefore never reads `mastra` from
 * its execute context — the module-scoped `log` above (an SDK
 * `createLogger` instance, not the execute-context one) covers the one
 * thing that would otherwise have needed it.
 */
export const priceLineStep = createStep({
```

```ts
  execute: async ({ inputData }) => {
    const { line, zipCode, estimateRequestId } = inputData;
    const basis = pricingBasisFor(line.action, line.costType);
```

```ts
    } catch (e) {
      log.warn('[price-line] per-line failure', {
```

#### Reasoning

- Identical call shape (`.warn(message, extraDataObject)`) to the removed
  `mastra.getLogger()` call — this is a source swap, not a behavior
  change. `tsc`/`eslint` catch any shape mismatch; none exists here since
  `ConsoleLogger.warn(message: string, ...args: any[])` is a superset of
  what was called before.

---

### `src/features/estimate-extraction-pipeline/pricing/index.ts`

**Action:** Modify

#### Before

```ts
import { billableLineSchema, type BillableLine, type PendingLine } from '../classification';
```

```ts
export type { PricedLineItem };
export { pricedLineItemSchema, billableLineSchema };
```

#### After

```ts
import { type BillableLine, type PendingLine } from '../classification';
```

```ts
export type { PricedLineItem };
export { pricedLineItemSchema };
```

(Verified against the live file: `billableLineSchema` — the schema VALUE —
is never referenced in this file's logic; only the `BillableLine` TYPE is
used, in `PriceLinesOutput.lines: BillableLine[]`. The prior revision of
this delta claimed the value import "stays because `priceLines`'s return
type still needs it internally" — that was wrong, confusing the type with
the value it's inferred from. Leaving the unused value import in place
would recreate the exact unused-import lint error already hit once this
session with `pendingLineSchema` in this same file.)

---

### `src/features/estimate-extraction-pipeline/extraction/index.ts`

**Action:** Modify (header region only; `extractWorkItems` and the
input/output interfaces are unchanged)

#### Before

```ts
import { RequestContext } from '@mastra/core/request-context';
import { billableItemExtractorAgent } from './agent';
import { workItemExtractionSchema, type ExtractedWorkItem } from './schema';

export type { ExtractedWorkItem };
/** Re-exported for Studio registration ONLY — no module calls this directly. */
export { billableItemExtractorAgent };
```

#### After

```ts
import { RequestContext } from '@mastra/core/request-context';
import { billableItemExtractorAgent } from './agent';
import { extractionConsistencyScorer } from './scorer';
import { workItemExtractionSchema, type ExtractedWorkItem } from './schema';

/**
 * THE DOOR — extraction's complete public contract. Everything a consumer
 * may depend on (the entry-point function, the output type, the enum
 * value lists and schema downstream modules build their own contracts
 * from) is exported here. No file outside this folder imports a deeper
 * path — the boundary grep in AGENTS.md enforces this with zero
 * exceptions.
 */
export { TRADE, ACTION, EXTENT_UNIT, extractedWorkItemSchema, type Action } from './schema';
export type { ExtractedWorkItem };
/**
 * Re-exported for Mastra-instance registration ONLY — no module calls
 * these directly.
 */
export { billableItemExtractorAgent, extractionConsistencyScorer };
```

#### Reasoning

- `workItemExtractionSchema` stays unexported: it is the model-call wire
  shape only `extractWorkItems` uses. The door exports what consumers
  need, not everything that exists — that asymmetry IS the boundary.

---

### `src/features/estimate-extraction-pipeline/classification/schema.ts`

**Action:** Modify (one line)

#### Before

```ts
import { TRADE, ACTION, EXTENT_UNIT } from '../extraction/schema';
```

#### After

```ts
import { TRADE, ACTION, EXTENT_UNIT } from '../extraction';
```

---

### `src/features/estimate-extraction-pipeline/classification/rules.ts`

**Action:** Modify (one line)

#### Before

```ts
import type { Action } from '../extraction/schema';
```

#### After

```ts
import type { Action } from '../extraction';
```

---

### `src/features/estimate-extraction-pipeline/pipeline.ts`

**Action:** Modify (import block only)

#### Before

```ts
import { extractWorkItems } from './extraction';
import { extractedWorkItemSchema } from './extraction/schema';
```

#### After

```ts
import { extractWorkItems, extractedWorkItemSchema } from './extraction';
```

---

### `src/features/estimate-extraction-pipeline/index.ts`

**Action:** Modify

#### Before

```ts
import { Mastra } from '@mastra/core/mastra';
import { billableItemExtractorAgent } from './extraction';
import { itemPricerAgent } from './pricing';
import { summarizeEstimateWorkflow } from './pipeline';
```

```ts
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
import { billableItemExtractorAgent, extractionConsistencyScorer } from './extraction';
import { itemPricerAgent } from './pricing';
import { summarizeEstimateWorkflow } from './pipeline';
```

```ts
export const mastra = new Mastra({
  agents: {
    'billable-item-extractor': billableItemExtractorAgent,
    'item-pricer': itemPricerAgent,
  },
  scorers: { 'extraction-consistency': extractionConsistencyScorer },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
});
```

(`pricingFanoutWorkflow` deliberately stays UNregistered — see Pattern
Audit. Its steps get their logging from `shared/logger.ts` now, not from
this instance.)

---

### `src/features/estimate/lib/format.ts`

**Action:** Modify (doc comment only; zero code change)

#### Before

```ts
/**
 * Display label for a `BillableItem.unit` chip: the uppercased unit
 * ("EA", "SF", "LF", "CY", "HRS"). `sqft` renders as "SF" — old persisted
 * envelopes may still contain the alias; `merge-items.ts` normalizes new
 * data to 'sf'.
 *
 * Labor lines show their stored unit. The pricer prices per that unit
 * (per-fixture, per-SF labor rates are standard trade convention); the
 * removed prototype rule that forced "HRS" onto every labor line
 * misstated those per-unit rates as hours.
 */
export function formatUnit(unit: string): string {
```

#### After

```ts
/**
 * Display label for a unit chip: the uppercased unit ("EA", "SF", "LF",
 * "CY", "HRS"). v3 lines carry their unit structurally — material lines
 * are ea/lf/sf/cy and labor lines are always hrs, enforced by the
 * classification module's discriminated union, so this function never
 * decides anything for them. Legacy v1/v2 rows render whatever unit they
 * were persisted with, including the retired 'sqft' alias (displays as
 * "SF").
 */
export function formatUnit(unit: string): string {
```

---

### `src/features/estimate/components/estimate-report.tsx`

**Action:** Modify (doc comment only; zero code change)

#### Before

```ts
/**
 * Branded FixPro estimate report. Layout mirrors a printed invoice:
 *
 *   [logo]  FixPro Estimate                Estimate #abc12345
 *           <fileName>                     Created June 2, 2026
 *   ────────────────────────────────────────────────────────
 *   Property                               Parties  [Submitted by …]
 *   ────────────────────────────────────────────────────────
 *   Billable items                          [toggles]
 *     INTERIOR · #item-001
 *     Replace damaged drywall section            qty × $unit
 *     Location: north wall, primary bedroom        = $line
 *     "<sourceQuote>" (p. 14)                    (toggleable)
 *     [confidence] source: <source>              (toggleable)
 *   ────────────────────────────────────────────────────────
 *                                          Subtotal: $X,XXX.00
 *                                          Unpriced items: N
 *   ────────────────────────────────────────────────────────
 *   Footer (AI-assisted disclaimer)
 */
```

#### After

```ts
/**
 * Branded FixPro estimate report. Layout mirrors a printed invoice:
 *
 *   [logo]  FixPro Estimate                Estimate #abc12345
 *           <fileName>                     Created June 2, 2026
 *   ────────────────────────────────────────────────────────
 *   Property                               Parties  [Submitted by …]
 *   ────────────────────────────────────────────────────────
 *   Billable Items                          [toggles]
 *     INTERIOR · 2 Items          Group Subtotal: $X,XXX.00
 *     Damaged Drywall Section          MATERIAL   32 SF   $480.00
 *       north wall, primary bedroom
 *       "<sourceQuote>" (p. 14)                  (toggleable)
 *       [confidence] source: <source>            (toggleable)
 *     Drywall Repaint                     LABOR   3.5 HRS  $265.00
 *   ────────────────────────────────────────────────────────
 *                                  Subtotal (Priced Lines): $X,XXX.00
 *                                          Unpriced Items: N
 *                                  Estimated Client Total: $X,XXX.00
 *   ────────────────────────────────────────────────────────
 *   Footer (AI-assisted disclaimer)
 */
```

#### Reasoning

- Matches what `ItemsSection`/`ItemRow` actually render today: noun-only
  titles (no "Replace the …" verb prefix), a trade-group header with an
  item count and its own subtotal, and a MATERIAL/LABOR badge with the
  line's real unit — not a generic "qty × $unit" gloss.

---

### `AGENTS.md`

**Action:** Modify (two regions: the Mastra stack bullet, and Useful
commands)

#### Before

```md
- Mastra `@mastra/core@1.32.x` for AI workflows. Prefer documented patterns:
  per-step `retries`, resilient-step returns + `.branch()` for failure
  routing, and `run.start().status` inspection over `try/catch`.
```

#### After

```md
- Mastra `@mastra/core` for AI workflows (version: see `package.json` —
  do not hardcode a version number here; it will go stale at the next
  bump). The AI pipeline lives at
  `src/features/estimate-extraction-pipeline/` as three one-door modules
  (`extraction/`, `classification/`, `pricing/`) plus a logic-free
  composition root (`pipeline.ts`). Rules, mechanically checked:
  - Only a module's `index.ts` may be imported from outside its folder:
    ```sh
    PKG=src/features/estimate-extraction-pipeline
    grep -rn "from '.*\/extraction\/\(schema\|agent\|scorer\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/extraction/"
    grep -rn "from '.*\/classification\/\(schema\|rules\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/classification/"
    grep -rn "from '.*\/pricing\/\(schema\|agent\|price-line\|workflow\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/pricing/"
    ```
    All three must return zero results.
  - The pipeline is pure: it never imports `@/db` or
    `@/features/estimate/`. All estimate-row DB writes live in the single
    caller, `src/features/estimate/lib/workflow.ts`.
  - Failure model: steps THROW (per-step `retries` re-run them); the
    caller inspects `run.start().status`. Do NOT reintroduce in-workflow
    persistence or `.branch()` failure routing — both were deliberately
    retired.
  - Code that runs outside a registered step's execute-context (e.g.
    pricing's internal fan-out) has NO working `mastra.getLogger()`/
    `mastra.getAgent()` — live-verified crash. Use
    `createModuleLogger(name)` from `shared/logger.ts` instead of
    `console.*` or a `mastra` context call.
```

#### Before

```md
pnpm exec tsc --noEmit  # typecheck
pnpm exec eslint <path> # lint specific files (project-level pnpm lint is broken)
```

#### After

```md
pnpm exec tsc --noEmit  # typecheck
pnpm exec eslint <path> # lint specific files (project-level pnpm lint is broken)
pnpm mastra:dev         # Mastra Studio, pointed at the pipeline feature dir
pnpm mastra:build       # Mastra build (same --dir)
```

## Validation Plan

1. `pnpm exec tsc --noEmit` — clean.
2. `pnpm exec eslint` on every modified file — clean.
3. **Zero-exception boundary gate** (tightened — no carve-outs remain):
   run the three greps now embedded in `AGENTS.md` directly. All three
   MUST return zero results — including for `pipeline.ts` and
   `classification/*`, which previously held the documented exceptions.
4. **Dead-export gate:**
   `grep -rn "from '@/features/estimate-extraction-pipeline/pricing'" src`
   → every match imports only `PricedLineItem`/`pricedLineItemSchema`/
   `priceLines`, never `billableLineSchema`.
5. **Purity gate (unchanged):**
   `grep -rn "@/db\|@/features/estimate/" src/features/estimate-extraction-pipeline`
   → zero results.
6. Re-run the pure-logic `tsx` checks (classification split/rounding/
   dedup/scope-net, union rejection of invalid unit-costType combos,
   `pricingBasisFor` matrix) — all must still pass, proving the door
   widening and logger swap changed no behavior.
7. `pnpm build` — clean (matches the pre-change baseline already verified
   on this branch).
8. Manual: `pnpm mastra:dev` → Studio lists the `extraction-consistency`
   scorer. Trigger a live estimate with a pricing failure path (or read
   logs from a normal run) → confirm `[pricing-fanout]`-labeled log lines
   appear from `price-line.ts`'s `log.warn`, proving the SDK logger works
   without the workflow being registered.

## Risk Notes

- **Scorer registration ≠ scorer persistence.** No storage is configured
  on the Mastra instance, so scorer RESULTS may surface only in
  logs/Studio-session views, not the `mastra_scorers` table. Accepted and
  unchanged from the landed plan; adding storage stays out of scope until
  asked for.
- **`createModuleLogger`'s output routing depends on `ConsoleLogger`'s
  default transport**, which is console-based (matching the explicit
  requirement that this stay visible in the console). If a future need
  arises to route pricing's logs to the same transport as registered
  steps, `createLogger` accepts a `transports` option — a config change
  in `shared/logger.ts` only, no call-site changes.
- **`AGENTS.md` guidance pins current architecture facts, not a version
  number.** If pricing's fan-out is ever registered, or the failure model
  changes, the AGENTS.md bullet must be updated in the same PR — stale
  guidance was the exact failure this delta corrects; don't recreate it.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
