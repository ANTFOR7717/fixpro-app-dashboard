# REFACTOR(global-directory-structure)

## Request
Implement Domain-Driven Design (Feature Slices) pattern to evacuate the remaining business domains (`auth`, `dashboard`, `landing`) trapped inside the flat proxy folder `src/components/`, while dragging their associated configurations and internal API route handlers securely into the feature boundary namespaces.

## Directory Map
```text
src/
  features/
    auth/
      api/
        login.ts                          (move from app/auth/login/action.ts)
        register.ts                       (move from app/auth/register/action.ts)
      components/
        login-form.tsx                    (move)
        register-form.tsx                 (move)
        password-input.tsx                (move)
    dashboard/
      config/
        dashboard-config.ts               (move from config/dashboard.ts)
      components/
        layout/
          dashboard-layout.tsx            (move)
          dashboard-sidebar.tsx           (move)
        overview/
          dashboard-overview.tsx          (move)
    marketing/
      components/
        navbar.tsx                        (move)
  components/
    auth/                                 (delete folder)
    dashboard/                            (delete folder)
    landing/                              (delete folder)
  app/
    auth/
      login/
        login-page-client.tsx             (modify)
        action.ts                         (delete)
      register/
        register-page-client.tsx          (modify)
        action.ts                         (delete)
    dashboard/
      client.tsx                          (modify)
      page.tsx                            (modify)
    admin/
      client.tsx                          (modify)
    page.tsx                              (modify)
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `src/features/auth/api/login.ts` | Move | Decouple identity server action into feature module |
| `src/features/auth/api/register.ts` | Move | Decouple identity server action into feature module |
| `src/features/auth/components/login-form.tsx` | Move, Modify | Encapsulate & patch API breaks |
| `src/features/auth/components/register-form.tsx` | Move, Modify | Encapsulate & patch API breaks |
| `src/features/auth/components/password-input.tsx` | Move | Feature slice encapsulation for Auth |
| `src/features/dashboard/config/dashboard-config.ts` | Move | Encapsulate dashboard configuration dictionary |
| `src/features/dashboard/components/layout/dashboard-layout.tsx` | Move, Modify | Isolate App Shell & patch internal breaks |
| `src/features/dashboard/components/layout/dashboard-sidebar.tsx` | Move | Domain logic isolation for App Shell |
| `src/features/dashboard/components/overview/dashboard-overview.tsx` | Move, Modify | Feature encapsulation & internal config map patch |
| `src/features/marketing/components/navbar.tsx` | Move | Feature slice encapsulation for Marketing |
| `src/app/auth/login/login-page-client.tsx` | Modify | Rebind path to Auth domain |
| `src/app/auth/register/register-page-client.tsx` | Modify | Rebind path to Auth domain |
| `src/app/dashboard/client.tsx` | Modify | Rebind path to Dashboard generic layers |
| `src/app/dashboard/page.tsx` | Modify | Rebind path to Dashboard domain |
| `src/app/admin/client.tsx` | Modify | Rebind path to Dashboard domain layout |
| `src/app/page.tsx` | Modify | Rebind path to Marketing domain |
| `src/app/auth/login/action.ts` | Delete | Relocated to domain root |
| `src/app/auth/register/action.ts` | Delete | Relocated to domain root |
| `src/components/auth/` | Delete | Extinguish anti-pattern folder |
| `src/components/dashboard/` | Delete | Extinguish anti-pattern folder |
| `src/components/landing/` | Delete | Extinguish anti-pattern folder |
| `src/config/dashboard.ts` | Delete | Succeeded by domain copy |


## Existing Pattern Audit
The codebase architecture demands strict separation of UI, logical constraints, and configs grouped securely into domains.

## File-by-File Changes

### `src/features/auth/api/login.ts`
**Action:** Move  
**Why:** Relocating the `use server` root out of the frontend hierarchy into module logics.
**Diff:** (File moved directly from `src/app/auth/login/action.ts` without internal code changes)

### `src/features/auth/api/register.ts`
**Action:** Move  
**Why:** Relocating the `use server` root out of the frontend hierarchy.
**Diff:** (File moved directly from `src/app/auth/register/action.ts` without internal code changes)

### `src/features/auth/components/login-form.tsx`
**Action:** Move & Modify imports
**Why:** Relocating breaks relative dependencies on form-messages and api logic namespaces.
```diff
-import { loginUser } from "../../app/auth/login/action";
-import { FormSuccess, FormError } from "../ui/form-messages";
+import { loginUser } from "@/features/auth/api/login";
+import { FormSuccess, FormError } from "@/components/ui/form-messages";
```

### `src/features/auth/components/register-form.tsx`
**Action:** Move & Modify imports
**Why:** Breaking component relations requires absolute paths bridging auth domains.
```diff
-import PasswordInput from "./password-input";
+import PasswordInput from "@/features/auth/components/password-input";
 import { registerSchema } from "@/lib/schemas";
-import { registerUser } from "@/app/auth/register/action";
-import { FormSuccess, FormError } from "../ui/form-messages";
+import { registerUser } from "@/features/auth/api/register";
+import { FormSuccess, FormError } from "@/components/ui/form-messages";
```

### `src/features/auth/components/password-input.tsx`
**Action:** Move  
**Why:** Relocating password logic entirely. No internal dependencies are broken.
**Diff:** (File moved directly from `src/components/auth/password-input.tsx` without internal code changes)

### `src/features/dashboard/config/dashboard-config.ts`
**Action:** Move  
**Why:** Relocating isolated logic. No internal dependencies are broken.
**Diff:** (File moved directly from `src/config/dashboard.ts` without internal code changes)

### `src/features/dashboard/components/layout/dashboard-layout.tsx`
**Action:** Move & Modify imports
**Why:** Rebinds its shell linkage internally directly towards its co-located sidebar.
```diff
 import { Separator } from "@/components/ui/separator";
-import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
+import { DashboardSidebar } from "@/features/dashboard/components/layout/dashboard-sidebar";
 import type { NavItemList } from "@/config/types";
```

### `src/features/dashboard/components/layout/dashboard-sidebar.tsx`
**Action:** Move
**Why:** Anchors the navigation tree. No relative breaks.
**Diff:** (File moved directly from `src/components/dashboard/dashboard-sidebar.tsx` without internal code changes)

### `src/features/dashboard/components/overview/dashboard-overview.tsx`
**Action:** Move & Modify imports
**Why:** Links domain logic.
```diff
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import Link from "next/link";
-import { dashboardConfig } from "@/config/dashboard";
+import { dashboardConfig } from "@/features/dashboard/config/dashboard-config";
```

### `src/features/marketing/components/navbar.tsx`
**Action:** Move
**Why:** Ensures the static navbar is aligned safely. No relative breaks.
**Diff:** (File moved directly from `src/components/landing/navbar.tsx` without internal code changes)

### `src/app/auth/login/login-page-client.tsx`
**Action:** Modify
**Why:** Points app routing towards domain exports.
```diff
 import { Button } from "@/components/ui/button";
-import LoginForm from "@/components/auth/login-form";
+import LoginForm from "@/features/auth/components/login-form";
 import { Card, CardContent } from "@/components/ui/card";
```

### `src/app/auth/register/register-page-client.tsx`
**Action:** Modify
**Why:** Points app routing towards domain exports.
```diff
 import { Card, CardContent } from "@/components/ui/card";
-import RegisterForm from "@/components/auth/register-form";
+import RegisterForm from "@/features/auth/components/register-form";
 import { GoogleIcon, GithubIcon } from "@/components/ui/icons";
```

### `src/app/dashboard/client.tsx`
**Action:** Modify
**Why:** Points app root boundaries to domains.
```diff
 import React from "react";
 import { usePathname, useRouter } from "next/navigation";
-import DashboardLayout from "@/components/dashboard/dashboard-layout";
+import DashboardLayout from "@/features/dashboard/components/layout/dashboard-layout";
 import { authClient } from "@/lib/auth-client";
-import { dashboardConfig } from "@/config/dashboard";
+import { dashboardConfig } from "@/features/dashboard/config/dashboard-config";
```

### `src/app/dashboard/page.tsx`
**Action:** Modify
**Why:** Patches domain rendering imports.
```diff
 import type { Metadata } from "next";
-import DashboardOverview from "@/components/dashboard/dashboard-overview";
+import DashboardOverview from "@/features/dashboard/components/overview/dashboard-overview";
 
 export const metadata: Metadata = {
```

### `src/app/admin/client.tsx`
**Action:** Modify
**Why:** Binds shared admin route container onto the Dashboard domain properly.
```diff
 import { usePathname, useRouter } from "next/navigation";
-import DashboardLayout from "@/components/dashboard/dashboard-layout";
+import DashboardLayout from "@/features/dashboard/components/layout/dashboard-layout";
 import { authClient } from "@/lib/auth-client";
```

### `src/app/page.tsx`
**Action:** Modify
**Why:** Integrates new marketing bounds.
```diff
 import { Check, ArrowRight } from "lucide-react";
-import Navbar from "@/components/landing/navbar";
+import Navbar from "@/features/marketing/components/navbar";
 
 export default function Home() {
```

## Validation Plan
1. Execution of `npm run build` safely binds the 100% complete application boundaries.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
