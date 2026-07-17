# Quickstart Validation: Dashboard UI Maturity

## Prerequisites

- Work on `feat/dashboard-ui-maturity`.
- Use the existing project environment, authenticated test user, development database, and representative estimate/contact records.
- Do not create new dependencies or migrations for this feature.

## Static Validation

```sh
pnpm exec tsc --noEmit
pnpm exec eslint <each-changed-source-path>
pnpm build
```

Run the four one-door import checks and the pipeline-purity check defined in `AGENTS.md`. All must return zero violations.

Inspect the final diff and confirm:

- no new React component declarations or exports;
- no component-interface, route, registry, copy, dependency, schema, API, action, workflow, or data changes;
- every new global stylesheet selector is scoped to dashboard route presence;
- `src/features/new-dashboard/registry.tsx` is untouched.

## Manual Run

```sh
pnpm dev
```

Sign in using an existing development account. Review each route at 375px, 768px, and 1440px viewport widths:

1. `/dashboard`
2. `/dashboard/estimate`
3. `/dashboard/estimates`
4. `/dashboard/estimate/<completed-estimate-id>`
5. `/dashboard/contacts`

For every route, confirm:

- professional visual contract in [contracts/dashboard-visual-contract.md](./contracts/dashboard-visual-contract.md);
- no unintended horizontal page scrolling;
- visible keyboard focus and unchanged tab order;
- existing hover, disabled, loading, active, destructive, failure, and validation states;
- no clipped primary actions, statuses, totals, or long content.

## Behavior Regression Scenarios

Use existing records and safe development data to confirm:

- sidebar open/close and dashboard navigation;
- dashboard refresh and existing quick-action destinations;
- estimate form validation, saved-contact selection, checkboxes, file selection, and current submit path;
- empty, processing, failed, and completed estimate presentation;
- retry, delete confirmation, refresh, and completed-estimate navigation;
- contact create, edit/cancel, delete confirmation, success/error feedback;
- source, pricing-evidence, and debug switches on a completed estimate report;
- priced and unpriced report rows, long excerpts, metadata, and totals.

Do not submit production data or delete non-test records during validation.

## Excluded-Surface Regression

Compare these routes against the baseline and confirm no direct visual changes:

- `/`
- `/auth/login`
- `/auth/register`
- `/admin`
- `/dashboard/new-dashboard` inner placeholder content

The demonstration dashboard route may inherit the shared dashboard shell appearance, but its own placeholder markup must remain untouched.

## Completion Evidence

Record:

- successful static command output;
- changed-file lint path list;
- viewport/route matrix reviewed;
- interaction scenarios exercised;
- excluded surfaces compared;
- any unavailable test state and why it could not be exercised.
