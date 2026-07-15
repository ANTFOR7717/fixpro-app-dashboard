# FIX(labor-material-classification)

## Request
Two compounding problems in the billable-item pipeline, both confirmed against real reprocessing logs from tonight:

**1. `costType` (labor vs material) classification is non-deterministic.** The `billable-item-extractor` agent is asked to pick a single `costType` per item, but `install`/`replace` actions are inherently **both** — a part is bought (material) AND someone is paid to put it in (labor). The model has no decision rule for this and guesses inconsistently: re-running the exact same PDF twice produced **"replace receptacles" as `labor` in one run and `material` in the next**, and within a single run, 4 near-identical "receptacle" items got 3 different `costType` calls. The classification is **deterministic from `action` alone** and should never have been left to the model:
   - `repair`, `service`, `evaluate`, `remove` → always **labor only**. No part is purchased.
   - `install`, `replace` → always **both** — split into a material line AND a labor line.

**2. The extracted title/scope text itself is frequently garbage** — bare one-word trade-category labels like `"Siding"`, `"Foundation"`, `"Chimney"`, `"Receptacles"` instead of an actual noun phrase identifying the specific defect. This is NOT silently passing validation: the `ItemContractGuard` correctly flags every one of these as a single-token scope violation and retries the model. The bug is what happens AFTER the guard exhausts its retry budget — tonight's logs show `"Processor requested retry but maxProcessorRetries (3) exceeded... Treating as abort"`, and the run continued anyway with the still-bad scope intact. The guard's protection is soft: it tries 3 times, then surrenders and lets the garbage through. These vague titles are also exactly why so many items come back "Price unavailable" — the pricer correctly refuses to price something it can't identify ("Scope ambiguous; needs contractor quote.").

This fix addresses both: it removes `costType` from the model's output contract entirely (replacing it with a deterministic code-level classifier keyed on `action`, splitting `install`/`replace` items into two billable lines), AND it closes the scope-quality gap with a concrete prompt tightening plus a deterministic safety-net filter that drops any item whose scope is still garbage after the guard's retries are exhausted — so vague titles can no longer reach the final report no matter how the model behaves upstream. It also fixes a related gap: the pricer agent is never told `unit` or `costType` today, so it has no idea whether it's pricing a $4 receptacle or an hour of electrician labor.

The report's existing `costType` badge ("Labor" / "Material") is left as-is — that part already works correctly and is not part of this fix.

## Directory Map
```text
src/
  mastra/
    agents/
      billable-item-extractor.schema.ts      (modify)
      billable-item-extractor.ts             (modify)
      item-pricer.ts                         (modify)
      processors/
        item-contract-guard.ts               (modify)
        item-contract-guard/
          item-validator.ts                  (modify)
    config/
      agent-rules.ts                         (modify)
    workflows/
      steps/
        extract-items.ts                     (modify)
        audit-items.ts                       (modify)
        merge-items.ts                       (modify)
        price-items.ts                       (modify)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/mastra/agents/billable-item-extractor.schema.ts` | modify | Add `extractedItemSchema` (= `billableItemSchema` minus `costType`) as the model's actual output contract. Add `extractedItemGuardSchema` (widened-enum guard variant of `extractedItemSchema`, replacing `billableItemGuardSchema`). Repoint `billableExtractionSchema.items` at `extractedItemSchema`. `billableItemSchema` stops being something the model ever sees directly — it becomes the *persisted* shape, assembled downstream after classification. |
| `src/mastra/agents/billable-item-extractor.ts` | modify | Remove the `costType` field instructions from the prompt — the model is never asked for it anymore. |
| `src/mastra/config/agent-rules.ts` | modify | Add `ACTION_COST_PROFILE`: the single source of truth mapping `action -> 'labor-only' \| 'material-and-labor'`. Remove `INCOMPATIBLE_UNITS` — it existed only to catch a bad model `costType` guess, which can no longer happen once `costType` isn't model output. |
| `src/mastra/agents/processors/item-contract-guard/item-validator.ts` | modify | Drop the `costType` enum check and the `INCOMPATIBLE_UNITS` cross-check (the field no longer exists on what the guard validates). Swap the validated type from `BillableItemGuard` to `ExtractedItemGuard`. |
| `src/mastra/agents/processors/item-contract-guard.ts` | modify | Swap `billableItemGuardSchema` → `extractedItemGuardSchema` as the parse gate. |
| `src/mastra/workflows/steps/extract-items.ts` | modify | Swap the `items` array type from `billableItemSchema` to `extractedItemSchema` (no `costType` yet — that's assigned in `merge-items`). |
| `src/mastra/workflows/steps/audit-items.ts` | modify | Same swap for `items`/`auditItems`. |
| `src/mastra/workflows/steps/merge-items.ts` | modify | **The core fix.** Input items are `extractedItemSchema` (no `costType`). After the existing dedup + renumber pass, add a deterministic classify-and-split pass: look up `ACTION_COST_PROFILE[item.action]`; emit one `labor` item for labor-only actions, or two items (`material` + `labor`, sharing the base id with `-material`/`-labor` suffixes) for `install`/`replace`. Output `items` becomes `billableItemSchema` (now carries `costType`). Log a new `splitCount` counter. |
| `src/mastra/agents/item-pricer.ts` | modify | Add explicit costType-aware pricing rules: when pricing a `material` line, price the physical part/materials only; when pricing a `labor` line, price the labor charge for the action only. Today the pricer prompt never mentions this distinction at all. |
| `src/mastra/workflows/steps/price-items.ts` | modify | Pass `unit` and `costType` in the per-item prompt text sent to the pricer — today neither is sent, so the pricer has been guessing the nature of every line item from `trade`/`action`/`scope` text alone. |
| `src/mastra/agents/processors/item-contract-guard/item-validator.ts` | modify (additional) | Export `checkScopeShape` (refactored to return reasons directly instead of mutating an `out` array) so `merge-items.ts` can reuse the exact same scope-quality rule as a deterministic safety net, not a second hand-written copy of the rule that could drift. |
| `src/mastra/agents/billable-item-extractor.ts` | modify (additional) | Tighten the `scope` field instructions with concrete bad/good examples naming the exact failure mode observed tonight: bare trade-category words ("Siding", "Foundation", "Chimney", "Receptacles") are forbidden as scope on their own. |
| `src/mastra/workflows/steps/merge-items.ts` | modify (additional) | Beyond the costType split (above), also filter out any merged item whose `scope` still fails `checkScopeShape` — this is the actual fix for vague titles reaching the final report, independent of whether the upstream guard's retry budget was exhausted. Logged as `droppedByScopeViolation`. |

## Existing Pattern Audit
- **Schema co-location.** `billable-item-extractor.schema.ts` already has a precedent for a "strict" schema plus a "loose, guard-facing" variant: `billableItemSchema` (strict enums) vs. `billableItemGuardSchema` (`.extend()` widening the four enum fields to `z.string()` so the guard can produce field-specific abort messages instead of opaque Zod errors). The new `extractedItemSchema` / `extractedItemGuardSchema` pair follows the exact same convention — `extractedItemGuardSchema` is `extractedItemSchema.extend({...})` widening the three remaining enums (`trade`, `action`, `unit`).
- **Business rules live in `agent-rules.ts`,** not in the validator or the schema — per its own file header: "rules that encode product policy, not tokenizer heuristics... so non-engineers (PM, QA) can adjust... without touching guard code." `ACTION_COST_PROFILE` is exactly this kind of rule (product policy: which actions imply a material purchase) and belongs there, replacing `INCOMPATIBLE_UNITS` which encoded a narrower version of the same idea (a cross-check that's now structurally impossible to violate).
- **Output processor (`ItemContractGuard`) validates by calling into `item-validator.ts`'s pure `validateItem()`,** which composes small rule-checks (`checkEnum`, `checkScopeShape`) over a guard schema. No control-flow changes needed in `item-contract-guard.ts` itself beyond the schema swap — the abort/retry orchestration is unaffected.
- **`merge-items.ts` is already the step that does pure, deterministic, no-I/O transformation** (dedup by structural key + sourceQuote, renumber ids via content-hash `generateItemId`). Adding a classify-and-split pass here — rather than a new workflow step — matches the file's existing job description ("Pure function, no I/O, no retries") and keeps the change contained to one file instead of growing the workflow graph.
- **`[extraction-quality]` logging pattern** in `merge-items.ts` already tracks counters (`droppedBySourceQuote`, `droppedByStructuralKey`, `mergedCount`). `splitCount` is added to the same log call, not a new log line.
- **`price-items.ts` builds a plain-text `userText` block** of `key: value` lines per item before calling the pricer agent (`zipCode`, `trade`, `action`, `scope`, `location`, `quantity`, `sourceQuote`). Adding `unit` and `costType` lines is additive to that same block, no restructuring.
- **No DB schema/migration impact.** `costType` and the item list live inside the JSON-serialized `summary` text column (the v2 envelope), not as DB columns. The persisted item shape (`billableItemSchema`) is unchanged field-for-field — only *how many* items get persisted per source defect changes (split pairs produce 2 instead of 1), and *who* assigns `costType` changes (code, not the model). `summaryEnvelopeV2Schema` stays valid with no version bump.
- **No existing tests** in this repository (`find . -iname "*.test.ts" -o -iname "*.spec.ts"` returns nothing) — no test suite to update.

## Execution Plan
### Step 1 — Schema split: `extractedItemSchema` lands next to `billableItemSchema`
**Intent:** Define the model's new (smaller) output contract without touching `billableItemSchema`, which downstream code (`price-items.ts`, `persist-success.ts`, the report) still depends on unchanged.
**Files:** `src/mastra/agents/billable-item-extractor.schema.ts`.

### Step 2 — `ACTION_COST_PROFILE` replaces `INCOMPATIBLE_UNITS`
**Intent:** Land the single deterministic rule the rest of the fix depends on, in the file the project already designates for this kind of policy.
**Files:** `src/mastra/config/agent-rules.ts`.

### Step 3 — Guard stops validating `costType`
**Intent:** The guard's parse gate and validator must match the model's new (smaller) output shape before the prompt changes, or the guard's `extractionGuardSchema.safeParse` would reject every real response (missing-field mismatch, not just a stricter check).
**Files:** `src/mastra/agents/processors/item-contract-guard.ts`, `src/mastra/agents/processors/item-contract-guard/item-validator.ts`.

### Step 4 — Prompt: remove `costType` from "FIELDS YOU MUST PRODUCE PER ITEM"
**Intent:** Stop asking the model for a field it no longer needs to (and shouldn't) decide.
**Files:** `src/mastra/agents/billable-item-extractor.ts`.

### Step 5 — Thread `extractedItemSchema` through extract/audit
**Intent:** Both passes call the same agent with `structuredOutput: { schema: billableExtractionSchema }`, which now resolves to `extractedItemSchema` items (Step 1). Their own `items`/`auditItems` schema fields must match or `tsc` breaks at the workflow boundary.
**Files:** `src/mastra/workflows/steps/extract-items.ts`, `src/mastra/workflows/steps/audit-items.ts`.

### Step 6 — `merge-items.ts`: classify and split
**Intent:** The actual fix. After existing dedup + renumber, deterministically assign `costType` per `ACTION_COST_PROFILE`, splitting `install`/`replace` items into a material line + a labor line. Output type flips from `extractedItemSchema[]` (input) to `billableItemSchema[]` (output) — every downstream consumer already expects `billableItemSchema`.
**Files:** `src/mastra/workflows/steps/merge-items.ts`.

### Step 7 — Pricer becomes costType-aware
**Intent:** Once items are reliably split into material vs. labor lines, mispricing one because the pricer doesn't know which is which becomes immediately visible (e.g. pricing the labor line as if it were the part's retail cost). Tell the pricer what it's pricing.
**Files:** `src/mastra/agents/item-pricer.ts`, `src/mastra/workflows/steps/price-items.ts`.

### Step 8 — Export the scope-quality rule for reuse
**Intent:** `merge-items.ts` needs the exact same "is this scope a real noun phrase" rule the guard already uses, not a second hand-maintained copy that could drift from it.
**Files:** `src/mastra/agents/processors/item-contract-guard/item-validator.ts`.

### Step 9 — Prompt: name the exact failure mode
**Intent:** Give the model concrete bad/good examples tied to what was actually observed (bare trade-category words as scope), not just an abstract "be specific" instruction it's already failing to follow under the existing abstract wording.
**Files:** `src/mastra/agents/billable-item-extractor.ts`.

### Step 10 — `merge-items.ts`: scope-quality safety net
**Intent:** Close the gap where the guard's retry-exhaustion lets vague scope through anyway. After classify-and-split (Step 6), filter out any item whose `scope` still fails the shared `checkScopeShape` rule, logging the count. This guarantees no garbage title reaches the final report regardless of upstream guard behavior.
**Files:** `src/mastra/workflows/steps/merge-items.ts`.

### Step 11 — Validate
**Intent:** `pnpm exec tsc --noEmit` clean, `pnpm exec eslint <changed paths>` clean, manual re-run of the workflow against one existing estimate to confirm "receptacle" now produces a consistent 2-line (material + labor) result every time.

## File-by-File Changes

### `src/mastra/agents/billable-item-extractor.schema.ts`
**Action:** Modify
**Why:** Split the model-facing schema from the persisted schema. `extractedItemSchema` is what the agent actually emits (no `costType`); `billableItemSchema` keeps its existing shape (with `costType`) because every downstream consumer (`audit-items` passthrough, `price-items`, `persist-success`, the report) still expects that exact shape — only `merge-items` now produces it instead of the model.
**Impact:** Two new exports (`extractedItemSchema`, `extractedItemGuardSchema` + their inferred types). `billableExtractionSchema.items` changes from `billableItemSchema` to `extractedItemSchema`. `billableItemGuardSchema` is removed (no longer used anywhere — the guard validates `extractedItemGuardSchema` now, see Step 3).

#### Before
```ts
export const billableItemSchema = z.object({
  /** Stable per-run id, e.g. "item-001". The merge step renumbers these. */
  id: z.string(),

  /** Which trade quotes the work. */
  trade: z.enum(TRADE),

  /** What kind of action a contractor performs. */
  action: z.enum(ACTION),

  // ... scope, location, quantity, unit fields unchanged ...

  /**
   * Whether the line is labor or material. REQUIRED. Pick the defensible
   * split from the inspector's wording.
   */
  costType: z.enum(COST_TYPE),

  // ... sourceQuote, pageHint fields unchanged ...
});

export type BillableItem = z.infer<typeof billableItemSchema>;

/**
 * Looser variant of `billableItemSchema` used by the `ItemContractGuard`
 * output processor. The four enum fields are widened to `z.string()` so
 * the guard can produce field-specific, actionable abort messages
 * ("trade \"misc\" is not in the allowed TRADE enum") instead of the
 * generic Zod error the strict schema would produce.
 *
 * Lives in the same file as the strict schema so the two cannot drift
 * on the field list — the loose one is a strict-superset that only
 * re-declares the four enum fields.
 */
export const billableItemGuardSchema = billableItemSchema.extend({
  trade: z.string(),
  action: z.string(),
  unit: z.string(),
  costType: z.string(),
});

export type BillableItemGuard = z.infer<typeof billableItemGuardSchema>;

export const billableExtractionSchema = z.object({
  items: z.array(billableItemSchema),
});

export type BillableExtraction = z.infer<typeof billableExtractionSchema>;
```

#### After
```ts
export const billableItemSchema = z.object({
  /** Stable per-run id, e.g. "item-001". The merge step renumbers these. */
  id: z.string(),

  /** Which trade quotes the work. */
  trade: z.enum(TRADE),

  /** What kind of action a contractor performs. */
  action: z.enum(ACTION),

  // ... scope, location, quantity, unit fields unchanged ...

  /**
   * Whether the line is labor or material. Assigned deterministically by
   * `merge-items.ts` from `ACTION_COST_PROFILE[action]` — NOT emitted by
   * the model (see `extractedItemSchema` below). `install`/`replace`
   * actions are split into one `material` item and one `labor` item;
   * every other action becomes a single `labor` item. This field only
   * exists on the persisted/downstream shape.
   */
  costType: z.enum(COST_TYPE),

  // ... sourceQuote, pageHint fields unchanged ...
});

export type BillableItem = z.infer<typeof billableItemSchema>;

/**
 * The model's ACTUAL output contract. Identical to `billableItemSchema`
 * minus `costType` — the model is never asked to classify labor vs.
 * material. That classification is deterministic from `action` alone
 * (see `ACTION_COST_PROFILE` in `src/mastra/config/agent-rules.ts`) and
 * is applied in `merge-items.ts`, which is also where `install`/`replace`
 * items are split into a material line + a labor line.
 *
 * Why this exists instead of just making `costType` optional on
 * `billableItemSchema`: an optional field the model COULD still fill in
 * (and sometimes would, inconsistently) is exactly the bug this fix
 * removes. Omitting the field from the schema the model is shown makes
 * it structurally impossible for the model to emit a costType guess.
 */
export const extractedItemSchema = billableItemSchema.omit({
  costType: true,
});

export type ExtractedItem = z.infer<typeof extractedItemSchema>;

/**
 * Looser variant of `extractedItemSchema` used by the `ItemContractGuard`
 * output processor. The three enum fields are widened to `z.string()` so
 * the guard can produce field-specific, actionable abort messages
 * ("trade \"misc\" is not in the allowed TRADE enum") instead of the
 * generic Zod error the strict schema would produce.
 *
 * Lives in the same file as the strict schema so the two cannot drift
 * on the field list — the loose one is a strict-superset that only
 * re-declares the three enum fields. (One fewer than the old
 * `billableItemGuardSchema` — `costType` isn't part of this shape.)
 */
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

#### Reasoning
- `extractedItemSchema = billableItemSchema.omit({ costType: true })` guarantees the two schemas cannot drift on the other 8 fields — there is exactly one place (`billableItemSchema`) that defines the full field list, and the model contract is a derived subtraction, not a hand-maintained parallel copy.
- Omitting the field from the schema is stronger than "tell the model not to fill it in via the prompt." Zod's `structuredOutput` translates the schema into the function-calling/JSON-schema contract the model is shown; a field that isn't in that contract cannot be guessed into existence, no matter how the model behaves probabilistically. This is the actual fix for non-determinism — moving the decision out of the model's reach structurally, not just instructing it more firmly.
- `billableItemGuardSchema` is deleted rather than kept unused — per repo convention, no dead exports.

### `src/mastra/config/agent-rules.ts`
**Action:** Modify
**Why:** This file is explicitly the home for "rules that encode product policy... so non-engineers can adjust... without touching guard code." `ACTION_COST_PROFILE` is the single source of truth for which actions imply a material purchase, used by `merge-items.ts`'s classify-and-split pass. `INCOMPATIBLE_UNITS` is removed because it only ever existed to catch a bad model-emitted `costType`/`unit` pairing — a category of error that cannot exist once `costType` is no longer model output.
**Impact:** `INCOMPATIBLE_UNITS` export removed (its only consumer, `item-validator.ts`, is updated in lockstep — Step 3). New `ACTION_COST_PROFILE` export added.

#### Before
```ts
import { ACTION_VERBS } from '../agents/processors/item-contract-guard/item-heuristics';

/**
 * `costType -> set of units that are not allowed for that costType`.
 * A lookup keeps the validator free of nested conditionals and makes
 * the rules trivially diffable in code review.
 */
export const INCOMPATIBLE_UNITS: Readonly<Record<string, ReadonlySet<string>>> = {
  material: new Set(['hrs']),
};

/**
 * Verbs that the extractor is told to keep out of `scope`. Six of these
 * are the model's canonical ACTION enum values; the rest are common
 * home-repair verbs the model has been observed slipping into scope.
 *
 * Re-exported from item-heuristics so the prompts, the cleaner, and
 * the guard all read the same source of truth.
 */
export const ACTION_VERBS_SET: ReadonlySet<string> = ACTION_VERBS;
```

#### After
```ts
import { ACTION_VERBS } from '../agents/processors/item-contract-guard/item-heuristics';
import type { Action } from '../agents/billable-item-extractor.schema';

/**
 * Whether an action implies ONLY labor, or BOTH a material purchase and
 * labor to install/replace it.
 *
 * This is deterministic, not a model judgment call: `repair`, `service`,
 * `evaluate`, and `remove` never involve buying a new part — you fix,
 * maintain, inspect, or take away something that already exists.
 * `install` and `replace` always do — a receptacle, a damper door, a
 * drain stop, etc. is a physical thing the contractor must buy before
 * they can charge labor to put it in.
 *
 * `merge-items.ts` reads this to assign `costType` and to decide whether
 * an item becomes one billable line (`'labor-only'`) or two
 * (`'material-and-labor'` — a `material` line + a `labor` line).
 *
 * This replaces the old `INCOMPATIBLE_UNITS` cross-check, which existed
 * only to catch a bad model-emitted `costType` guess. Once `costType` is
 * no longer model output (see `extractedItemSchema`), that failure mode
 * is structurally impossible and the cross-check has nothing left to
 * catch.
 */
export const ACTION_COST_PROFILE: Readonly<
  Record<Action, 'labor-only' | 'material-and-labor'>
> = {
  repair: 'labor-only',
  service: 'labor-only',
  evaluate: 'labor-only',
  remove: 'labor-only',
  install: 'material-and-labor',
  replace: 'material-and-labor',
};

/**
 * Verbs that the extractor is told to keep out of `scope`. Six of these
 * are the model's canonical ACTION enum values; the rest are common
 * home-repair verbs the model has been observed slipping into scope.
 *
 * Re-exported from item-heuristics so the prompts, the cleaner, and
 * the guard all read the same source of truth.
 */
export const ACTION_VERBS_SET: ReadonlySet<string> = ACTION_VERBS;
```

#### Reasoning
- `Record<Action, ...>` (not `Record<string, ...>`) makes the mapping exhaustive at compile time — adding a 7th value to the `ACTION` enum in the schema file becomes a `tsc` error here until it's classified, so this rule can never silently miss a new action.
- Plain object lookup, no conditionals, matches the file's own stated style (`INCOMPATIBLE_UNITS` was a lookup for the same reason: "keeps the validator free of nested conditionals").

### `src/mastra/agents/processors/item-contract-guard/item-validator.ts`
**Action:** Modify
**Why:** The guard's `validateItem` currently checks `costType` against the enum and runs the `INCOMPATIBLE_UNITS` cross-check. Neither field/check is meaningful anymore — `costType` doesn't exist on the type the guard validates after Step 1 swaps the model's contract to `extractedItemSchema`.
**Impact:** `checkEnum('costType', ...)` call removed. `INCOMPATIBLE_UNITS` import and its `forbiddenUnits` check removed. Type import switches from `BillableItemGuard` to `ExtractedItemGuard`.

#### Before
```ts
import {
  TRADE,
  ACTION,
  UNIT,
  COST_TYPE,
} from '../../billable-item-extractor.schema';
import {
  ARTICLES,
  SENTENCE_PUNCTUATION_RE,
} from './item-heuristics';
import {
  INCOMPATIBLE_UNITS,
  ACTION_VERBS_SET,
} from '../../../config/agent-rules';
import type { BillableItemGuard } from '../../billable-item-extractor.schema';

/**
 * Enum sets derived from the schema, so the guard can never drift from
 * the formal contract.
 */
const VALID_TRADES: ReadonlySet<string> = new Set<string>(TRADE);
const VALID_ACTIONS: ReadonlySet<string> = new Set<string>(ACTION);
const VALID_UNITS: ReadonlySet<string> = new Set<string>(UNIT);
const VALID_COST_TYPES: ReadonlySet<string> = new Set<string>(COST_TYPE);

export function validateItem(
  item: BillableItemGuard,
  index: number,
): ItemViolation {
  const reasons: string[] = [];

  checkEnum('trade', item.trade, VALID_TRADES, reasons);
  checkEnum('action', item.action, VALID_ACTIONS, reasons);
  checkEnum('unit', item.unit, VALID_UNITS, reasons);
  checkEnum('costType', item.costType, VALID_COST_TYPES, reasons);

  const forbiddenUnits = INCOMPATIBLE_UNITS[item.costType];
  if (forbiddenUnits?.has(item.unit)) {
    reasons.push(
      `costType=${item.costType} cannot pair with unit=${item.unit}`,
    );
  }

  checkScopeShape(item.scope, reasons);

  return {
    index,
    id: item.id,
    reasons,
  };
}

function checkEnum(
  field: 'trade' | 'action' | 'unit' | 'costType',
  value: string,
  allowed: ReadonlySet<string>,
  out: string[],
): void {
  if (!allowed.has(value)) {
    out.push(`${field} "${value}" is not in the allowed ${field.toUpperCase()} enum`);
  }
}
```

#### After
```ts
import {
  TRADE,
  ACTION,
  UNIT,
} from '../../billable-item-extractor.schema';
import {
  ARTICLES,
  SENTENCE_PUNCTUATION_RE,
} from './item-heuristics';
import { ACTION_VERBS_SET } from '../../../config/agent-rules';
import type { ExtractedItemGuard } from '../../billable-item-extractor.schema';

/**
 * Enum sets derived from the schema, so the guard can never drift from
 * the formal contract.
 */
const VALID_TRADES: ReadonlySet<string> = new Set<string>(TRADE);
const VALID_ACTIONS: ReadonlySet<string> = new Set<string>(ACTION);
const VALID_UNITS: ReadonlySet<string> = new Set<string>(UNIT);

export function validateItem(
  item: ExtractedItemGuard,
  index: number,
): ItemViolation {
  const reasons: string[] = [];

  checkEnum('trade', item.trade, VALID_TRADES, reasons);
  checkEnum('action', item.action, VALID_ACTIONS, reasons);
  checkEnum('unit', item.unit, VALID_UNITS, reasons);

  checkScopeShape(item.scope, reasons);

  return {
    index,
    id: item.id,
    reasons,
  };
}

function checkEnum(
  field: 'trade' | 'action' | 'unit',
  value: string,
  allowed: ReadonlySet<string>,
  out: string[],
): void {
  if (!allowed.has(value)) {
    out.push(`${field} "${value}" is not in the allowed ${field.toUpperCase()} enum`);
  }
}
```
`checkScopeShape` is unchanged — elided here, no edits inside it.

#### Reasoning
- Deleting the `costType` check rather than leaving it as unreachable dead code: the field genuinely does not exist on `ExtractedItemGuard`, so `item.costType` would be a `tsc` error if left in place. This is a forced, not optional, edit.
- `checkEnum`'s field union type drops `'costType'` for the same reason — keeping it would allow a call site to pass a string literal that no longer corresponds to a real field.

### `src/mastra/agents/processors/item-contract-guard.ts`
**Action:** Modify
**Why:** The guard's parse gate (`extractionGuardSchema`) must match the model's actual (now-smaller) output shape.
**Impact:** One import swap, one schema reference swap. No control-flow changes.

#### Before
```ts
import { billableItemGuardSchema } from '../billable-item-extractor.schema';

const extractionGuardSchema = z.object({
  items: z.array(billableItemGuardSchema),
});
```

#### After
```ts
import { extractedItemGuardSchema } from '../billable-item-extractor.schema';

const extractionGuardSchema = z.object({
  items: z.array(extractedItemGuardSchema),
});
```
Everything else in this file — `onViolation`, `processOutputStep`, `formatSchemaMismatch`, `formatViolations`, the abort/retry flow — is unchanged.

#### Reasoning
- This is a pure rename/swap. The orchestration logic (`abort()`, retry counting, violation formatting) doesn't know or care about the shape being validated — it only consumes `result.success` / `result.error.issues` / `result.data`, all of which stay structurally the same (just one fewer field).

### `src/mastra/agents/billable-item-extractor.ts`
**Action:** Modify
**Why:** Remove the `costType` field instructions from the prompt — asking the model for a field that's no longer in the schema it's shown would be confusing prompt debt with no effect (the structuredOutput contract ignores instructions for fields outside the schema).
**Impact:** One bullet point removed from "FIELDS YOU MUST PRODUCE PER ITEM." No other prompt content changes.

#### Before
```
- unit: REQUIRED. One of ea, lf, sf, sqft, cy, hrs. The unit the
  inspector's count refers to. For labor use 'hrs' if the inspector
  gave hours; otherwise the physical unit the labor is measured in
  ('sf' for square-footage work, 'lf' for linear-footage work, etc.).
  NEVER invent a unit the report does not support.
- costType: REQUIRED. One of labor, material. Whether the line is work
  to pay for (labor) or a thing to buy (material). Pick the defensible
  split from the inspector's wording.
- sourceQuote: a verbatim excerpt from the report that anchors this item.
```

#### After
```
- unit: REQUIRED. One of ea, lf, sf, sqft, cy, hrs. The unit the
  inspector's count refers to. For labor use 'hrs' if the inspector
  gave hours; otherwise the physical unit the labor is measured in
  ('sf' for square-footage work, 'lf' for linear-footage work, etc.).
  NEVER invent a unit the report does not support.
- sourceQuote: a verbatim excerpt from the report that anchors this item.
```
Every other line of the prompt (the agent's job description, GROUNDING TESTS, HARD RULES 1-7, the other field instructions, OUTPUT FORMAT) is unchanged — elided here.

#### Reasoning
- The model never decided this reliably in the first place (the whole reason for this fix); removing the instruction is strictly correct, not a behavior change worth hedging on.

### `src/mastra/workflows/steps/extract-items.ts`
**Action:** Modify
**Why:** `items` in this step's output is now `extractedItemSchema[]`, matching what `billableExtractionSchema` (Step 1) actually returns from `agent.generate`.
**Impact:** One import swap, one type reference change in the output schema. `execute`'s body is unchanged — it already just forwards `extraction.items` untouched, no field-by-field construction to update.

#### Before
```ts
import {
  billableExtractionSchema,
  billableItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';

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
  // ... retries, execute unchanged ...
```

#### After
```ts
import {
  billableExtractionSchema,
  extractedItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';

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
    items: z.array(extractedItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  // ... retries, execute unchanged ...
```

#### Reasoning
- `extraction.items` (from `result.object`) is already typed as `ExtractedItem[]` once `billableExtractionSchema` changes (Step 1) — the assignment in `execute`'s three return paths (`items: extraction.items` / `items: []`) type-checks with zero body edits.

### `src/mastra/workflows/steps/audit-items.ts`
**Action:** Modify
**Why:** Same reasoning as `extract-items.ts` — Pass B calls the same agent with the same `billableExtractionSchema`, so its `items`/`auditItems` fields must also be `extractedItemSchema[]`.
**Impact:** One import swap, two type references changed (`items` on input, `items`/`auditItems` on output). `execute` body unchanged — `passASummary` already only reads `trade`/`action`/`scope`/`location` off each item, none of which moved.

#### Before
```ts
import {
  billableExtractionSchema,
  billableItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';

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
  // ... retries, execute unchanged ...
```

#### After
```ts
import {
  billableExtractionSchema,
  extractedItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';

export const auditItemsStep = createStep({
  id: 'audit-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(extractedItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(extractedItemSchema),
    auditItems: z.array(extractedItemSchema),
    auditFailed: z.boolean(),
  }),
  // ... retries, execute unchanged ...
```

#### Reasoning
- Identical mechanical swap to `extract-items.ts`. The body's only touch of item internals (`passASummary`'s `.map((it) => ({ trade, action, scope, location }))`) reads fields that exist on both the old and new type, so it compiles unchanged.

### `src/mastra/workflows/steps/merge-items.ts`
**Action:** Modify
**Why:** This is the fix for both problems. After the existing dedup + renumber pass produces a deduplicated `ExtractedItem[]`: (1) filter out any item whose `scope` still violates `checkScopeShape` — the safety net for the guard's retry-exhaustion gap — THEN (2) run a deterministic classify-and-split pass that assigns `costType` from `ACTION_COST_PROFILE` and splits `install`/`replace` items into a material line + a labor line. Output flips from `ExtractedItem[]` to `BillableItem[]`.
**Impact:** Imports change (`BillableItem` → `ExtractedItem` for the internal working type; `billableItemSchema` added for the output schema; `extractedItemSchema` added for the input schema; `ACTION_COST_PROFILE` imported from `agent-rules.ts`; `checkScopeShape` imported from `item-validator.ts`). `normKey`/`normQuote`/`generateItemId`/the dedup loop are unchanged — they operate on the same `trade`/`action`/`scope`/`location`/`sourceQuote` fields that exist on both old and new types. A new scope-quality filter, a new `classifyAndSplit` function, and `droppedByScopeViolation`/`splitCount` log fields are added.

#### Before
```ts
import { createStep } from '@mastra/core/workflows';
import { createHash } from 'crypto';
import { z } from 'zod';
import {
  type BillableItem,
  billableItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';

// ... normKey, normQuote unchanged ...

/**
 * Content-addressable id: sha256 of the item's identifying tuple,
 * truncated to 12 hex chars. Stable across passes (extract + audit)
 * and across re-runs of the same estimate, so the audit pass can
 * reference Pass A ids directly without remapping.
 */
function generateItemId(it: BillableItem): string {
  const seed = `${it.trade}-${it.action}-${it.scope}-${it.location}`.toLowerCase();
  return 'item-' + createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

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
    const seenKeys = new Set<string>();
    const seenQuotes = new Set<string>();
    const merged: BillableItem[] = [];
    let droppedBySourceQuote = 0;
    let droppedByStructuralKey = 0;

    for (const it of [...inputData.items, ...inputData.auditItems]) {
      // ... dedup loop unchanged ...
    }

    const renumbered = merged.map((it) => ({
      ...it,
      id: generateItemId(it),
    }));

    mastra.getLogger().info('[extraction-quality]', {
      estimateRequestId: inputData.estimateRequestId,
      passACount: inputData.items.length,
      auditCount: inputData.auditItems.length,
      droppedBySourceQuote,
      droppedByStructuralKey,
      auditFailed: inputData.auditFailed,
      mergedCount: renumbered.length,
    });

    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      items: renumbered,
    };
  },
});
```

#### After
```ts
import { createStep } from '@mastra/core/workflows';
import { createHash } from 'crypto';
import { z } from 'zod';
import {
  type BillableItem,
  type ExtractedItem,
  billableItemSchema,
  extractedItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import { ACTION_COST_PROFILE } from '@/mastra/config/agent-rules';
import { checkScopeShape } from '@/mastra/agents/processors/item-contract-guard/item-validator';

// ... normKey, normQuote unchanged (now typed on ExtractedItem instead of BillableItem) ...

/**
 * Content-addressable id: sha256 of the item's identifying tuple,
 * truncated to 12 hex chars. Stable across passes (extract + audit)
 * and across re-runs of the same estimate, so the audit pass can
 * reference Pass A ids directly without remapping.
 */
function generateItemId(it: ExtractedItem): string {
  const seed = `${it.trade}-${it.action}-${it.scope}-${it.location}`.toLowerCase();
  return 'item-' + createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

/**
 * Deterministically assign `costType` and split mixed-cost items.
 *
 * `repair` / `service` / `evaluate` / `remove` never involve buying a
 * new part — they become a single `labor` line, unchanged otherwise.
 *
 * `install` / `replace` always involve BOTH a material purchase and the
 * labor to put it in — these are split into two billable lines that
 * share the same trade/action/scope/location/quantity/sourceQuote, so
 * the report shows two rows badged "Material" and "Labor" for the same
 * scope/location, each individually priceable, instead of one ambiguous
 * line that can only be billed as one or the other.
 *
 * Split ids are derived from the base id with a stable suffix so they
 * stay deterministic across re-runs, same as `generateItemId` itself.
 */
function classifyAndSplit(
  items: readonly (ExtractedItem & { id: string })[],
): { result: BillableItem[]; splitCount: number } {
  const result: BillableItem[] = [];
  let splitCount = 0;

  for (const it of items) {
    const profile = ACTION_COST_PROFILE[it.action];
    if (profile === 'labor-only') {
      result.push({ ...it, costType: 'labor' });
      continue;
    }
    // 'material-and-labor'
    splitCount++;
    result.push({ ...it, id: `${it.id}-material`, costType: 'material' });
    result.push({ ...it, id: `${it.id}-labor`, costType: 'labor' });
  }

  return { result, splitCount };
}

export const mergeItemsStep = createStep({
  id: 'merge-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(extractedItemSchema),
    auditItems: z.array(extractedItemSchema),
    auditFailed: z.boolean(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    items: z.array(billableItemSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    const seenKeys = new Set<string>();
    const seenQuotes = new Set<string>();
    const merged: ExtractedItem[] = [];
    let droppedBySourceQuote = 0;
    let droppedByStructuralKey = 0;

    for (const it of [...inputData.items, ...inputData.auditItems]) {
      // ... dedup loop unchanged ...
    }

    // Scope-quality safety net: the guard already retries the model on a
    // vague scope (e.g. a bare "Siding"/"Foundation"/"Receptacles"), but
    // gives up after `maxProcessorRetries` and lets the last attempt
    // through anyway. Re-running the IDENTICAL rule here means a vague
    // scope that survived the guard's retry budget still never reaches
    // the persisted report — it's dropped instead of shown as a garbage
    // line item on the client-facing invoice.
    const scopeValid = merged.filter((it) => checkScopeShape(it.scope).length === 0);
    const droppedByScopeViolation = merged.length - scopeValid.length;

    const renumbered = scopeValid.map((it) => ({
      ...it,
      id: generateItemId(it),
    }));

    const { result: classified, splitCount } = classifyAndSplit(renumbered);

    mastra.getLogger().info('[extraction-quality]', {
      estimateRequestId: inputData.estimateRequestId,
      passACount: inputData.items.length,
      auditCount: inputData.auditItems.length,
      droppedBySourceQuote,
      droppedByStructuralKey,
      droppedByScopeViolation,
      auditFailed: inputData.auditFailed,
      mergedCount: renumbered.length,
      splitCount,
      finalLineCount: classified.length,
    });

    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      items: classified,
    };
  },
});
```

#### Reasoning
- The scope-quality filter runs BEFORE renumbering and BEFORE the split, on the same `merged` array dedup already produced. This ordering matters: an item dropped for a vague scope should never get an id assigned or get split into a material+labor pair — both of those would be wasted work on data that's about to be discarded.
- `droppedByScopeViolation` sits alongside the existing `droppedBySourceQuote`/`droppedByStructuralKey` counters in the same log call — same pattern, not a new log line, so this drop reason is visible in the exact place engineers already look for extraction-quality regressions.
- The dedup loop, `normKey`, and `normQuote` are untouched — they key off `trade`/`action`/`scope`/`location`/`sourceQuote`, none of which moved. Dedup correctly happens BEFORE the split: comparing two pre-split `ExtractedItem`s for "is this the same defect mentioned twice across Pass A and Pass B" is unaffected by costType, which doesn't exist yet at that point in the pipeline.
- Splitting happens AFTER renumbering (not before) so `generateItemId` only ever hashes one canonical tuple per real-world defect; the `-material`/`-labor` suffixes are then derived from that single stable id, keeping both halves traceable back to the same source defect and stable across re-runs (same property as the original `generateItemId` design goal).
- `quantity` is **not** divided between the two split lines — both the material line and the labor line carry the full original `quantity` (e.g. "2 receptacles" → material line qty=2, labor line qty=2). This is intentional: the material line prices "2 receptacles" (the parts), the labor line prices "2 receptacle installations" (the labor to put in 2 of them) — they are two different cost bases over the same count, not a quantity split.
- `finalLineCount` is logged alongside `mergedCount` so a future regression in split behavior (e.g. silently stopping the split) is visible in the `[extraction-quality]` log without needing to inspect a row's `summary` directly.

### `src/mastra/agents/item-pricer.ts`
**Action:** Modify
**Why:** The pricer is never told whether it's pricing a material or labor line today — it infers the nature of the line purely from `trade`/`action`/`scope` text, which is exactly the kind of guess this whole fix is eliminating elsewhere. Once `costType` is reliably split, the pricer must price each half correctly: a `material` line should be priced as the part's cost, a `labor` line as the cost of the work — never blend the two.
**Impact:** Two new HARD RULES added to the prompt (after existing rule 5, renumbering 6→8 to 8→10). No change to the agent's model, gateway, or output schema.

#### Before
```
5. NEVER produce a range. Pick a single integer or null. If your honest
   answer is a range, return null with unavailableReason explaining the
   range and recommending a contractor quote.
6. Local area means the SUPPLIED zip code. If you only have a national
   average, you may use it but mark confidence = "low" and say so in
   source (e.g. "national average (no local data)").
7. The unitPrice is PER UNIT OF QUANTITY. The report multiplies by
   quantity itself. Example: item is "replace 3 shingles", quantity is 3;
   you return the price PER SHINGLE, not for all three.
8. Better to admit ignorance than to overbill or underbill blindly. If
   the inspector's wording is genuinely ambiguous about the scope (which
   the extractor was supposed to filter, but might miss), return null with
   unavailableReason = "Scope ambiguous; needs contractor quote."
9. confidence reflects how well-grounded your number is in real local
   market data for the supplied zip code. "high" only when you have a
   defensible local-market number; "medium" when you have a defensible
   regional/state-level number; "low" when you only have a national
   average or rule-of-thumb.
```

#### After
```
5. NEVER produce a range. Pick a single integer or null. If your honest
   answer is a range, return null with unavailableReason explaining the
   range and recommending a contractor quote.
6. Local area means the SUPPLIED zip code. If you only have a national
   average, you may use it but mark confidence = "low" and say so in
   source (e.g. "national average (no local data)").
7. The unitPrice is PER UNIT OF QUANTITY. The report multiplies by
   quantity itself. Example: item is "replace 3 shingles", quantity is 3;
   you return the price PER SHINGLE, not for all three.
8. The input tells you costType: "material" or "labor". PRICE ONLY THAT
   HALF — never blend them:
   - costType "material": price the physical part/materials ONLY (what
     it costs to buy the item). Do NOT include any labor or installation
     charge.
   - costType "labor": price ONLY the labor charge to perform the named
     action (install / replace / repair / etc.) on this item. Do NOT
     include the cost of the part itself.
   A "replace receptacle" pair sends you two separate calls: one with
   costType=material (price the receptacle), one with costType=labor
   (price the labor to swap it in). Treat them as two unrelated pricing
   questions about the same physical job — never silently fold one
   into the other.
9. Better to admit ignorance than to overbill or underbill blindly. If
   the inspector's wording is genuinely ambiguous about the scope (which
   the extractor was supposed to filter, but might miss), return null with
   unavailableReason = "Scope ambiguous; needs contractor quote."
10. confidence reflects how well-grounded your number is in real local
    market data for the supplied zip code. "high" only when you have a
    defensible local-market number; "medium" when you have a defensible
    regional/state-level number; "low" when you only have a national
    average or rule-of-thumb.
```
Rules 1-4 and the rest of the prompt (INPUT, OUTPUT, the closing instruction) are unchanged — elided here.

#### Reasoning
- The new rule 8 is placed before the existing ignorance/confidence rules so the model reads "what am I pricing" before "how confident am I" — order mirrors the actual decision sequence.
- Explicit worked example ("replace receptacle" → two separate calls) anchors the abstract rule to the exact real-world case that motivated this fix.

### `src/mastra/workflows/steps/price-items.ts`
**Action:** Modify
**Why:** The pricer's new rule 8 (above) is meaningless if the per-item call never tells it `costType` or `unit` — today's `userText` only sends `zipCode`, `trade`, `action`, `scope`, `location`, `quantity`, `sourceQuote`.
**Impact:** Two new lines added to the `userText` template string. No schema or control-flow changes — `item.unit` and `item.costType` already exist on `BillableItem` (the type `inputData.items` is typed as).

#### Before
```ts
const userText =
  'Price ONE billable item. Return JSON matching the schema.\n\n' +
  `zipCode: ${inputData.zipCode}\n` +
  `trade: ${item.trade}\n` +
  `action: ${item.action}\n` +
  `scope: ${item.scope}\n` +
  `location: ${item.location}\n` +
  `quantity: ${item.quantity}\n` +
  `sourceQuote: ${JSON.stringify(item.sourceQuote)}`;
```

#### After
```ts
const userText =
  'Price ONE billable item. Return JSON matching the schema.\n\n' +
  `zipCode: ${inputData.zipCode}\n` +
  `trade: ${item.trade}\n` +
  `action: ${item.action}\n` +
  `scope: ${item.scope}\n` +
  `location: ${item.location}\n` +
  `quantity: ${item.quantity}\n` +
  `unit: ${item.unit}\n` +
  `costType: ${item.costType}\n` +
  `sourceQuote: ${JSON.stringify(item.sourceQuote)}`;
```

#### Reasoning
- Placed after `quantity` and before `sourceQuote`, matching the order the pricer's instructions now reference them (rule 7 talks about quantity, the new rule 8 talks about costType) — the prompt and the data line up in reading order.

### `src/mastra/agents/processors/item-contract-guard/item-validator.ts` (continued — scope-quality export)
**Action:** Modify
**Why:** `merge-items.ts`'s safety-net filter (Step 10) needs the exact same scope-shape rule the guard uses, so a future change to one can't silently diverge from the other. `checkScopeShape` is refactored from a mutate-an-`out`-array function to a pure function returning its own reasons array, then exported.
**Impact:** `checkScopeShape`'s signature changes from `(scope: string, out: string[]): void` to `(scope: string): string[]`. Its one call site inside `validateItem` (already shown in the earlier change to this file) updates to `reasons.push(...checkScopeShape(item.scope))`.

#### Before
```ts
function checkScopeShape(scope: string, out: string[]): void {
  const trimmed = scope.trim();
  const firstWord = trimmed.toLowerCase().split(/\s+/)[0] ?? '';

  if (ARTICLES.has(firstWord)) {
    out.push(
      `scope "${scope}" starts with article "${firstWord}" — emit the noun phrase without a leading article`,
    );
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (ACTION_VERBS_SET.has(firstWord) && tokens.length < 3) {
    out.push(
      `scope "${scope}" likely starts with an action verb — the action belongs in the "action" field, not scope`,
    );
  }
  if (SENTENCE_PUNCTUATION_RE.test(trimmed)) {
    out.push(
      `scope "${scope}" contains sentence punctuation — emit a noun phrase, not a sentence`,
    );
  }
  if (tokens.length < 2) {
    out.push(
      `scope "${scope}" is a single token — be more specific (e.g. "kitchen GFCI receptacle")`,
    );
  }
}
```
(Called from `validateItem` as: `checkScopeShape(item.scope, reasons);`)

#### After
```ts
/**
 * Exported so `merge-items.ts` can run the identical rule as a
 * deterministic safety net AFTER the guard's retry budget is exhausted.
 * The guard retries the model up to `maxProcessorRetries` times on a
 * violation, but if the model still emits a vague scope on the final
 * attempt, the guard's `abort()` gives up and the bad scope reaches
 * `merge-items.ts` anyway — this same function is the last line of
 * defense there, which only works if it's the SAME rule, not a
 * hand-copied duplicate that can drift.
 */
export function checkScopeShape(scope: string): string[] {
  const reasons: string[] = [];
  const trimmed = scope.trim();
  const firstWord = trimmed.toLowerCase().split(/\s+/)[0] ?? '';

  if (ARTICLES.has(firstWord)) {
    reasons.push(
      `scope "${scope}" starts with article "${firstWord}" — emit the noun phrase without a leading article`,
    );
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (ACTION_VERBS_SET.has(firstWord) && tokens.length < 3) {
    reasons.push(
      `scope "${scope}" likely starts with an action verb — the action belongs in the "action" field, not scope`,
    );
  }
  if (SENTENCE_PUNCTUATION_RE.test(trimmed)) {
    reasons.push(
      `scope "${scope}" contains sentence punctuation — emit a noun phrase, not a sentence`,
    );
  }
  if (tokens.length < 2) {
    reasons.push(
      `scope "${scope}" is a single token — be more specific (e.g. "kitchen GFCI receptacle")`,
    );
  }
  return reasons;
}
```
`validateItem`'s call site updates to:
```ts
reasons.push(...checkScopeShape(item.scope));
```

#### Reasoning
- Pure function (no mutation of a caller-provided array) is both a cleaner shape for a second caller to use and removes the only reason the old signature took an `out: string[]` parameter in the first place (it was written only for `validateItem`'s single call site).
- This is the only way `merge-items.ts` can apply the rule without re-implementing it — the alternative (a parallel `isScopeVague()` check hand-written in `merge-items.ts`) is exactly the kind of drift risk the rest of this codebase already avoids (see `INCOMPATIBLE_UNITS`/`ACTION_VERBS_SET` being centralized in `agent-rules.ts` for the same reason).

### `src/mastra/agents/billable-item-extractor.ts` (continued — scope examples)
**Action:** Modify
**Why:** The existing `scope` instruction says "Be specific enough that a contractor knows exactly what to quote" with examples of GOOD scope, but gives no explicit BAD examples — and the model's actual failure mode tonight was emitting exactly the trade-category word as scope ("Siding", "Foundation", "Chimney", "Receptacles"). Naming the exact failure pattern is more effective than restating the abstract rule a second way.
**Impact:** The `scope` field instruction (in "FIELDS YOU MUST PRODUCE PER ITEM") gains explicit bad examples.

#### Before
```
- scope: a short noun phrase naming the item. Be specific enough that a
  contractor knows exactly what to quote. Examples: 'kitchen GFCI
  receptacle', 'angle stop under kitchen sink', 'double-tapped breaker
  #14 in main panel'.
```

#### After
```
- scope: a short noun phrase naming the item. Be specific enough that a
  contractor knows exactly what to quote. Examples: 'kitchen GFCI
  receptacle', 'angle stop under kitchen sink', 'double-tapped breaker
  #14 in main panel'.
  NEVER emit a bare trade-category word as scope — "siding", "foundation",
  "chimney", "receptacles", "plumbing", "roof" are NOT valid scope on
  their own, even if that is the only word the report uses nearby. Find
  the actual noun phrase from the inspector's sentence that names the
  specific component or defect. BAD -> GOOD:
    "siding" -> "loose siding panel" / "damaged siding board"
    "foundation" -> "foundation moisture intrusion" / "foundation crack"
    "chimney" -> "leaning chimney structure" / "chimney movement"
    "receptacles" -> "loose wall receptacle" / "ungrounded receptacle"
  If the report's wording is genuinely too vague to produce a real noun
  phrase even after re-reading the sentence, omit the item rather than
  emit a one-word category label.
```
Every other field instruction and the rest of the prompt is unchanged — elided here.

#### Reasoning
- Listing the EXACT words observed failing tonight ("siding", "foundation", "chimney", "receptacles") rather than only abstract guidance gives the model concrete anchors for the specific pattern it's been getting wrong, while the BAD→GOOD pairs model the actual transformation expected (add the specific defect/component, not just any extra word).
- The closing instruction ("omit rather than emit a one-word label") gives the model an explicit safe fallback — consistent with the existing prompt's repeated "when unsure, omit" philosophy elsewhere in the same file.

## Validation Plan
- **TypeScript:** `pnpm exec tsc --noEmit` must be clean. Run after Step 1 (schema) before touching any consumer, since every other step's edits exist to satisfy the type change cascading from `extractedItemSchema`/`billableItemSchema` splitting apart — `tsc` is the actual gate proving the cascade is complete (no stray `billableItemSchema`/`billableItemGuardSchema`/`BillableItemGuard`/`INCOMPATIBLE_UNITS` reference left importing something deleted).
- **ESLint:** `pnpm exec eslint <changed paths>` clean on every file in the Modification Table.
- **DB migrations:** none. No DB schema change — `costType` lives inside the JSON `summary` column, item count per estimate simply grows for split lines.
- **Manual smoke test (re-run against an existing estimate, e.g. one of the two rows fixed earlier today):**
  1. Trigger a retry/reprocess on a row containing an `install` or `replace` item (e.g. "receptacle").
  2. Confirm the `[extraction-quality]` log shows `splitCount > 0` and `finalLineCount > mergedCount`.
  3. Open `/dashboard/estimate/[id]` and confirm the "receptacle" defect now renders as TWO rows: one badged "Material", one badged "Labor", each with its own price (the badge text itself is unchanged from today).
  4. Re-run the SAME PDF a second time (full pipeline, not just a retry) and confirm the two receptacle rows get the SAME costType split both times — this is the actual regression test for the bug reported (4 receptacles, 3 labor / 1 material, inconsistent across runs). It should now be 100% deterministic.
  5. Confirm a `repair`-only item (e.g. "electrical panel knockouts") still renders as exactly ONE row badged "Labor" (not split).
  6. Spot-check the pricer's `source`/`confidence` on a few split pairs to confirm the material price and labor price look distinct (not the same number copy-pasted) — this verifies the new pricer rule 8 is actually being followed, not just present in the prompt.
  7. Confirm the `[extraction-quality]` log's `droppedByScopeViolation` count, and manually verify no remaining row in the report has a bare one-word scope like "Siding"/"Foundation"/"Chimney"/"Receptacles" — this is the regression test for the second bug (vague titles surviving guard retry-exhaustion).
  8. Re-run the SAME PDF that originally produced "Siding"/"Foundation"/"Chimney"/"Receptacles" tonight and confirm those specific items either (a) come back with a real noun-phrase scope thanks to the tightened prompt, or (b) are dropped and counted in `droppedByScopeViolation` rather than appearing verbatim in the report — either outcome is acceptable, silently appearing unchanged is not.
- **PR gate:** push the feature branch (`fix/labor-material-classification` per `AGENTS.md` naming), open the PR via `gh pr create`, link this plan file, include the validation summary. Do NOT merge.

## Risk Notes
- **The scope-quality filter trades data loss for honesty.** Dropping an item rather than showing a vague title means a real billable defect can disappear from the report entirely if the model never produces a usable noun phrase for it across all guard retries. This is a deliberate tradeoff: a missing line item is recoverable (re-run, or the contractor catches it on-site); a garbage line item titled "Siding" on a client-facing invoice is a trust problem the moment the client sees it. If `droppedByScopeViolation` turns out high in practice (analogous to the existing >50%-unpriced threshold already flagged in the original pricing plan), that's the signal to revisit — either loosen the rule or add a recovery path (e.g. one extra workflow-level retry pass specifically for scope-dropped items) rather than accept silent data loss indefinitely.
- **Pricer still has no real lookup tool.** This fix makes costType classification deterministic and tells the pricer which half it's pricing, but it does not give the pricer a real materials-cost or labor-rate database — it is still the model's general knowledge, self-filtered by "would I bet money on this." Expect the unpriced rate to stay high for genuinely local-market-dependent items; that is a separate, already-flagged risk in the original pricing plan, not something this fix claims to solve.
- **Doubling line count changes report length and total line items.** An estimate that previously showed 30 lines (1 per defect) may now show 40-45 (each install/replace defect becomes 2). This is intentional and correct (it reflects two real, separately billable costs) but is a visible UX change worth confirming looks acceptable in the smoke test, not just correct.
- **Existing persisted rows are not migrated.** Rows already in the DB (including the two reprocessed earlier tonight) keep whatever single-costType guess they got under the old model-driven classification until they're reprocessed again via retry. No backfill script is in scope for this fix — consistent with how this codebase has always handled schema evolution (re-process via the existing retry action, no migration).
- **`generateItemId`'s suffix scheme (`-material`/`-labor`) assumes no existing id ever naturally ends in those strings.** Ids are `item-<12 hex chars>`, so a collision with the literal suffix text is not possible — hex digests don't produce trailing `-material`/`-labor`. No mitigation needed beyond this guarantee already holding.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
