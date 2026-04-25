# Dashboard Reference Architecture

## Purpose
This document defines the correct, canonical pattern for the user-facing `/dashboard` route. It serves as the exemplar that all other frontend routes should follow. Every decision here is intentional and should be replicated when building any new dashboard section, auth section, or marketing section.

---

## Core Rules (Apply Everywhere)

| Rule | Description |
|---|---|
| **Pages are shells** | A page file exports metadata and mounts exactly one component. Nothing else. |
| **Layouts are guards** | A layout file checks session/auth server-side, then mounts a client boundary. |
| **`-layout-client.tsx` is the boundary** | The `"use client"` directive appears here and only here per route group. It reads config and Next.js hooks, passes everything down as props. |
| **Layout components own no config** | `dashboard-layout.tsx` and `dashboard-sidebar.tsx` receive all content as props. They never import from `src/config/`. |
| **Content components may import config** | Page-specific display components (`dashboard-overview.tsx`, `users-table.tsx`) are not reused across contexts and may import from `src/config/` directly. |
| **Config owns no JSX** | Config files export plain data — strings, component references (`LucideIcon`), booleans. Never instantiated JSX elements. |
| **`components/` by domain** | Component folders map to route domains: `admin/`, `dashboard/`, `auth/`. Shared primitives go in `ui/`. |

---

## File Map

```
src/
  app/
    dashboard/
      layout.tsx                        Server Component — session guard
      dashboard-layout-client.tsx       "use client" — usePathname, logout handler
      page.tsx                          Server Component — exports metadata, mounts DashboardOverview

  components/
    dashboard/
      dashboard-layout.tsx              "use client" — SidebarProvider + header chrome
      dashboard-sidebar.tsx             "use client" — sidebar, accepts NavItemList props
      dashboard-overview.tsx            Display component — quick actions, tech stack (no footer)

  config/
    dashboard.ts                        Owns all dashboard content (extends current file)
```

---

## Layer-by-Layer Specification

### Layer 1 — `app/dashboard/layout.tsx` (Server Component)

**Responsibility:** Session guard. Redirects unauthenticated users. Mounts the client boundary.

```tsx
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardLayoutClient } from "./dashboard-layout-client";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/auth/login");
  }

  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
```

**What it does NOT do:**
- No content. No JSX beyond mounting the client boundary.
- No reading from `dashboardConfig`. That happens one layer down.
- No `"use client"`.

---

### Layer 2 — `app/dashboard/dashboard-layout-client.tsx` ("use client")

**Responsibility:** Client boundary. Reads `dashboardConfig` and Next.js hooks. Passes all props to `DashboardLayout` component.

```tsx
"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import { authClient } from "@/lib/auth-client";
import { dashboardConfig } from "@/config/dashboard";

export function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      router.push("/auth/login");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <DashboardLayout
      pathname={pathname}
      onLogout={handleLogout}
      navItems={dashboardConfig.nav}
      footerItems={dashboardConfig.footerNav}
      title={dashboardConfig.title}
      version={dashboardConfig.version}
      rootLabel={dashboardConfig.rootLabel}
      rootHref={dashboardConfig.rootHref}
    >
      {children}
    </DashboardLayout>
  );
}
```

**What it does NOT do:**
- No rendering of page content.
- No data fetching.
- No business logic beyond the logout handler.

---

### Layer 3 — `app/dashboard/page.tsx` (Server Component)

**Responsibility:** Export metadata. Mount the overview component. Nothing else.

```tsx
import type { Metadata } from "next";
import { dashboardConfig } from "@/config/dashboard";
import DashboardOverview from "@/components/dashboard/dashboard-overview";

export const metadata: Metadata = {
  title: dashboardConfig.pages.overview.title,
  description: dashboardConfig.pages.overview.description,
};

export default function DashboardPage() {
  return <DashboardOverview />;
}
```

**Line count target: ≤ 12 lines.**

---

### Layer 4 — `components/dashboard/dashboard-layout.tsx` ("use client")

**Responsibility:** Renders the sidebar chrome + page header with breadcrumbs. Purely presentational — receives all content as props.

This is a direct port of `components/admin/dashboard-layout.tsx`. The component is already fully generic (accepts `navItems`, `footerItems`, `title`, `version`, `rootLabel`, `rootHref`). The file moves from `components/admin/` to `components/dashboard/` to correctly scope it.

Interface:
```tsx
interface DashboardLayoutProps {
  children: React.ReactNode;
  pathname: string;
  onLogout: () => Promise<void>;
  navItems: NavItemList;
  footerItems: NavItemList;
  title: string;
  version: string;
  rootLabel: string;
  rootHref: string;
}
```

**What it does NOT do:**
- No config imports.
- No routing logic.
- No hardcoded strings.

---

### Layer 5 — `components/dashboard/dashboard-sidebar.tsx` ("use client")

**Responsibility:** Renders the sidebar nav from `navItems` and `footerItems` props. Purely presentational.

This is a direct port of `components/admin/dashboard-sidebar.tsx`. Same fully generic interface. Moves to `components/dashboard/`.

---

### Layer 6 — `components/dashboard/dashboard-overview.tsx` (**Server Component**)

**Responsibility:** Renders the user dashboard overview content — quick actions, tech stack. Imports directly from `dashboardConfig`. This is intentional: `DashboardOverview` is page-specific and not reused across different layout contexts, so it is exempt from the layout-components-own-no-config rule.

```tsx
import { dashboardConfig } from "@/config/dashboard";
import { Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function DashboardOverview() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {dashboardConfig.quickActions.title}
          </CardTitle>
          <CardDescription>{dashboardConfig.quickActions.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {dashboardConfig.quickActions.items.map((action) => (
              <Button key={action.label} variant="outline" className="h-auto p-4 flex-col gap-2" asChild>
                <Link href={action.href} {...(action.external ? { target: "_blank" } : {})}>
                  <action.icon className="h-5 w-5" />
                  <span>{action.label}</span>
                </Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tech Stack */}
      <Card>
        <CardHeader>
          <CardTitle>{dashboardConfig.techStack.title}</CardTitle>
          <CardDescription>{dashboardConfig.techStack.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {dashboardConfig.techStack.items.map((tech) => (
              <Badge key={tech} variant="outline" className="px-3 py-1">{tech}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Note:** The container padding (`p-4 md:p-6`) is set here, matching the admin `UsersPage` pattern. The outer layout provides the sidebar chrome; the page component provides the inner content padding.

---

### Layer 7 — `src/config/dashboard.ts` (extends current file)

The current `dashboardConfig` has `quickActions`, `techStack`, and `footer`. It needs the following additions to support the layout system:

```ts
// Add to dashboardConfig:
nav: [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
] satisfies NavItem[],

footerNav: [
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] satisfies NavItem[],

title: "Dashboard",
version: "v1.0.0",
defaultRoute: "/dashboard",
rootLabel: "Dashboard",
rootHref: "/dashboard",

pages: {
  overview: {
    title: "Dashboard | Zexa Better Auth",
    description: "Your personal dashboard overview.",
  },
},
```

Also imports `NavItem` and `NavItemList` types from `@/config/types.ts` (see NavItem Types section).

> **`dashboardConfig.footer` key:** The current `dashboardConfig` has a `footer: { builtBy, builtByHref }` key. This key is no longer used anywhere — the user removed the footer from the page. This key must be **removed** from `dashboard.ts` during the refactor to avoid orphaned config.

> **`footerNav` settings link:** The `footerNav` entry pointing to `/dashboard/settings` is a **placeholder**. The settings route does not exist yet. Include the entry in config but render it with a disabled or `coming-soon` visual state, OR defer the footerNav array to empty (`[]`) until the settings page exists. Do not add a working link to a non-existent route.

> **`adminConfig.footerNav` parity:** `adminConfig` has the same problem — `{ href: "/admin/settings" }` also points to a non-existent route. Both should be resolved consistently: either both deferred to `[]` or both rendered as disabled. Do not fix one without the other.

---

## `NavItem` Types — Shared vs Duplicated

Currently `NavItem` and `NavItemList` are defined in `src/config/admin.ts`. The dashboard config will also need them. Two options:

**Option A (recommended): Extract to `src/config/types.ts`**
```ts
// src/config/types.ts
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export type NavItemList = ReadonlyArray<NavItem>;
```

Both `admin.ts` and `dashboard.ts` import from `types.ts`. Components also import from `types.ts`.

> **`QuickAction` interface:** `dashboard.ts` defines `QuickAction` with `external?: boolean`. This is a distinct type from `NavItem` — sidebar nav links are never external, so merging the two would corrupt `NavItem`'s semantics. `QuickAction` stays in `dashboard.ts` as content-specific config. It does NOT move to `types.ts`.

**Option B: Import from admin.ts**
`dashboard.ts` imports `NavItem` from `@/config/admin`. Works but creates a semantic dependency between two sibling configs.

Option A is correct.

**Companion edits required when Option A is implemented:**

1. **`src/config/admin.ts`** — Remove the `NavItem` interface and `NavItemList` type definitions. Add `import type { NavItem, NavItemList } from "@/config/types"`.
2. **`components/dashboard/dashboard-layout.tsx`** (moved from admin) — Update `import type { NavItemList } from "@/config/admin"` → `from "@/config/types"`.
3. **`components/dashboard/dashboard-sidebar.tsx`** (moved from admin) — Same import update.
4. **`src/app/admin/admin-layout-client.tsx`** — Update `import DashboardLayout from "@/components/admin/dashboard-layout"` → `"@/components/dashboard/dashboard-layout"` after the file move.

---

## Component Directory Structure (After Refactor)

```
components/
  dashboard/
    dashboard-layout.tsx        Generic sidebar layout (moved from admin/)
    dashboard-sidebar.tsx       Generic sidebar (moved from admin/)
    dashboard-overview.tsx      Dashboard overview content (new)
  admin/
    users-table.tsx
    user-actions.tsx
    user-add-dialog.tsx
    user-ban-dialog.tsx
    user-delete-dialog.tsx
    user-revoke-sessions-dialog.tsx
    user-role-dialog.tsx
    user-unban-dialog.tsx
  auth/
    login-form.tsx
    register-form.tsx
    password-input.tsx
  landing/
    navbar.tsx
  ui/
    (shadcn primitives)
```

---

## Data Flow Diagram

```
src/config/dashboard.ts
        │
        ▼
app/dashboard/dashboard-layout-client.tsx  ("use client")
  ├─ reads: dashboardConfig.nav, .title, .version, .rootHref, .rootLabel
  ├─ reads: usePathname(), useRouter()
  └─ passes props to ▼

components/dashboard/dashboard-layout.tsx   ("use client")
  ├─ receives: navItems, footerItems, title, version, rootLabel, rootHref, pathname, onLogout
  ├─ renders: SidebarProvider, header, breadcrumbs
  └─ passes props to ▼

components/dashboard/dashboard-sidebar.tsx  ("use client")
  ├─ receives: navItems, footerItems, title, version, pathname, onLogout
  └─ renders: sidebar nav from props

                                            app/dashboard/page.tsx  (Server Component)
                                              ├─ reads: dashboardConfig.pages.overview (metadata only)
                                              └─ mounts ▼

                                            components/dashboard/dashboard-overview.tsx
                                              └─ reads: dashboardConfig (all content, direct import)
```

---

## What This Pattern Proves

When this is implemented, the following should all be true:

1. Adding a new page (e.g. `/dashboard/profile`) requires:
   - Creating `app/dashboard/profile/page.tsx` (thin shell, metadata from config)
   - Creating `components/dashboard/profile-content.tsx` (display component)
   - Adding `{ href: "/dashboard/profile", label: "Profile", icon: User }` to `dashboardConfig.nav`
   - **No changes to layout, sidebar, or layout-client.**

2. Changing the sidebar title requires editing one line in `dashboardConfig.title`.

3. Changing the post-logout redirect requires editing one line in `dashboard-layout-client.tsx`.

4. Changing the overview cards requires editing `components/dashboard/dashboard-overview.tsx` or `dashboardConfig`.

5. No page file contains layout markup. No component file contains route logic.

---

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
