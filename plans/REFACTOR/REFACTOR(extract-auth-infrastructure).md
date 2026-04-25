# REFACTOR(extract-auth-infrastructure)

## Request
Extract the generic authentication infrastructure (providers, types, and adapters) out of the vertical feature slice (`src/features/auth`) and promote it to a top-level domain module (`src/auth`) matching the parity and scope of the `src/db` infrastructure.

## Directory Map
```text
src/
  auth/
    types.ts                             (new)
    client-provider.ts                   (new)
    server-provider.ts                   (new)
    adapters/
      better-auth/
        client.ts                        (new)
        server.ts                        (new)
  features/
    auth/
      infrastructure/
        types.ts                         (move)
        client-provider.ts               (move)
        server-provider.ts               (move)
        adapters/
          better-auth/
            client.ts                    (move)
            server.ts                    (move)
      api/
        login.ts                         (modify)
        register.ts                      (modify)
    marketing/
      components/
        navbar.tsx                       (modify)
    user-management/
      api/
        admin-actions.ts                 (modify)
        get-users.ts                     (modify)
  app/
    admin/
      client.tsx                         (modify)
      layout.tsx                         (modify)
    dashboard/
      client.tsx                         (modify)
      layout.tsx                         (modify)
    api/
      auth/
        [...all]/
          route.ts                       (modify)
    auth/
      login/
        login-page-client.tsx            (modify)
      register/
        register-page-client.tsx         (modify)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/auth/types.ts` | Move | Move system interface boundaries to the root auth module. |
| `src/auth/client-provider.ts` | Move | Expose generic UI injection point at global level. |
| `src/auth/server-provider.ts` | Move | Expose generic backend API injection point at global level. |
| `src/auth/adapters/better-auth/client.ts` | Move | Move Better Auth SDK logic to root adapter layer. |
| `src/auth/adapters/better-auth/server.ts` | Move | Move Better Auth Server SDK logic to root adapter layer. |
| `src/features/auth/api/login.ts` | Modify | Rebind `authServerProvider` to new root path. |
| `src/features/auth/api/register.ts` | Modify | Rebind `authServerProvider` to new root path. |
| `src/features/marketing/components/navbar.tsx` | Modify | Rebind `authClientProvider` to new root path. |
| `src/features/user-management/api/admin-actions.ts` | Modify | Rebind `authClientProvider` to new root path. |
| `src/features/user-management/api/get-users.ts` | Modify | Rebind `authServerProvider` to new root path. |
| `src/app/admin/client.tsx` | Modify | Rebind `authClientProvider` to new root path. |
| `src/app/admin/layout.tsx` | Modify | Rebind `authServerProvider` to new root path. |
| `src/app/dashboard/client.tsx` | Modify | Rebind `authClientProvider` to new root path. |
| `src/app/dashboard/layout.tsx` | Modify | Rebind `authServerProvider` to new root path. |
| `src/app/api/auth/[...all]/route.ts` | Modify | Rebind `authServerProvider` to new root path. |
| `src/app/auth/login/login-page-client.tsx` | Modify | Rebind `authClientProvider` to new root path. |
| `src/app/auth/register/register-page-client.tsx` | Modify | Rebind `authClientProvider` to new root path. |

## Existing Pattern Audit
The host project establishes foundational system service layers at the codebase root (e.g., `src/db`). Authentication engines govern database tokens, sessions, and security checks across all isolated feature bounds. Structuring pure infrastructure in `src/auth/` ensures that domain feature slices (like `features/auth`) strictly retain only feature-specific UI and route logic, preventing SDK wrappers from leaking into component domains.

## Execution Plan
### Step 1 — Migrate the Infrastructure Domain
Physically migrate all directories traversing `src/features/auth/infrastructure` natively up to the new `src/auth` volume. The relative paths internal to those adapters are purely self-contained, so they require zero logic updates once moved. 

### Step 2 — Re-link the Client Imports
Update all components referencing the client-side provider to hook into `@/auth/client-provider`.

### Step 3 — Re-link the Server Imports
Update all API, Actions, and Layout blocks referencing the backend constraints to utilize `@/auth/server-provider` and `@/auth/types`.

## File-by-File Changes

### `src/auth/types.ts`
**Action:** Move  
**Why:** Moving system dependencies to an autonomous core module cleanly away from business UI logic.  
**Impact:** Path shifts from `src/features/auth/infrastructure/types.ts`. Internal typings are identical.

#### Before
```text
Old path: src/features/auth/infrastructure/types.ts
```

#### After
```text
New path: src/auth/types.ts
```

#### Reasoning
- Required to isolate strict Port mappings directly inside the core bounds.

---

### `src/auth/client-provider.ts`
**Action:** Move  
**Why:** Establishing global injection pointer for UI features.  
**Impact:** Path shifts from `src/features/auth/infrastructure/client-provider.ts`. 

#### Before
```text
Old path: src/features/auth/infrastructure/client-provider.ts
```

#### After
```text
New path: src/auth/client-provider.ts
```

#### Reasoning
- Features simply import this root mapping instead of coupling internally.

---

### `src/auth/server-provider.ts`
**Action:** Move  
**Why:** Establishing global injection pointer for backend logic.  
**Impact:** Path shifts from `src/features/auth/infrastructure/server-provider.ts`. 

#### Before
```text
Old path: src/features/auth/infrastructure/server-provider.ts
```

#### After
```text
New path: src/auth/server-provider.ts
```

#### Reasoning
- Binds DB dependencies to the root, not inside UI slices.

---

### `src/auth/adapters/better-auth/client.ts`
**Action:** Move  
**Why:** Consolidating concrete implementations in the infrastructure envelope.  
**Impact:** Path shifts from `src/features/auth/infrastructure/adapters/better-auth/client.ts`.

#### Before
```text
Old path: src/features/auth/infrastructure/adapters/better-auth/client.ts
```

#### After
```text
New path: src/auth/adapters/better-auth/client.ts
```

#### Reasoning
- Relative imports internally (e.g. `../../types`) stay contiguous and do not crash.

---

### `src/auth/adapters/better-auth/server.ts`
**Action:** Move  
**Why:** Consolidating concrete implementations in the infrastructure envelope.  
**Impact:** Path shifts from `src/features/auth/infrastructure/adapters/better-auth/server.ts`.

#### Before
```text
Old path: src/features/auth/infrastructure/adapters/better-auth/server.ts
```

#### After
```text
New path: src/auth/adapters/better-auth/server.ts
```

#### Reasoning
- Moves identical database schema constraints.

---

### `src/app/admin/client.tsx`
**Action:** Modify  
**Why:** Re-linking dependency due to physical file move.  
**Impact:** Updates ES6 import mapping.

#### Before
```tsx
import DashboardLayout from "@/features/dashboard/components/layout/dashboard-layout";
import { authClientProvider } from "@/features/auth/infrastructure/client-provider";
import { adminConfig } from "@/features/user-management/config/admin-config";
```

#### After
```tsx
import DashboardLayout from "@/features/dashboard/components/layout/dashboard-layout";
import { authClientProvider } from "@/auth/client-provider";
import { adminConfig } from "@/features/user-management/config/admin-config";
```
#### Reasoning
- Binds straight to the root feature alias seamlessly.

---

### `src/app/admin/layout.tsx`
**Action:** Modify  
**Why:** Re-linking dependency due to physical file move.  
**Impact:** Updates ES6 import mapping.

#### Before
```tsx
import { authServerProvider } from "@/features/auth/infrastructure/server-provider";
import { headers } from "next/headers";
```

#### After
```tsx
import { authServerProvider } from "@/auth/server-provider";
import { headers } from "next/headers";
```
#### Reasoning
- Server provider moves up bounds natively.

---

### `src/app/dashboard/client.tsx`
**Action:** Modify  
**Why:** Re-linking dependency.  
**Impact:** Updates ES6 import mapping.

#### Before
```tsx
import LayoutComponent from "@/features/dashboard/components/layout/dashboard-layout";
import { authClientProvider } from "@/features/auth/infrastructure/client-provider";
import { dashboardConfig } from "@/features/dashboard/config/dashboard-config";
```

#### After
```tsx
import LayoutComponent from "@/features/dashboard/components/layout/dashboard-layout";
import { authClientProvider } from "@/auth/client-provider";
import { dashboardConfig } from "@/features/dashboard/config/dashboard-config";
```
#### Reasoning
- Client provider shift.

---

### `src/app/dashboard/layout.tsx`
**Action:** Modify  
**Why:** Re-linking dependency.  
**Impact:** Updates ES6 import mapping.

#### Before
```tsx
import { authServerProvider } from "@/features/auth/infrastructure/server-provider";
import { headers } from "next/headers";
```

#### After
```tsx
import { authServerProvider } from "@/auth/server-provider";
import { headers } from "next/headers";
```
#### Reasoning
- Server-side shift.

---

### `src/app/api/auth/[...all]/route.ts`
**Action:** Modify  
**Why:** API fallback boundary shifts cleanly to root edge wrapper.  
**Impact:** Updates ES6 import mapping.

#### Before
```ts
import { authServerProvider } from "@/features/auth/infrastructure/server-provider";

export const { GET, POST } = authServerProvider.getRouteHandler();
```

#### After
```ts
import { authServerProvider } from "@/auth/server-provider";

export const { GET, POST } = authServerProvider.getRouteHandler();
```
#### Reasoning
- Rebinding strictly.

---

### `src/features/marketing/components/navbar.tsx`
**Action:** Modify  
**Why:** Modifying client references to new auth home.  
**Impact:** Updates ES6 import mapping.

#### Before
```tsx
"use client";

import { authClientProvider } from "@/features/auth/infrastructure/client-provider";
import { Button } from "@/components/ui/button";
```

#### After
```tsx
"use client";

import { authClientProvider } from "@/auth/client-provider";
import { Button } from "@/components/ui/button";
```
#### Reasoning
- Resolves the missing `Module not found` error cleanly.

---

### `src/features/user-management/api/admin-actions.ts`
**Action:** Modify  
**Why:** Modifying client references to new auth home.  
**Impact:** Updates ES6 import mapping.

#### Before
```ts
import { authClientProvider } from "@/features/auth/infrastructure/client-provider";

export async function banUser(
```

#### After
```ts
import { authClientProvider } from "@/auth/client-provider";

export async function banUser(
```
#### Reasoning
- Rebinds action execution paths.

---

### `src/features/user-management/api/get-users.ts`
**Action:** Modify  
**Why:** DB user fetch relies on server provider interface payload.  
**Impact:** Updates ES6 import mapping.

#### Before
```ts
import { db } from "@/db";
import { authServerProvider } from "@/features/auth/infrastructure/server-provider";
import { headers } from "next/headers";
```

#### After
```ts
import { db } from "@/db";
import { authServerProvider } from "@/auth/server-provider";
import { headers } from "next/headers";
```
#### Reasoning
- Maps correctly matching DB core patterns natively adjacent.

---

### `src/app/auth/login/login-page-client.tsx`
**Action:** Modify  
**Why:** Hook into client provider for OAuth actions.  
**Impact:** Updates ES6 import mapping.

#### Before
```tsx
import LoginForm from "@/features/auth/components/login-form";
import { Card, CardContent } from "@/components/ui/card";
import { GoogleIcon, GithubIcon } from "@/components/ui/icons";
import { authClientProvider } from "@/features/auth/infrastructure/client-provider";
import { GalleryVerticalEnd } from "lucide-react";
```

#### After
```tsx
import LoginForm from "@/features/auth/components/login-form";
import { Card, CardContent } from "@/components/ui/card";
import { GoogleIcon, GithubIcon } from "@/components/ui/icons";
import { authClientProvider } from "@/auth/client-provider";
import { GalleryVerticalEnd } from "lucide-react";
```
#### Reasoning
- Rebind.

---

### `src/app/auth/register/register-page-client.tsx`
**Action:** Modify  
**Why:** Hook into client provider for OAuth sign up.  
**Impact:** Updates ES6 import mapping.

#### Before
```tsx
import { Card, CardContent } from "@/components/ui/card";
import RegisterForm from "@/features/auth/components/register-form";
import { GoogleIcon, GithubIcon } from "@/components/ui/icons";
import { authClientProvider } from "@/features/auth/infrastructure/client-provider";
import { GalleryVerticalEnd } from "lucide-react";
```

#### After
```tsx
import { Card, CardContent } from "@/components/ui/card";
import RegisterForm from "@/features/auth/components/register-form";
import { GoogleIcon, GithubIcon } from "@/components/ui/icons";
import { authClientProvider } from "@/auth/client-provider";
import { GalleryVerticalEnd } from "lucide-react";
```
#### Reasoning
- Rebind correctly matching the pattern.

---

### `src/features/auth/api/login.ts`
**Action:** Modify  
**Why:** Server actions use server-side core interfaces.  
**Impact:** Updates ES6 import mapping for both classes simultaneously.

#### Before
```ts
"use server";

import { authServerProvider } from "@/features/auth/infrastructure/server-provider";
import { AuthError } from "@/features/auth/infrastructure/types";
import { ActionResult } from "@/lib/schemas";
```

#### After
```ts
"use server";

import { authServerProvider } from "@/auth/server-provider";
import { AuthError } from "@/auth/types";
import { ActionResult } from "@/lib/schemas";
```
#### Reasoning
- Brings both definitions successfully.

---

### `src/features/auth/api/register.ts`
**Action:** Modify  
**Why:** Server actions use server-side core interfaces.  
**Impact:** Updates ES6 import mapping.

#### Before
```ts
"use server";

import { authServerProvider } from "@/features/auth/infrastructure/server-provider";
import { AuthError } from "@/features/auth/infrastructure/types";
import { ActionResult } from "@/lib/schemas";
```

#### After
```ts
"use server";

import { authServerProvider } from "@/auth/server-provider";
import { AuthError } from "@/auth/types";
import { ActionResult } from "@/lib/schemas";
```
#### Reasoning
- Final server implementation block securely connected.

## Validation Plan
1. Command execution: Move files using bash native utilities.
2. Verify: Ensure Turbo resolves without `Module not found` via `npm run build`.
3. Edge test: Start the project natively with `yarn dev` to confirm zero Next.js hot-reload crashes.

## Risk Notes
- File movement risk mitigated by explicit CLI operations retaining history prior to executing string replacements. 

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
