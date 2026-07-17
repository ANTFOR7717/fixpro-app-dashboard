# Feature Specification: Dashboard UI Maturity

**Feature Branch**: `feat/dashboard-ui-maturity`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "Mature the existing dashboard and dashboard subpage UI styling without adding components, UX features, or changing behavior; exclude homepage, authentication, and admin views."

## Clarifications

### Session 2026-07-16

- Q: Should the registered demonstration route `/dashboard/new-dashboard` be directly restyled or left alone? → A: Leave it alone; it will be deleted later. Only unavoidable inherited shared-shell styling may apply.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent Professional Dashboard Shell (Priority: P1)

An authenticated user moves between the dashboard overview and dashboard subpages and experiences one restrained, professional visual system across the sidebar, header, breadcrumbs, page canvas, typography, spacing, surfaces, controls, and status treatments.

**Why this priority**: The shared shell frames every in-scope view. Inconsistency here makes the entire product feel unfinished regardless of the quality of an individual page.

**Independent Test**: Visit each in-scope dashboard route and confirm that the same visual hierarchy, content gutters, neutral palette, border treatment, typography scale, and navigation states are present without any route or navigation behavior changing.

**Acceptance Scenarios**:

1. **Given** an authenticated user is on any in-scope dashboard route, **When** the page renders, **Then** the sidebar, header, breadcrumbs, page background, and content region use a consistent professional visual language.
2. **Given** the user navigates among the dashboard overview, estimate submission, estimate history, estimate detail, and contacts, **When** the route changes, **Then** all existing destinations and active-navigation behavior remain unchanged.
3. **Given** the dashboard is viewed at desktop, tablet, or mobile width, **When** the shell adapts, **Then** its existing sidebar and navigation controls remain usable and content does not cause unintended horizontal page scrolling.

---

### User Story 2 - Clear Existing Workflows (Priority: P1)

An authenticated user can scan and complete the existing estimate and contact workflows through clearer hierarchy, spacing, alignment, form styling, action emphasis, and responsive presentation, without encountering any new control or workflow.

**Why this priority**: Estimate submission, estimate review, and contact management are the dashboard's core working views. Visual maturity must improve their clarity without changing how they operate.

**Independent Test**: Exercise the existing estimate form, saved-contact selection, contact creation/edit/delete controls, estimate list actions, status display, and estimate report controls; confirm that every control, label, state, and result remains present and behaves as before while the views share the new styling system.

**Acceptance Scenarios**:

1. **Given** the user opens the estimate submission page, **When** they inspect and complete the form, **Then** all existing fields, selectors, checkboxes, validation messages, file input, and submission control remain available with clearer visual grouping and consistent control styling.
2. **Given** the user opens estimate history, **When** estimates are empty, processing, completed, or failed, **Then** the existing empty state, status display, retry control, delete control, and detail link remain available and visually legible.
3. **Given** the user opens Contacts, **When** contacts are empty or populated and a contact is created, edited, or deleted, **Then** the same existing forms, rows, actions, and confirmation behavior remain available with a consistent page hierarchy.
4. **Given** a view contains dense rows or forms, **When** it is displayed at a narrow viewport, **Then** content reflows without clipping key text or controls and without adding alternate mobile-only behavior.

---

### User Story 3 - Credible Estimate Report Presentation (Priority: P2)

An authenticated user reviews an existing estimate detail report that reads like a credible professional document, with disciplined metadata, section hierarchy, item alignment, totals, and subdued supporting information.

**Why this priority**: The estimate report is a client-facing output and should inspire confidence, but it depends on the shared dashboard foundation and does not require new report capabilities.

**Independent Test**: Open a completed estimate and compare the rendered property information, parties, billable trade groups, item details, evidence controls, totals, empty/error states, and disclaimer against the current data; confirm all information and controls are retained and remain usable across supported viewport widths.

**Acceptance Scenarios**:

1. **Given** a completed estimate has priced and unpriced line items, **When** the report renders, **Then** the existing values, semantic distinctions, grouping, totals, and disclaimer are presented with clear alignment and hierarchy.
2. **Given** source, evidence, or debug display is toggled, **When** the state changes, **Then** the existing content appears exactly as before and remains visually integrated with the report.
3. **Given** the report is viewed on a narrow screen, **When** item content cannot fit the desktop column arrangement, **Then** it reflows legibly without losing labels, values, or controls.

---

### Edge Cases

- Empty estimate and contact collections retain an intentional, quiet empty-state treatment and their existing calls to action.
- Long filenames, addresses, contact details, status errors, source excerpts, and unavailable-price explanations wrap or truncate only where the existing meaning remains accessible.
- Processing, completed, failed, destructive, disabled, loading, hover, focus, and validation states remain visually distinct without relying on color alone where an existing label or icon is available.
- Dashboard content remains usable when the sidebar is open on mobile and when browser text or viewport constraints increase content wrapping.
- The registered demonstration-only `/dashboard/new-dashboard` view is excluded from direct edits because it will be deleted later; only unavoidable styling inherited from the shared dashboard shell may apply.
- Dark-theme tokens must not regress if the dashboard is rendered within the existing dark theme, even though no new theme behavior is introduced.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The visual refresh MUST apply only to the dashboard shell and the existing dashboard overview, estimate submission, estimate history, estimate detail, and contacts views.
- **FR-002**: The homepage, login, registration, admin, and registered demonstration-only `/dashboard/new-dashboard` views MUST remain outside the direct change scope; the demonstration view may only inherit unavoidable shared-shell styling.
- **FR-003**: The refresh MUST NOT add new product features, workflows, routes, navigation destinations, controls, fields, panels, metrics, charts, or user-facing components.
- **FR-004**: The refresh MUST preserve all existing dashboard content, component responsibilities, data flow, component interfaces, validation, state transitions, server actions, navigation, authentication, upload, estimate processing, pricing, retry, deletion, and contact-management behavior.
- **FR-005**: The dashboard MUST use a coherent styling system with a neutral application canvas, white primary surfaces, high-contrast charcoal text, restrained secondary text, fine neutral borders, and selective use of the existing brand accent.
- **FR-006**: Accent and semantic colors MUST be used purposefully: brand color for primary action, focus, active navigation, and successful progress; destructive color for destructive action and failure; neutral treatments for supporting surfaces.
- **FR-007**: Page titles, section titles, body text, labels, metadata, and captions MUST use a consistent restrained type scale and weight hierarchy across all in-scope views.
- **FR-008**: In-scope pages MUST use consistent page gutters, vertical rhythm, content-width rules, surface spacing, border treatment, and corner-radius treatment appropriate to their content density.
- **FR-009**: Existing cards and bordered surfaces MUST avoid unnecessary nested elevation, excessive shadow, oversized rounding, broad decorative tinting, and repeated heavy dashed treatments.
- **FR-010**: Existing buttons, links, inputs, selectors, checkboxes, switches, file controls, badges, progress indicators, and destructive controls MUST retain their semantics while receiving consistent visual states.
- **FR-011**: Existing form fields and controls MUST retain visible labels, validation feedback, focus indication, disabled indication, and adequate target sizing.
- **FR-012**: Existing list rows, action groups, progress displays, report columns, and metadata MUST remain legible without unintended horizontal page scrolling at representative mobile, tablet, and desktop widths.
- **FR-013**: Styling changes MUST be scoped so that shared global primitives do not unintentionally alter excluded views.
- **FR-014**: The work MUST use existing assets, components, icons, dependencies, and design-system primitives; no new dependency or component abstraction may be introduced.
- **FR-015**: User-facing wording and information architecture MUST remain unchanged except where a correction is separately identified and explicitly approved.

### Key Entities

No data entities are introduced or changed. Existing dashboard views continue to present the current estimate, contact, navigation, status, and report data without schema or persistence changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All identified in-scope dashboard routes render using the agreed visual system while all excluded homepage, authentication, registration, and admin views remain visually unchanged.
- **SC-002**: A route-by-route comparison confirms that 100% of existing dashboard controls, fields, actions, navigation destinations, statuses, and user-visible data remain present and behaviorally unchanged.
- **SC-003**: At representative 375px, 768px, and 1440px viewport widths, every in-scope view can be used without unintended horizontal page scrolling or clipped primary actions.
- **SC-004**: Keyboard review confirms that all existing interactive elements retain visible focus indication and can be reached and operated in their existing order.
- **SC-005**: Automated project validation passes for the styling-only change, including TypeScript, linting of every changed source file, the project build, and all constitution-required boundary checks.
- **SC-006**: Review of the final diff confirms zero new runtime dependencies, routes, data schemas, server actions, component interfaces, and standalone React components.

## Assumptions

- The existing Inter typeface, FixPro logo, Lucide icons, Tailwind utilities, and shadcn-derived primitives remain the visual foundation.
- The existing FixPro evergreen remains the brand accent but is used more selectively than in the current broadly green-tinted palette.
- This work improves responsive presentation through styling and reflow only; it does not add alternate mobile workflows.
- Current dashboard copy, information architecture, and business behavior are accepted as the source of truth for this visual-only scope.
- The demonstration-only new-dashboard registry entry is scheduled for later deletion and receives no direct edits in this work.
