# Tasks: Dashboard UI Maturity

**Input**: Design documents from `/specs/003-dashboard-ui-maturity/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/dashboard-visual-contract.md`, `quickstart.md`

**Tests**: This styling-only feature requires existing project validation and manual route/interaction regression checks. It does not introduce a new automated test framework.

**Organization**: Tasks are grouped by user story so each visual increment has an explicit independent validation target. No task may introduce components, behavior, copy, dependencies, or changes to excluded routes.

## Phase 1: Setup

**Purpose**: Confirm the approved scope and baseline before source changes.

- [ ] T001 Confirm the implementation baseline, explicit unchanged paths, and route/viewport validation matrix against `specs/003-dashboard-ui-maturity/plan.md`, `specs/003-dashboard-ui-maturity/contracts/dashboard-visual-contract.md`, and `specs/003-dashboard-ui-maturity/quickstart.md`

---

## Phase 2: Foundational Dashboard Scope

**Purpose**: Create the dashboard-only styling boundary required by every user story without changing shared component APIs or excluded surfaces.

**Critical**: Complete this phase before any user-story styling.

- [ ] T002 Add the dashboard-only route scope marker without changing authentication or layout behavior in `src/app/dashboard/layout.tsx`
- [ ] T003 Define dashboard-scoped canvas, surface, typography, border, radius, focus, and semantic variables while leaving root/shared tokens unchanged in `src/app/globals.css`

**Checkpoint**: Dashboard-specific styles have an isolated route boundary; admin, auth, marketing, and shared primitives remain outside it.

---

## Phase 3: User Story 1 — Consistent Professional Dashboard Shell (Priority: P1) 🎯 MVP

**Goal**: Apply one restrained professional visual language to the existing dashboard shell and overview while preserving navigation and registry behavior.

**Independent Test**: Visit `/dashboard` at 375px, 768px, and 1440px; verify the sidebar, header, breadcrumbs, content canvas, quick actions, and recent-estimates widget share the visual contract, retain existing destinations, and produce no unintended horizontal scrolling. Compare `/admin` to baseline and confirm it is unchanged.

### Implementation

- [ ] T004 [US1] Refine the dashboard-only shared-shell header, breadcrumb, sidebar brand/version, active navigation, and content-canvas selectors under route scope in `src/app/globals.css`
- [ ] T005 [US1] Restyle the existing registry-driven quick actions and widget hierarchy without adding or removing content in `src/features/dashboard/components/overview/dashboard-overview.tsx`

**Checkpoint**: User Story 1 is visually complete and independently verifiable as the MVP.

---

## Phase 4: User Story 2 — Clear Existing Workflows (Priority: P1)

**Goal**: Improve hierarchy, density, control consistency, row presentation, empty states, and responsive reflow across estimate submission/history and contacts without changing any workflow.

**Independent Test**: Exercise the current estimate form, saved-contact selection, file input, validation, contact create/edit/delete, estimate empty/processing/failed/completed states, refresh/retry/delete controls, and completed-detail navigation at all three representative viewport widths; confirm every existing control and behavior remains present.

### Implementation

- [ ] T006 [P] [US2] Normalize page hierarchy, form sections, control widths, validation styling, upload surface, and narrow-screen grids while preserving all handlers and fields in `src/features/estimate/components/estimate-view.tsx`
- [ ] T007 [P] [US2] Align the existing saved-contact selector with the form control contract without changing selection behavior in `src/features/contacts/components/contact-picker.tsx`
- [ ] T008 [P] [US2] Normalize contact create/update field spacing, error treatment, and submit presentation without changing validation or actions in `src/features/contacts/components/contact-form.tsx`
- [ ] T009 [US2] Refine Contacts page heading, create/list separation, empty state, row density, and responsive layout while preserving content and actions in `src/features/contacts/components/contacts-view.tsx`
- [ ] T010 [US2] Make existing contact row actions and inline editing reflow cleanly at narrow widths without changing edit/delete state or dialogs in `src/features/contacts/components/contact-row-actions.tsx`
- [ ] T011 [P] [US2] Refine estimate-history heading, empty state, row metadata/actions, hover/focus treatment, and responsive wrapping in `src/features/estimate/components/estimates-list-view.tsx`
- [ ] T012 [P] [US2] Remove nested-card visual duplication and align existing recent-estimate rows/footer with the dashboard visual contract in `src/features/estimate/components/recent-estimates-widget.tsx`
- [ ] T013 [US2] Preserve status semantics while making the existing status bar fit dense and narrow list layouts in `src/features/estimate/components/estimate-status-bar.tsx`

**Checkpoint**: User Story 2 workflows are visually mature, responsive, and behaviorally unchanged.

---

## Phase 5: User Story 3 — Credible Estimate Report Presentation (Priority: P2)

**Goal**: Present the existing estimate detail as a credible professional document with disciplined hierarchy and responsive item layouts.

**Independent Test**: Open a completed estimate containing priced and unpriced items at 375px, 768px, and 1440px; verify metadata, property, parties, switches, trade groups, source/evidence/debug content, totals, and disclaimer retain their values and controls without clipping or page overflow.

### Implementation

- [ ] T014 [P] [US3] Normalize the existing detail-page canvas, content width, spacing, and back-link presentation without changing navigation in `src/app/dashboard/estimate/[id]/page.tsx`
- [ ] T015 [P] [US3] Refine the report paper surface, header metadata, property/parties hierarchy, separators, empty states, and disclaimer without changing report content in `src/features/estimate/components/estimate-report.tsx`
- [ ] T016 [US3] Refine switch grouping, trade headers, badges, item columns, stacked narrow-screen labels, and totals while preserving calculations and toggle state in `src/features/estimate/components/items-section.tsx`

**Checkpoint**: User Story 3 is visually complete and retains the existing report contract.

---

## Phase 6: Polish & Cross-Cutting Validation

**Purpose**: Prove visual scope, responsiveness, accessibility, behavioral preservation, and repository compliance across the completed feature.

- [ ] T017 Run `pnpm exec tsc --noEmit`, `pnpm exec eslint <each-changed-source-path>`, `pnpm build`, and all boundary/purity checks from `AGENTS.md`; record outcomes against `specs/003-dashboard-ui-maturity/quickstart.md`
- [ ] T018 Review all in-scope routes at 375px, 768px, and 1440px for overflow, clipping, hierarchy, focus visibility, keyboard order, semantic states, and long-content behavior using `specs/003-dashboard-ui-maturity/quickstart.md`
- [ ] T019 Exercise the existing interaction scenarios, compare every excluded surface to baseline, and audit the final diff for zero new components, interfaces, behavior, copy, routes, dependencies, schemas, or direct `/dashboard/new-dashboard` edits using `specs/003-dashboard-ui-maturity/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: Starts immediately.
- **Phase 2 — Foundational Scope**: Depends on T001 and blocks every user story.
- **Phase 3 — User Story 1**: Depends on T002–T003; establishes the MVP shell and overview.
- **Phase 4 — User Story 2**: Depends on T002–T003. It can be implemented after the visual foundation is frozen; final integration must remain consistent with User Story 1.
- **Phase 5 — User Story 3**: Depends on T002–T003. It can begin after the visual foundation is frozen; report styling must use the same contract.
- **Phase 6 — Validation**: Depends on T004–T016.

### User Story Dependencies

```text
T001 Setup
  └── T002–T003 Dashboard-only foundation
        ├── US1 T004–T005 (MVP shell and overview)
        ├── US2 T006–T013 (existing working views)
        └── US3 T014–T016 (estimate report)
              └── T017–T019 integrated validation after all stories
```

US1, US2, and US3 have independent acceptance routes after the shared scope/tokens are fixed. The final visual-coherence and excluded-surface checks are integrated and sequential.

### Within Each User Story

- Implement route/component styling without changing logic.
- Review the story's independent route and states before moving to integrated validation.
- Resolve responsive presentation in the same component task; do not create alternate mobile components.

## Parallel Opportunities

Parallel markers identify disjoint-file work only after T002–T003 freeze the shared visual contract. They do not authorize separate agents before the mandatory planning-router decision and routed-plan approval.

### User Story 2

```text
T006 Estimate form styling
T007 Contact picker styling
T008 Contact form styling
T011 Estimate-history styling
T012 Recent-estimates styling
```

T009–T010 integrate contact layouts after T007–T008. T013 follows the two estimate-list surfaces so its fixed-width/status presentation can be reconciled with both consumers.

### User Story 3

```text
T014 Detail-page canvas
T015 Report document surface
```

T016 follows both because item-row responsive decisions must fit the final report width and spacing.

## Implementation Strategy

### MVP First

1. Complete T001–T003.
2. Complete T004–T005 for User Story 1.
3. Validate `/dashboard` and excluded `/admin` independently.
4. Continue only after the shell and visual tokens are coherent.

### Incremental Delivery

1. Foundation: isolated route scope and visual variables.
2. US1: shell and overview.
3. US2: estimate/contact working views.
4. US3: estimate detail report.
5. Integrated static, responsive, keyboard, interaction, and excluded-surface validation.

## Notes

- `[P]` means different files and no dependency on another incomplete task within that set.
- Every source task is styling-only and must preserve existing logic and component interfaces.
- Shared design-system primitive files and shared dashboard shell component files remain unchanged.
- Stop and request direction if implementation evidence requires a new component, interface, behavior, dependency, or excluded-file edit.
