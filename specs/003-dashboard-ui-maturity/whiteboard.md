# Dashboard UI Maturity — Routed Whiteboard

## Status

Status: Prepared — awaiting explicit approval.

## Purpose / Big Picture

Make the existing authenticated FixPro dashboard feel restrained, credible, and professionally composed through styling and responsive reflow only. The observable result is a consistent dashboard shell, clearer existing estimate/contact workflows, and a document-like estimate report. No product capability, component abstraction, copy, route, data contract, or behavior changes.

## User Contract

1. Apply the visual refresh only to `/dashboard`, `/dashboard/estimate`, `/dashboard/estimates`, `/dashboard/estimate/[id]`, and `/dashboard/contacts`.
2. Preserve all existing fields, controls, content, navigation, state, handlers, validation, server actions, queries, calculations, and authentication behavior.
3. Add no React component, component API, UX feature, route, navigation destination, dependency, asset, schema, migration, or copy change.
4. Leave homepage, login, registration, admin, marketing, and the inner `/dashboard/new-dashboard` placeholder markup directly unchanged.
5. Use a neutral canvas, white surfaces, charcoal hierarchy, fine borders, restrained evergreen accents, modest radii, and minimal shadows.
6. Keep destructive/failure and focus states semantically distinct.
7. Prevent unintended page-level horizontal scrolling at 375px, 768px, and 1440px.
8. Preserve keyboard order and visible focus.
9. Keep shared shadcn-derived primitives and shared dashboard shell component APIs unchanged.
10. Stop if implementation evidence requires any excluded file or behavioral change.

## Acceptance Coverage

| Criterion | Files | Plan step | Observable validation |
|---|---|---|---|
| Dashboard-only visual scope | `src/app/dashboard/layout.tsx`, `src/app/globals.css` | Foundation | Dashboard changes; `/admin`, auth, and marketing retain baseline styling |
| Professional shell and overview | `src/app/globals.css`, `src/features/dashboard/components/overview/dashboard-overview.tsx` | US1 | Sidebar/header/breadcrumb/actions/widgets follow one visual grammar |
| Existing estimate/contact workflows | Estimate and contact component files in the modification table | US2 | Every current control and state remains usable at three widths |
| Credible report | Detail page, report, and items files | US3 | Metadata, rows, toggles, totals, and disclaimer remain complete and legible |
| No new behavior/components | All diffs | Final audit | Diff contains presentation and route-scope changes only |
| Accessibility/responsiveness | All in-scope routes | Validation | No clipping/page overflow; focus remains visible and ordered |

## Context and Orientation

`src/app/dashboard/layout.tsx:DashboardLayout` authenticates the route and renders `DashboardLayoutClient`. `src/app/dashboard/client.tsx` delegates to `src/features/dashboard/components/layout/dashboard-layout.tsx`, whose component is also used by `src/app/admin/client.tsx`; therefore the shared shell implementation cannot be restyled globally. A `dashboard-ui` route marker plus `body:has(.dashboard-ui)` scoping isolates tokens and data-slot selectors, including Radix sidebar content portaled under the body. Registry-driven overview content remains owned by `DashboardOverview`; estimate and contact components own their existing states and interactions. No server/data file participates in presentation.

## Directory Map and Modification Table

```text
src/app/dashboard/layout.tsx
src/app/globals.css
src/features/dashboard/components/overview/dashboard-overview.tsx
src/features/estimate/components/estimate-view.tsx
src/features/contacts/components/contact-picker.tsx
src/features/contacts/components/contact-form.tsx
src/features/contacts/components/contacts-view.tsx
src/features/contacts/components/contact-row-actions.tsx
src/features/estimate/components/estimates-list-view.tsx
src/features/estimate/components/recent-estimates-widget.tsx
src/features/estimate/components/estimate-status-bar.tsx
src/app/dashboard/estimate/[id]/page.tsx
src/features/estimate/components/estimate-report.tsx
src/features/estimate/components/items-section.tsx
```

| File | Action | Reason |
|---|---|---|
| `src/app/dashboard/layout.tsx` | Modify | Add the dashboard route scope marker. |
| `src/app/globals.css` | Modify | Define route-scoped visual tokens and shared-shell refinements. |
| `src/features/dashboard/components/overview/dashboard-overview.tsx` | Modify | Refine quick actions and widget hierarchy. |
| `src/features/estimate/components/estimate-view.tsx` | Modify | Refine the existing submission form and upload surface. |
| `src/features/contacts/components/contact-picker.tsx` | Modify | Make the existing selector fill its form column. |
| `src/features/contacts/components/contact-form.tsx` | Modify | Normalize form grid and semantic error styling. |
| `src/features/contacts/components/contacts-view.tsx` | Modify | Refine page, list, empty, and responsive row presentation. |
| `src/features/contacts/components/contact-row-actions.tsx` | Modify | Allow current actions and inline editor to use available width. |
| `src/features/estimate/components/estimates-list-view.tsx` | Modify | Refine list density, empty state, and responsive action rows. |
| `src/features/estimate/components/recent-estimates-widget.tsx` | Modify | Remove double-card styling and improve responsive rows. |
| `src/features/estimate/components/estimate-status-bar.tsx` | Modify | Make the existing status track width responsive. |
| `src/app/dashboard/estimate/[id]/page.tsx` | Modify | Normalize the existing detail canvas and gutters. |
| `src/features/estimate/components/estimate-report.tsx` | Modify | Refine the report paper and responsive header. |
| `src/features/estimate/components/items-section.tsx` | Modify | Reflow toggles, trade headers, and item columns at narrow widths. |

## Pattern Audit and Evidence Ledger

| Decision | Repository or user evidence | Constraint learned | Reuse or deviation |
|---|---|---|
| Route-scope dashboard styling | `src/app/dashboard/client.tsx` and `src/app/admin/client.tsx` both consume `DashboardLayout`; user excluded admin | Shared shell classes/root tokens cannot change globally | Reuse existing shell; add dashboard ancestor scope |
| Keep primitives unchanged | Shared card, button, input, select, and sidebar primitives are application-wide | Primitive changes would leak to excluded views | Reuse current variants and data slots |
| Preserve registry content | `DashboardOverview` reads quick actions/widgets from `featureRegistry` | Links, labels, and ownership are behavior/content | Change usage classes only |
| Responsive list/report reflow | `EstimateStatusBar` has fixed width; `ItemsSection` uses fixed columns | Narrow layouts need reflow without alternate UX | Adjust existing flex/grid classes |
| No direct demo work | User said leave `/dashboard/new-dashboard` alone | Its local markup is excluded | No diff for its registry file |
| Project validation | `package.json`, constitution, and AGENTS.md | Typecheck, changed-file lint, build, and boundary/purity checks are required | Use project-native commands |

## Interfaces and Dependencies

- Component exports, props, server/client boundaries, route contracts, schemas, actions, and registry metadata remain byte-for-byte unchanged.
- Existing dependencies only: Next.js, React, Tailwind CSS, Radix/shadcn-derived primitives, Lucide, and Inter.
- The only new identifier is the `dashboard-ui` CSS class on the dashboard route wrapper.
- CSS uses existing custom properties and data-slot attributes; root and `.dark` definitions remain unchanged.
- No migration, generated file, package change, external interface, or API contract.

## Plan of Work

### Milestone 1 — Foundation
- Modify `src/app/dashboard/layout.tsx`.
- Modify `src/app/globals.css`.
- Proof: dashboard marker exists; scoped tokens apply only with marker; admin has no marker.

### Milestone 2 — US1 Shell and overview
- Modify `src/features/dashboard/components/overview/dashboard-overview.tsx`.
- Complete the dashboard-only shell selectors already specified in `src/app/globals.css`.
- Proof: `/dashboard` matches the visual contract and all existing quick-action/widget links remain unchanged.

### Milestone 3 — US2 Existing workflows
- Modify `src/features/estimate/components/estimate-view.tsx`.
- Modify `src/features/contacts/components/contact-picker.tsx`.
- Modify `src/features/contacts/components/contact-form.tsx`.
- Modify `src/features/contacts/components/contacts-view.tsx`.
- Modify `src/features/contacts/components/contact-row-actions.tsx`.
- Modify `src/features/estimate/components/estimates-list-view.tsx`.
- Modify `src/features/estimate/components/recent-estimates-widget.tsx`.
- Modify `src/features/estimate/components/estimate-status-bar.tsx`.
- Proof: existing form/contact/list/status states work at all target widths with no page overflow.

### Milestone 4 — US3 Estimate report
- Modify `src/app/dashboard/estimate/[id]/page.tsx`.
- Modify `src/features/estimate/components/estimate-report.tsx`.
- Modify `src/features/estimate/components/items-section.tsx`.
- Proof: completed report retains data/toggles/calculations and reflows legibly at all target widths.

### Milestone 5 — Integrated proof
- Run static gates, route/viewport review, keyboard review, interaction regression, excluded-surface comparison, and final diff audit.
- Proof: all checks in `specs/003-dashboard-ui-maturity/quickstart.md` are recorded; no scope violation remains.

## Exact File Changes

### `src/app/dashboard/layout.tsx`
**Action:** Modify  
**Why:** Add the dashboard route scope marker.  
**Impact:** Scopes styling without changing auth or shared shell APIs.

```diff
--- a/src/app/dashboard/layout.tsx
+++ b/src/app/dashboard/layout.tsx
@@ -26,8 +26,10 @@
   const footerItems = featureRegistry.getNavigation(role, "footer");
 
   return (
-    <DashboardLayoutClient navItems={navItems} footerItems={footerItems}>
-      {children}
-    </DashboardLayoutClient>
+    <div className="dashboard-ui min-h-svh">
+      <DashboardLayoutClient navItems={navItems} footerItems={footerItems}>
+        {children}
+      </DashboardLayoutClient>
+    </div>
   );
 }
```

#### Reasoning
- The exact diff implements Foundation without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/app/globals.css`
**Action:** Modify  
**Why:** Define route-scoped visual tokens and shared-shell refinements.  
**Impact:** Changes dashboard presentation only when the dashboard marker is present.

```diff
--- a/src/app/globals.css
+++ b/src/app/globals.css
@@ -125,6 +125,58 @@
   font-family: var(--font-inter);
 }
 
+/* Dashboard-only visual system. The route marker prevents these tokens and
+   shared-shell refinements from leaking into marketing, auth, or admin. */
+body:has(.dashboard-ui) {
+  --background: oklch(0.975 0.004 160);
+  --foreground: oklch(0.22 0.018 160);
+  --card: oklch(0.995 0.002 160);
+  --card-foreground: oklch(0.22 0.018 160);
+  --muted: oklch(0.955 0.008 160);
+  --muted-foreground: oklch(0.48 0.018 160);
+  --accent: oklch(0.94 0.018 160);
+  --accent-foreground: oklch(0.25 0.035 160);
+  --border: oklch(0.89 0.008 160);
+  --input: oklch(0.86 0.012 160);
+  --sidebar: oklch(0.965 0.008 160);
+  --sidebar-accent: oklch(0.925 0.024 160);
+  --sidebar-border: oklch(0.88 0.012 160);
+}
+
+.dark body:has(.dashboard-ui) {
+  --background: oklch(0.145 0.012 160);
+  --foreground: oklch(0.94 0.008 160);
+  --card: oklch(0.18 0.014 160);
+  --card-foreground: oklch(0.94 0.008 160);
+  --muted: oklch(0.22 0.014 160);
+  --muted-foreground: oklch(0.68 0.014 160);
+  --accent: oklch(0.24 0.022 160);
+  --accent-foreground: oklch(0.94 0.008 160);
+  --border: oklch(0.29 0.014 160);
+  --input: oklch(0.3 0.014 160);
+  --sidebar: oklch(0.13 0.012 160);
+  --sidebar-accent: oklch(0.23 0.022 160);
+  --sidebar-border: oklch(0.27 0.014 160);
+}
+
+body:has(.dashboard-ui) [data-slot="sidebar-inset"] > header {
+  border-bottom: 1px solid var(--border);
+  background: color-mix(in oklch, var(--background) 92%, transparent);
+}
+
+body:has(.dashboard-ui) [data-slot="sidebar-inner"] {
+  border: 1px solid var(--sidebar-border);
+  border-radius: var(--radius-lg);
+}
+
+body:has(.dashboard-ui) [data-slot="sidebar-menu-button"][data-active="true"] {
+  box-shadow: inset 3px 0 0 var(--sidebar-primary);
+}
+
+body:has(.dashboard-ui) [data-slot="breadcrumb-list"] {
+  font-size: 0.8125rem;
+}
+
 /* Modern Material Design Scrollbar */
 ::-webkit-scrollbar {
   width: 8px;
```

#### Reasoning
- The exact diff implements Foundation / US1 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/features/dashboard/components/overview/dashboard-overview.tsx`
**Action:** Modify  
**Why:** Refine quick actions and widget hierarchy.  
**Impact:** Preserves registry content while reducing tile and nested-card styling.

```diff
--- a/src/features/dashboard/components/overview/dashboard-overview.tsx
+++ b/src/features/dashboard/components/overview/dashboard-overview.tsx
@@ -10,13 +10,13 @@
   const widgets = featureRegistry.getWidgets();
 
   return (
-    <div className="flex flex-col gap-4 p-4 md:p-6">
+    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 lg:p-8">
       {/* Quick Actions */}
-      <Card>
+      <Card className="shadow-none">
         <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
           <div className="space-y-1.5">
-            <CardTitle className="flex items-center gap-2">
-              <Settings className="h-5 w-5" />
+            <CardTitle className="flex items-center gap-2 text-base">
+              <Settings className="h-4 w-4 text-muted-foreground" />
               Quick Actions
             </CardTitle>
             <CardDescription>
@@ -26,19 +26,19 @@
           <RefreshButton />
         </CardHeader>
         <CardContent>
-          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
+          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
             {quickActions.map((action) => (
               <Button
                 key={action.label}
                 variant="outline"
-                className="h-auto p-4 flex-col gap-2"
+                className="h-11 justify-start rounded-lg px-3.5 shadow-none"
                 asChild
               >
                 <Link
                   href={action.href}
                   {...(action.external ? { target: "_blank" } : {})}
                 >
-                  <action.icon className="h-5 w-5" />
+                  <action.icon className="h-4 w-4 text-muted-foreground" />
                   <span>{action.label}</span>
                 </Link>
               </Button>
@@ -48,7 +48,7 @@
       </Card>
 
       {/* Dynamic Feature Widgets Grid */}
-      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
+      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
         {widgets.map((widget) => {
           // Map abstract sizes to 12-column grid spans
           const sizeMap = {
@@ -60,7 +60,7 @@
           const span = sizeMap[widget.size || "full"];
 
           return (
-            <Card key={widget.id} className={span}>
+            <Card key={widget.id} className={`${span} shadow-none`}>
               <CardHeader>
                 <CardTitle>{widget.title}</CardTitle>
                 {widget.description && (
```

#### Reasoning
- The exact diff implements US1 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/features/estimate/components/estimate-view.tsx`
**Action:** Modify  
**Why:** Refine the existing submission form and upload surface.  
**Impact:** Preserves every field and handler while improving hierarchy and responsive layout.

```diff
--- a/src/features/estimate/components/estimate-view.tsx
+++ b/src/features/estimate/components/estimate-view.tsx
@@ -44,7 +44,7 @@
       type="submit"
       disabled={pending}
       aria-busy={pending}
-      className="w-full h-12 text-lg font-semibold"
+      className="h-10 w-full text-sm font-semibold"
     >
       {pending ? (
         <>
@@ -137,15 +137,15 @@
   };
 
   return (
-    <div className="max-w-3xl space-y-6 p-6">
+    <div className="mx-auto w-full max-w-4xl space-y-8 p-0">
       <div className="space-y-2">
-        <h1 className="text-3xl font-extrabold tracking-tight">Get Repair Estimate</h1>
+        <h1 className="text-2xl font-semibold tracking-tight">Get Repair Estimate</h1>
         <p className="text-muted-foreground">Provide information and upload your inspection report (PDF).</p>
       </div>
 
       <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
-        <Card>
-          <CardContent className="pt-6 space-y-8">
+        <Card className="shadow-none">
+          <CardContent className="space-y-8 pt-6">
             <div className="space-y-6">
               {/* Role Selection */}
               <div className="space-y-2">
@@ -154,7 +154,7 @@
                   onValueChange={(v) => setValue("submitterRole", v as "agent" | "homeowner")}
                   defaultValue="agent"
                 >
-                  <SelectTrigger><SelectValue placeholder="Select your role" /></SelectTrigger>
+                  <SelectTrigger className="w-full"><SelectValue placeholder="Select your role" /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="agent">Real Estate Agent</SelectItem>
                     <SelectItem value="homeowner">Homeowner</SelectItem>
@@ -166,9 +166,9 @@
               <Separator />
 
               {/* Agents Grid */}
-              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
+              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                 <div className="space-y-4">
-                  <Label className="text-lg font-bold">Listing Agent Information</Label>
+                  <Label className="text-base font-semibold">Listing Agent Information</Label>
                   <ContactPicker
                     label="Use saved contact"
                     contacts={contacts}
@@ -181,31 +181,31 @@
                   <div className="space-y-2">
                     <Label htmlFor="listingAgentName">Full Name *</Label>
                     <Input id="listingAgentName" {...register("listingAgentName")} />
-                    {errors.listingAgentName && <p className="text-xs text-red-500">{errors.listingAgentName.message}</p>}
+                    {errors.listingAgentName && <p className="text-xs text-destructive">{errors.listingAgentName.message}</p>}
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="listingAgentPhone">Cell Number *</Label>
                     <Input id="listingAgentPhone" type="tel" {...register("listingAgentPhone")} />
-                    {errors.listingAgentPhone && <p className="text-xs text-red-500">{errors.listingAgentPhone.message}</p>}
+                    {errors.listingAgentPhone && <p className="text-xs text-destructive">{errors.listingAgentPhone.message}</p>}
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="listingAgentEmail">Email *</Label>
                     <Input id="listingAgentEmail" type="email" {...register("listingAgentEmail")} />
-                    {errors.listingAgentEmail && <p className="text-xs text-red-500">{errors.listingAgentEmail.message}</p>}
+                    {errors.listingAgentEmail && <p className="text-xs text-destructive">{errors.listingAgentEmail.message}</p>}
                   </div>
                   <label className="flex items-center gap-2 text-sm text-muted-foreground">
                     <input
                       type="checkbox"
                       checked={saveListingAsContact}
                       onChange={(e) => setSaveListingAsContact(e.target.checked)}
-                      className="h-4 w-4"
+                      className="h-4 w-4 accent-primary"
                     />
                     Save listing agent as a contact
                   </label>
                 </div>
 
                 <div className="space-y-4">
-                  <Label className="text-lg font-bold">Buyer Agent Information</Label>
+                  <Label className="text-base font-semibold">Buyer Agent Information</Label>
                   <ContactPicker
                     label="Use saved contact"
                     contacts={contacts}
@@ -218,24 +218,24 @@
                   <div className="space-y-2">
                     <Label htmlFor="buyerAgentName">Full Name *</Label>
                     <Input id="buyerAgentName" {...register("buyerAgentName")} />
-                    {errors.buyerAgentName && <p className="text-xs text-red-500">{errors.buyerAgentName.message}</p>}
+                    {errors.buyerAgentName && <p className="text-xs text-destructive">{errors.buyerAgentName.message}</p>}
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="buyerAgentPhone">Cell Number *</Label>
                     <Input id="buyerAgentPhone" type="tel" {...register("buyerAgentPhone")} />
-                    {errors.buyerAgentPhone && <p className="text-xs text-red-500">{errors.buyerAgentPhone.message}</p>}
+                    {errors.buyerAgentPhone && <p className="text-xs text-destructive">{errors.buyerAgentPhone.message}</p>}
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="buyerAgentEmail">Email *</Label>
                     <Input id="buyerAgentEmail" type="email" {...register("buyerAgentEmail")} />
-                    {errors.buyerAgentEmail && <p className="text-xs text-red-500">{errors.buyerAgentEmail.message}</p>}
+                    {errors.buyerAgentEmail && <p className="text-xs text-destructive">{errors.buyerAgentEmail.message}</p>}
                   </div>
                   <label className="flex items-center gap-2 text-sm text-muted-foreground">
                     <input
                       type="checkbox"
                       checked={saveBuyerAsContact}
                       onChange={(e) => setSaveBuyerAsContact(e.target.checked)}
-                      className="h-4 w-4"
+                      className="h-4 w-4 accent-primary"
                     />
                     Save buyer agent as a contact
                   </label>
@@ -246,17 +246,17 @@
 
               {/* Property Details */}
               <div className="space-y-4">
-                <Label className="text-lg font-bold">Property Details</Label>
-                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
+                <Label className="text-base font-semibold">Property Details</Label>
+                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                   <div className="md:col-span-2 space-y-2">
                     <Label htmlFor="propertyAddress">Property Address *</Label>
                     <Input id="propertyAddress" {...register("propertyAddress")} />
-                    {errors.propertyAddress && <p className="text-xs text-red-500">{errors.propertyAddress.message}</p>}
+                    {errors.propertyAddress && <p className="text-xs text-destructive">{errors.propertyAddress.message}</p>}
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="zipCode">Zip code *</Label>
                     <Input id="zipCode" {...register("zipCode")} />
-                    {errors.zipCode && <p className="text-xs text-red-500">{errors.zipCode.message}</p>}
+                    {errors.zipCode && <p className="text-xs text-destructive">{errors.zipCode.message}</p>}
                   </div>
                 </div>
                 <div className="space-y-2">
@@ -265,7 +265,7 @@
                     onValueChange={(v) => setValue("timeframe", v as (typeof TIMEFRAME_OPTIONS)[number])}
                     defaultValue="ASAP (24-48 hours)"
                   >
-                    <SelectTrigger><SelectValue placeholder="Select timeframe" /></SelectTrigger>
+                    <SelectTrigger className="w-full"><SelectValue placeholder="Select timeframe" /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="ASAP (24-48 hours)">ASAP (24-48 hours)</SelectItem>
                       <SelectItem value="This Week (2-7 days)">This Week (2-7 days)</SelectItem>
@@ -274,21 +274,21 @@
                     </SelectContent>
                   </Select>
                   <input type="hidden" {...register("timeframe")} />
-                  {errors.timeframe && <p className="text-xs text-red-500">{errors.timeframe.message}</p>}
+                  {errors.timeframe && <p className="text-xs text-destructive">{errors.timeframe.message}</p>}
                 </div>
               </div>
             </div>
           </CardContent>
         </Card>
 
-        <div className="p-8 border-2 border-dashed border-border rounded-xl bg-muted/50 flex flex-col items-center justify-center text-center">
-          <Upload className="h-10 w-10 text-muted-foreground mb-2" />
+        <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-6 text-center">
+          <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
           <input
             type="file"
             name="file"
             ref={fileInputRef}
             accept="application/pdf"
-            className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 w-full max-w-xs cursor-pointer"
+            className="w-full max-w-sm cursor-pointer text-sm text-muted-foreground file:mr-4 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
             required
           />
         </div>
```

#### Reasoning
- The exact diff implements US2 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/features/contacts/components/contact-picker.tsx`
**Action:** Modify  
**Why:** Make the existing selector fill its form column.  
**Impact:** Preserves selection behavior.

```diff
--- a/src/features/contacts/components/contact-picker.tsx
+++ b/src/features/contacts/components/contact-picker.tsx
@@ -32,7 +32,7 @@
     <div className="space-y-2">
       <Label>{label}</Label>
       <Select onValueChange={handleChange} defaultValue={MANUAL_VALUE}>
-        <SelectTrigger>
+        <SelectTrigger className="w-full">
           <SelectValue placeholder="Choose a saved contact or enter manually" />
         </SelectTrigger>
         <SelectContent>
```

#### Reasoning
- The exact diff implements US2 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/features/contacts/components/contact-form.tsx`
**Action:** Modify  
**Why:** Normalize form grid and semantic error styling.  
**Impact:** Preserves validation and server actions.

```diff
--- a/src/features/contacts/components/contact-form.tsx
+++ b/src/features/contacts/components/contact-form.tsx
@@ -71,21 +71,21 @@
     <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
       <FormError message={state?.error || ""} />
       <FormSuccess message={state?.message || ""} />
-      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
+      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
         <div className="space-y-2">
           <Label htmlFor="fullName">Full Name *</Label>
           <Input id="fullName" {...register("fullName")} />
-          {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
+          {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
         </div>
         <div className="space-y-2">
           <Label htmlFor="phone">Phone *</Label>
           <Input id="phone" type="tel" {...register("phone")} />
-          {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
+          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
         </div>
         <div className="space-y-2">
           <Label htmlFor="email">Email *</Label>
           <Input id="email" type="email" {...register("email")} />
-          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
+          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
         </div>
       </div>
       <SubmitButton mode={mode} />
```

#### Reasoning
- The exact diff implements US2 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/features/contacts/components/contacts-view.tsx`
**Action:** Modify  
**Why:** Refine page, list, empty, and responsive row presentation.  
**Impact:** Preserves contact content and actions.

```diff
--- a/src/features/contacts/components/contacts-view.tsx
+++ b/src/features/contacts/components/contacts-view.tsx
@@ -13,24 +13,24 @@
   const contacts = await listContactsForUser(session.user.id);
 
   return (
-    <div className="max-w-3xl space-y-6 p-6">
+    <div className="mx-auto w-full max-w-4xl space-y-8 p-0">
       <div className="space-y-2">
-        <h1 className="text-3xl font-extrabold tracking-tight">Contacts</h1>
+        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
         <p className="text-muted-foreground">
           Save agents you work with so you don&apos;t have to retype them on every estimate.
         </p>
       </div>
 
-      <Card>
-        <CardContent className="pt-6 space-y-6">
+      <Card className="shadow-none">
+        <CardContent className="space-y-6 pt-6">
           <ContactForm mode="create" />
           <Separator />
           {contacts.length === 0 ? (
-            <p className="text-sm text-muted-foreground">No saved contacts yet.</p>
+            <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No saved contacts yet.</p>
           ) : (
             <ul className="divide-y divide-border">
               {contacts.map((c) => (
-                <li key={c.id} className="py-4 flex items-start justify-between gap-4">
+                <li key={c.id} className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                   <div className="space-y-0.5">
                     <p className="font-semibold">{c.fullName}</p>
                     <p className="text-sm text-muted-foreground">{c.email}</p>
```

#### Reasoning
- The exact diff implements US2 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/features/contacts/components/contact-row-actions.tsx`
**Action:** Modify  
**Why:** Allow current actions and inline editor to use available width.  
**Impact:** Preserves edit/delete state and dialogs.

```diff
--- a/src/features/contacts/components/contact-row-actions.tsx
+++ b/src/features/contacts/components/contact-row-actions.tsx
@@ -29,8 +29,8 @@
   };
 
   return (
-    <div className="flex flex-col gap-2">
-      <div className="flex gap-2">
+    <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end sm:has-[form]:col-span-2 sm:has-[form]:w-full">
+      <div className="flex gap-2 sm:justify-end">
         <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
           {editing ? "Cancel" : "Edit"}
         </Button>
@@ -39,7 +39,9 @@
         </Button>
       </div>
       {editing && (
-        <ContactForm mode="update" contact={contact} onDone={() => setEditing(false)} />
+        <div className="w-full">
+          <ContactForm mode="update" contact={contact} onDone={() => setEditing(false)} />
+        </div>
       )}
       <ConfirmationDialog
         isOpen={confirmOpen}
```

#### Reasoning
- The exact diff implements US2 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/features/estimate/components/estimates-list-view.tsx`
**Action:** Modify  
**Why:** Refine list density, empty state, and responsive action rows.  
**Impact:** Preserves status, retry, delete, and navigation behavior.

```diff
--- a/src/features/estimate/components/estimates-list-view.tsx
+++ b/src/features/estimate/components/estimates-list-view.tsx
@@ -23,10 +23,10 @@
     .orderBy(desc(estimateRequestTable.createdAt));
 
   return (
-    <div className="max-w-3xl space-y-6 p-6">
+    <div className="mx-auto w-full max-w-6xl space-y-8 p-4 md:p-6 lg:p-8">
       <div className="flex items-start justify-between gap-4">
         <div className="space-y-2">
-          <h1 className="text-3xl font-extrabold tracking-tight">Your Estimates</h1>
+          <h1 className="text-2xl font-semibold tracking-tight">Your Estimates</h1>
           <p className="text-muted-foreground">
             Every inspection report you&apos;ve uploaded. Delete an estimate to remove its row and the uploaded PDF.
           </p>
@@ -35,8 +35,8 @@
       </div>
 
       {estimates.length === 0 ? (
-        <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-border rounded-xl bg-muted/30">
-          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
+        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card p-8 text-center">
+          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
             <FileText className="h-6 w-6 text-primary" />
           </div>
           <h3 className="text-lg font-semibold text-foreground tracking-tight">You haven&apos;t uploaded any estimates yet.</h3>
@@ -48,13 +48,13 @@
           </Button>
         </div>
       ) : (
-        <Card>
+        <Card className="shadow-none">
           <CardContent className="p-0">
             <div className="divide-y divide-border">
               {estimates.map((upload) => {
                 const leftBlock = (
                   <div className="flex items-center gap-4 overflow-hidden">
-                    <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
+                    <div className="shrink-0 rounded-md bg-muted p-2.5 text-primary">
                       <FileText className="h-5 w-5" />
                     </div>
                     <div className="flex flex-col overflow-hidden">
@@ -73,7 +73,7 @@
                 );
 
                 return (
-                  <div key={upload.id} className="flex items-center justify-between p-4">
+                  <div key={upload.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                     {upload.status === "completed" ? (
                       <Link
                         href={`/dashboard/estimate/${upload.id}`}
@@ -85,7 +85,7 @@
                       <div className="flex-1 min-w-0">{leftBlock}</div>
                     )}
 
-                    <div className="flex items-center gap-3 shrink-0 pl-4">
+                    <div className="flex w-full shrink-0 flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end sm:pl-4">
                       <EstimateStatusBar
                         status={upload.status}
                         errorMessage={upload.errorMessage}
```

#### Reasoning
- The exact diff implements US2 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/features/estimate/components/recent-estimates-widget.tsx`
**Action:** Modify  
**Why:** Remove double-card styling and improve responsive rows.  
**Impact:** Preserves widget query and links.

```diff
--- a/src/features/estimate/components/recent-estimates-widget.tsx
+++ b/src/features/estimate/components/recent-estimates-widget.tsx
@@ -27,8 +27,8 @@
 
   if (recentUploads.length === 0) {
     return (
-      <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-border rounded-xl bg-muted/30">
-        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
+      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
+        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
           <FileText className="h-6 w-6 text-primary" />
         </div>
         <h3 className="text-lg font-semibold text-foreground tracking-tight">No estimates processed</h3>
@@ -48,13 +48,13 @@
   }
 
   return (
-    <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
+    <div className="overflow-hidden">
       <div className="divide-y divide-border">
         {recentUploads.map((upload) => {
           const content = (
             <>
-              <div className="flex items-center gap-4 overflow-hidden">
-                <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
+              <div className="flex min-w-0 items-center gap-4 overflow-hidden">
+                <div className="shrink-0 rounded-md bg-muted p-2.5 text-primary">
                   <FileText className="h-5 w-5" />
                 </div>
                 <div className="flex flex-col overflow-hidden">
@@ -68,7 +68,7 @@
                   </span>
                 </div>
               </div>
-              <div className="flex items-center gap-3 shrink-0 pl-4">
+              <div className="flex w-full shrink-0 flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end sm:pl-4">
                 <EstimateStatusBar
                   status={upload.status}
                   errorMessage={upload.errorMessage}
@@ -85,7 +85,7 @@
               <Link
                 key={upload.id}
                 href={`/dashboard/estimate/${upload.id}`}
-                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
+                className="flex flex-col gap-4 p-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
               >
                 {content}
               </Link>
@@ -93,7 +93,7 @@
           }
 
           return (
-            <div key={upload.id} className="flex items-center justify-between p-4">
+            <div key={upload.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
               {content}
             </div>
           );
```

#### Reasoning
- The exact diff implements US2 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/features/estimate/components/estimate-status-bar.tsx`
**Action:** Modify  
**Why:** Make the existing status track width responsive.  
**Impact:** Preserves status mapping and tooltips.

```diff
--- a/src/features/estimate/components/estimate-status-bar.tsx
+++ b/src/features/estimate/components/estimate-status-bar.tsx
@@ -70,7 +70,7 @@
 
   return (
     <div
-      className={cn('flex items-center gap-1.5 w-[180px] shrink-0', className)}
+      className={cn('flex w-full max-w-[180px] shrink-0 items-center gap-1.5', className)}
       role="progressbar"
       aria-valuemin={0}
       aria-valuemax={STAGES.length}
```

#### Reasoning
- The exact diff implements US2 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/app/dashboard/estimate/[id]/page.tsx`
**Action:** Modify  
**Why:** Normalize the existing detail canvas and gutters.  
**Impact:** Preserves authorization, query, and back navigation.

```diff
--- a/src/app/dashboard/estimate/[id]/page.tsx
+++ b/src/app/dashboard/estimate/[id]/page.tsx
@@ -21,7 +21,7 @@
   const envelope = parseSummaryEnvelope(row.summary);
 
   return (
-    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
+    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 md:px-6 md:py-8 lg:px-8">
       <div>
         <Button variant="ghost" size="sm" asChild>
           <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Back to dashboard</Link>
```

#### Reasoning
- The exact diff implements US3 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/features/estimate/components/estimate-report.tsx`
**Action:** Modify  
**Why:** Refine the report paper and responsive header.  
**Impact:** Preserves all report data and sections.

```diff
--- a/src/features/estimate/components/estimate-report.tsx
+++ b/src/features/estimate/components/estimate-report.tsx
@@ -39,7 +39,7 @@
  */
 export function EstimateReport({ row, envelope }: EstimateReportProps) {
   return (
-    <Card className="mx-auto max-w-4xl px-8 py-10">
+    <Card className="mx-auto max-w-4xl rounded-lg px-4 py-6 shadow-none sm:px-8 sm:py-10">
       <ReportHeader row={row} />
       <Separator className="my-8" />
       <PropertyAndParties row={row} />
@@ -59,7 +59,7 @@
     day: 'numeric',
   });
   return (
-    <div className="flex items-start justify-between gap-4">
+    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
       <div className="flex items-center gap-3">
         <Image
           src="/fixpro-logo.webp"
@@ -70,13 +70,13 @@
           className="rounded"
         />
         <div>
-          <h1 className="text-2xl font-semibold tracking-tight">
+          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
             FixPro Estimate
           </h1>
           <p className="text-sm text-muted-foreground">{row.fileName}</p>
         </div>
       </div>
-      <div className="text-right text-sm">
+      <div className="text-sm sm:text-right">
         <div className="font-mono">Estimate #{shortId}</div>
         <div className="text-muted-foreground">Created {created}</div>
       </div>
```

#### Reasoning
- The exact diff implements US3 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

### `src/features/estimate/components/items-section.tsx`
**Action:** Modify  
**Why:** Reflow toggles, trade headers, and item columns at narrow widths.  
**Impact:** Preserves grouping, calculations, toggles, and evidence content.

```diff
--- a/src/features/estimate/components/items-section.tsx
+++ b/src/features/estimate/components/items-section.tsx
@@ -102,7 +102,7 @@
             always measured in Hours.
           </p>
         </div>
-        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
+        <div className="flex w-full flex-wrap items-center gap-4 border-t pt-3 text-xs text-muted-foreground sm:w-auto sm:border-0 sm:pt-0">
           <label
             htmlFor={sourceToggleId}
             className="flex cursor-pointer items-center gap-2"
@@ -193,7 +193,7 @@
   const tradeLabel = formatTradeLabel(trade);
   return (
     <div className="overflow-hidden rounded-lg border">
-      <div className="flex items-center justify-between bg-muted px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
+      <div className="flex flex-col gap-2 bg-muted px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
         <div className="flex items-center gap-2">
           <span>{tradeLabel}</span>
           <span className="inline-flex items-center rounded-full border bg-card px-1.5 py-0 text-[10px] normal-case tracking-normal">
@@ -234,8 +234,8 @@
   const lineTotal = formatLineTotal(item.quantity, unitPrice);
   const isUnpriced = lineTotal === PRICE_UNAVAILABLE;
   return (
-    <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_130px] items-center border-t px-4 py-3 text-sm">
-      <div>
+    <div className="grid grid-cols-2 items-center gap-3 border-t px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_90px_110px_130px] sm:gap-0">
+      <div className="col-span-2 sm:col-span-1">
         <div className="flex flex-wrap items-center gap-1.5">
           <div className="font-medium leading-snug">
             {formatItemTitle(item.scope, item.action, item.costType)}
```

#### Reasoning
- The exact diff implements US3 without changing public interfaces or behavior.
- The bundled whiteboarding verifier confirmed this diff applies to the current worktree.

## Concrete Steps

Working directory for every command: `/Users/dev/Projects/fixpro-app-dashboard`.

1. Apply the exact diffs above in dependency order: foundation, US1, US2, US3.
2. Run `pnpm exec tsc --noEmit`; expect exit 0.
3. Run `pnpm exec eslint <each-changed-source-path>`; expect exit 0.
4. Run `pnpm build`; expect exit 0.
5. Run the four one-door import greps and pipeline-purity grep from AGENTS.md; expect zero matches.
6. Run `pnpm dev`; review five in-scope routes at 375px, 768px, and 1440px.
7. Exercise navigation, validation, contact actions, estimate states/actions, status tooltips, and report switches.
8. Compare `/`, auth, `/admin`, and `/dashboard/new-dashboard` inner content to baseline.
9. Audit `git diff` for the fourteen approved files only and no behavior/copy/API changes.

## Validation and Acceptance

- Success: all five route families follow the visual contract and remain behaviorally identical.
- Empty/failure boundaries: contact/estimate empty states, failed estimates, unpriced lines, and validation errors remain readable and semantically distinct.
- Responsive boundaries: long filenames, addresses, contact values, source excerpts, actions, statuses, and totals do not create page overflow.
- Accessibility: keyboard order is unchanged; existing focus rings, labels, and state text remain visible.
- Compatibility: admin/shared primitive rendering is unchanged because all new global rules require dashboard route presence.
- Regression: homepage, authentication, registration, marketing, admin, pipeline, database, API, and demo placeholder files have no direct diff.

## Idempotence and Recovery

- Applying the patch once is deterministic; a second application must fail rather than duplicate changes.
- No migration, generated artifact, or persistent state requires cleanup.
- Recovery is a normal revert of the fourteen presentation files; no data rollback is needed.
- If a diff no longer applies, regenerate the whiteboard instead of forcing hunks.

## Risks and Decisions

| Risk | Control |
|---|---|
| CSS leakage to admin | Require `body:has(.dashboard-ui)` for new shell/token selectors and validate admin |
| Portal scope | Body route-presence selector reaches mobile portaled sidebar without changing shared props |
| Browser selector support | Verify dashboard and mobile sidebar in the supported modern browser set before PR |
| Narrow overflow | Exact responsive flex/grid changes plus 375px review |
| Visual inconsistency | One shared token contract and single-threaded exact-diff execution |
| Scope drift | Fourteen-file allowlist and final diff audit |

### Decision Log

- 2026-07-16: User limited work to existing dashboard styling and prohibited new UX/components.
- 2026-07-16: User excluded `/dashboard/new-dashboard` direct edits.
- 2026-07-16: Planning router selected whiteboarding because shared scoped CSS and visual coherence make parallel coordination uneconomical.
- 2026-07-16: Route-presence CSS scoping selected because the shared shell also serves admin and mobile sidebar content may be portaled.

## Review Log

- 2026-07-16 — Scaffold pass. Built exact proposed content in `/private/tmp/fixpro-dashboard-whiteboard.ljBNax`; generated fourteen unified diffs with `make-diff.sh`; each passed individual `git apply --check`. Result: scaffolded for independent review.
- 2026-07-16 — Review pass 1. Found that `sm:min-w-xl` in the contact inline editor could force the auto grid column beyond a narrow viewport. Replaced it with form-presence responsive spanning on the existing action container and a fluid editor wrapper. Result: revised; review again.
- 2026-07-16 — Review pass 2. Re-read the approved spec, plan, tasks, current source, all fourteen exact diffs, shared-shell consumers, responsive boundaries, and excluded-file contract. Confirmed file-list parity and ran `git apply --check /private/tmp/fixpro-dashboard-whiteboard.ljBNax/combined.patch` from the repository root with exit 0. No material issue remains. Result: prepared for explicit approval.

## Approval

Implementation awaits explicit user approval of this prepared routed whiteboard. After approval, the implementation-planning extension must record it before source changes begin.
