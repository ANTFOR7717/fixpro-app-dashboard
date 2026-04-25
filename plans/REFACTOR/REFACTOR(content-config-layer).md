# REFACTOR(content-config-layer)

## Request
Extract all hardcoded copy, nav items, icon references, version strings, and page metadata from the admin and user dashboard components into typed TypeScript config files. Components must become purely presentational — they receive all content as props and own no strings themselves.

## Directory Map
```text
src/
  config/
    admin.ts                                    (new)
    dashboard.ts                                (new)
  components/
    admin/
      dashboard-sidebar.tsx                     (modify)
      dashboard-layout.tsx                      (modify)
  app/
    admin/
      admin-layout-client.tsx                   (modify)
      page.tsx                                  (modify)
      users/
        page.tsx                                (modify)
    dashboard/
      page.tsx                                  (modify)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/config/admin.ts` | New | Single source of truth for all admin dashboard content — nav items, footer items, title, version, default route, and page-level copy. |
| `src/config/dashboard.ts` | New | Single source of truth for all user dashboard content — quick actions, tech stack badges, and page copy. |
| `src/components/admin/dashboard-sidebar.tsx` | Modify | Remove the hardcoded `sidebarNavItems` array and hardcoded footer links. Accept `navItems`, `footerItems`, `title`, and `version` as props. |
| `src/components/admin/dashboard-layout.tsx` | Modify | Remove the hardcoded `"Admin"` breadcrumb root label. Accept `rootLabel` and `rootHref` as props. Pass new sidebar props through. |
| `src/app/admin/admin-layout-client.tsx` | Modify | Import `adminConfig` and pass all nav/copy props down to `DashboardLayout`. |
| `src/app/admin/page.tsx` | Modify | Replace hardcoded `/admin/users` redirect with `adminConfig.defaultRoute`. |
| `src/app/admin/users/page.tsx` | Modify | Replace hardcoded metadata strings with values from `adminConfig.pages.users`. |
| `src/app/dashboard/page.tsx` | Modify | Replace hardcoded `techStack` array, quick action buttons, and footer copy with values from `dashboardConfig`. |

## Existing Pattern Audit
- `DashboardLayout` and `DashboardSidebar` are already prop-driven for `pathname` and `onLogout` (from the previous frontend-decoupling refactor) — this refactor extends the same pattern to content props.
- `AdminLayoutClient` is already the correct injection boundary — it reads Next.js hooks and passes values down. It should also read the config and pass content down.
- `dashboard/page.tsx` is currently a standalone page with no shared shell — content config is applied to the existing structure without adding a new layout wrapper.
- Icons are imported from `lucide-react` throughout the codebase — `LucideIcon` typing is consistent and appropriate for the config type.

## Execution Plan

### Step 1 — Create `src/config/admin.ts`
Define all admin content in one typed file. Nav items, footer items, title, version, default route, and per-page metadata.

### Step 2 — Create `src/config/dashboard.ts`
Define all user dashboard content — quick actions (with href, label, icon), tech stack badge labels, and page-level copy.

### Step 3 — Update `DashboardSidebar`
Remove hardcoded `sidebarNavItems` and hardcoded footer JSX. Accept and render config-driven props.

### Step 4 — Update `DashboardLayout`
Remove hardcoded `"Admin"` root label. Accept `rootLabel` and `rootHref` props, and forward new sidebar props through.

### Step 5 — Update `AdminLayoutClient`
Import `adminConfig`. Pass nav, footerItems, title, version, rootLabel, rootHref down to `DashboardLayout`.

### Step 6 — Update `admin/page.tsx` and `admin/users/page.tsx`
Read `defaultRoute` and page metadata from `adminConfig`.

### Step 7 — Update `dashboard/page.tsx`
Consume `dashboardConfig` for all content. No structural changes to layout.

## File-by-File Changes

---

### `src/config/admin.ts`
**Action:** Create  
**Why:** All admin hardcoded content consolidated here.  
**Impact:** Every admin dashboard string and route lives in one typed, auditable file.

#### Before
File does not exist yet.

#### After
```ts
import { Users, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Use ReadonlyArray so as-const config arrays are assignable without spread copies
export type NavItemList = ReadonlyArray<NavItem>;

export const adminConfig = {
  title: "Admin Panel",
  version: "v1.0.0",
  defaultRoute: "/admin/users",
  rootLabel: "Admin",
  rootHref: "/admin",
  nav: [
    { href: "/admin/users", label: "Users", icon: Users },
  ] satisfies NavItem[],
  footerNav: [
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ] satisfies NavItem[],
  pages: {
    users: {
      title: "Users | Admin Dashboard",
      description: "Manage users in the admin dashboard",
    },
  },
} as const;
```

#### Reasoning
- `satisfies NavItem[]` enforces type correctness while keeping `as const` inference for `href` literals.
- `footerNav` is a separate array from `nav` matching the sidebar's structural split (main content vs footer).
- `pages` holds Next.js `Metadata` strings so page files don't own any copy.

---

### `src/config/dashboard.ts`
**Action:** Create  
**Why:** User dashboard page has fully hardcoded content — quick actions, tech stack, footer copy.  
**Impact:** All user-dashboard strings live in one place.

#### Before
File does not exist yet.

#### After
```ts
import { Users, Shield, Code, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface QuickAction {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
}

export const dashboardConfig = {
  quickActions: {
    title: "Quick Actions",
    description: "Get started with common tasks and explore the template features",
    items: [
      { href: "/auth/register", label: "Create Account", icon: Users },
      { href: "/admin", label: "Admin Panel", icon: Shield },
      {
        href: "https://github.com/zexahq/better-auth-starter",
        label: "View Source",
        icon: Code,
        external: true,
      },
      {
        href: "https://github.com/zexahq/better-auth-starter",
        label: "Documentation",
        icon: Mail,
        external: true,
      },
    ] satisfies QuickAction[],
  },
  techStack: {
    title: "Tech Stack",
    description: "Built with modern technologies for performance, security, and developer experience",
    items: [
      "Next.js 15",
      "Better Auth",
      "PostgreSQL",
      "Drizzle ORM",
      "Tailwind CSS",
      "Radix UI",
      "TypeScript",
      "React Hook Form",
      "Zod",
    ],
  },
  footer: {
    builtBy: "Zexa",
    builtByHref: "https://zexa.dev",
  },
} as const;
```

#### Reasoning
- `external` flag on `QuickAction` drives `target="_blank"` in JSX without hardcoding it per item.
- `as const` prevents downstream mutation and enables literal type inference on `href`.

---

### `src/components/admin/dashboard-sidebar.tsx`
**Action:** Modify  
**Why:** Hardcoded `sidebarNavItems` array and hardcoded footer `<Link>` blocks must be replaced with prop-driven rendering.  
**Impact:** Sidebar renders whatever it receives — adding a nav item requires zero component changes.

#### Before
```tsx
import { Users, Settings, LogOut, GalleryVerticalEnd } from "lucide-react";

const sidebarNavItems = [
  { href: "/admin/users", icon: Users, label: "Users" },
];

interface DashboardSidebarProps {
  pathname: string;
  onLogout: () => Promise<void>;
}

export function DashboardSidebar({ pathname, onLogout }: DashboardSidebarProps) {
  // ...
  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader>
        {/* ... */}
        <span className="font-semibold">Admin Panel</span>
        <span className="">v1.0.0</span>
        {/* ... */}
      </SidebarHeader>
      <SidebarContent>
        {/* renders sidebarNavItems */}
      </SidebarContent>
      <SidebarFooter>
        {/* hardcoded Settings link + Logout */}
        <Link href="/admin/settings">
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </Link>
        {/* ... */}
      </SidebarFooter>
    </Sidebar>
  );
}
```

#### After
```tsx
"use client";

import Link from "next/link";
import { LogOut, GalleryVerticalEnd } from "lucide-react";
import type { NavItemList } from "@/config/admin";

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";

interface DashboardSidebarProps {
  pathname: string;
  onLogout: () => Promise<void>;
  navItems: NavItemList;
  footerItems: NavItemList;
  title: string;
  version: string;
}

export function DashboardSidebar({
  pathname,
  onLogout,
  navItems,
  footerItems,
  title,
  version,
}: DashboardSidebarProps) {
  const handleLogout = async () => {
    try {
      await onLogout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <GalleryVerticalEnd className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">{title}</span>
                  <span className="">{version}</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.label}
                    className="text-muted-foreground"
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {footerItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild tooltip={item.label}>
                <Link href={item.href}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Logout" className="cursor-pointer">
              <button onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
```

#### Reasoning
- `LogOut` and `GalleryVerticalEnd` remain as direct imports — they are structural chrome, not content.
- All content imports (`Users`, `Settings`, `"Admin Panel"`, `"v1.0.0"`) are gone.
- `footerItems` renders identically to `navItems` — no special-casing per link.

---

### `src/components/admin/dashboard-layout.tsx`
**Action:** Modify  
**Why:** Hardcoded `"Admin"` breadcrumb root label and hardcoded `href="/admin"` must be replaced with props.  
**Impact:** Layout is fully decoupled from any specific route or label.

#### Before
```tsx
interface DashboardLayoutProps {
  children: React.ReactNode;
  pathname: string;
  onLogout: () => Promise<void>;
}

const DashboardLayout = ({ children, pathname, onLogout }: DashboardLayoutProps) => {
  // ...
  <Link href="/admin">Admin</Link>
  // ...
  <DashboardSidebar pathname={pathname} onLogout={onLogout} />
```

#### After (complete component)
```tsx
"use client";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import React from "react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { DashboardSidebar } from "@/components/admin/dashboard-sidebar";
import type { NavItemList } from "@/config/admin";

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

const DashboardLayout = ({
  children,
  pathname,
  onLogout,
  navItems,
  footerItems,
  title,
  version,
  rootLabel,
  rootHref,
}: DashboardLayoutProps) => {
  const pathSegments = pathname.split("/").filter(Boolean);
  const rootDepth = rootHref.split("/").filter(Boolean).length;
  const relevantSegments = pathSegments.slice(rootDepth);

  return (
    <SidebarProvider>
      <DashboardSidebar
        pathname={pathname}
        onLogout={onLogout}
        navItems={navItems}
        footerItems={footerItems}
        title={title}
        version={version}
      />
      <SidebarInset className="bg-background overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href={rootHref}>{rootLabel}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {relevantSegments.length > 0 && <BreadcrumbSeparator />}
                {relevantSegments.map((segment, index) => {
                  const href = `${rootHref}/${relevantSegments
                    .slice(0, index + 1)
                    .join("/")}`;
                  const isLast = index === relevantSegments.length - 1;
                  return (
                    <React.Fragment key={href}>
                      <BreadcrumbItem>
                        {isLast ? (
                          <BreadcrumbPage className="capitalize">
                            {segment}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild className="capitalize">
                            <Link href={href}>{segment}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!isLast && <BreadcrumbSeparator />}
                    </React.Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
};

export default DashboardLayout;
```

#### Reasoning
- `rootLabel` / `rootHref` make the breadcrumb root fully configurable — if the layout is reused for a non-admin dashboard it works without modification.

---

### `src/app/admin/admin-layout-client.tsx`
**Action:** Modify  
**Why:** This is the correct injection boundary — it must now also pass content props from `adminConfig` into `DashboardLayout`.  
**Impact:** All config consumption is centralized here; child components stay pure.

#### Before
```tsx
"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import DashboardLayout from "@/components/admin/dashboard-layout";
import { authClient } from "@/lib/auth-client";

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
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
    <DashboardLayout pathname={pathname} onLogout={handleLogout}>
      {children}
    </DashboardLayout>
  );
}
```

#### After (complete file)
```tsx
"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import DashboardLayout from "@/components/admin/dashboard-layout";
import { authClient } from "@/lib/auth-client";
import { adminConfig } from "@/config/admin";

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
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
      navItems={adminConfig.nav}
      footerItems={adminConfig.footerNav}
      title={adminConfig.title}
      version={adminConfig.version}
      rootLabel={adminConfig.rootLabel}
      rootHref={adminConfig.rootHref}
    >
      {children}
    </DashboardLayout>
  );
}
```

#### Reasoning
- Config import stays in the boundary layer — no child component imports config directly.

---

### `src/app/admin/page.tsx`
**Action:** Modify  
**Why:** `redirect("/admin/users")` is hardcoded. Changing the default admin landing page requires editing this file directly.  
**Impact:** Default route is controlled by config.

#### Before (complete file)
```ts
import { redirect } from "next/navigation";

const AdminPage = async () => {
  redirect("/admin/users");
};

export default AdminPage;
```

#### After (complete file)
```ts
import { redirect } from "next/navigation";
import { adminConfig } from "@/config/admin";

const AdminPage = async () => {
  redirect(adminConfig.defaultRoute);
};

export default AdminPage;
```

#### Reasoning
- One-line change. Changing the default admin landing page is now a config edit, not a code edit.

---

### `src/app/admin/users/page.tsx`
**Action:** Modify  
**Why:** `title` and `description` in `metadata` are hardcoded strings.  
**Impact:** Page metadata is owned by config, not by the page file.

#### Before
```ts
export const metadata: Metadata = {
  title: "Users | Admin Dashboard",
  description: "Manage users in the admin dashboard",
};
```

#### After
```ts
import { adminConfig } from "@/config/admin";

export const metadata: Metadata = {
  title: adminConfig.pages.users.title,
  description: adminConfig.pages.users.description,
};
```

#### Reasoning
- Keeps the page file as a thin shell — it mounts the component and declares metadata, owns neither.

---

### `src/app/dashboard/page.tsx`
**Action:** Modify  
**Why:** `techStack` array, quick action links, button labels, and footer copy are all hardcoded in JSX.  
**Impact:** User dashboard copy is fully config-driven.

#### Before (abbreviated — all hardcoded)
```tsx
const techStack = ["Next.js 15", "Better Auth", /* ... */];
// Card titles, descriptions, button labels, hrefs, footer copy all inline in JSX
```

#### After (complete relevant JSX, structural markup unchanged)
```tsx
import { dashboardConfig } from "@/config/dashboard";
import { Settings } from "lucide-react"; // structural chrome icon, stays

// Quick Actions card
<Card className="mb-12">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Settings className="h-5 w-5" />
      {dashboardConfig.quickActions.title}
    </CardTitle>
    <CardDescription>
      {dashboardConfig.quickActions.description}
    </CardDescription>
  </CardHeader>
  <CardContent>
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {dashboardConfig.quickActions.items.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          className="h-auto p-4 flex-col gap-2"
          asChild
        >
          <Link
            href={action.href}
            {...(action.external ? { target: "_blank" } : {})}
          >
            <action.icon className="h-5 w-5" />
            <span>{action.label}</span>
          </Link>
        </Button>
      ))}
    </div>
  </CardContent>
</Card>

// Tech Stack card
<Card>
  <CardHeader>
    <CardTitle>{dashboardConfig.techStack.title}</CardTitle>
    <CardDescription>{dashboardConfig.techStack.description}</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="flex flex-wrap gap-2">
      {dashboardConfig.techStack.items.map((tech) => (
        <Badge key={tech} variant="outline" className="px-3 py-1">
          {tech}
        </Badge>
      ))}
    </div>
  </CardContent>
</Card>

// Footer
<div className="text-center mt-12 pt-8 border-t border-border/50">
  <p className="text-muted-foreground">
    Built with ❤️ by{" "}
    <Link
      href={dashboardConfig.footer.builtByHref}
      target="_blank"
      className="text-primary hover:underline font-medium"
    >
      {dashboardConfig.footer.builtBy}
    </Link>
  </p>
</div>
```

> **Note:** `<Settings className="h-5 w-5" />` in the Quick Actions card header is structural chrome (decorative icon, not navigation content) — it stays as a direct import.

#### Reasoning
- `action.external` drives `target="_blank"` in a single spread — no per-item conditional.
- Card titles and descriptions come from `dashboardConfig` too, keeping all copy in one place.

---

## Validation Plan
1. `pnpm dev` — zero TypeScript errors (`satisfies` catches malformed nav items).
2. Navigate to `/admin/users` — sidebar renders "Users" nav item from config.
3. Navigate to `/admin/settings` — sidebar Settings footer link resolves from `footerNav`.
4. Add a new item to `adminConfig.nav` — sidebar renders it without touching any component.
5. Navigate to `/dashboard` — all cards and badges render from `dashboardConfig`.

## Risk Notes
- `as const` on the config objects means downstream array mutations will cause TS errors — intentional.
- `adminConfig.nav` is typed with `satisfies NavItem[]` but is also `readonly` due to `as const`. If a component needs to filter/mutate the array, use `.slice()` or spread to create a mutable copy.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
