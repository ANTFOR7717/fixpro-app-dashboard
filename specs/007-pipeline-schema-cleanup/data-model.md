# Data Model: Pipeline Schema Cleanup

Concrete before/after shapes for every schema touched. Each maps directly
to spec.md's FR-00x list; see `research.md` for the reasoning behind each
choice.

## `extraction/schema.ts`

```ts
// BEFORE
export const extractedFindingSchema = z.object({
  id: z.string(),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  statedQuantity: z.number().int().min(1).nullable(),
  inspectorHours: z.number().positive().nullable(),
  sourceQuote: z.string().min(8).max(500),
  pageHint: z.string().regex(/^p\.\s*\d+$/).nullable(),
});

// AFTER (FR-001, FR-019)
export const extractedFindingSchema = z.object({
  id: z.string(),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  statedQuantity: z.number().int().min(1).nullable(),
  inspectorHours: z.number().positive().nullable(),
  sourceQuote: z.string().min(1),
});
```

`extraction/agent.ts`: remove the `pageHint` field instruction and the
"pageHint must be the page..." grounding sentence (FR-001).

## `classification/schema.ts`

```ts
// BEFORE — itemIdentityFields is a bare object literal
const itemIdentityFields = {
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  sourceQuote: z.string().min(8).max(500),
  pageHint: z.string().regex(/^p\.\s*\d+$/).nullable(),
} as const;

// AFTER — a real ZodObject (FR-001, FR-007, FR-019)
const itemIdentitySchema = z.object({
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  sourceQuote: z.string().min(1),
});

export const materialLineSchema = itemIdentitySchema.extend({
  costType: z.literal('material'),
  material: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.enum(EXTENT_UNIT),
  amountSource: z.string().min(1),
  pricingBasis: z.literal('material-part-only'),
});

export const laborLineSchema = itemIdentitySchema.extend({
  costType: z.literal('labor'),
  laborType: z.string().min(1),
  quantity: z.number().positive(), // FR-018: no .multipleOf(0.25)
  unit: z.literal('hrs'),
  hoursSource: z.string().min(1),
  pricingBasis: z.enum(['labor-install-hourly', 'labor-all-in-hourly']),
});
```

```ts
// BEFORE — classificationResultSchema hand-retypes 5 fields
export const classificationResultSchema = z.object({
  findingId: z.string(),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  sourceQuote: z.string().min(8).max(500),
  pageHint: z.string().regex(/^p\.\s*\d+$/).nullable(),
  materials: z.array(materialDeterminationSchema),
  labor: laborDeterminationSchema,
  trade: determinedOr(z.enum(TRADE)),
});

// AFTER — derived via .omit()/.extend() (FR-001, FR-008)
export const classificationResultSchema = extractedFindingSchema
  .omit({ id: true, statedQuantity: true, inspectorHours: true })
  .extend({
    findingId: z.string(),
    materials: z.array(materialDeterminationSchema),
    labor: laborDeterminationSchema,
    trade: determinedOr(z.enum(TRADE)),
  });
```

```ts
// BEFORE — amountSource/hoursSource are dangling optional siblings,
// requiring flatten.ts's hand-written throws to enforce coupling
export const materialDeterminationSchema = z.object({
  material: z.string().min(1),
  quantity: determinedOr(
    z.object({ amount: z.number().positive(), unit: z.enum(EXTENT_UNIT) }),
  ),
  amountSource: z.string().min(1).optional(),
});

export const laborDeterminationSchema = z.object({
  laborType: z.string().min(1),
  hours: determinedOr(z.number().multipleOf(0.25).min(0.25)),
  hoursSource: z.string().min(1).optional(),
});

// AFTER — source lives inside the determined branch's own value
// (FR-004, FR-006, FR-018)
export const materialDeterminationSchema = z.object({
  material: z.string().min(1),
  quantity: determinedOr(
    z.object({
      amount: z.number().positive(),
      unit: z.enum(EXTENT_UNIT),
      amountSource: z.string().min(1),
    }),
  ),
});

export const laborDeterminationSchema = z.object({
  laborType: z.string().min(1),
  hours: determinedOr(
    z.object({
      amount: z.number().positive(), // FR-018: no .multipleOf(0.25)
      hoursSource: z.string().min(1),
    }),
  ),
});
```

`classification/flatten.ts`'s two `throw new Error(...)` invariant checks
(FR-005) are deleted, and the field ACCESS PATH they guarded changes —
this is a real code change to `flattenOneResult()`, not just a deletion:

```ts
// BEFORE
if (material.amountSource === undefined) {
  throw new Error(`material "${material.material}" has a determined quantity but no amountSource`);
}
materialLines.push({ ..., quantity: material.quantity.value.amount, unit: material.quantity.value.unit, amountSource: material.amountSource, ... });

// AFTER — amountSource now lives inside the determined value; no guard needed
materialLines.push({ ..., quantity: material.quantity.value.amount, unit: material.quantity.value.unit, amountSource: material.quantity.value.amountSource, ... });
```

The labor branch changes identically: `result.labor.hoursSource` becomes
`result.labor.hours.value.hoursSource`, and its own `if (result.labor.hoursSource === undefined) throw ...` block is deleted the same way.

`finding-workflow.ts`'s `materialsStepOutputSchema`/
`laborStepOutputSchema` (FR-006) reference these same
`materialDeterminationSchema`/`laborDeterminationSchema` determined-value
shapes (via `determinedOr(..., agentUndeterminedSchema)`, passing the
same value schema, different flag schema) instead of retyping
`material`/`amountSource`/`laborType`/`hoursSource`.

```ts
// BEFORE — agentUndeterminedSchema retypes status/reason
export const agentUndeterminedSchema = z.object({
  status: z.literal('flagged_for_web_search'),
  reason: z.string().min(1).max(300),
});

// AFTER (FR-010, FR-019)
export const agentUndeterminedSchema = webSearchFlagSchema.omit({
  searchContext: true,
});
```

Note: `webSearchFlagSchema.reason`'s bound also loosens per FR-019
(`z.string().min(1)`, no `.max(300)`), so `agentUndeterminedSchema`
inherits that directly via `.omit()`.

`classification/agents.ts`: remove the three `pageHint` mentions in the
materials/labor/trade agents' own prompt instructions (FR-001).

`classification/finding-workflow.ts`: `excerptNearPageHint()` deleted;
its four call sites replaced with a full-document formatter matching
`buildExtractionPrompt`'s existing shape (FR-002, research.md R3):

```ts
function formatDocumentContext(parsedDocument: ParsedDocument): string {
  return parsedDocument.pages
    .map((page) => `[p. ${page.pageNumber}]\n${page.content}`)
    .join('\n\n');
}
```

## `pricing/schema.ts`

```ts
// BEFORE
const priceEvidenceFields = {
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1).max(120),
  unavailableReason: z.string().min(1).max(280).nullable(),
} as const;

function xorUnavailable(priced, unavailableReason, ctx) { /* ... */ }

export const materialPriceResponseSchema = z
  .object({ unitPrice: z.number().int().min(0).nullable(), ...priceEvidenceFields })
  .superRefine((r, ctx) => xorUnavailable(r.unitPrice, r.unavailableReason, ctx));

export const laborPriceResponseSchema = z
  .object({ hourlyRate: z.number().int().min(0).nullable(), ...priceEvidenceFields })
  .superRefine((r, ctx) => xorUnavailable(r.hourlyRate, r.unavailableReason, ctx));

export const pricedLineItemSchema = z.object({
  itemId: z.string().min(1),
  unitPrice: z.number().int().min(0).nullable(),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1).max(120),
  unavailableReason: z.string().min(1).max(280).nullable(),
});

// AFTER (FR-009, FR-017, FR-019) — determinedOr, no xorUnavailable,
// currency/confidence/source defined ONCE (FR-009), not per response schema
const priceEvidenceFields = {
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.string().min(1),
} as const;

const priceFlagSchema = z.object({
  status: z.literal('unavailable'),
  reason: z.string().min(1),
});

export const materialPriceResponseSchema = z.object({
  price: determinedOr(
    z.object({ unitPrice: z.number().int().min(0), ...priceEvidenceFields }),
    priceFlagSchema,
  ),
});

export const laborPriceResponseSchema = z.object({
  price: determinedOr(
    z.object({ hourlyRate: z.number().int().min(0), ...priceEvidenceFields }),
    priceFlagSchema,
  ),
});
```

Note: `priceEvidenceFields` still exists after this change — its role
narrows (drops `unavailableReason`, which becomes `priceFlagSchema.reason`
instead) but it does NOT disappear, since it's still the one shared
definition both response schemas' determined branches spread from
(FR-009). This corrects an initial draft of this file, which kept
`priceEvidenceFields` spread but still hand-retyped
`currency`/`confidence`/`source` a second time inside each determined
branch — the exact duplication FR-009 requires eliminating, caught during
plan self-review, not left in.

`determinedOr()` moves (or is re-exported) from `classification/schema.ts`
so `pricing/schema.ts` can reuse it without a deep cross-module import —
exact placement is a planning/tasks-phase call, not decided here, since
it doesn't change the shape itself.

## `pricing/agent.ts` (FR-017a — added during plan review)

The agent's own prompt instructions describe the OLD flat output shape
and must be rewritten to match FR-017's `determinedOr()` contract:

```
// BEFORE
OUTPUT
MATERIAL lines: unitPrice (integer whole USD, or null), currency, confidence,
source, unavailableReason.
LABOR lines: hourlyRate (integer whole USD/hr, or null), currency,
confidence, source, unavailableReason.
...
1. NEVER hallucinate a price. If you lack a defensible number for this work
   in this zip code, return null with a one-sentence unavailableReason.

// AFTER — matching classification/agents.ts's existing determined-or-flagged phrasing
OUTPUT
Return a determined price when you have a defensible number:
{ "status": "determined", "value": { "unitPrice": <int>, "currency": "USD",
"confidence": "<high|medium|low>", "source": "<label>" } } (MATERIAL lines;
LABOR lines use "hourlyRate" in place of "unitPrice").
If you lack a defensible number, return instead:
{ "status": "unavailable", "reason": "<one-sentence reason>" }
...
1. NEVER hallucinate a price. If you lack a defensible number for this work
   in this zip code, return the unavailable shape with a one-sentence reason.
```

## `pricing/price-line.ts` / `pricing/index.ts` / `estimate/lib/envelope.ts`

```ts
// pricedLineSchema (NEW, replaces pricedLineItemSchema) — FR-011
//
// CORRECTION (caught during plan review, not implementation): billableLineSchema
// is `z.discriminatedUnion('costType', [...])` — a ZodDiscriminatedUnion,
// NOT a ZodObject. `.extend()` is a ZodObject-only method (verified against
// node_modules/zod/v4/classic/schemas.d.ts: ZodDiscriminatedUnion extends
// ZodUnion extends _ZodType, no `.extend()` anywhere in that chain). The
// original `billableLineSchema.extend({ price })` in this file and in
// spec.md's FR-011/finding #11 does not compile — that method doesn't
// exist on that type. The actual fix extends each BRANCH schema (both
// real ZodObjects) individually, then rebuilds the discriminated union:
const pricedMaterialLineSchema = materialLineSchema.extend({
  price: materialPriceResponseSchema.shape.price,
});
const pricedLaborLineSchema = laborLineSchema.extend({
  price: laborPriceResponseSchema.shape.price,
});
export const pricedLineSchema = z.discriminatedUnion('costType', [
  pricedMaterialLineSchema,
  pricedLaborLineSchema,
]);
export type PricedLine = z.infer<typeof pricedLineSchema>;
```

`pricing/price-line.ts`'s step output becomes the merged `pricedLineSchema`
object directly, not `{ line, price }` as two separate schemas.
`pricing/index.ts`'s `priceLines()` returns `PricedLine[]`, not
`{ lines, prices }`.

**FR-016 boundary, made explicit**: FR-016 forbids modifying
`price-line.ts`'s try/catch *resilience pattern* (still catch, still
degrade gracefully instead of throwing — that behavior is untouched).
It does NOT forbid updating the *data this file constructs*, which
necessarily changes shape because of FR-011/FR-017. Concretely:

```ts
// BEFORE — success path reconstructs a flat object field-by-field
const m = result.object;
if (!m) throw new Error('pricer returned no structured object');
return {
  line,
  price: { itemId: line.id, unitPrice: m.unitPrice, currency: m.currency, confidence: m.confidence, source: m.source, unavailableReason: m.unavailableReason },
};

// AFTER — m.price IS already the exact shape pricedLineSchema's own
// `price` field expects (both come from the same determinedOr union),
// so this simplifies to a direct pass-through, not a reconstruction
const m = result.object;
if (!m) throw new Error('pricer returned no structured object');
return { ...line, price: m.price };
```

```ts
// BEFORE — catch-block fallback returns the OLD flat shape
} catch (e) {
  log.warn(...);
  return {
    line,
    price: { itemId: line.id, unitPrice: null, currency: 'USD' as const, confidence: 'low' as const, source: 'lookup-failed', unavailableReason: 'Pricing lookup failed; needs contractor quote.' },
  };
}

// AFTER — same resilience behavior (catch, degrade, never throw —
// FR-016 unchanged), new shape matching priceFlagSchema
} catch (e) {
  log.warn(...);
  return { ...line, price: { status: 'unavailable' as const, reason: 'Pricing lookup failed; needs contractor quote.' } };
}
```

`estimate/lib/envelope.ts`'s `summaryEnvelopeV3Schema` (FR-012, modified
in place per the resolved Clarification):

```ts
// BEFORE
export const summaryEnvelopeV3Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_3),
  lines: z.array(billableLineSchema),
  prices: z.array(pricedLineItemSchema),
  parsedDocument: parsedDocumentSchema.default({ pages: [] }),
  flaggedForWebSearch: z.array(webSearchFlagSchema).default([]),
});

// AFTER
export const summaryEnvelopeV3Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_3),
  lines: z.array(pricedLineSchema),
  parsedDocument: parsedDocumentSchema.default({ pages: [] }),
  flaggedForWebSearch: z.array(webSearchFlagSchema).default([]),
});
```

`ParsedEnvelope`'s `'v3'` variant drops its separate `prices: PricedLineItem[]`
field; `lines: PricedLine[]` carries price data directly. An estimate
persisted under the OLD split shape fails `summaryEnvelopeV3Schema.safeParse()`
and falls through to `'unparseable'` (accepted per the resolved
Clarification — recovered via retry, not preserved).

`estimate/components/items-section.tsx` (FR-013): `priceByItemId` `Map`
and its construction (`new Map(prices.map(...))`) are deleted; `ItemRow`
reads `item.price` directly instead of a separately-passed `price` prop
looked up by id.

## Deleted entirely

- `shared/quarter-hour.ts` (`roundToQuarter()`) — FR-014.
- `shared/gateway.ts`'s `kiloGateway` export (file otherwise unchanged;
  `pioneerGateway` remains) — FR-015.
- `pricing/schema.ts`'s `xorUnavailable` function — FR-017.
- `classification/flatten.ts`'s two `throw new Error(...)` blocks — FR-005.
