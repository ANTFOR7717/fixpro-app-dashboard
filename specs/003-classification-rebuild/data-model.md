# Data Model: Classification Module Rebuild

## Trade taxonomy

```ts
export const TRADE = [
  'electrical', 'plumbing', 'hvac', 'fire_protection',
  'roofing', 'siding', 'carpentry', 'drywall', 'flooring', 'glazing',
  'masonry', 'painting', 'insulation', 'concrete', 'waterproofing', 'tile',
  'foundation', 'excavation_grading', 'landscaping', 'fencing',
  'mold_remediation', 'pest_control', 'general_contractor',
] as const;
export type Trade = (typeof TRADE)[number];
```

Sourced from the Tennessee Board for Licensing Contractors'
"Classification Outline with Trade Exam Requirements" (Rev. 5/2019),
scoped to the residential-repair-relevant subset — see spec.md
Clarification Q3 for full sourcing and per-value rationale. Closed set,
no `other` value; an undeterminable trade produces a `WebSearchFlag`
instead (see below), never a 24th taxonomy value.

`EXTENT_UNIT` is unchanged from the scrapped module — `['ea', 'lf', 'sf',
'cy']` — a correct, minimal domain fact (research.md's Constitution
Check row on this).

## The shared "couldn't determine" shape: `WebSearchFlag`

One schema, reused identically for material quantity, labor hours, and
trade (spec.md Q2/Q3):

```ts
export const webSearchFlagSchema = z.object({
  status: z.literal('flagged_for_web_search'),
  /** Short, specific, machine-readable — e.g. "no quantity or unit
   *  stated in finding or surrounding page text". */
  reason: z.string().min(1).max(300),
  searchContext: z.object({
    finding: extractedFindingSchema,
    /** The surrounding parsed-document text near finding.pageHint,
     *  captured once here (via getInitData()) so a future web-search
     *  step never has to re-fetch or re-parse the source document. */
    documentExcerpt: z.string(),
    /** Whatever THIS pass did manage to determine for the same
     *  finding, so a future resolution step has maximal context. */
    partialFindings: z.object({
      materials: z.array(z.object({
        material: z.string(),
        quantity: z.number().positive(),
        unit: z.enum(EXTENT_UNIT),
      })).optional(),
      labor: z.object({
        laborType: z.string(),
        hours: z.number().positive(),
      }).optional(),
    }),
  }),
});
export type WebSearchFlag = z.infer<typeof webSearchFlagSchema>;
```

A generic `determinedOr(valueSchema)` helper builds the discriminated
union used everywhere a value can be resolved OR flagged:

```ts
function determinedOr<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('determined'), value: valueSchema }),
    webSearchFlagSchema,
  ]);
}
```

## Per-finding intermediate result (nested workflow's own output)

```ts
export const materialDeterminationSchema = z.object({
  material: z.string().min(1),
  quantity: determinedOr(z.object({
    amount: z.number().positive(),
    unit: z.enum(EXTENT_UNIT),
  })),
  /** Present only alongside a 'determined' quantity — the grounding
   *  citation (document quote or, in a future pass, a web-search
   *  citation). Omitted entirely when quantity is flagged. */
  amountSource: z.string().min(1).optional(),
});

export const laborDeterminationSchema = z.object({
  laborType: z.string().min(1),
  hours: determinedOr(z.number().multipleOf(0.25).min(0.25)),
  hoursSource: z.string().min(1).optional(),
});

export const classificationResultSchema = z.object({
  findingId: z.string(),
  materials: z.array(materialDeterminationSchema),
  labor: laborDeterminationSchema,
  trade: determinedOr(z.enum(TRADE)),
});
export type ClassificationResult = z.infer<typeof classificationResultSchema>;
```

A finding with zero materials produces `materials: []` (User Story 2) —
never an error, never a placeholder entry.

## Handoff shape to pricing: `billableLineSchema` — field contract UNCHANGED, only `trade`'s values change

Preserved exactly as `pricing/price-line.ts` consumes it today
(research.md R8):

```ts
const itemIdentityFields = {
  id: z.string(),
  trade: z.enum(TRADE),          // new 23-value taxonomy; shape unchanged
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  sourceQuote: z.string().min(8).max(500),
  pageHint: z.string().regex(/^p\.\s*\d+$/).nullable(),
} as const;

export const materialLineSchema = z.object({
  ...itemIdentityFields,
  costType: z.literal('material'),
  material: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.enum(EXTENT_UNIT),
  amountSource: z.string().min(1),
  pricingBasis: z.literal('material-part-only'),
});

export const laborLineSchema = z.object({
  ...itemIdentityFields,
  costType: z.literal('labor'),
  laborType: z.string().min(1),
  quantity: z.number().multipleOf(0.25).min(0.25),
  unit: z.literal('hrs'),
  hoursSource: z.string().min(1),
  pricingBasis: z.enum(['labor-install-hourly', 'labor-all-in-hourly']),
});

export const billableLineSchema = z.discriminatedUnion('costType', [
  materialLineSchema,
  laborLineSchema,
]);
export type BillableLine = z.infer<typeof billableLineSchema>;
```

## The flatten/aggregate step: `ClassificationResult[]` -> `{ lines, flaggedForWebSearch }`

Runs once, after `.foreach()` collects every finding's
`ClassificationResult` (mirrors the documented `.foreach().then(aggregateStep)`
map-reduce pattern). Per finding:

1. **If `trade.status === 'flagged_for_web_search'`**: the whole finding
   produces no `BillableLine` at all this pass — its `trade` flag (as-is)
   is pushed to `flaggedForWebSearch`. A finding's lines all need a real
   trade value; a finding whose trade can't be resolved can't produce a
   line pricing could act on regardless of how well its materials/labor
   resolved individually.
2. **Otherwise**, for each material in `materials`:
   - if `quantity.status === 'determined'`: emit one `materialLineSchema`
     line (`pricingBasis: 'material-part-only'`, `id: buildLineId(findingId, 'material', index)`).
   - if flagged: push that material's flag to `flaggedForWebSearch`
     instead (this ONE material is deferred; siblings and labor are not).
3. For `labor`:
   - if `hours.status === 'determined'`: emit one `laborLineSchema` line.
     `pricingBasis` is `'labor-install-hourly'` if at least one material
     line was emitted for this finding (step 2 produced 1+), else
     `'labor-all-in-hourly'` — the exact same rule the scrapped module's
     schema comment already documented correctly (not itself slop;
     preserved because it is genuinely how `pricing/price-line.ts`'s
     prompt distinguishes the two cases).
   - if flagged: push to `flaggedForWebSearch`.

```ts
function buildLineId(
  findingId: string,
  kind: 'material' | 'labor',
  index?: number,
): string {
  return kind === 'labor' ? `${findingId}:labor` : `${findingId}:material:${index}`;
}
```

One named function, one call site per kind — replacing the scrapped
module's scattered inline string-suffixing (`${f.id}-material`,
`${f.id}-material-${i}`, `${f.id}-labor`) with a single, typed,
grep-able source of truth (Constitution VI's "trivial data
normalization with no SDK equivalent" exception — confirmed no SDK
primitive covers per-item ID derivation).

`flattenClassificationResultsStep`'s own output schema:

```ts
z.object({
  lines: z.array(billableLineSchema),
  flaggedForWebSearch: z.array(webSearchFlagSchema),
})
```

## `pipeline.ts` composition change

Before (scrapped):

```ts
.then(findingExtractorAgentStep)
.map(async ({ inputData }) => ({ prompt: buildClassificationPrompt(inputData.findings) }))
.then(lineClassifierAgentStep)
.map(async ({ inputData, getStepResult }) => ({
  findings: getStepResult(findingExtractorAgentStep).findings,
  classifications: inputData.lines,
}))
.then(buildLinesStep)
```

After:

```ts
.then(findingExtractorAgentStep)
.map(async ({ getStepResult }) => ({
  findings: getStepResult(findingExtractorAgentStep).findings,
  parsedDocument: getStepResult(parseDocumentStep).parsedDocument,
}))
.then(classifyStep)   // execute() calls classifyFindings({ findings, parsedDocument })
```

`classifyStep`'s own `outputSchema` is
`z.object({ lines: z.array(billableLineSchema), flaggedForWebSearch: z.array(webSearchFlagSchema) })`
— matching `classifyFindings()`'s own return shape directly (no reshaping
`.map()` needed between them, same as `priceStep` calling `priceLines()`
today).

`priceStep`'s own `inputSchema`/`execute()` gains one pass-through field
(`flaggedForWebSearch`), exactly like it already passes `parsedDocument`
through unchanged today — `priceLines()`'s own call and pricing's own
logic are untouched.

`summarizeEstimateWorkflow`'s own `outputSchema` (== `priceStep.outputSchema`)
therefore gains `flaggedForWebSearch: z.array(webSearchFlagSchema)` as a
new top-level field of the workflow's final result.

## `estimate/lib/envelope.ts` change

```ts
export const summaryEnvelopeV3Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_3),
  lines: z.array(billableLineSchema),
  prices: z.array(pricedLineItemSchema),
  parsedDocument: parsedDocumentSchema.default({ pages: [] }),
  flaggedForWebSearch: z.array(webSearchFlagSchema).default([]),
});
```

`.default([])`, matching `parsedDocument`'s own precedent exactly —
every already-persisted v3 row (with no such key at all) still parses
successfully; `ParsedEnvelope`'s `'v3'` variant gains the same field.
`triggerSummarizeEstimate` (`estimate/lib/workflow.ts`) passes
`result.result.flaggedForWebSearch` through when building the envelope,
the same way it already passes `result.result.parsedDocument` through.

No UI rendering of `flaggedForWebSearch` is added in this pass — out of
scope (spec.md's own subject is the determination/data-contract, not a
UI feature); the data is simply no longer silently dropped at the
persistence boundary, satisfying FR-009.

## `estimate/lib/format.ts` change

`formatTradeLabel`'s `switch` gains one `case` per new `TRADE` value with
a clean human label (e.g. `'excavation_grading'` -> `'Excavation &
Grading'`, `'general_contractor'` -> `'General Contractor'`). Its
existing `default` branch (title-casing any unrecognized string) already
prevents a hard failure even before this change — this is a display-
quality completion, not a break-fix.
