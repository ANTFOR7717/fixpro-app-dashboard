# FIX(estimate-classification-conventions)

## Request

Fix the five defects found in the estimate labor/materials classification and
its conventions, on branch `fix/estimate-classification-conventions`:

1. **Stop forcing "HRS" on labor lines.** `formatUnit` relabels every labor
   line's unit chip as "HRS" even when the stored quantity is a count of
   shingles or square feet. "repair 8 sf of drywall" renders as "8 HRS".
2. **Repair/service/remove/evaluate labor must be priced all-in.** The pricer
   is told every labor line must exclude the part — correct for split
   install/replace pairs (the material sibling catches the part), but
   labor-only actions have no sibling, so incidental materials are excluded
   from the estimate entirely. Structural underbilling.
3. **Guard the material split line against inheriting `unit: 'hrs'`.** The
   install/replace split copies `unit` onto both lines; an inspector-given
   hours unit produces a "6 HRS of receptacle" material line.
4. **Render material+labor split pairs as one grouped item** instead of two
   visually unrelated rows that duplicate scope/location/source quote.
5. **Normalize the `sf`/`sqft` alias** so new data only ever carries `sf`.

**Constraints (user-mandated):**
- Prefer deterministic/mechanical guardrails over prompt instructions
  wherever possible.
- Use Mastra's built-in capabilities (verified against the installed
  `@mastra/core@1.37.1`) instead of custom mechanical code.
- No new packages or dependencies.

## Directory Map

```text
falcon-bighorn/
├── FIX(estimate-classification-conventions).md              [CREATE] this plan
├── src/
│   ├── mastra/
│   │   ├── config/
│   │   │   └── agent-rules.ts                               [MODIFY] add PricingBasis + pricingBasisFor()
│   │   ├── agents/
│   │   │   ├── billable-item-extractor.ts                   [MODIFY] unit guidance in prompt (drop sqft, hrs never for install/replace)
│   │   │   ├── billable-item-extractor.schema.ts            [MODIFY] UNIT comment (drop "Plan B" hack note), add CostType export
│   │   │   ├── item-pricer.ts                               [MODIFY] rule 6 keyed to deterministic pricingBasis input
│   │   │   ├── item-pricer.schema.ts                        [MODIFY] superRefine: unitPrice/unavailableReason mutual exclusion
│   │   │   └── processors/item-contract-guard/
│   │   │       └── item-validator.ts                        [MODIFY] add checkUnitActionCoupling (guard-retry layer)
│   │   └── workflows/steps/
│   │       ├── merge-items.ts                               [MODIFY] sqft→sf normalization + material-unit safety net
│   │       └── price-items.ts                               [MODIFY] pass pricingBasis to the pricer
│   └── features/estimate/
│       ├── lib/
│       │   ├── format.ts                                    [MODIFY] formatUnit drops costType param + HRS override
│       │   └── group-split-pairs.ts                         [CREATE] pure mechanical pairing of split lines
│       └── components/
│           └── items-section.tsx                            [MODIFY] paired rendering, header copy, formatUnit call
```

No files are moved or deleted. No DB schema or migration changes — the
persisted `summary` envelope shape (`billableItemSchema`) is unchanged.

## Modification Table

| File | Action | Why |
|---|---|---|
| `src/mastra/config/agent-rules.ts` | Modify | Add `PricingBasis` type + `pricingBasisFor(action, costType)` — the deterministic rule for what the pricer must include. Lives here because this file is the declared home for product policy rules (`ACTION_COST_PROFILE` precedent). |
| `src/mastra/agents/processors/item-contract-guard/item-validator.ts` | Modify | Add `checkUnitActionCoupling`: install/replace with `unit: 'hrs'` is a contract violation → Mastra `abort(retry)` re-prompts the model, same mechanism as `checkScopeShape`. |
| `src/mastra/workflows/steps/merge-items.ts` | Modify | Deterministic layer: normalize `sqft`→`sf` before persist/price; coerce the material split line's unit to `ea` if `hrs` survived the guard's retry budget (safety-net pattern already established by the scope check). |
| `src/mastra/workflows/steps/price-items.ts` | Modify | Compute `pricingBasis` deterministically per line and pass it in the pricer's user message — the model no longer infers whether a sibling line exists. |
| `src/mastra/agents/item-pricer.ts` | Modify | Rewrite rule 6 to obey the supplied `pricingBasis` token; `all-in-job` includes incidental materials + disposal. Drop `sqft` from the unit list. |
| `src/mastra/agents/item-pricer.schema.ts` | Modify | `superRefine` enforcing exactly-one-of `unitPrice`/`unavailableReason` — mechanical cross-field validation via Mastra's existing `structuredOutput` Zod path instead of prose-only rules. |
| `src/mastra/agents/billable-item-extractor.ts` | Modify | Unit guidance: drop `sqft` from the advertised list; `hrs` only for labor-only actions when the inspector gave hours. |
| `src/mastra/agents/billable-item-extractor.schema.ts` | Modify | Comments only + `CostType` type export. `sqft` stays in the enum so old persisted envelopes still parse; the "Plan B" HRS-hack note is deleted because the hack is deleted. |
| `src/features/estimate/lib/format.ts` | Modify | `formatUnit(unit)` — remove the `costType` param and the labor→HRS override. Renderer-only, so old persisted rows display correctly too. |
| `src/features/estimate/lib/group-split-pairs.ts` | Create | Pure helper pairing consecutive `<base>-material`/`<base>-labor` lines. Pairing is recoverable mechanically from the id scheme `merge-items.ts` already writes — no schema change needed. |
| `src/features/estimate/components/items-section.tsx` | Modify | Render split pairs as one item (shared scope/location/quote, two aligned cost lines); fix header copy; update `formatUnit` call. |

## Existing Pattern Audit

Every change below follows a pattern this repo already uses; nothing new is
introduced:

- **Deterministic policy in `config/agent-rules.ts`, consumed by steps.**
  `ACTION_COST_PROFILE` (added in PR #15) is exactly this; `pricingBasisFor`
  is its natural extension for the pricing side.
- **Guard-retry + deterministic safety net, sharing one rule function.**
  `checkScopeShape` is exported from `item-validator.ts` and used both by the
  `ItemContractGuard` Mastra output processor (`abort(retry: true)`, up to
  `maxProcessorRetries: 3`) and by `merge-items.ts` as the last line of
  defense. `checkUnitActionCoupling` copies this shape verbatim — guard
  retries the model; merge coerces deterministically if retries are exhausted.
- **Mechanical derivation instead of model judgment.** PR #15 removed
  `costType` from the model's output contract and derives it in code. Passing
  `pricingBasis` as a computed input field is the same move applied to the
  pricer: the model prices, but *what to include* is computed.
- **Renderer tolerance for legacy persisted rows.** `formatPartyRole` and
  `formatTradeLabel` both accept unknown strings and degrade gracefully;
  keeping `sqft` in the enum + renderer alias follows suit.
- **Pure helpers in `src/features/estimate/lib/`.** `format.ts`,
  `envelope.ts` — `group-split-pairs.ts` joins them.
- **Split-id scheme.** `merge-items.ts` already writes `${base}-material` /
  `${base}-labor` consecutively; the pairing helper only reads what that
  scheme guarantees.

### Mastra capability audit (evidence for the "no custom mechanical code" constraint)

Verified against the installed `@mastra/core@1.37.1`
(`node_modules/@mastra/core/dist/processors/`):

- **Built-in processors** are content/infra-level: `BatchPartsProcessor`,
  `CostGuardProcessor`, `LanguageDetector`, `ModerationProcessor`,
  `PIIDetector`, `PromptInjectionDetector`, `RegexFilterProcessor`,
  `ResponseCache`, `StructuredOutputProcessor`, `TokenLimiter`,
  `UnicodeNormalizer`. **None** perform domain unit normalization, cost-type
  classification, or cross-field business validation — so the tiny domain
  rules added here (one lookup function, one coupling check, one unit
  coercion) are justified custom code, and they are placed inside Mastra's
  own extension points rather than beside them.
- **The Mastra-native mechanisms this plan leans on, all already in use:**
  - `Processor.processOutputStep` + `abort(reason, { retry: true })` +
    `maxProcessorRetries` — model-facing enforcement (issue 3's guard layer).
  - `structuredOutput: { schema }` on `agent.generate` — Zod validation of
    pricer output (`errorStrategy: 'strict' | 'warn' | 'fallback'` exists on
    `StructuredOutputOptions`; a validation failure surfaces as a throw that
    `price-items.ts` already converts to a `lookup-failed` row). The
    `superRefine` tightening rides this existing path.
  - `createStep` with Zod input/output schemas — deterministic transforms
    (issues 3 and 5's coercion/normalization live in `merge-items.ts`).
- **No new packages.** `zod@4.2.1` and `@mastra/core@1.37.1` are already
  dependencies; nothing else is needed.

## Execution Plan

Ordered so the codebase typechecks after every step:

1. `billable-item-extractor.schema.ts` — add `CostType` export; update `UNIT`
   comment (no runtime change).
2. `agent-rules.ts` — add `PricingBasis` + `pricingBasisFor`.
3. `item-validator.ts` — add + wire `checkUnitActionCoupling`.
4. `merge-items.ts` — `sqft`→`sf` normalization; material-line unit coercion.
5. `item-pricer.schema.ts` — `superRefine` mutual exclusion.
6. `price-items.ts` — pass `pricingBasis`.
7. `item-pricer.ts` — prompt rule 6 rewrite; drop `sqft` from unit list.
8. `billable-item-extractor.ts` — prompt unit guidance.
9. `format.ts` — `formatUnit` signature change.
10. `group-split-pairs.ts` — new helper.
11. `items-section.tsx` — paired rendering + copy + call-site update.
12. Validation gates (below), then stop for PR review.

## File-by-File Changes

### 1. `src/mastra/agents/billable-item-extractor.schema.ts`

**Action:** Modify
**Why:** Delete the "Plan B" comment that documents the HRS display hack
(the hack is removed in `format.ts`); document `sqft` as a
normalized-at-merge legacy alias; export `CostType` for `pricingBasisFor`.
**Impact:** Comments + one type export. No runtime or persisted-shape change.

#### Before

```ts
/**
 * Unit the inspector's count refers to. The report renders this as a chip
 * next to the quantity (e.g. "0.5 CY", "8 SF", "6 HRS"). `sf` and `sqft`
 * are aliases for the same concept; the report renders both as "SF".
 *
 * Note: a Labor line can technically have any of these as its `unit`
 * (the pricer prices by the unit the model emits). The report renderer
 * forces the chip to "HRS" when costType is "labor" — see Plan B.
 */
export const UNIT = ['ea', 'lf', 'sf', 'sqft', 'cy', 'hrs'] as const;

/**
 * Whether the line is labor or material. Drives the Type badge.
 */
export const COST_TYPE = ['labor', 'material'] as const;
```

#### After

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

/**
 * Whether the line is labor or material. Drives the Type badge.
 */
export const COST_TYPE = ['labor', 'material'] as const;

export type CostType = (typeof COST_TYPE)[number];
```

#### Reasoning

- Keeping `'sqft'` in the enum is deliberate backward tolerance: rows
  persisted before this branch may contain it, and `parseSummaryEnvelope`
  (`src/features/estimate/lib/envelope.ts:39`) parses persisted JSON with
  this exact schema — narrowing the enum would flip old rows to
  `'unparseable'`.
- `CostType` mirrors the existing `Action` type export one line above the
  `ACTION` const; `agent-rules.ts` already imports `Action` the same way.

---

### 2. `src/mastra/config/agent-rules.ts`

**Action:** Modify
**Why:** Home of deterministic product policy (per this file's own header and
the `ACTION_COST_PROFILE` precedent). Adds the rule for what a price must
include, derived from `(action, costType)` — closing the underbilling gap
where repair-line materials had nowhere to appear.
**Impact:** New exports consumed by `price-items.ts`. Existing exports
untouched.

#### Before

```ts
import { ACTION_VERBS } from '../agents/processors/item-contract-guard/item-heuristics';
import type { Action } from '../agents/billable-item-extractor.schema';
```

```ts
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
```

#### After

```ts
import { ACTION_VERBS } from '../agents/processors/item-contract-guard/item-heuristics';
import type { Action, CostType } from '../agents/billable-item-extractor.schema';
```

```ts
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
 * What the pricer must include in its number for one billable line.
 * Derived deterministically from (action, costType) — never a model
 * judgment call:
 *
 *   - 'material-part-only'   — material half of a split install/replace
 *     pair. Price the part; the sibling labor line covers installation.
 *   - 'labor-excluding-part' — labor half of a split pair. Price the
 *     labor to perform the action; the sibling material line covers
 *     the part.
 *   - 'all-in-job'           — labor-only actions (repair / service /
 *     evaluate / remove). There is NO sibling material line, so the
 *     price must be the complete job: labor PLUS incidental materials
 *     (patching compound, sealant, fasteners) PLUS disposal where the
 *     action implies it.
 *
 * `price-items.ts` computes this per line and passes it to the pricer
 * as an explicit input field, so the model never has to infer whether
 * a sibling line exists. Before this rule, the pricer excluded parts
 * from EVERY labor line — correct for split pairs, but for labor-only
 * actions the excluded materials had no other line to land on and
 * silently vanished from the estimate.
 */
export type PricingBasis =
  | 'material-part-only'
  | 'labor-excluding-part'
  | 'all-in-job';

export function pricingBasisFor(action: Action, costType: CostType): PricingBasis {
  if (ACTION_COST_PROFILE[action] === 'labor-only') return 'all-in-job';
  return costType === 'material' ? 'material-part-only' : 'labor-excluding-part';
}
```

#### Reasoning

- A three-value basis is the minimum that distinguishes "sibling exists"
  from "sibling does not exist" — the fact the model previously had to
  guess. Deriving it from `ACTION_COST_PROFILE` means the two rules can
  never disagree about which actions split.
- The alternative (a third profile splitting repairs into material+labor
  lines) was rejected: it would force the pricer to invent a standalone
  materials number for jobs where materials are incidental, adding a
  hallucination surface instead of removing one.

---

### 3. `src/mastra/agents/processors/item-contract-guard/item-validator.ts`

**Action:** Modify
**Why:** Guard-retry layer for issue 3. An install/replace item measured in
`hrs` is incoherent — hours cannot count a part. The Mastra processor
(`ItemContractGuard`) re-prompts the model via `abort(retry: true)` exactly
as it already does for scope-shape violations.
**Impact:** `validateItem` gains one check. The exported function is also the
documented twin of the deterministic coercion in `merge-items.ts` (same
pattern as `checkScopeShape`).

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
import { ACTION_VERBS_SET } from '../../../config/agent-rules';
import type { ExtractedItemGuard } from '../../billable-item-extractor.schema';
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

  return {
    index,
    id: item.id,
    reasons,
  };
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

New function, appended after `checkScopeShape`:

```ts
/**
 * Split-action / unit coupling. `install` and `replace` items are split
 * by `merge-items.ts` into a material line + a labor line that both
 * inherit `unit` — and hours cannot count a part. The guard asks the
 * model for the physical unit of the thing being installed; if the
 * model still emits 'hrs' after the retry budget, `classifyAndSplit`
 * in `merge-items.ts` coerces the MATERIAL line to 'ea' (the labor
 * line may legitimately keep 'hrs').
 *
 * Same two-layer pattern as `checkScopeShape`: guard retries the model,
 * merge applies the deterministic fallback.
 *
 * An `action` outside the ACTION enum yields no coupling reason here —
 * `checkEnum` already reports it, and `ACTION_COST_PROFILE` lookup is
 * simply undefined for it.
 */
export function checkUnitActionCoupling(action: string, unit: string): string[] {
  if (ACTION_COST_PROFILE[action as Action] === 'material-and-labor' && unit === 'hrs') {
    return [
      `unit "hrs" is not valid for action "${action}" — this item is split into a material line and a labor line, and a part cannot be counted in hours. Use the physical unit of the item being installed ("ea", "lf", "sf", "cy").`,
    ];
  }
  return [];
}
```

#### Reasoning

- This file already imports from `config/agent-rules` (`ACTION_VERBS_SET`),
  so the `ACTION_COST_PROFILE` import introduces no new dependency
  direction.
- Enforcement lives in Mastra's processor retry loop (model gets a chance
  to supply the *real* physical unit — better data than a blind coercion),
  with the coercion as the guaranteed floor. This is the strongest
  mechanical arrangement available without discarding items.

---

### 4. `src/mastra/workflows/steps/merge-items.ts`

**Action:** Modify
**Why:** Deterministic layer for issues 3 and 5. Normalizes `sqft`→`sf`
before ids/classification/pricing/persistence; coerces the material split
line's unit when `hrs` survived the guard.
**Impact:** New persisted v2 envelopes and all pricer inputs never contain
`sqft`; material lines never carry `hrs`.

#### Before

```ts
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
```

```ts
    const renumbered = scopeValid.map((it) => ({
      ...it,
      id: generateItemId(it),
    }));
```

#### After

```ts
  for (const it of items) {
    const profile = ACTION_COST_PROFILE[it.action];
    if (profile === 'labor-only') {
      result.push({ ...it, costType: 'labor' });
      continue;
    }
    // 'material-and-labor'
    splitCount++;
    // Deterministic twin of the guard's checkUnitActionCoupling rule: if
    // the model still emitted 'hrs' for an install/replace after the
    // guard's retry budget, hours cannot count a part — the material
    // line falls back to 'ea'. The labor line may legitimately keep the
    // inspector's hours.
    const materialUnit = it.unit === 'hrs' ? 'ea' : it.unit;
    result.push({ ...it, id: `${it.id}-material`, unit: materialUnit, costType: 'material' });
    result.push({ ...it, id: `${it.id}-labor`, costType: 'labor' });
  }
```

```ts
    const renumbered = scopeValid.map((it) => ({
      ...it,
      // 'sqft' is a schema-tolerated legacy alias for 'sf' (see UNIT in
      // billable-item-extractor.schema.ts). Normalize here so persisted
      // v2 envelopes and pricer inputs only ever carry 'sf'.
      unit: it.unit === 'sqft' ? ('sf' as const) : it.unit,
      id: generateItemId(it),
    }));
```

#### Reasoning

- Both coercions live in the merge step because it is the single
  deterministic chokepoint everything downstream (pricer, persistence,
  renderer) flows through — the same reason PR #15 put `classifyAndSplit`
  here. A Zod `.transform()` on the extraction schema was considered and
  rejected: `extractedItemSchema` is converted to JSON schema for the
  model's structured output, and transforms are unrepresentable there; a
  plain workflow-step map is the Mastra-native equivalent already in use.
- `generateItemId` seeds from `trade-action-scope-location` (not `unit`),
  so normalizing `unit` in the same map does not change ids.
- Split-pair rendering (file 10) relies on the two `result.push` calls
  staying adjacent — they do.

---

### 5. `src/mastra/agents/item-pricer.schema.ts`

**Action:** Modify
**Why:** The `unitPrice`/`unavailableReason` relationship ("populated when
unitPrice is null") is currently prose-only; the model can emit a price AND
a reason, or null AND no reason. Enforce exactly-one-of mechanically in the
schema Mastra already validates with.
**Impact:** A violating response fails `structuredOutput` validation →
`agent.generate` throws → the existing per-item `catch` in `price-items.ts`
records the honest `lookup-failed` row. No new failure handling needed.

#### Before

```ts
export const itemPricerResponseSchema = z.object({
  unitPrice: z.number().int().min(0).nullable(),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1).max(120),
  unavailableReason: z.string().min(1).max(280).nullable(),
});
```

#### After

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
  // exactly one of unitPrice / unavailableReason is non-null. Refinements
  // don't alter the JSON schema shown to the model; they run in the Zod
  // validation Mastra's structuredOutput already performs. A violation
  // fails validation -> agent.generate throws -> price-items.ts's
  // per-item catch records a 'lookup-failed' row.
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
```

#### Reasoning

- Uses only Zod (existing dep) inside Mastra's existing `structuredOutput`
  validation path — no custom validation code in the step.
- Zod v4 `.superRefine` attaches checks without changing the inferred type,
  so `ItemPricerResponse` and all call sites are unaffected.

---

### 6. `src/mastra/workflows/steps/price-items.ts`

**Action:** Modify
**Why:** Compute `pricingBasis` deterministically per line and hand it to the
pricer as data, removing the model's need to infer sibling-line existence.
**Impact:** One import, one derived const, one line in the user message.

#### Before

```ts
import {
  billableItemSchema,
  pricedLineItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import { itemPricerResponseSchema } from '@/mastra/agents/item-pricer.schema';
```

```ts
      for (const item of inputData.items) {
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

#### After

```ts
import {
  billableItemSchema,
  pricedLineItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import { itemPricerResponseSchema } from '@/mastra/agents/item-pricer.schema';
import { pricingBasisFor } from '@/mastra/config/agent-rules';
```

```ts
      for (const item of inputData.items) {
        // Deterministic: tells the pricer whether a sibling line covers
        // the other half of the cost (split install/replace pairs) or
        // this line must carry the all-in job price (labor-only actions).
        const pricingBasis = pricingBasisFor(item.action, item.costType);
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
          `pricingBasis: ${pricingBasis}\n` +
          `sourceQuote: ${JSON.stringify(item.sourceQuote)}`;
```

#### Reasoning

- `costType` stays in the message (the badge semantics are still real data),
  but the *inclusion rule* now arrives pre-computed. The pricer prompt's
  rule 6 (file 7) is rewritten to obey the token rather than reason about
  actions.

---

### 7. `src/mastra/agents/item-pricer.ts`

**Action:** Modify
**Why:** Rule 6 currently hard-codes "labor excludes the part" for every
labor line — the underbilling root cause. Rewrite it to obey the supplied
`pricingBasis`. Also drop `sqft` from the advertised unit list (normalized
away upstream).
**Impact:** Prompt-only. The instruction is now keyed to a deterministic
input token, which is the tightest form a pricing rule can take given the
price itself must come from the model.

#### Before

```ts
INPUT
The user message names the trade, action, scope, location, quantity, the
unit (ea | lf | sf | sqft | cy | hrs), the cost type (labor | material),
the inspector's verbatim sourceQuote, and a zip code. Treat the
sourceQuote as authoritative — it is the inspector's own words. The
unit and costType are descriptive facts from the report; pass them
through unchanged.
```

```ts
6. The input tells you costType: "material" or "labor". PRICE ONLY THAT
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
```

#### After

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

#### Reasoning

- The remaining prompt surface is irreducible: the dollar figure is the
  model's output. Everything decidable in code (which half, whether a
  sibling exists) now arrives decided.

---

### 8. `src/mastra/agents/billable-item-extractor.ts`

**Action:** Modify
**Why:** Align the prompt's unit guidance with the new mechanical rules so
the model doesn't burn guard retries: no `sqft`, and no `hrs` on
install/replace items.
**Impact:** Prompt-only; the schema still tolerates `sqft` (normalized at
merge) and the guard catches `hrs`-on-split (retried, then coerced).

#### Before

```ts
- unit: REQUIRED. One of ea, lf, sf, sqft, cy, hrs. The unit the
  inspector's count refers to. For labor use 'hrs' if the inspector
  gave hours; otherwise the physical unit the labor is measured in
  ('sf' for square-footage work, 'lf' for linear-footage work, etc.).
  NEVER invent a unit the report does not support.
```

#### After

```ts
- unit: REQUIRED. One of ea, lf, sf, cy, hrs. The unit the inspector's
  count refers to (use 'sf' for square footage). Use 'hrs' ONLY when the
  inspector explicitly gave hours AND the action is repair, service,
  evaluate, or remove — never for install or replace items, which are
  counted in the physical unit of the item being installed ('ea' for a
  fixture, 'sf' for sheet goods, 'lf' for runs). NEVER invent a unit the
  report does not support.
```

#### Reasoning

- Prompt matches guard: the model is told the rule the guard enforces, so
  retries become rare instead of routine. Enforcement remains mechanical.

---

### 9. `src/features/estimate/lib/format.ts`

**Action:** Modify
**Why:** Issue 1's root cause. The `costType === 'labor'` override relabels
physical quantities as hours; the pricer already prices per the stored unit,
so the chip must show the stored unit.
**Impact:** Signature change `formatUnit(unit, costType)` → `formatUnit(unit)`.
Only call site is `items-section.tsx:241` (verified by grep). Renderer-only,
so previously persisted estimates display correctly without migration.

#### Before

```ts
/**
 * Display label for a `BillableItem.unit` chip.
 *
 * The prototype rule: when `costType === 'labor'`, the chip is ALWAYS
 * "HRS" regardless of the model's `unit` field. For material lines, the
 * chip is the uppercased unit ("EA", "SF", "LF", "CY", "HRS"). `sqft` is
 * an alias for `sf` — both render as "SF".
 */
export function formatUnit(unit: string, costType: string): string {
  if (costType === 'labor') return 'HRS';
  switch (unit) {
    case 'ea':
      return 'EA';
    case 'lf':
      return 'LF';
    case 'sf':
    case 'sqft':
      return 'SF';
    case 'cy':
      return 'CY';
    case 'hrs':
      return 'HRS';
    default:
      return unit.toUpperCase();
  }
}
```

#### After

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
  switch (unit) {
    case 'ea':
      return 'EA';
    case 'lf':
      return 'LF';
    case 'sf':
    case 'sqft':
      return 'SF';
    case 'cy':
      return 'CY';
    case 'hrs':
      return 'HRS';
    default:
      return unit.toUpperCase();
  }
}
```

#### Reasoning

- Dropping the parameter (rather than ignoring it) makes the compiler flag
  the call site, and prevents the override from silently coming back.
- The `sqft` case must stay: old persisted rows bypass merge normalization.

---

### 10. `src/features/estimate/lib/group-split-pairs.ts`

**Action:** Create
**Why:** Issue 4. Pairing is fully recoverable from the id scheme
`merge-items.ts` already writes (`<base>-material` / `<base>-labor`,
adjacent) — a pure helper keeps the persisted shape untouched and old
envelopes rendering unchanged.
**Impact:** New module in the established `lib/` pure-helper location,
consumed only by `items-section.tsx`.

#### Before

*(new file)*

#### After

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

#### Reasoning

- No schema change, no persisted-data change, no new field: the pairing
  key already exists in the ids. This is the strongest "mechanical, not
  clever" option.
- Rows persisted before PR #15 have plain `item-<hash>` ids with no
  suffix — every one becomes a group of one and renders exactly as today.
- Component keys use `lines[0].id` (always unique), not `baseId`, so even
  a duplicate base across non-consecutive groups cannot collide.

---

### 11. `src/features/estimate/components/items-section.tsx`

**Action:** Modify
**Why:** Issues 1 (copy + call site) and 4 (paired rendering).
**Impact:** Split pairs render as one item: scope/location/source quote once,
then two cost lines whose badge/quantity/total columns align with single
rows (same grid template). Subtotals, group subtotals, and unpriced counts
are computed over flat `items` exactly as before — visual grouping only.

#### Change A — imports

##### Before

```ts
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
import type {
  BillableItem,
  PricedLineItem,
} from '@/mastra/agents/billable-item-extractor.schema';
```

##### After

```ts
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

#### Change B — header copy (issue 1)

##### Before

```tsx
          <p className="mt-0.5 text-sm text-muted-foreground">
            Grouped by Trade. Client Total is Quantity × Unit Price. Labor is
            always measured in Hours.
          </p>
```

##### After

```tsx
          <p className="mt-0.5 text-sm text-muted-foreground">
            Grouped by Trade. Client Total is Quantity × Unit Price. Install
            and Replace Items are Split into Material and Labor Lines.
          </p>
```

#### Change C — `TradeGroup` renders groups (issue 4)

##### Before

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

##### After

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

#### Change D — `ItemRow` call-site fix for `formatUnit` (issue 1)

##### Before

```tsx
          {formatUnit(item.unit, item.costType)}
```

##### After

```tsx
          {formatUnit(item.unit)}
```

#### Change E — new `SplitItemRow` + `CostLine` components (issue 4)

Appended after `ItemRow`, before `Totals`:

##### Before

*(not present)*

##### After

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
```

#### Reasoning

- Singles keep today's exact layout (`ItemRow` untouched apart from the
  `formatUnit` call), so pre-split legacy rows and labor-only lines look
  identical to before.
- Pair sub-lines reuse the identical grid template string, so all four
  columns align vertically with single rows above and below.
- Per-line pricing evidence stays per-line (each half has its own
  confidence/source), shown in the sub-line's first column when the
  toggle is on. The source quote — identical on both halves by
  construction — renders once.
- Money math is untouched: `Totals`, group subtotals, and the unpriced
  count still iterate the flat `items`/`groupItems` arrays.

## Validation Plan

Per the repo's validation gates (AGENTS.md — `pnpm lint` is broken under
Next 16 and is not the gate):

1. `pnpm exec tsc --noEmit` — must be clean. Specifically proves the
   `formatUnit` signature change caught every call site and the
   `unit: 'sqft' ? 'sf'` narrowing satisfies the enum.
2. `pnpm exec eslint src/mastra/config/agent-rules.ts src/mastra/agents/billable-item-extractor.ts src/mastra/agents/billable-item-extractor.schema.ts src/mastra/agents/item-pricer.ts src/mastra/agents/item-pricer.schema.ts src/mastra/agents/processors/item-contract-guard/item-validator.ts src/mastra/workflows/steps/merge-items.ts src/mastra/workflows/steps/price-items.ts src/features/estimate/lib/format.ts src/features/estimate/lib/group-split-pairs.ts src/features/estimate/components/items-section.tsx` — clean.
3. Manual QA (no test runner exists in this repo):
   - `pnpm dev`, open an existing estimate persisted **before** this branch:
     labor lines show their stored units (a pre-existing labor line with
     `unit: 'sf'` now reads "SF", not "HRS"); post-#15 split pairs render
     grouped; pre-#15 rows render as singles unchanged.
   - Run one new estimate end-to-end: confirm the `[extraction-quality]`
     log line, no `sqft` in the persisted envelope
     (`estimate_requests.summary`), split pairs grouped in the report, and
     spot-check that a repair line's price is plausibly all-in (higher than
     bare labor).
   - Toggle "Show Source Quote" and "Show Pricing Evidence" on a report
     containing both a split pair and a single line.

## Risk Notes

- **Repair prices will rise** on new estimates — that is the fix (materials
  were silently excluded). Old persisted prices are not recomputed.
- **`superRefine` + Mastra structured output:** Zod v4 refinements are
  validation-only and are omitted from the JSON schema Mastra derives for
  the model, so the model-facing contract is unchanged. If implementation
  finds Mastra's schema conversion rejects a refined schema (it should not;
  verify at step 5 with `tsc` + one live pricer call), the contained
  fallback is: revert the schema to the flat object and apply the identical
  exactly-one-of check on `result.object` in `price-items.ts`'s existing
  `!r` branch. This fallback must not expand beyond those ~4 lines.
- **More pricer nulls, short-term:** responses that previously slipped
  through with inconsistent price/reason pairs now become explicit
  `lookup-failed` rows. That is honest behavior, but watch the
  `[pricing-quality]` log counts on the first few runs.
- **Copy choice** ("Install and Replace Items are Split into Material and
  Labor Lines") is the one subjective edit; trivially adjustable at review.
- **Old envelopes:** every change is either upstream-of-persistence or
  renderer-tolerant; `parseSummaryEnvelope` behavior for v1/v2/legacy rows
  is unchanged. `'sqft'` must remain in the `UNIT` enum for this reason —
  do not "clean it up" during implementation.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
