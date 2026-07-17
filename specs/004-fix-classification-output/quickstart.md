# Quickstart: Validating the Structured-Output Fix

## Prerequisites

- Same as feature 003: `.env` populated with `PIONEER_API_KEY`, the
  existing eval fixture (`eval/fixtures/4014-sparrow-house-ln-inspection-report.pdf`).
- This fix's own predecessor state: a live run against this fixture with
  feature 003's ORIGINAL (pre-fix) code produced 100% classification
  failure — every finding logged `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`.
  That run's log is this fix's own regression baseline.

## Scenario 1 — the primary defect is gone (SC-001, SC-002)

```bash
pnpm eval:pipeline
```

**Expected**: at least one real `BillableLine` is produced (not every
finding ending up flagged). Grep the run's own log output for
`STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED` — any remaining occurrence
must be traceable to a specific, understood cause (e.g. a genuine
provider hiccup unrelated to schema shape), not silently tolerated as
"expected."

## Scenario 2 — an honestly-flagged finding still carries full context, without the model having produced it (SC-003)

For at least one finding whose materials/hours/trade end up flagged,
inspect the pipeline's own `flaggedForWebSearch` output array. Confirm:
- `searchContext.finding` and `searchContext.documentExcerpt` are both
  present and correct for that specific finding.
- The corresponding agent step's own raw response (visible via
  `mastra:dev`/Studio, or a temporary log line) contained only
  `{ status, reason }` — never the finding or excerpt.

## Scenario 3 — per-finding failure isolation still holds (SC-004)

Per feature 003's own quickstart Scenario 4 pattern: temporarily force a
non-schema-validation failure for one finding (e.g. a simulated network
error) and confirm every other finding in the same run still completes.
Revert the temporary change afterward.

## Scenario 4 — nothing outside classification's structured-output/resilience code changed (SC-005)

```bash
git diff --stat
```

**Expected**: only `src/features/estimate-extraction-pipeline/classification/schema.ts`,
`classification/agents.ts`, and `classification/finding-workflow.ts`
appear (beyond this feature's own `specs/004-fix-classification-output/`
documentation).

## Regression check

`pnpm exec tsc --noEmit`, `pnpm exec eslint <changed paths>`, the
one-door/purity greps from `AGENTS.md`, and `pnpm build` must all stay
clean — see tasks.md's Polish phase for exact commands.
