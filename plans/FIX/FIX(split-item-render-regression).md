# FIX(split-item-render-regression)

## Request

Two defects visible in the same live report, fixed together:

**Part 1 — Rendering regression.** Revert the "grouped split-pair"
rendering in the estimate report. The Material/Labor split itself
(`merge-items.ts` splitting `install`/`replace` items into two billable
lines via `ACTION_COST_PROFILE`) is intentional, pre-existing design and
is **not** touched by this fix. What broke is how the report **displays**
that split: `groupSplitPairs()` + `SplitItemRow`/`CostLine` (added in the
prior labor/materials conventions fix) collapse the two lines into ONE
card — a single shared scope/location header with two bare
`badge / qty / price` sub-rows stacked underneath, no independent
scope/location/quote per line. Confirmed regression, from the user
directly: this reads as "1 item [with] two tags," not as two distinct
billable line items. The prior, correct behavior — before that grouping
was added — was two fully independent `ItemRow`s, each with its own
complete scope/location/source-quote block, its own badge, its own
quantity/unit, its own price. That is the behavior to restore.

**Part 2 — Bad unit/quantity data reaching the report.** Independent of
the rendering bug, the LIVE extractor (`billable-item-extractor.ts`, the
agent actually running on `main` today — the Docling/Stage-1/2 rewrite is
a separate, not-yet-merged branch) is emitting `unit: 'ea'` for materials
that are never sold or quoted "each" in real trade practice — wood siding,
trim boards, drywall, roofing — because its current rule falls back to
`ea` whenever the source report gives no explicit measurement. This is
NOT something introduced by this session's prior fixes: it predates them.
What the prior fix DID do is remove the "labor always shows HRS" display
override, which means this pre-existing bad unit is now visible on labor
lines too instead of being masked. The fix here is upstream, at the
classification layer: make the model pick the unit real contractors use
for that TYPE of material (`sf` for area-measured materials like siding,
`lf` for length-measured materials like trim, `hrs` only when the
inspector gave hours, `ea` reserved for genuinely discrete purchased
items), backed by a deterministic guard so a wrong/implausible unit gets
a real retry instead of silently reaching the report. This also closes
the related defect where one item names two different components joined
by "or" (e.g. "Damaged Trim Or Wood Siding" — trim is `lf`, siding is
`sf`; they can never share one correct unit), which is a violation of the
extractor's own existing "ONE ITEM PER FIX" rule that nothing currently
catches mechanically.

**Part 3 — Material and Labor rows show an identical, undifferentiated
title.** `merge-items.ts`'s `classifyAndSplit` clones the entire item —
including `scope` — onto both split halves. Both rows then call
`formatScope(item.scope)` on the same string, so a split pair's Material
row and Labor row display the exact same bold title with nothing but the
small badge to tell them apart. That reads as duplicated, undifferentiated
AI output. Fix, confirmed with the user: differentiate via a trailing
NOUN qualifier on the labor row only (e.g. "Wood Siding Board Replacement"
vs "Wood Siding Board"), NOT an action-verb prefix — `format.ts`'s
existing doc comment on `formatScope` records that a past PR (#13)
deliberately removed a verb-prefix behavior "because it drifted from the
prototype," and a noun-suffix approach respects that constraint instead
of silently reintroducing it. This is purely deterministic — no new model
output, no prompt change, no new fields — and because it's renderer-only,
it improves already-persisted estimates immediately, unlike Part 2.

## Root Cause

`items-section.tsx`'s `TradeGroup` calls `groupSplitPairs(groupItems)`
(`src/features/estimate/lib/group-split-pairs.ts`) before rendering, which
detects the `<base>-material` / `<base>-labor` id-suffix pairs
`merge-items.ts` produces and merges each pair into one `ItemGroup` with
`lines.length === 2`. `TradeGroup` then renders those as `SplitItemRow`
instead of two `ItemRow`s. This was a deliberate design choice at the time
(intended to reduce "visual duplication" of a repeated scope/location/
quote), but in practice it reads as a single confusing item wearing two
tags rather than two clear, independently billable lines — exactly the
failure mode reported.

## Directory Map

```text
falcon-bighorn/
├── FIX(split-item-render-regression).md              [CREATE] this plan
└── src/
    ├── features/estimate/
    │   ├── components/
    │   │   └── items-section.tsx                      [MODIFY] remove grouping; flat ItemRow rendering; use formatItemTitle
    │   └── lib/
    │       ├── group-split-pairs.ts                    [DELETE] no longer referenced anywhere
    │       └── format.ts                                [MODIFY] add formatItemTitle (labor-row noun-suffix)
    └── mastra/agents/
        ├── billable-item-extractor.ts                  [MODIFY] unit-by-material-type prompt guidance
        └── processors/item-contract-guard/
            ├── item-heuristics.ts                      [MODIFY] add material-unit keyword sets
            └── item-validator.ts                       [MODIFY] add checkMaterialUnitPlausibility + checkMixedMaterialTypeScope
```

No other files reference `groupSplitPairs`, `SplitItemRow`, or `CostLine`
(confirmed by repo-wide grep before drafting this plan). No schema, no
workflow, no pricing, no `merge-items.ts` change — Part 1 is a
rendering-only revert; Part 2 is a prompt + deterministic-guard change
confined to the extraction/validation layer.

## Modification Table

| File | Action | Why |
|---|---|---|
| `src/features/estimate/components/items-section.tsx` | Modify | **(Part 1 + Part 3)** Remove the `groupSplitPairs` import and call; `TradeGroup` maps `ItemRow` directly over every item again, exactly as it did before the split-pair grouping was introduced. Delete the now-unused `SplitItemRow` and `CostLine` components. `ItemRow`'s quantity/unit/price/badge logic (`formatUnit(item.unit)`, `formatCostType(item.costType)`) is untouched — only its title call site changes, from `formatScope` directly to `formatItemTitle` (Change D). |
| `src/features/estimate/lib/group-split-pairs.ts` | Delete | **(Part 1)** Its sole purpose was feeding the grouped rendering being reverted. No other module imports it. |
| `src/features/estimate/lib/format.ts` | Modify | **(Part 3)** Add `formatItemTitle(scope, action, costType)`: labor rows in an install/replace split pair get a trailing noun suffix ("Installation"/"Replacement"); every other row (material rows, and all labor-only-action rows, which have no material counterpart to differentiate against) is unchanged. Deterministic, no model involvement. |
| `src/mastra/agents/processors/item-contract-guard/item-heuristics.ts` | Modify | **(Part 2)** Add `AREA_MATERIAL_KEYWORDS` and `LENGTH_MATERIAL_KEYWORDS` — same "constants, not code paths" home as `ARTICLES`/`ACTION_VERBS`. |
| `src/mastra/agents/processors/item-contract-guard/item-validator.ts` | Modify | **(Part 2)** Add `checkMaterialUnitPlausibility` (flags `unit: 'ea'` on scope text naming a known area/length material) and `checkMixedMaterialTypeScope` (flags a scope naming BOTH an area-type and a length-type material — a provable unit conflict, not a generic "contains and/or" heuristic), both wired into `validateItem` alongside the existing `checkScopeShape`/`checkUnitActionCoupling` checks — same abort/retry mechanism, no new guard class. |
| `src/mastra/agents/billable-item-extractor.ts` | Modify | **(Part 2)** Strengthen the `unit` field's prompt guidance with explicit material-type → unit mapping and BAD→GOOD examples, matching the existing scope BAD→GOOD pattern already in this prompt. |

## Existing Pattern Audit

- **Pre-regression baseline.** Before the split-pair grouping was added,
  `TradeGroup` was: `{groupItems.map((item) => <ItemRow key={item.id}
  item={item} .../>)}` — a plain map, no grouping step. This fix restores
  that exact shape verbatim; it does not invent a new rendering pattern.
- **`ItemRow`'s structure is unchanged; only its title call site is
  (see Part 3 / Change D).** It independently renders, per item: a title
  (`formatScope` directly today; `formatItemTitle` — which calls
  `formatScope` internally — after this fix), `formatLocation`/optional
  source quote, a `formatCostType(item.costType)` badge (`MATERIAL` or
  `LABOR`), quantity + `formatUnit(item.unit)`, and the priced line total
  (or "Price unavailable"). For a split pair, this means the material line
  and labor line each render as a complete, self-contained row — including
  each repeating its own location/quote (and, post-fix, a differentiated
  title), which is the accepted, correct tradeoff (some visual repetition)
  in exchange for each row reading as an unambiguous, independent billable
  item.
- **Nothing downstream depends on the grouped shape.** `groupSplitPairs`
  only reorganizes an already-fetched `BillableItem[]` for rendering
  purposes; `priceByItemId`, `subtotal`/`unpriced` totals in
  `ItemsSection`, and `groupSubtotal` in `TradeGroup` all iterate the flat
  `items`/`groupItems` arrays already and require no change.
- **Split-id scheme is untouched.** `merge-items.ts` still produces
  `<base>-material` / `<base>-labor` ids. This fix does not touch that —
  it only stops the report from using those ids to merge rendering. If a
  future request asks for a different (non-merged) way to visually relate
  the pair, the id scheme is still available to key off of; that is out of
  scope here.
- **(Part 2) Guard-retry + no-merge-fallback pattern, same as
  `checkScopeShape`.** `item-validator.ts` already has a two-layer pattern
  for some checks (`checkUnitActionCoupling`: guard retries the model,
  `merge-items.ts` applies a deterministic fallback if retries exhaust)
  and a guard-only pattern for others (`checkScopeShape` originally had no
  merge-time fallback until one was added later for a different reason).
  `checkMaterialUnitPlausibility` and `checkMixedMaterialTypeScope` are
  guard-only, matching `checkScopeShape`'s original shape: there is no safe
  deterministic correction for "this item's unit should probably be sf,
  not ea" or "split this compound scope into two items" — both require
  real judgment, so the fix is to give the model real retry pressure to
  get it right, not to invent a merge-time guess that could easily be
  wrong. If the guard's retry budget exhausts, the item still reaches
  `merge-items.ts` with whatever the model's last attempt produced —
  exactly today's worst case, now with real correction pressure applied
  first.
- **Prompt BAD→GOOD pattern.** The scope field already teaches the model
  via BAD→GOOD pairs (`"siding" -> "loose siding panel"`). The unit fix
  extends the identical pattern to the unit field rather than inventing a
  new prompting style.
- **Keyword-set-in-`item-heuristics.ts` pattern.** `ARTICLES` and
  `ACTION_VERBS` are exactly this shape already: a `ReadonlySet<string>`
  of lowercase words, matched against the first token or full text of
  `scope`. `AREA_MATERIAL_KEYWORDS`/`LENGTH_MATERIAL_KEYWORDS` follow the
  same shape and same file.
- **(Part 3) Respecting the documented no-verb-prefix constraint.**
  `format.ts`'s `formatScope` doc comment explicitly records that a past
  PR (#13) removed a verb-prefix behavior "because it drifted from the
  prototype." `formatItemTitle` does not touch or wrap `formatScope`'s
  no-verb behavior — it calls `formatScope` unchanged for the base title
  and appends a trailing NOUN ("Installation"/"Replacement"), which is a
  distinct, additive concern, not a reintroduction of the removed verb
  prefix. Confirmed with the user directly (noun-suffix chosen over
  verb-prefix) before writing this section.

## Execution Plan

1. Modify `src/features/estimate/components/items-section.tsx`:
   remove the `groupSplitPairs` import, revert `TradeGroup`'s render body,
   delete `SplitItemRow` and `CostLine`, update `ItemRow` to call
   `formatItemTitle` instead of `formatScope` directly (all four changes
   applied in one pass since they touch the same file — `formatItemTitle`
   is defined in step 3, not yet at this point; this file will not
   typecheck in isolation until step 3 lands, which is expected and fine
   as long as `tsc` is run only after all steps, per the Validation Plan,
   not after each individual step).
2. Delete `src/features/estimate/lib/group-split-pairs.ts`.
3. Modify `src/features/estimate/lib/format.ts`: add `formatItemTitle`.
4. Modify `src/mastra/agents/processors/item-contract-guard/item-heuristics.ts`:
   add `AREA_MATERIAL_KEYWORDS`, `LENGTH_MATERIAL_KEYWORDS`.
5. Modify `src/mastra/agents/processors/item-contract-guard/item-validator.ts`:
   add `checkMaterialUnitPlausibility` + `checkMixedMaterialTypeScope`,
   wire both into `validateItem`.
6. Modify `src/mastra/agents/billable-item-extractor.ts`: strengthen the
   `unit` field's prompt guidance.
7. Validation gates (below), then stop for review.

File order above matches the File-by-File Changes section below exactly,
so the two can be followed side by side without jumping around.

## File-by-File Changes

### `src/features/estimate/components/items-section.tsx`

**Action:** Modify
**Why:** Restore flat, independent per-item rendering; remove the grouping
that caused the regression; **(Part 3)** use `formatItemTitle` so a split
pair's two rows no longer show an identical bold title.
**Impact:** Split material/labor pairs render as two separate `ItemRow`s
again, each showing its own scope/location/source-quote/badge/qty/price,
and the labor row's title now carries a differentiating noun suffix.
Non-split items are unaffected (they were always single `ItemRow`s, and
labor-only actions get no suffix — see Change D).

#### Change A — swap the `groupSplitPairs` import for `formatItemTitle`

##### Before

```tsx
import {
  PRICE_UNAVAILABLE,
  formatCostType,
  formatCurrency,
  formatLineTotal,
  formatLocation,
  formatScope,
  formatTradeLabel,
  formatUnit,
} from '@/features/estimate/lib/format';
import { groupSplitPairs } from '@/features/estimate/lib/group-split-pairs';
import type {
  BillableItem,
  PricedLineItem,
} from '@/mastra/agents/billable-item-extractor.schema';
```

##### After

```tsx
import {
  PRICE_UNAVAILABLE,
  formatCostType,
  formatCurrency,
  formatLineTotal,
  formatLocation,
  formatItemTitle,
  formatTradeLabel,
  formatUnit,
} from '@/features/estimate/lib/format';
import type {
  BillableItem,
  PricedLineItem,
} from '@/mastra/agents/billable-item-extractor.schema';
```

(`formatScope` is no longer imported directly here — `ItemRow` now calls
`formatItemTitle`, which calls `formatScope` internally. After this plan,
`formatScope` has no consumer left outside `format.ts` itself — verified
by repo-wide grep: its only two call sites today are both inside this
file, one becoming `formatItemTitle` here in Change A/D, the other
deleted with `SplitItemRow` in Change C. It stays exported anyway, as the
existing public function `formatItemTitle` wraps, not because some other
consumer needs it — there isn't one today.)

#### Change B — `TradeGroup` renders items flatly again

##### Before

```tsx
      <div>
        {groupSplitPairs(groupItems).map((group) =>
          group.lines.length === 1 ? (
            <ItemRow
              key={group.lines[0].id}
              item={group.lines[0]}
              price={priceByItemId.get(group.lines[0].id) ?? null}
              showSource={showSource}
              showEvidence={showEvidence}
            />
          ) : (
            <SplitItemRow
              key={group.lines[0].id}
              lines={group.lines}
              priceByItemId={priceByItemId}
              showSource={showSource}
              showEvidence={showEvidence}
            />
          ),
        )}
      </div>
```

##### After

```tsx
      <div>
        {groupItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            price={priceByItemId.get(item.id) ?? null}
            showSource={showSource}
            showEvidence={showEvidence}
          />
        ))}
      </div>
```

#### Change C — delete `SplitItemRow` and `CostLine`

##### Before

```tsx
/**
 * One split install/replace item: the scope/location/source-quote block
 * renders once, followed by the material and labor cost lines. The cost
 * lines reuse ItemRow's grid template so the Type badge, quantity, and
 * line-total columns stay aligned with single-line items.
 */
function SplitItemRow({
  lines,
  priceByItemId,
  showSource,
  showEvidence,
}: {
  lines: BillableItem[];
  priceByItemId: Map<string, PricedLineItem>;
  showSource: boolean;
  showEvidence: boolean;
}) {
  const first = lines[0];
  return (
    <div className="border-t px-4 py-3 text-sm">
      <div className="font-medium leading-snug">{formatScope(first.scope)}</div>
      <div className="text-xs text-muted-foreground">
        {formatLocation(first.location)}
      </div>
      {showSource ? (
        <div className="mt-1 text-sm italic text-muted-foreground">
          “{first.sourceQuote}”
          {first.pageHint ? (
            <span className="not-italic"> ({first.pageHint})</span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2">
        {lines.map((line) => (
          <CostLine
            key={line.id}
            line={line}
            price={priceByItemId.get(line.id) ?? null}
            showEvidence={showEvidence}
          />
        ))}
      </div>
    </div>
  );
}

function CostLine({
  line,
  price,
  showEvidence,
}: {
  line: BillableItem;
  price: PricedLineItem | null;
  showEvidence: boolean;
}) {
  const unitPrice = price?.unitPrice ?? null;
  const lineTotal = formatLineTotal(line.quantity, unitPrice);
  const isUnpriced = lineTotal === PRICE_UNAVAILABLE;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_130px] items-center py-1">
      <div>
        {showEvidence && price ? (
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="mr-1">
              {price.confidence}
            </Badge>
            <span>source: {price.source}</span>
            {price.unitPrice === null && price.unavailableReason ? (
              <span> — {price.unavailableReason}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div>
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {formatCostType(line.costType)}
        </span>
      </div>
      <div className="tabular-nums">
        <span className="font-medium">{line.quantity}</span>
        <span className="ml-1 inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          {formatUnit(line.unit)}
        </span>
      </div>
      <div
        className={
          isUnpriced
            ? 'tabular-nums text-right text-muted-foreground'
            : 'tabular-nums text-right font-semibold'
        }
      >
        {lineTotal}
      </div>
    </div>
  );
}

function Totals({
```

##### After

```tsx
function Totals({
```

(i.e. both functions are deleted outright; `Totals` — unchanged — is the
next function in the file and is what directly follows.)

#### Change D — `ItemRow` uses `formatItemTitle` for its bold title

##### Before

```tsx
        <div className="font-medium leading-snug">{formatScope(item.scope)}</div>
```

##### After

```tsx
        <div className="font-medium leading-snug">
          {formatItemTitle(item.scope, item.action, item.costType)}
        </div>
```

#### Reasoning

- `ItemRow`'s structure (location, quote, badge, quantity, price columns)
  is otherwise unmodified — it already independently renders everything a
  complete billable line needs. Only the title's computed string changes,
  via the single call in Change D; reverting `TradeGroup` to map it
  flatly is otherwise sufficient. Nothing else about `ItemRow` contributed
  to the regression.
- Deleting `SplitItemRow`/`CostLine` rather than leaving them unused avoids
  dead code the linter would otherwise have to be told to ignore, and
  removes the only call site that made `group-split-pairs.ts` necessary.
- The header copy ("Install and Replace Items are Split into Material and
  Labor Lines") is left as-is — it is still accurate: the split is real
  and intentional, only its rendering is reverting.

---

### `src/features/estimate/lib/group-split-pairs.ts`

**Action:** Delete
**Why:** Its only purpose was feeding the grouped rendering being reverted;
confirmed (repo-wide grep) that nothing else imports `groupSplitPairs` or
its `ItemGroup` type.
**Impact:** File removed. No other file changes as a result.

#### Before

The full file, as it exists today:

```ts
import type { BillableItem } from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Group the material/labor halves of a split install/replace item into
 * one renderable unit.
 *
 * `merge-items.ts` splits install/replace items into two adjacent lines
 * with ids `<base>-material` / `<base>-labor` that share
 * trade/scope/location/sourceQuote. The report renders such a pair as
 * ONE item with two cost lines instead of two visually unrelated rows
 * repeating the same scope and quote.
 *
 * Grouping is purely mechanical: strip the split suffix and join
 * CONSECUTIVE lines with the same base id. Lines without a split suffix
 * (labor-only actions, and rows persisted before the split-id scheme)
 * always form a group of one. Consecutive-only matching means a
 * pathological envelope with interleaved or orphaned split ids degrades
 * to single rows — never to a wrong pairing.
 */
const SPLIT_SUFFIX_RE = /-(material|labor)$/;

export interface ItemGroup {
  /** 1 line (unsplit item) or 2 lines (material + labor pair). */
  lines: BillableItem[];
}

export function groupSplitPairs(items: readonly BillableItem[]): ItemGroup[] {
  const groups: Array<ItemGroup & { baseId: string; split: boolean }> = [];
  for (const item of items) {
    const split = SPLIT_SUFFIX_RE.test(item.id);
    const baseId = split ? item.id.replace(SPLIT_SUFFIX_RE, '') : item.id;
    const prev = groups[groups.length - 1];
    if (split && prev?.split && prev.baseId === baseId) {
      prev.lines.push(item);
    } else {
      groups.push({ baseId, split, lines: [item] });
    }
  }
  return groups;
}
```

#### After

File deleted.

#### Reasoning

- The split-id scheme (`<base>-material` / `<base>-labor`) it read from
  still exists in `merge-items.ts` and is unaffected — only the consumer
  that merged rendering on top of it is removed. If a future, different
  visual treatment for split pairs is wanted, the ids are still there to
  key off of.

---

### `src/features/estimate/lib/format.ts`

**Action:** Modify
**Why:** **(Part 3)** Differentiate a split pair's Material and Labor
titles with a deterministic trailing noun suffix — no model involvement,
applies retroactively to already-persisted estimates since this is
renderer-only.
**Impact:** New exported function, consumed only by `ItemRow` (Change D
above). `formatScope` itself is unchanged and still exported.

#### Before

```ts
export function formatScope(scope: string): string {
  return titleCaseTokens(scope, ACRONYMS);
}
```

#### After

```ts
export function formatScope(scope: string): string {
  return titleCaseTokens(scope, ACRONYMS);
}

/**
 * Labor-row noun suffix for the two actions that ever produce a
 * material+labor split (`ACTION_COST_PROFILE` in `agent-rules.ts`).
 * Deliberately a NOUN ("Installation"/"Replacement"), not a verb
 * ("Install"/"Replace") — see `formatItemTitle` below for why.
 */
const LABOR_SPLIT_SUFFIX: Partial<Record<string, string>> = {
  install: 'Installation',
  replace: 'Replacement',
};

/**
 * Renderer-side title for a billable item's row, differentiating a split
 * pair's Material and Labor rows without an action-verb prefix.
 *
 * `merge-items.ts` clones the entire item — including `scope` — onto
 * both halves of an install/replace split, so both rows previously
 * called `formatScope(item.scope)` on the identical string: same bold
 * title on both rows, nothing but the small MATERIAL/LABOR badge to tell
 * them apart. This reads as duplicated, undifferentiated output.
 *
 * Fix is a trailing NOUN qualifier on the labor half only ("Wood Siding
 * Board Replacement" vs "Wood Siding Board") — NOT an action-verb prefix.
 * `formatScope`'s own doc comment above records that a past PR (#13)
 * deliberately removed a verb-prefix behavior "because it drifted from
 * the prototype"; a noun suffix is an additive, distinct concern from
 * that removed behavior, not a reintroduction of it.
 *
 * Labor-only actions (repair, service, evaluate, remove — see
 * `ACTION_COST_PROFILE`) have no material counterpart to differentiate
 * against, so they get no suffix and render exactly as `formatScope`
 * alone would produce, unchanged from today.
 */
export function formatItemTitle(
  scope: string,
  action: string,
  costType: string,
): string {
  const base = formatScope(scope);
  if (costType !== 'labor') return base;
  const suffix = LABOR_SPLIT_SUFFIX[action];
  return suffix ? `${base} ${suffix}` : base;
}
```

#### Reasoning

- `Partial<Record<string, string>>` (not a typed `Action` import) keeps
  `format.ts` free of any dependency on `mastra` agent types — it already
  has zero imports today, and this preserves that; an unrecognized action
  string simply falls through to `undefined` → no suffix, never a crash.
- Only `install`/`replace` get an entry, mirroring
  `ACTION_COST_PROFILE`'s `'material-and-labor'` category exactly — the
  only two actions that ever produce a labor row with a material sibling
  to differentiate against.
- Renderer-only means this improves the display of every already-persisted
  estimate immediately on deploy, unlike Part 2 (which only affects future
  extractions).

---

### `src/mastra/agents/processors/item-contract-guard/item-heuristics.ts`

**Action:** Modify
**Why:** Add the keyword sets the new Part 2 checks need, in the
same file/shape as the existing `ARTICLES`/`ACTION_VERBS` constants.
**Impact:** Pure additions — nothing existing in this file changes.

#### Before

```ts
/** Sentence-ending punctuation. A `scope` containing any of these is a sentence. */
export const SENTENCE_PUNCTUATION_RE: RegExp = /[.!?]/;
```

#### After

```ts
/** Sentence-ending punctuation. A `scope` containing any of these is a sentence. */
export const SENTENCE_PUNCTUATION_RE: RegExp = /[.!?]/;

/**
 * Materials real contractors quote by SQUARE FOOTAGE, never "each" — even
 * when the inspection report gives no explicit measurement. A scope
 * naming one of these with `unit: 'ea'` is implausible on its face: nobody
 * buys or bids "1 each" of siding or drywall.
 */
export const AREA_MATERIAL_KEYWORDS: ReadonlySet<string> = new Set([
  'siding', 'drywall', 'roofing', 'shingle', 'shingles', 'flooring',
  'subfloor', 'sheathing', 'insulation', 'stucco', 'plaster', 'underlayment',
  'membrane', 'paneling',
]);

/**
 * Materials real contractors quote by LINEAR FOOTAGE, never "each" — same
 * rationale as `AREA_MATERIAL_KEYWORDS`, for length-measured trim/edge
 * components.
 */
export const LENGTH_MATERIAL_KEYWORDS: ReadonlySet<string> = new Set([
  'trim', 'fascia', 'soffit', 'gutter', 'downspout', 'fencing', 'fence',
  'railing', 'baseboard', 'casing', 'molding', 'coping', 'flashing',
  'weatherstripping',
]);
```

#### Reasoning

- Both keyword sets are deliberately short and specific rather than
  exhaustive — false negatives (a material type not yet listed) just mean
  the guard doesn't catch that case yet, which is the same as today's
  behavior; false positives (flagging a legitimately discrete "ea" item)
  are the risk to keep near zero, so only unambiguous area/length trade
  materials are listed. Extending either set later is a one-line change.
- `trim` is deliberately in `LENGTH_MATERIAL_KEYWORDS` (trim boards/molding
  are quoted per linear foot), while `siding` is in
  `AREA_MATERIAL_KEYWORDS` — this is exactly why "Trim Or Wood Siding" was
  unfixable as one item: the two halves have different correct units.

---

### `src/mastra/agents/processors/item-contract-guard/item-validator.ts`

**Action:** Modify
**Why:** Add the two new deterministic checks and wire them into
`validateItem`, following the exact existing pattern of
`checkScopeShape`/`checkUnitActionCoupling`.
**Impact:** Two new exported functions; `validateItem` gains two more
`reasons.push(...)` lines. No existing check is altered.

#### Before

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
import { ACTION_COST_PROFILE, ACTION_VERBS_SET } from '../../../config/agent-rules';
import type { Action, ExtractedItemGuard } from '../../billable-item-extractor.schema';
```

```ts
export function validateItem(
  item: ExtractedItemGuard,
  index: number,
): ItemViolation {
  const reasons: string[] = [];

  checkEnum('trade', item.trade, VALID_TRADES, reasons);
  checkEnum('action', item.action, VALID_ACTIONS, reasons);
  checkEnum('unit', item.unit, VALID_UNITS, reasons);

  reasons.push(...checkScopeShape(item.scope));
  reasons.push(...checkUnitActionCoupling(item.action, item.unit));

  return {
    index,
    id: item.id,
    reasons,
  };
}
```

```ts
export function checkUnitActionCoupling(action: string, unit: string): string[] {
  if (ACTION_COST_PROFILE[action as Action] === 'material-and-labor' && unit === 'hrs') {
    return [
      `unit "hrs" is not valid for action "${action}" — this item is split into a material line and a labor line, and a part cannot be counted in hours. Use the physical unit of the item being installed ("ea", "lf", "sf", "cy").`,
    ];
  }
  return [];
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
  AREA_MATERIAL_KEYWORDS,
  LENGTH_MATERIAL_KEYWORDS,
} from './item-heuristics';
import { ACTION_COST_PROFILE, ACTION_VERBS_SET } from '../../../config/agent-rules';
import type { Action, ExtractedItemGuard } from '../../billable-item-extractor.schema';
```

```ts
export function validateItem(
  item: ExtractedItemGuard,
  index: number,
): ItemViolation {
  const reasons: string[] = [];

  checkEnum('trade', item.trade, VALID_TRADES, reasons);
  checkEnum('action', item.action, VALID_ACTIONS, reasons);
  checkEnum('unit', item.unit, VALID_UNITS, reasons);

  reasons.push(...checkScopeShape(item.scope));
  reasons.push(...checkUnitActionCoupling(item.action, item.unit));
  reasons.push(...checkMaterialUnitPlausibility(item.scope, item.unit));
  reasons.push(...checkMixedMaterialTypeScope(item.scope));

  return {
    index,
    id: item.id,
    reasons,
  };
}
```

```ts
export function checkUnitActionCoupling(action: string, unit: string): string[] {
  if (ACTION_COST_PROFILE[action as Action] === 'material-and-labor' && unit === 'hrs') {
    return [
      `unit "hrs" is not valid for action "${action}" — this item is split into a material line and a labor line, and a part cannot be counted in hours. Use the physical unit of the item being installed ("ea", "lf", "sf", "cy").`,
    ];
  }
  return [];
}

/**
 * Catches the "1 EA of wood siding" failure mode: `unit: 'ea'` on a scope
 * naming a material real contractors quote by area or length, regardless
 * of whether the report stated an explicit measurement. Only fires for
 * `unit === 'ea'` — sf/lf/hrs/cy are never flagged here, since the model
 * already picked a plausible measured unit in that case.
 */
export function checkMaterialUnitPlausibility(scope: string, unit: string): string[] {
  if (unit !== 'ea') return [];
  const lower = scope.toLowerCase();

  for (const keyword of AREA_MATERIAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      return [
        `scope "${scope}" names an area-measured material ("${keyword}") but unit is "ea" — contractors quote this by square footage. Use unit "sf", not "ea", even if the report gives no explicit measurement.`,
      ];
    }
  }
  for (const keyword of LENGTH_MATERIAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      return [
        `scope "${scope}" names a length-measured material ("${keyword}") but unit is "ea" — contractors quote this by linear footage. Use unit "lf", not "ea", even if the report gives no explicit measurement.`,
      ];
    }
  }
  return [];
}

/**
 * Catches a scope naming BOTH an area-measured material AND a
 * length-measured material (e.g. "trim or wood siding" — trim is `lf`,
 * siding is `sf`). This is a provable unit conflict: the scope names two
 * components that can never share one correct unit, so it must become
 * two items, not one.
 *
 * Deliberately NOT a generic "contains the word 'or'/'and'" check — an
 * earlier draft of this rule used exactly that regex and would have
 * incorrectly flagged "Peeling And Chipping Exterior Paint" (one
 * material, two symptoms, joined by "and" — not two different
 * components). Requiring a match from BOTH keyword sets targets the
 * actual defect (mismatched unit types) instead of grammar.
 */
export function checkMixedMaterialTypeScope(scope: string): string[] {
  const lower = scope.toLowerCase();
  const hasArea = [...AREA_MATERIAL_KEYWORDS].some((k) => lower.includes(k));
  const hasLength = [...LENGTH_MATERIAL_KEYWORDS].some((k) => lower.includes(k));
  if (hasArea && hasLength) {
    return [
      `scope "${scope}" names both an area-measured material and a length-measured material — these can never share one correct unit. Emit TWO separate items, one per component, each with its own correct unit ("sf" or "lf").`,
    ];
  }
  return [];
}
```

#### Reasoning

- Both new checks are guard-only (no merge-time fallback) — see Existing
  Pattern Audit for why: there is no safe deterministic correction for
  "pick sf instead of ea" or "split this into two items," unlike
  `checkUnitActionCoupling`'s clean `ea`-coercion fallback.
- `checkMixedMaterialTypeScope` fires independently of `unit` — a mixed
  scope is wrong regardless of what unit the model picked, since no
  single unit can ever be correct for two different material types. It
  can fire alongside `checkMaterialUnitPlausibility` on the same item
  (e.g. `unit: 'ea'` AND mixed materials) — both violation reasons are
  concatenated into one retry message by `formatViolations`, which only
  helps the model converge on the right fix (split into two items, each
  with its own correct unit) rather than confusing it.
- Verified against the exact false positive that motivated this design:
  "Peeling And Chipping Exterior Paint" contains neither an area nor a
  length keyword (paint is in neither set), so `hasArea`/`hasLength` are
  both false and this check does not fire — it stays a single item, as it
  should.

---

### `src/mastra/agents/billable-item-extractor.ts`

**Action:** Modify
**Why:** The guard can retry the model, but the model needs to be TOLD the
rule to have a real chance of getting it right the first time, not just
after a rejection. Extends the prompt's existing BAD→GOOD teaching pattern
(already used for `scope`) to `unit`.
**Impact:** Prompt-only; schema and guard wiring elsewhere are untouched.

#### Before

```ts
- unit: REQUIRED. One of ea, lf, sf, cy, hrs. The unit the inspector's
  count refers to (use 'sf' for square footage). Use 'hrs' ONLY when the
  inspector explicitly gave hours AND the action is repair, service,
  evaluate, or remove — never for install or replace items, which are
  counted in the physical unit of the item being installed ('ea' for a
  fixture, 'sf' for sheet goods, 'lf' for runs). NEVER invent a unit the
  report does not support.
```

#### After

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

#### Reasoning

- The distinction is explicit: quantity may still default to 1 when the
  report gives no count (unchanged, existing rule) — but UNIT must reflect
  real trade convention for that material TYPE, independent of whether a
  number appears in the text. Decoupling these two was the missing piece;
  previously the unit rule read as "infer from the text," which gives the
  model no basis to pick `sf`/`lf` when the text is silent, so it fell
  back to `ea`.
- Kept the existing "never invent a unit the report does not support" as
  the closing line — this rule is about not inventing units OUTSIDE the
  enum (e.g. "sq" or "board-ft"), not about refusing to infer `sf`/`lf`
  from material type, so it does not conflict with the new guidance.

## Validation Plan

Per `AGENTS.md` (project `pnpm lint` is broken under Next 16 and is not the
gate):

1. `pnpm exec tsc --noEmit` — must be clean. In particular confirms no
   remaining reference to `groupSplitPairs`/`ItemGroup` anywhere (the
   deleted file would otherwise surface as a missing-module error at the
   one import site being removed in the same change).
2. `pnpm exec eslint src/features/estimate/components/items-section.tsx` —
   must be clean (no unused imports/vars left behind from the deleted
   functions).
3. Repo-wide grep after the edit: `grep -rn "groupSplitPairs\|SplitItemRow\|CostLine\|group-split-pairs" src` must return zero results.
4. Manual QA via `pnpm dev`: open a report containing an install/replace
   item (material+labor split) and confirm it now renders as TWO separate
   bordered rows — each with its own scope/location text repeated, its own
   MATERIAL or LABOR badge, its own quantity + real unit, its own price —
   instead of one shared header with two stacked tag-lines. Confirm
   non-split (labor-only) items are visually unchanged (they were never
   affected by the grouping).
5. **(Part 2)** `pnpm exec eslint src/mastra/agents/billable-item-extractor.ts src/mastra/agents/processors/item-contract-guard/item-heuristics.ts src/mastra/agents/processors/item-contract-guard/item-validator.ts` — must be clean.
6. **(Part 2) Pure-logic check, no live model needed:** exercise
   `checkMaterialUnitPlausibility` and `checkMixedMaterialTypeScope`
   directly via `tsx` with cases drawn straight from the reported bug:
   `checkMixedMaterialTypeScope("Damaged Trim Or Wood Siding")` → fires
   (contains both a length keyword "trim" and an area keyword "siding");
   `checkMaterialUnitPlausibility("Damaged Trim Or Wood Siding", "ea")` →
   also fires (area match wins first, suggests "sf"); the false-positive
   case that motivated the redesign,
   `checkMixedMaterialTypeScope("Peeling And Chipping Exterior Paint")` →
   must NOT fire (paint is in neither keyword set);
   `checkMaterialUnitPlausibility("loose siding panel", "ea")` → area
   violation; `checkMaterialUnitPlausibility("angle stop under kitchen
   sink", "ea")` → no violation (genuinely discrete, not in either
   keyword set); `checkMaterialUnitPlausibility("kitchen GFCI receptacle",
   "sf")` → no violation (only fires when `unit === 'ea'`).
7. **(Part 2) Live QA via `pnpm dev`:** re-upload the same report that
   produced the reported screenshot (or an equivalent one) and confirm
   `Damaged Trim Or Wood Siding` no longer appears as one item — it should
   split into two items, one naming trim (unit `lf`) and one naming
   siding (unit `sf`), OR the guard's retry converges on a single
   corrected component if that's what the report actually supports.
   Confirm previously-fine items (`Dryer Vent Damper Door` at `1 EA`,
   priced $25; `Chimney Leaning` at `1 EA`, priced $350) are UNCHANGED —
   these are genuinely discrete/job-priced items and must not be
   flagged by the new checks (both keyword sets deliberately exclude
   "chimney" and "damper door" — verify no keyword accidentally matches
   substrings within them).
8. **(Part 3)** `pnpm exec eslint src/features/estimate/lib/format.ts` —
   must be clean.
9. **(Part 3) Pure-logic check, no live model needed:** exercise
   `formatItemTitle` directly via `tsx`:
   `formatItemTitle('wood siding board', 'replace', 'material')` →
   `"Wood Siding Board"`;
   `formatItemTitle('wood siding board', 'replace', 'labor')` →
   `"Wood Siding Board Replacement"` (differs from the material title —
   this is the actual fix); `formatItemTitle('dryer vent damper door',
   'install', 'labor')` → `"Dryer Vent Damper Door Installation"`;
   **also print** `formatItemTitle('damaged siding board', 'replace',
   'labor')` → `"Damaged Siding Board Replacement"` — this exercises the
   EXISTING (unchanged) condition-adjective scope convention and produces
   the awkward-but-not-wrong phrasing flagged in Risk Notes; look at it
   directly rather than trusting the risk note's description alone before
   deciding whether it's acceptable;
   `formatItemTitle('loose siding', 'repair', 'labor')` →
   `"Loose Siding"` (no suffix — repair has no material sibling).
10. **(Part 3) Manual QA via `pnpm dev`:** open a report with a split
    install/replace item and confirm the Material row's title is the bare
    noun phrase while the Labor row's title carries the "Installation"/
    "Replacement" suffix — the two rows must read as visibly different
    text, not the same string twice. Confirm labor-only items (repair,
    service, evaluate, remove — no split) show their title completely
    unchanged from today.

## Risk Notes

- **Visual repetition returns.** Reverting means a split item's
  scope/location (and, if the toggle is on, its source quote) is shown
  twice — once per row. This is the accepted tradeoff per the user's
  explicit direction: two independently legible rows over one merged,
  ambiguous card.
- **No data/schema/pricing impact from Part 1.** This is a pure rendering
  revert; `merge-items.ts`, `price-items.ts`, `item-pricer.ts`, and the
  `billableItemSchema`/split-id scheme are all untouched. Old persisted
  estimates render exactly as new ones do after this change (as they did
  before the grouping was introduced).
- **Part 2 only affects NEW extractions.** The guard/prompt changes apply
  to future `billable-item-extractor` runs. Already-persisted estimates
  (including the one in the reported screenshot) keep their existing
  `unit: 'ea'` values until that specific estimate is re-run — this fix
  does not retroactively correct stored data, because there's no safe way
  to guess the right unit for already-persisted items without re-reading
  the source report.
- **Guard-only means no 100% guarantee.** Because there's no merge-time
  fallback for these two checks (by design — see Existing Pattern Audit),
  a model that stubbornly repeats the same mistake for all
  `maxProcessorRetries` (3) attempts still reaches `merge-items.ts`
  uncorrected. This is a real, accepted limit of a guard-only approach;
  it is still strictly better than today (zero correction pressure) and
  matches the existing `checkScopeShape` precedent for how much retry
  budget this codebase considers reasonable before giving up.
- **Keyword lists are not exhaustive.** `AREA_MATERIAL_KEYWORDS`/
  `LENGTH_MATERIAL_KEYWORDS` cover the materials seen in the reported bug
  and common adjacent ones, not every possible trade material. A material
  type not on either list still silently defaults to whatever the model
  picks (today's status quo) — extending the lists is a one-line change
  whenever a new gap is found, not a redesign.
- **Substring matching can cite the wrong keyword (verified, not just
  theoretical).** `.includes()` matches inside unrelated words:
  `"damaged waterproofing membrane"` matches `"roofing"` (from
  water-PROOF-ING) even though the scope never says "roofing";
  `"wire encasing conduit"` matches `"casing"` (from en-CASING). In both
  verified cases the resulting sf/lf conclusion still happens to be
  directionally correct (waterproofing and conduit runs are genuinely
  measured, not "each"), so this has not produced a wrong final unit in
  testing — but the violation message would cite a keyword that literally
  isn't in the scope text, which could confuse rather than help the model
  on a genuine edge case. Not fixed here (word-boundary matching would
  need per-keyword tokenization rules to avoid new false negatives on
  compound words like "roofing-membrane"); flagged as a known imprecision
  to revisit if it produces a real bad outcome, not just a misleading
  message.
- **`checkMaterialUnitPlausibility` only checks `unit === 'ea'`.** It does
  not catch other implausible unit choices (e.g. a material line emitted
  as `'cy'` when it should be `'sf'`). This is a deliberate scope match to
  the exact reported failure mode (generic `'ea'` overuse), not a claim
  that every possible wrong-unit case is now caught.
- **This is scoped to the LIVE agent only.** `billable-item-extractor.ts`
  is what's actually running on `main` today. The separate, not-yet-merged
  Docling/Stage-1/2 architecture branch has its own copy of this same
  prompt logic in `item-classifier.ts` (carried over near-verbatim when
  that branch was built) — it will need the identical unit-guidance and
  guard changes applied before it ships, or it will reintroduce this exact
  bug. Flagged here so it isn't missed; applying it there is out of scope
  for this fix and should happen as part of that branch's own review.
- **(Part 3) Suffix list is as narrow as `ACTION_COST_PROFILE`'s split
  category.** Only `install`/`replace` get a suffix, matching exactly
  which actions ever produce a labor row with a material sibling. If a
  future change ever widens `ACTION_COST_PROFILE`'s `'material-and-labor'`
  category to a new action, `LABOR_SPLIT_SUFFIX` needs a matching entry
  added at the same time, or that new action's labor row would silently
  fall back to no suffix (a duplicate-title regression, not a crash).
  This coupling is not enforced by the type system — a comment in both
  places is the only guard against drift.
- **(Part 3) Reintroduces the shape, not the substance, of a previously
  rejected pattern.** The user was shown the historical no-verb-prefix
  constraint directly and chose the noun-suffix design specifically
  because it avoids the verb.
- **(Part 3) Verified, concrete awkwardness case, not just a vague
  concern.** The EXISTING scope convention (unchanged by this plan) keeps
  a condition-adjective describing the defect — the scope BAD→GOOD
  examples in this same prompt literally teach `"damaged siding board"` /
  `"loose siding panel"`. Running `formatItemTitle` against that real
  wording produces `"Damaged Siding Board Replacement"` and `"Loose Siding
  Panel Replacement"` for the labor row — grammatically fine, but it reads
  as replacing a product literally named "Damaged Siding Board" rather
  than a clean "Siding Board Replacement." This is a direct consequence of
  scoping this fix to title-suffix rendering only (Part 3) and NOT also
  changing scope-naming to be product-styled for split actions (the more
  invasive follow-up considered and deliberately deferred earlier in this
  conversation). Not a regression — material and labor titles are still
  clearly differentiated, which was the actual bug — but the "Home
  Depot-style" product-naming quality the user originally asked about is
  only partially addressed by this plan. Worth a real visual check after
  implementation, and a candidate for a following, separate fix if it
  reads as badly as the verified example above suggests.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
