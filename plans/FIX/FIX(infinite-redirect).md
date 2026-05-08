# FIX(infinite-redirect)

## Request
Fix the Next.js middleware infinite redirect loop, and implement a high-quality, completely decoupled session lifecycle manager using native `BroadcastChannel` APIs without any mechanical AI slop.

## Directory Map
```text
.
├── src/
│   ├── app/
│   │   ├── auth/
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   └── dashboard/
│   │       └── client.tsx
│   ├── auth/
│   │   └── components/
│   │       └── session-lifecycle-manager.tsx
│   └── proxy.ts
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/proxy.ts` | Modify | Remove blind cookie-based redirects that cause infinite loops on stale cookies. |
| `src/app/auth/login/page.tsx` | Modify | Replace middleware logic with secure, server-side database session validation. |
| `src/auth/components/session-lifecycle-manager.tsx` | Create | Pure, decoupled cross-tab idle manager using `BroadcastChannel`. |
| `src/app/dashboard/client.tsx` | Modify | Inject the manager with explicit routing/auth callbacks to prevent coupling. |

## Existing Pattern Audit
The project relies on `better-auth`. The existing middleware (`proxy.ts`) incorrectly assumed any cookie meant a valid session. We must mirror `DashboardLayout`'s proven pattern of using `authServerProvider.getSession()` for routing decisions. The `SessionLifecycleManager` must be fully decoupled from Next.js routing and `better-auth` to maintain a strict separation of concerns.

## Execution Plan
### Step 1 — Purge Middleware Trap
Modify `src/proxy.ts` to remove the optimistic `/auth/` redirect.

### Step 2 — Secure Auth Routing
Modify `src/app/auth/login/page.tsx` to validate sessions against the DB and redirect to `/dashboard` if valid.

### Step 3 — Decoupled Session Manager
Create `src/auth/components/session-lifecycle-manager.tsx` as a pure React component that manages native DOM events and `BroadcastChannel`, but delegates actions via `onIdle` and `onSync` callbacks.

### Step 4 — Safe Client Injection
Modify `src/app/dashboard/client.tsx` to define the logout/redirect handlers and pass them to the manager, ensuring safe execution without race conditions.

## File-by-File Changes

### `src/proxy.ts`
**Action:** Modify  
**Why:** Middleware must not blindly redirect away from `/auth` based on unverified cookies.  
**Impact:** Eliminates the infinite redirect loop vulnerability.

#### Before
```ts
import { isPublicPath } from "@/lib/public-paths";
import { DEFAULT_LOGIN_REDIRECT } from "@/lib/config";
import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get authentication status for all routes
  const sessionCookie = getSessionCookie(request);

  // If user is already logged in and trying to access auth pages, redirect to dashboard
  if (sessionCookie && pathname.startsWith("/auth/")) {
    return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, request.url));
  }

  // Allow access to public paths without authentication
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // For protected paths, check authentication
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return NextResponse.next();
}

// Match all routes except for static files and Next.js internal routes
export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

#### After
```ts
import { isPublicPath } from "@/lib/public-paths";
import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get authentication status for all routes
  const sessionCookie = getSessionCookie(request);

  // Allow access to public paths without authentication
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // For protected paths, check authentication
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return NextResponse.next();
}

// Match all routes except for static files and Next.js internal routes
export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

#### Reasoning
- Prevents infinite loops caused by stale cookies by removing the optimistic redirect block.
- Removed unused `DEFAULT_LOGIN_REDIRECT` import.

### `src/app/auth/login/page.tsx`
**Action:** Modify  
**Why:** Replaces the removed middleware logic with proper validation.  
**Impact:** Safely redirects truly authenticated users to the dashboard.

#### Before
```tsx
import { LoginPageClient } from "./login-page-client";

export default function LoginPage() {
  return <LoginPageClient />;
}
```

#### After
```tsx
import { authServerProvider } from "@/auth/server-provider";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginPageClient } from "./login-page-client";

export default async function LoginPage() {
  const session = await authServerProvider.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect("/dashboard");
  }

  return <LoginPageClient />;
}
```

#### Reasoning
- Awaits database verification to ensure the session is actually alive before redirecting.

### `src/auth/components/session-lifecycle-manager.tsx`
**Action:** Create  
**Why:** Replaces polling/disk I/O slop with an elegant, perfectly decoupled architecture using native BroadcastChannel APIs.  
**Impact:** Pure UI component that handles native browser state with zero coupling to Next.js or better-auth.

#### Before
```tsx
// [NEW FILE]
```

#### After
```tsx
"use client";

import { useEffect, useRef } from "react";

export const AUTH_CHANNEL = "auth_sync_channel";

interface SessionLifecycleProps {
  timeoutMs?: number;
  onIdle: () => void;
  onSync: () => void;
}

export function SessionLifecycleManager({
  timeoutMs = 15 * 60 * 1000,
  onIdle,
  onSync,
}: SessionLifecycleProps) {
  // Use refs to maintain callback stability without re-triggering the main effect
  const onIdleRef = useRef(onIdle);
  const onSyncRef = useRef(onSync);

  useEffect(() => {
    onIdleRef.current = onIdle;
    onSyncRef.current = onSync;
  }, [onIdle, onSync]);

  useEffect(() => {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    let timeout: ReturnType<typeof setTimeout>;

    const resetIdleTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        onIdleRef.current();
      }, timeoutMs);
    };

    channel.onmessage = (e) => {
      if (e.data === "LOGOUT") onSyncRef.current();
      if (e.data === "ACTIVE") resetIdleTimer();
    };

    let lastActivity = 0;
    const handleActivity = () => {
      const now = Date.now();
      // Strict 1-second throttle for DOM events to eliminate main-thread lag
      if (now - lastActivity > 1000) {
        lastActivity = now;
        resetIdleTimer();
        channel.postMessage("ACTIVE");
      }
    };

    // Passive listeners for maximum scroll/interaction performance
    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity, { passive: true });

    resetIdleTimer();

    return () => {
      clearTimeout(timeout);
      channel.close();
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  }, [timeoutMs]);

  return null;
}

// Utility for manual logouts to use without retaining channel instances
export const broadcastLogout = () => {
  const channel = new BroadcastChannel(AUTH_CHANNEL);
  channel.postMessage("LOGOUT");
  channel.close();
};
```

#### Reasoning
- Complete elimination of `localStorage` disk reads/writes and `setInterval` polling.
- Complete separation of concerns: The component knows nothing about routing or authentication. It strictly manages DOM events and messaging.
- `useRef` prevents stale closures and removes the need for `useCallback` dependency arrays in the parent.

### `src/app/dashboard/client.tsx`
**Action:** Modify  
**Why:** Injects the manager and explicitly defines the exact business logic for idle timeouts and cross-tab syncs.  
**Impact:** Clean, explicit, and perfectly safe logouts.

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
import { SessionLifecycleManager, broadcastLogout } from "@/auth/components/session-lifecycle-manager";

export function DashboardLayoutClient({
  children,
  role,
}: {
  children: React.ReactNode;
  role: "admin" | "user";
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Manual logout from the user clicking "Logout"
  const handleLogout = async () => {
    try {
      await authClientProvider.signOut();
      broadcastLogout();
      router.push("/auth/login");
    } catch (e) {
      console.error("Manual logout failed:", e);
    }
  };

  // Idle timeout triggered by the SessionLifecycleManager
  const handleIdle = async () => {
    try {
      await authClientProvider.signOut();
    } catch (e) {
      console.error("Idle cleanup failed:", e);
    } finally {
      // Must protect local machine UX even if API fails
      broadcastLogout();
      router.push("/auth/login");
    }
  };

  // Another tab successfully logged out
  const handleSync = () => {
    router.push("/auth/login");
  };

  const navItems = featureRegistry.getNavigation(role, "sidebar");
  const footerItems = featureRegistry.getNavigation(role, "footer");

  return (
    <>
      <SessionLifecycleManager 
        onIdle={handleIdle}
        onSync={handleSync}
      />
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
- The client strictly dictates exactly what happens during `onIdle` vs `onSync`.
- Full file contents included to ensure direct copy-paste without destroying existing imports or context.

## Validation Plan
1. Clear browser cookies.
2. Log in successfully.
3. Open two tabs to `/dashboard`.
4. Click Logout in Tab A. Verify Tab B redirects instantly to `/auth/login`.
5. Navigate manually to `/auth/login` while logged in, verify it redirects to `/dashboard`.

## Risk Notes
- None.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
