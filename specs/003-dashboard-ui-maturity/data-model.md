# Phase 1 Data Model: Dashboard UI Maturity

## Outcome

No persisted or domain data model changes are required.

The feature is presentation-only and preserves all existing entities, fields, relationships, validation, identity rules, and lifecycle transitions for:

- authenticated users and roles;
- dashboard navigation metadata;
- contacts;
- estimate requests and their statuses;
- parsed estimate envelopes, line items, prices, and report metadata.

## Existing State Preservation

| Existing state | Presentation obligation | Behavior obligation |
|---|---|---|
| Empty contacts | Quiet, legible empty treatment | Existing create form remains available |
| Populated contacts | Consistent row hierarchy and actions | Existing edit/delete flows remain unchanged |
| Empty estimates | Quiet empty treatment and existing action | Existing upload destination remains unchanged |
| Uploaded/processing estimate | Legible neutral/active status | Existing refresh and processing behavior unchanged |
| Failed estimate | Semantic failure treatment | Existing retry/delete behavior unchanged |
| Completed estimate | Legible completed status and detail affordance | Existing detail navigation unchanged |
| Priced report line | Aligned amount and totals hierarchy | Existing calculation/display value unchanged |
| Unpriced report line | Distinct but subdued unavailable treatment | Existing unavailable reason and totals behavior unchanged |
| Source/evidence/debug toggles | Integrated supporting-control styling | Existing local toggle state and content unchanged |

## Validation Rules

- No schema or migration files may change.
- No form schema or validation rule may change.
- No status mapping or state transition may change.
- No query, server action, upload, pricing, retry, deletion, or authentication logic may change.
- Final diff review must confirm that changes are limited to presentation and route scoping.
