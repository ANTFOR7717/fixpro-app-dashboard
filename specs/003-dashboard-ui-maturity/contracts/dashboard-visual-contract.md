# Dashboard Visual Contract

This contract defines observable presentation requirements for the existing dashboard. It introduces no new component or product API.

## Scope Contract

Direct styling applies to:

- `/dashboard`
- `/dashboard/estimate`
- `/dashboard/estimates`
- `/dashboard/estimate/[id]`
- `/dashboard/contacts`
- shared dashboard shell presentation only while serving the dashboard routes

Direct styling does not apply to:

- `/`
- `/auth/login`
- `/auth/register`
- `/admin` and descendants
- `/dashboard/new-dashboard`

The excluded demonstration route may inherit unavoidable shared-shell styling but its own markup is not edited.

## Visual Tokens

| Concern | Contract |
|---|---|
| Canvas | Neutral off-white, visually distinct from white content surfaces |
| Primary surfaces | White or near-white with fine neutral borders |
| Primary text | High-contrast charcoal, not saturated green |
| Secondary text | Restrained gray-green with readable contrast |
| Brand accent | Existing FixPro evergreen, reserved for primary actions, active navigation, focus, and successful progress |
| Destructive/failure | Existing destructive semantic family only |
| Radius | Predominantly 8–10px; pills only where meaningfully badge-like |
| Elevation | Border-led; shadows subtle and limited to true elevation |
| Spacing | 8px rhythm; 24px mobile/tablet and up to 32px desktop page gutters where space allows |
| Typography | Inter retained; page headings 24–28px semibold; section titles approximately 16–18px semibold; body/labels approximately 13–14px |

Exact accessible values are finalized during implementation within dashboard-scoped variables and verified in both existing light and dark token contexts.

## Component Presentation Contract

### Shell and navigation

- Dashboard header has a quiet boundary from content.
- Breadcrumbs remain compact and subordinate to page headings.
- Sidebar brand/version hierarchy is restrained.
- Active navigation is visibly distinct without relying on text weight alone.
- Shared shell component interfaces remain unchanged.

### Overview

- Quick actions retain the same destinations and labels.
- Actions read as compact utilities, not decorative feature tiles.
- Widget/card nesting does not create doubled borders or elevation.

### Forms

- Existing fields, labels, selectors, checkboxes, file input, validation, and submit states remain present.
- Controls align consistently and fill their intended column width.
- Section hierarchy uses typography, spacing, and separators rather than new containers.

### Lists and statuses

- Filename/contact identity remains primary; metadata remains secondary.
- Existing row actions remain visible and semantically clear.
- Status, retry, delete, and refresh controls reflow without clipping at narrow widths.
- Semantic status and destructive treatments remain intact.

### Estimate report

- The report reads as a document surface within the application canvas.
- Metadata, property, parties, trade groups, item values, and totals retain their current order and values.
- Desktop columns become a labeled stacked/grid presentation when space is insufficient.
- Existing source/evidence/debug switches and content remain unchanged.

### Empty and error states

- Existing copy and calls to action remain unchanged.
- Decorative dashed borders, tint, icon bubbles, and whitespace are reduced.
- Failure, validation, and unavailable states remain distinguishable.

## Responsive Contract

At 375px, 768px, and 1440px viewport widths:

- no in-scope page produces unintended horizontal page scrolling;
- primary actions and destructive controls remain reachable;
- long values do not obscure status or totals;
- existing reading and keyboard order is preserved;
- mobile sidebar behavior remains unchanged.

## Non-Change Contract

Implementation must add none of the following:

- standalone React components;
- component props or variants;
- routes or navigation entries;
- fields, controls, panels, charts, or metrics;
- copy or information-architecture changes;
- dependencies, assets, fonts, requests, or client state;
- schema, persistence, API, server-action, or workflow changes.
