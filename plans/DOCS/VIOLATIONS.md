# VIOLATIONS.md
## Frontend Architecture Violations

Audit date: 2026-04-03. Files audited: `app/page.tsx`, `app/layout.tsx`, `app/dashboard/page.tsx`, `app/auth/login/page.tsx`, `app/auth/register/page.tsx`, `components/landing/navbar.tsx`, `components/auth/*`, `components/admin/*`, `src/config/admin.ts`, `src/config/dashboard.ts`.

---

## VIOLATION 1 — Fat Pages: Layout Markup Inside Page Files

**Severity: High**

### `app/page.tsx` (155 lines)
A page file should export a component that mounts content. Instead, `app/page.tsx` owns the following layers that belong in layout files or layout components:

- Line 75: Full-page wrapper `<div className="min-h-screen bg-background">` — page background and minimum height are layout concerns.
- Line 76: `<Navbar />` mounted directly — the page is responsible for its own navigation chrome.
- Line 78: `<div className="container mx-auto px-4 py-8 max-w-6xl">` — container and padding are layout concerns.
- Lines 83–113: Feature grid built entirely inline in JSX, not extracted to a `<FeaturesGrid />` component.
- Lines 116–134: Tech stack card built entirely inline in JSX, not extracted to a `<TechStackCard />` component.
- Lines 136–148: Footer markup inline — not extracted to a `<LandingFooter />` component.

The page file accumulates every visual layer of the landing page into a single 155-line component. Adding a banner, changing the grid layout, or adjusting the footer each requires editing this file.

### `app/dashboard/page.tsx` (91 lines)
Same structural violation as the landing page:

- Line 17: Full-page wrapper `<div className="min-h-screen bg-background">` — layout concern in a page file.
- Line 18: `<Navbar />` mounted directly — the page is responsible for its own navigation chrome.
- Line 20: `<div className="container mx-auto px-4 py-8 max-w-6xl">` — container and padding inline.
- Lines 22–52: Quick Actions card built inline — not extracted to a component.
- Lines 55–71: Tech Stack card built inline — not extracted to a component.
- Lines 73–84: Footer inline.

### `app/auth/login/page.tsx` (73 lines)
- Line 18: Full-page centering wrapper `<div className="flex min-h-screen items-center justify-center bg-neutral-100">` — layout concern.
- Lines 20–25: Brand header (logo icon + "Zexa Better Auth" text) built inline — not a component.
- Lines 26–65: The card, OAuth buttons, OR divider, and navigation link are all assembled inline in the page rather than delegated to an auth layout component.

### `app/auth/register/page.tsx` (68 lines)
- Line 13: Identical full-page centering wrapper as login — `"flex min-h-screen items-center justify-center bg-neutral-100"`.
- Lines 15–20: Identical brand header block (same icon, same text) as login — not shared via a layout.
- Lines 21–63: Same card, OAuth button layout, OR divider, and navigation link built inline again entirely independently from the login page.

---

## VIOLATION 2 — Missing Layout Files

**Severity: High**

### Missing: `app/dashboard/layout.tsx`
There is no layout file for the `/dashboard` route. Consequences:
1. **No authentication gate.** `/dashboard` is publicly accessible to any unauthenticated visitor. The page is statically generated at build time and served from CDN with no session check.
2. **No shared layout shell.** Any future route under `/dashboard/*` (settings, profile, billing) must independently assemble its own page wrapper and navbar.
3. **No server-side user context.** Without a layout that checks `auth.api.getSession()`, the dashboard page cannot access the logged-in user's data server-side.

### Missing: `app/auth/layout.tsx`
There is no layout file for the `/auth` route group. Consequences:
1. Both `login/page.tsx` and `register/page.tsx` independently implement identical page chrome:
   - The centering wrapper div with `bg-neutral-100`
   - The brand logo (GalleryVerticalEnd icon + "Zexa Better Auth" label)
   - The dead-link `<a href="#">` wrapper around the brand
2. Changing the auth page background, adding a split-pane layout, or updating the brand name requires editing two separate files.
3. There is no logical place to redirect already-authenticated users hitting `/auth/login` — that guard would need to be duplicated in both page files.

---

## VIOLATION 3 — Pages Marked `"use client"` at the Page Level

**Severity: Medium**

### `app/auth/login/page.tsx` — line 1: `"use client"`
The entire login page is a Client Component. The reason is that it uses `useRouter` (line 3) to push to `/dashboard` after login. The actual form (`LoginForm`) is already a separate component in `components/auth/`. The page shell — the centering wrapper, brand header, OAuth buttons, divider, and navigation link — has no client-side reason to exist as a Client Component. Marking the page itself as `"use client"` means:
- The page shell cannot be server-rendered.
- The implicit server → client boundary is lost; the entire subtree is client-side from the page root.
- `useRouter` usage in the page file means post-login redirect logic lives in the page layer rather than inside the form action.

The post-login route `"/dashboard"` at line 28 is also hardcoded:
```tsx
<LoginForm onLoginSuccess={() => router.push("/dashboard")} />
```

### `app/auth/register/page.tsx` — line 1: `"use client"`
The register page is also marked `"use client"` with no apparent reason — it doesn't use any client-only hooks. It imports `signInWithGoogle` and `signInWithGithub` from `@/lib/auth-client`, which are client functions, and passes them as `onClick` handlers. However, this still doesn't require the page itself to be a Client Component — the OAuth buttons could be extracted into their own `"use client"` component while the page remains a Server Component.

---

## VIOLATION 4 — Hardcoded Content Inside Component Files (Not in Config)

**Severity: Medium–High**

### `app/page.tsx`

**`features` array (lines 16–60):**
The entire features grid content — titles, descriptions, item bullet points, and icon instances — is defined as a hardcoded JavaScript array inside the component function. This includes:

```tsx
const features = [
  {
    icon: <Shield className="h-5 w-5" />,  // JSX instance as data — see Violation 5
    title: "Authentication & Authorization",
    description: "Complete auth system with email...",
    items: ["Email & Password Auth", "Session Management", "Role-based Access", "Account Linking"],
  },
  // ... 3 more objects
];
```

All four feature titles, four descriptions, and sixteen item strings are hardcoded inside the component body with no config file.

**`techStack` array (lines 62–72):**
```tsx
const techStack = ["Next.js 15", "Better Auth", "PostgreSQL", "Drizzle ORM", "Tailwind CSS", "shadcn ui", "TypeScript", "React Hook Form", "Zod"];
```
Hardcoded tech stack inside the component. Note this list is **different** from `dashboardConfig.techStack.items` — see Violation 6.

**Footer copy (lines 138–147):**
```tsx
Built with ❤️ by <Link href="https://zexa.app" target="_blank">Zexa</Link>
```
URL `https://zexa.app` and brand name `"Zexa"` are inline strings. Note the URL differs from the dashboardConfig footer URL (`https://zexa.dev`) — see Violation 6.

### `app/auth/login/page.tsx`

- Line 24: `"Zexa Better Auth"` — brand name hardcoded inline as a text node, separate from the register page's copy of the same string.
- Line 28: `router.push("/dashboard")` — post-login redirect destination hardcoded. If the dashboard route changes, this must be updated manually.
- Line 31: `"OR"` divider text — hardcoded.
- Lines 56–64: `"Not registered?"`, `"Create an account"` — nav prompt copy hardcoded.

### `app/auth/register/page.tsx`

- Line 19: `"Zexa Better Auth"` — same brand name, hardcoded again.
- Lines 51–59: `"Already have an account?"`, `"Login"` — nav prompt copy hardcoded.

### `components/landing/navbar.tsx`

- Line 40: `"Zexa Better Auth Starter"` — brand name hardcoded. Different from the auth pages' `"Zexa Better Auth"` (missing "Starter"). Three different formulations of the brand name across three files.
- Line 46: `href="/dashboard"` — nav link destination hardcoded.
- Line 48: `"Dashboard"` — nav label hardcoded.
- Line 77: `"Admin"` — admin badge label hardcoded.
- Line 105: `session.user.name || "User"` — fallback display name `"User"` hardcoded.
- Line 117: `href="/dashboard"` — dropdown dashboard link hardcoded.
- Line 126: `href="/admin"` — admin panel link hardcoded.
- Line 128: `"Admin Panel"` — admin panel label hardcoded.

---

## VIOLATION 5 — JSX Instances Stored as Data

**Severity: Medium**

`app/page.tsx` lines 18, 30, 42, 54:
```tsx
const features = [
  { icon: <Shield className="h-5 w-5" />, ... },
  { icon: <Users className="h-5 w-5" />, ... },
  { icon: <Database className="h-5 w-5" />, ... },
  { icon: <Palette className="h-5 w-5" />, ... },
];
```

Instantiated JSX elements (`<Shield />`, `<Users />`, etc.) are stored as values in a plain array. This is not inert data — these are already-created React elements with the `className` baked in at the time the array is constructed. Consequences:

1. **The data cannot be extracted to a TypeScript config file.** JSX is not serializable — it cannot live in `src/config/landing.ts` as a plain object. The config-driven pattern applied to admin and user dashboard content cannot be applied here without first changing `icon` to a component reference (`icon: Shield`) rather than an instance.
2. **Restyling is impossible without changing the data.** The `className="h-5 w-5"` is locked into the data object. A consumer cannot render the icon at a different size without modifying the array itself.
3. **Renders on every call.** The `features` array is inside the component function, so a new set of JSX elements is created on every render.

The fix pattern used elsewhere (`icon: Shield` as a `LucideIcon` type, rendered as `<item.icon className="..." />`) would solve all three issues.

---

## VIOLATION 6 — Data Duplication with Divergent Values

**Severity: Medium**

### Tech Stack list exists in two places with different content

| Location | Entry |
|---|---|
| `app/page.tsx` line 68 | `"shadcn ui"` |
| `src/config/dashboard.ts` `techStack.items[5]` | `"Radix UI"` |

Both lists are supposed to describe the same project tech stack. They differ on the UI library entry. There is no single source of truth.

### Footer URL exists in two places pointing to different domains

| Location | URL |
|---|---|
| `app/page.tsx` line 141 | `https://zexa.app` |
| `src/config/dashboard.ts` `footer.builtByHref` | `https://zexa.dev` |

Two different URLs for the same brand link.

### Brand name exists in three places with three different formulations

| Location | Name |
|---|---|
| `components/landing/navbar.tsx` line 40 | `"Zexa Better Auth Starter"` |
| `app/auth/login/page.tsx` line 24 | `"Zexa Better Auth"` |
| `app/auth/register/page.tsx` line 19 | `"Zexa Better Auth"` |

Three files, three formulations. No single config owns the brand name.

---

## VIOLATION 7 — Cross-Boundary Imports

**Severity: Medium**

### `app/dashboard/page.tsx` → `components/landing/navbar`

```tsx
import Navbar from "@/components/landing/navbar";
```

The user dashboard borrows the landing page's navigation component. The landing `Navbar` is a `"use client"` component that makes auth-state decisions and renders landing-specific chrome (`"Dashboard"` link, admin badge). Using it in the user dashboard means:

- Changes to the landing navbar (e.g. adding a landing-specific promo banner, changing responsiveness behavior) can break or alter the user dashboard unintentionally.
- The user dashboard cannot have its own navigation behavior without forking `navbar.tsx` or wrapping it.
- There is no explicit design contract between the landing page and the dashboard page that both should share the same navigation component.

---

## VIOLATION 8 — Dead `href="#"` Links in Auth Pages

**Severity: Low–Medium**

### `app/auth/login/page.tsx` line 20
```tsx
<a href="#" className="flex items-center gap-2 self-center font-medium">
  <div>...</div>
  Zexa Better Auth
</a>
```

The brand logo/name in the login page is wrapped in a link that goes nowhere (`href="#"` scrolls to the current page top). The intended behavior is to link back to `/` (the landing page). This is a usability defect.

### `app/auth/register/page.tsx` line 15
Identical dead link. Same element, same issue, duplicated because there is no shared auth layout.

---

## VIOLATION 9 — Misnamed and Mislocated Component Directory

**Severity: Low–Medium**

### `components/admin/dashboard-layout.tsx` and `components/admin/dashboard-sidebar.tsx`

After the content-config refactor, these components are fully generic — they accept `navItems`, `footerItems`, `title`, `version`, `rootHref`, `rootLabel` as props and contain no admin-specific logic or imports. They are suitable for any dashboard, admin or user. Despite this, they live under `components/admin/`.

The consequence: when the user-dashboard layout is built, either:
1. A new set of layout/sidebar components is created under `components/dashboard/` (duplication), or
2. The admin-scoped component path is imported from a non-admin context (misleading).

The correct location for these generic layout primitives is `components/dashboard/` or `components/shared/`, with `components/admin/` containing only components that are genuinely admin-specific (user actions, user dialogs, users table).

---

## VIOLATION 10 — Unjustified Single-File Directory

**Severity: Low**

### `components/landing/`

This directory contains exactly one file: `navbar.tsx`. A directory with a single file provides no organizational value — it adds a path segment for no grouping benefit. Either:

- The directory should be removed and the file moved to `components/navbar.tsx` or `components/landing-navbar.tsx`, or
- The directory should be expanded to contain other landing-specific components (hero, features grid, tech stack card, footer) that are currently inline in `app/page.tsx`.

Currently the directory is inconsistent with both approaches: it's named as if it's a shared landing component library but contains only one component, and that component is imported by the user dashboard (`app/dashboard/page.tsx`), which is not a landing page.

---

## VIOLATION 11 — Root Metadata Inconsistent with Config Pattern

**Severity: Low**

### `app/layout.tsx` lines 11–14

```tsx
export const metadata: Metadata = {
  title: "Zexa Better Auth",
  description: "A Next.js boilerplate for building web applications",
};
```

The admin and user dashboard pages now read their metadata from `adminConfig.pages.users.title` and `adminConfig.pages.users.description` respectively. The root layout metadata is still hardcoded inline. A `src/config/site.ts` (or equivalent) that owns the site title, description, brand name, URLs, and social links would be consistent with the established config-driven pattern and would resolve Violations 4 and 6 upstream (the brand name and footer URL would have a single canonical source).

---

## Summary by File

| File | Violations |
|---|---|
| `app/page.tsx` | 1 (fat page), 4 (hardcoded content), 5 (JSX as data), 6 (duplicate + divergent data) |
| `app/dashboard/page.tsx` | 1 (fat page), 2 (no layout.tsx), 7 (cross-boundary import) |
| `app/auth/login/page.tsx` | 1 (fat page), 2 (no auth layout), 3 ("use client" page), 4 (hardcoded content), 6 (brand name), 8 (dead link) |
| `app/auth/register/page.tsx` | 1 (fat page), 2 (no auth layout), 3 ("use client" page), 4 (hardcoded content), 6 (brand name), 8 (dead link) |
| `components/landing/navbar.tsx` | 4 (hardcoded content), 6 (brand name), 10 (unjustified directory) |
| `components/admin/dashboard-layout.tsx` | 9 (mislocated) |
| `components/admin/dashboard-sidebar.tsx` | 9 (mislocated) |
| `app/layout.tsx` | 11 (inconsistent with config pattern) |
