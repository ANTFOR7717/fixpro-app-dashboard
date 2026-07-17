# Quickstart: Validating the Pipeline Schema Cleanup

## Prerequisites

- `.env` populated with `PIONEER_API_KEY` (already present).
- The existing eval fixture
  (`eval/fixtures/4014-sparrow-house-ln-inspection-report.pdf`).

## Scenario 1 — `pageHint` is completely gone (SC-001)

```bash
grep -rn "pageHint" src/
```

**Expected**: zero results, no exception — `legacyBillableItemSchema`
(the schema that used to carve out an exception here) is itself deleted
(revised FR-003).

## Scenario 2 — no duplicated field declarations remain (SC-002)

```bash
grep -rn "z.string().min(8).max(500)\|z.string().min(1).max(300)\|z.string().min(1).max(200)\|z.string().min(1).max(120)\|z.string().min(1).max(280)" src/features/estimate-extraction-pipeline/
```

**Expected**: zero results (FR-019 — each loosened to `z.string().min(1)`
with no unexplained upper bound). Manual review confirms
`itemIdentitySchema` (renamed from `itemIdentityFields`)/
`classificationResultSchema`/`priceEvidenceFields`/`agentUndeterminedSchema`
are each defined exactly once and composed elsewhere via
`.extend()`/`.omit()`/spread — NOT `pricedLineItemSchema`, which no longer
exists at all (replaced by the merged `pricedLineSchema`, FR-011).

## Scenario 3 — one array, not two (SC-003)

```bash
grep -n "priceByItemId\|prices:" src/features/estimate/components/items-section.tsx src/features/estimate/lib/envelope.ts src/features/estimate-extraction-pipeline/pricing/index.ts
```

**Expected**: zero results. `priceLines()`'s return type is
`PricedLine[]`, not `{ lines, prices }`.

## Scenario 4 — dead code is gone (SC-004)

```bash
grep -rn "roundToQuarter\|kiloGateway" src/
```

**Expected**: zero results.

## Scenario 5 — real pipeline run, no regressions (SC-005)

```bash
pnpm eval:pipeline
```

**Expected**: a real estimate is produced. Classification agents receive
real, non-empty document context for every finding (proving FR-002's
full-document replacement reaches every call site). Zero schema-validation
failures caused by this change. Every line has a `price` field with
either a real determined price or an honest `{ status: 'unavailable',
reason }`.

## Scenario 6 — legacy data is intentionally unrecoverable except by retry (SC-006, revised)

v1/v2 legacy support is deleted entirely (revised FR-003 — explicit user
direction, not an oversight). Manual check against existing DB rows (or
a seeded row per shape):

- A row persisted under v1, v2, or the OLD (split `lines`/`prices`) v3
  shape shows as `'unparseable'` in the report UI and offers the
  existing retry affordance — this is the accepted, intentional outcome
  for every prior shape, not a bug or a partial regression.

## Scenario 7 — quarter-hour constraint is gone (SC-007)

Manually construct (or observe from a live run) a labor determination of
a non-quarter-hour value (e.g. 1.3 hours) and confirm it validates
successfully against `laborDeterminationSchema`/`laborLineSchema`.

## Regression check

`pnpm exec tsc --noEmit`, `pnpm exec eslint <changed paths>`, the
one-door/purity greps from `AGENTS.md`, and `pnpm build` must all stay
clean.
