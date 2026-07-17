# Implementation Plan: Dashboard UI Maturity

**Branch**: `feat/dashboard-ui-maturity` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-dashboard-ui-maturity/spec.md`

## Summary

Mature the existing authenticated dashboard shell, overview, estimate submission, estimate history, estimate detail report, and contacts views through a restrained FixPro visual system and responsive styling only. Add a dashboard-route scope marker, define dashboard-only visual variables and selectors, and refine existing component usages in place. Preserve all content, component interfaces, state, actions, routes, and data behavior. Do not edit shared design-system primitives or the shared dashboard shell API because that shell also serves the excluded admin area.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2, Next.js 16.2 App Router

**Primary Dependencies**: Tailwind CSS 4.1, shadcn-derived Radix primitives, Lucide React, existing Inter font and FixPro image assets

**Storage**: N/A — no schema, persistence, migration, or data-flow changes

**Testing**: `pnpm exec tsc --noEmit`; `pnpm exec eslint <changed paths>`; `pnpm build`; constitution boundary greps; manual authenticated route, responsive, keyboard, and behavioral regression review

**Target Platform**: Modern desktop and mobile browsers supported by the current Next.js application

**Project Type**: Next.js web application with feature-organized server and client components

**Performance Goals**: No new runtime dependencies, network requests, fonts, assets, client state, or animation systems; no unintended horizontal page scrolling at 375px, 768px, or 1440px viewport widths

**Constraints**: Styling-only; no new React components, component APIs, UX capabilities, routes, controls, copy, schemas, server actions, or shared primitive changes; homepage, auth, registration, admin, and `/dashboard/new-dashboard` excluded from direct edits

**Scale/Scope**: One shared dashboard route scope and five user-facing dashboard view families: overview, estimate submission, estimate history, estimate detail, and contacts

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-Research Gate

- **I. One-Door Module Boundaries — PASS**: No estimate-pipeline modules or imports are changed. Required boundary greps remain validation gates.
- **II. Pipeline Purity — PASS**: No pipeline, database, or estimate workflow code is changed.
- **III. Explicit Throw/Retry Failure Model — PASS**: No workflow execution or failure behavior is changed.
- **IV. No Hand-Rolled Agent Orchestration — PASS**: No agent or workflow code is in scope.
- **V. Verification Discipline Over Guessing — PASS**: Technical decisions are derived from repository source, installed dependency versions in `package.json`, existing route/component ownership, and the current design-system implementation. No new external API behavior is assumed.
- **VI. No Slop — PASS**: The plan reuses existing components and primitives, introduces no dependency or abstraction, avoids duplicating shared component APIs, and explicitly blocks scope creep.
- **Development workflow — PASS**: Work is isolated on `feat/dashboard-ui-maturity`, follows Spec Kit artifacts, and retains the mandated typecheck, changed-file lint, build, and boundary checks.

### Post-Design Gate

PASS. The Phase 1 artifacts introduce only a UI presentation contract and validation guide. They require no data model, API, schema, migration, SDK, pipeline, or architectural exception. Complexity tracking is therefore unnecessary.

## Project Structure

### Documentation (this feature)

```text
specs/003-dashboard-ui-maturity/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── dashboard-visual-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md                         # Generated only by speckit.tasks
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── globals.css                  # Dashboard-scoped variables/selectors only
│   └── dashboard/
│       ├── layout.tsx               # Dashboard-only scope marker
│       └── estimate/[id]/page.tsx   # Existing detail-page spacing/surface usage
├── features/
│   ├── dashboard/components/
│   │   └── overview/dashboard-overview.tsx
│   ├── estimate/components/
│   │   ├── estimate-view.tsx
│   │   ├── estimates-list-view.tsx
│   │   ├── recent-estimates-widget.tsx
│   │   ├── estimate-status-bar.tsx
│   │   ├── estimate-report.tsx
│   │   └── items-section.tsx
│   └── contacts/components/
│       ├── contacts-view.tsx
│       ├── contact-form.tsx
│       ├── contact-picker.tsx
│       └── contact-row-actions.tsx
└── design-systems/shadcn/components/ # Reused unchanged
```

**Explicitly unchanged**:

```text
src/app/page.tsx
src/app/auth/
src/app/admin/
src/features/marketing/
src/features/auth/
src/features/new-dashboard/registry.tsx
src/design-systems/shadcn/components/
src/features/estimate/api/
src/features/estimate/db/
src/features/estimate/lib/
src/features/estimate-extraction-pipeline/
src/features/contacts/api/
src/features/contacts/db/
```

**Structure Decision**: Keep the existing feature-oriented Next.js structure. Apply route ownership in `src/app/dashboard/layout.tsx`, dashboard-specific presentation in the current dashboard/estimate/contact components, and scoped visual variables in the existing global stylesheet. Do not add a component directory, theme provider, design token module, or variant API for this visual-only pass.

## Technical Approach

### 1. Isolate the dashboard visual scope

- Add a stable class marker to the existing dashboard route layout.
- Define dashboard-only color and surface variables under that marker; account for portaled sidebar content by using a route-presence selector rather than changing shared sidebar props.
- Leave root tokens and shared shadcn-derived primitives unchanged so marketing, auth, registration, admin, dialogs, and unrelated pages keep their current appearance.
- Do not edit `DashboardLayout` or `DashboardSidebar` component interfaces; their dashboard rendering is refined through scoped descendant/data-slot styling.

### 2. Establish the restrained FixPro visual grammar

- Use a neutral off-white canvas, white primary surfaces, charcoal foreground, restrained gray-green secondary text, fine neutral borders, and the existing evergreen only for active, primary, focus, and successful states.
- Standardize page headings at a restrained semibold scale, compact descriptions, 24–32px page gutters, an 8px spacing rhythm, 8–10px radii, and border-led rather than shadow-led separation.
- Retain existing focus rings and semantic destructive/failure treatments.
- Avoid broad green tinting, oversized headings, decorative icon bubbles, heavy dashed borders, large pill treatments, and nested card elevation.

### 3. Refine each existing view in place

- **Overview**: Keep registry-driven actions/widgets; make actions compact and horizontally composed, normalize section/card hierarchy, and remove the visual double-card effect around recent estimates.
- **Estimate submission**: Keep all current inputs, selects, saved-contact behavior, checkboxes, validation, upload, and submit logic; normalize headings, section spacing, full-width controls, error color tokens, file-control surface, and responsive grids.
- **Estimate history and recent estimates**: Keep current data/actions/statuses; reduce decorative treatment, improve row density and hover/focus states, and allow status/action groups to wrap below metadata at narrow widths.
- **Contacts**: Keep create/edit/delete behavior; distinguish create and list regions using spacing and borders, align row actions, and ensure inline edit content uses available width on narrow screens.
- **Estimate detail/report**: Keep invoice content and all evidence/debug switches; refine the paper surface, metadata hierarchy, section rhythm, trade headers, totals, empty/error states, and responsive item rows.
- **Shared shell**: Through dashboard-scoped selectors only, refine the dashboard header divider, breadcrumb hierarchy, sidebar brand/version contrast, navigation active state, and content canvas.

### 4. Preserve behavior and excluded surfaces

- Make no changes to props, handlers, state, schemas, data queries, actions, redirects, or copy.
- Do not directly edit `/dashboard/new-dashboard`; it may only inherit unavoidable shared-shell styling.
- Confirm the same shared shell remains visually unchanged when rendered by `/admin`.

## Validation Strategy

1. Run TypeScript, changed-file ESLint, project build, and constitution boundary/purity checks.
2. Compare all in-scope routes at 375px, 768px, and 1440px widths for overflow, clipping, hierarchy, and control access.
3. Verify existing keyboard focus order and visible focus states.
4. Exercise existing form validation, contact selection/create/edit/delete, estimate upload control, refresh/retry/delete controls, completed estimate navigation, status tooltips, and report switches without changing their behavior.
5. Compare homepage, login, registration, admin, and `/dashboard/new-dashboard` before/after; direct styling changes on these surfaces fail scope validation.
6. Inspect the final diff for zero new components, dependencies, component APIs, routes, schemas, server actions, workflow changes, and user-facing copy changes.

## Risks and Controls

- **Shared shell also serves admin**: Dashboard-only route marker and scoped selectors; verify `/admin` unchanged.
- **Mobile sidebar is portaled outside the route wrapper**: Route-presence scoping must cover the portal without globally changing the sidebar; validate desktop and mobile shell separately.
- **Dense report rows use fixed desktop columns**: Introduce responsive layout classes only; verify long values, evidence content, priced/unpriced lines, and totals.
- **Nested page padding is inconsistent**: Normalize at existing view boundaries without changing route ownership or adding layout abstractions.
- **Global stylesheet can leak**: Every new selector must be namespaced to dashboard route presence; root and `.dark` token blocks remain unchanged.
- **Visual-only work can hide behavioral regressions**: Diff inspection plus route-level interaction QA ensures event handlers and component contracts are untouched.

## Complexity Tracking

No constitution violations or architecture exceptions are required.
