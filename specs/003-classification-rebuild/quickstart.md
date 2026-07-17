# Quickstart: Validating the Classification Rebuild

## Prerequisites

- `.env` populated with `PIONEER_API_KEY` (and `PIONEER_API_URL` if not
  using the default) — the same gateway every pipeline agent already
  uses.
- A real inspection-report PDF fixture. The feature 002 eval harness's
  existing fixture (`eval/fixtures/4014-sparrow-house-ln-inspection-report.pdf`)
  already contains at least one labor-only finding and at least one
  material-and-labor finding (both referenced in that feature's own
  hand-authored expected-output record) — reuse it rather than sourcing
  a new one.

## Scenario 1 — end-to-end run via the eval harness (SC-001, SC-002, SC-003)

```bash
pnpm eval:pipeline
```

**Expected**: the harness runs the real `summarize-estimate` workflow
against the fixture; every finding extraction produced has a
corresponding `BillableLine` or `WebSearchFlag` entry — none silently
missing (SC-001). Manually inspect the run's classification-stage step
output (or the harness's own classification scorer, once its field
names/taxonomy are updated for this rebuild — tasks.md Polish phase) for:

- at least one finding whose result has zero material lines and one
  labor line (SC-002 — a labor-only finding, e.g. a loose-fixture or
  service-call finding in the fixture)
- at least one finding whose result has 1+ material lines AND one labor
  line (SC-003 — e.g. a "replace damaged X" finding)

## Scenario 2 — trade consistency (SC-004)

For a small sample (5-10) of the run's `BillableLine`s, manually confirm
each line's `trade` value is one of the 23 taxonomy values in
`data-model.md`, and that it is the trade a real contractor would
actually send for that specific material/labor combination — not a
generic default. Cross-check against `spec.md` Clarification Q3's
sourcing table if a value's fit is unclear.

## Scenario 3 — honest undetermined representation (SC-005)

Identify (or, if none occurs naturally in the fixture, temporarily
construct via a minimal synthetic finding for local testing only — not
committed as a fixture change) a finding whose quantity/hours genuinely
cannot be grounded in its own text or surrounding document context.
Confirm the pipeline's result includes a `WebSearchFlag` entry (not a
missing value, not a fabricated number) whose `searchContext` contains
the full originating finding, a non-empty `documentExcerpt`, and a
specific `reason` string — never a generic placeholder message.

## Scenario 4 — per-finding failure isolation (SC-006)

Temporarily lower `materialsAgentStep`'s (or any one per-finding step's)
`retries` to `0` and inject a deliberate one-off failure path locally
(e.g. a malformed schema for a single test run) to confirm: the combine
step downgrades that ONE finding to a `flagged_for_web_search` result
(with a failure-derived `reason`) while every OTHER finding in the same
run still completes normally — matching `pricing/price-line.ts`'s
already-accepted per-item resilience precedent. Revert the temporary
change afterward; this is a manual verification step, not a new
permanent code path.

## Regression check

`pnpm exec tsc --noEmit`, `pnpm exec eslint <changed paths>`, the
one-door/purity greps from `AGENTS.md`, and `pnpm build` must all stay
clean (per the constitution's Development Workflow validation gates) —
see tasks.md's Polish phase for the exact commands.
