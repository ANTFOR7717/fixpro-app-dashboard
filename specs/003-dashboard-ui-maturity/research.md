# Phase 0 Research: Dashboard UI Maturity

## Decision 1: Scope dashboard styling at the route boundary

**Decision**: Add one dashboard-only marker in `src/app/dashboard/layout.tsx` and namespace visual variables/selectors to dashboard route presence.

**Rationale**: `src/features/dashboard/components/layout/dashboard-layout.tsx` is consumed by both `src/app/dashboard/client.tsx` and `src/app/admin/client.tsx`. Directly restyling that shared component or the global root tokens would alter the explicitly excluded admin surface and potentially auth/marketing views. Route scoping preserves the existing shared API while isolating presentation.

**Alternatives considered**:

- Change shared `DashboardLayout` or `DashboardSidebar` classes: rejected because admin uses them.
- Add a new theme provider or layout variant prop: rejected because the scope forbids new components and component-interface changes.
- Change root variables globally: rejected because excluded routes share `src/app/globals.css`.

## Decision 2: Keep shared design-system primitives unchanged

**Decision**: Refine dashboard usages and dashboard-scoped data-slot selectors; do not modify card, button, input, select, sidebar, badge, switch, or other shared primitive definitions.

**Rationale**: The primitives are application-wide dependencies. Editing them would create broad visual effects outside the approved dashboard scope, while their existing focus, disabled, and semantic variants already provide the required behavior.

**Alternatives considered**:

- Add new dashboard variants to primitives: rejected because it expands component APIs and creates a new design abstraction.
- Duplicate primitives under the dashboard feature: rejected as unnecessary duplication and a constitution No Slop violation.

## Decision 3: Use a restrained operations-product visual system

**Decision**: Use neutral canvas/surfaces, charcoal hierarchy, fine borders, restrained evergreen accents, modest radii, an 8px spacing rhythm, and minimal shadows.

**Rationale**: Repository inspection shows broad green tinting, repeated large rounded cards, dashed containers, tinted icon circles, oversized headings, and nested bordered surfaces. Reducing decorative signals while strengthening alignment and hierarchy makes the existing repair-estimate workflows read as a dependable professional tool.

**Alternatives considered**:

- Dark or highly branded sidebar overhaul: rejected because it would dominate the information and complicate excluded admin sharing.
- New illustration, animation, chart, or metric system: rejected as new UX/components and outside scope.
- Wholesale design-system replacement: rejected as disproportionate and high-risk.

## Decision 4: Preserve markup ownership and behavior

**Decision**: Prefer existing `className` changes and minimal route scoping. Preserve component names, exports, props, state, event handlers, server/client boundaries, content, and registries.

**Rationale**: The user's central constraint is presentation maturity without behavior or component changes. Existing components already map cleanly to the required views and states.

**Alternatives considered**:

- Extract shared page-header, empty-state, or list-row components: rejected because new components are explicitly prohibited.
- Reorganize pages or registry metadata: rejected because information architecture and navigation are unchanged.

## Decision 5: Responsive reflow without alternate UX

**Decision**: Keep the current controls and reading order, using responsive grid/flex classes so forms, action groups, status bars, report items, and totals wrap or stack at narrow widths.

**Rationale**: The current fixed report columns and horizontally dense list rows can overflow or compress on narrow screens. Styling-only reflow satisfies the responsive acceptance criteria without adding mobile-specific workflows.

**Alternatives considered**:

- Add mobile cards, drawers, menus, or alternate controls: rejected as new UX/components.
- Permit horizontal page scrolling: rejected because it fails SC-003; local debug/code regions may retain their existing contained scrolling.

## Decision 6: Validate excluded surfaces and behavior explicitly

**Decision**: Treat unchanged admin/auth/marketing/demo views and unchanged interactions as first-class regression checks alongside typecheck, lint, build, and constitution greps.

**Rationale**: Static tooling cannot prove visual scoping or behavioral preservation. Manual route, viewport, keyboard, and interaction review is required for the feature's observable outcomes.

**Alternatives considered**:

- Rely only on compilation: rejected because compilation does not detect CSS leakage, clipping, focus visibility, or accidental visual scope changes.

## Research Outcome

All technical-context questions are resolved. No external service, data model, API, dependency, or migration research is required.
