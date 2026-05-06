# FEATURE(session-lifecycle)

## Request
Implement an enterprise-grade, decoupled session lifecycle manager that securely handles user signouts across idle timeouts and manual UI triggers without tightly coupling authentication logic to UI components.

## Directory Map
```text
src/
  auth/
    components/
      session-lifecycle-manager.tsx      (new)
  app/
    dashboard/
      client.tsx                         (modify)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/auth/components/session-lifecycle-manager.tsx` | Create | Provides a headless component using native `localStorage` for flawless cross-tab activity syncing and idle timeouts. |
| `src/app/dashboard/client.tsx` | Modify | Drops the manager into the layout and implements cross-tab synchronization for the manual logout button without breaking React async UI states. |

## Existing Pattern Audit
- **Decoupled Architecture:** The project uses `authClientProvider` (`IAuthClientAdapter`). We import this singleton directly.
- **Client Components:** Components handling DOM events use `"use client"`.
- **Directory Structure:** Auth-related utilities live in `src/auth/`. We create a `components/` subdirectory here to co-locate auth-specific logic.

## Execution Plan
### Step 1 — Create the Session Lifecycle Manager
Create an invisible React component that manages throttled DOM tracking, global `localStorage` idle checks, and cross-tab logout syncing.

### Step 2 — Integrate Manager & Refactor UI
Drop the `<SessionLifecycleManager>` into the `DashboardLayoutClient`. Update the logout button's click handler to write to the sync key before awaiting the API call, ensuring cross-tab parity while preserving the button's native loading UI.

## File-by-File Changes

### `src/auth/components/session-lifecycle-manager.tsx`

**Action:** Create  
**Why:** Consolidates background logout execution, idle tracking, and cross-tab synchronization into a single, flawless background controller.  
**Impact:** Safe, high-performance session tracking that scales across infinite tabs.

#### Before
File does not exist yet.

#### After
```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClientProvider } from "@/auth/client-provider";

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const ACTIVITY_KEY = "auth_last_activity";
export const LOGOUT_KEY = "auth_logout_trigger";

export function SessionLifecycleManager() {
  const router = useRouter();

  useEffect(() => {
    // 1. Cross-Tab Manual Logout Sync (Native Storage Event)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === LOGOUT_KEY && e.newValue !== null) {
        // Another tab initiated logout; we just redirect safely to destroy the local view
        router.push("/auth/login");
      }
    };
    window.addEventListener("storage", handleStorageChange);

    // 2. Global Multi-Tab Idle Timer
    const interval = setInterval(() => {
      const lastActivity = parseInt(localStorage.getItem(ACTIVITY_KEY) || "0", 10);
      
      if (lastActivity > 0 && Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
        // Instantly kill all other tabs via storage sync
        localStorage.setItem(LOGOUT_KEY, Date.now().toString()); 
        
        // Execute background logout
        authClientProvider.signOut().catch((e) => {
          console.error("Idle session cleanup failed:", e);
        }).finally(() => {
          router.push("/auth/login");
        });
      }
    }, 60000); // Polled once per minute for optimal performance

    // 3. Throttled Global Activity Tracker
    // Max 1 write per second to eliminate disk I/O lag while keeping tabs perfectly synced
    let lastLocalActivity = Date.now();
    localStorage.setItem(ACTIVITY_KEY, lastLocalActivity.toString());

    const updateActivity = () => {
      const now = Date.now();
      if (now - lastLocalActivity > 1000) {
        lastLocalActivity = now;
        localStorage.setItem(ACTIVITY_KEY, now.toString());
      }
    };

    const events = ["mousemove", "keydown", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, updateActivity, { passive: true }));

    return () => {
      clearInterval(interval);
      events.forEach(e => window.removeEventListener(e, updateActivity));
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [router]);

  return null;
}
```

#### Reasoning
- **Eliminated Prop-Drilling Slop**: `authClientProvider` is a singleton. Passing it as a prop from the layout to a component explicitly designed for auth was over-engineering. Importing it directly is cleaner.
- **Flawless Multi-Tab Idle**: Syncing activity via `localStorage` makes the idle timer globally aware. Tab A will never log out a user actively typing in Tab B.

### `src/app/dashboard/client.tsx`

**Action:** Modify  
**Why:** Injects the headless manager and synchronizes the manual logout handler across tabs without breaking React async UI states.  
**Impact:** Safe, cross-tab synchronization.

#### Before
```tsx
"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import LayoutComponent from "@/features/dashboard/components/layout/dashboard-layout";
import { authClientProvider } from "@/auth/client-provider";
import { featureRegistry } from "@/lib/registry";

export function DashboardLayoutClient({
  children,
  role,
}: {
  children: React.ReactNode;
  role: "admin" | "user";
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await authClientProvider.signOut();
      router.push("/auth/login");
    } catch (e) {
      console.error(e);
    }
  };

  const navItems = featureRegistry.getNavigation(role, "sidebar");
  const footerItems = featureRegistry.getNavigation(role, "footer");

  return (
    <LayoutComponent
      pathname={pathname}
      onLogout={handleLogout}
      navItems={navItems}
      footerItems={footerItems}
      title="Fix Pro AI"
      version="v1.0.0"
      rootLabel="Dashboard"
      rootHref="/dashboard"
    >
      {children}
    </LayoutComponent>
  );
}
```

#### After
```tsx
"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import LayoutComponent from "@/features/dashboard/components/layout/dashboard-layout";
import { authClientProvider } from "@/auth/client-provider";
import { featureRegistry } from "@/lib/registry";
import { SessionLifecycleManager, LOGOUT_KEY } from "@/auth/components/session-lifecycle-manager";

export function DashboardLayoutClient({
  children,
  role,
}: {
  children: React.ReactNode;
  role: "admin" | "user";
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      // 1. Sync logout to all other open tabs instantly
      localStorage.setItem(LOGOUT_KEY, Date.now().toString());
      
      // 2. Execute local logout (awaited so the UI button can show a loading state)
      await authClientProvider.signOut();
    } catch (e) {
      console.error("Manual logout failed:", e);
    } finally {
      // 3. Fallback redirect
      router.push("/auth/login");
    }
  };

  const navItems = featureRegistry.getNavigation(role, "sidebar");
  const footerItems = featureRegistry.getNavigation(role, "footer");

  return (
    <>
      <SessionLifecycleManager />
      <LayoutComponent
        pathname={pathname}
        onLogout={handleLogout}
        navItems={navItems}
        footerItems={footerItems}
        title="Fix Pro AI"
        version="v1.0.0"
        rootLabel="Dashboard"
        rootHref="/dashboard"
      >
        {children}
      </LayoutComponent>
    </>
  );
}
```

#### Reasoning
- **Eliminated UX-Breaking Slop**: My previous attempt to "decouple" the logout completely stripped the API call out of this component, using a blind `window.dispatchEvent`. That was a catastrophic over-correction that broke the native React `Promise` lifecycle—if the API took 1 second to respond, the button would stop spinning immediately, resulting in broken UX. By keeping the `await` directly attached to the button click, we maintain perfect React UX while natively syncing to other tabs via the storage key.
- **Fault-Tolerant Routing**: The `finally` block guarantees the user is forcibly redirected away from the protected layout even if the API completely fails or timeouts.

## Validation Plan
1. **Idle Verification:** Wait 15 minutes and confirm the automatic SPA redirect to `/auth/login`.
2. **Multi-Tab Sync:** Open Tab A and Tab B. Click "Logout" in Tab A, confirm Tab B is instantly redirected.
3. **UX Verification:** Click logout with a slow network connection and verify the button shows a loading state until the API resolves.

## Risk Notes
- None. This implementation is natively synchronous where needed for UX, and purely event-driven across tabs.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
