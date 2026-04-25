# REFACTOR(modular-architecture)

## Request
Transform the SaaS starter into a truly modular platform where features (Auth, User Management, etc.) self-register their navigation items, dashboard widgets, and administrative actions, making implementations easily understood and adaptations trivial.

## Directory Map
```text
src/
  lib/
    registry.tsx                      (new)
  features/
    dashboard/
      components/
        layout/
          dashboard-layout.tsx        (modify)
        overview/
          dashboard-overview.tsx      (modify)
    user-management/
      registry.ts                     (new)
  config/
    features-index.ts                 (new)
  app/
    layout.tsx                        (modify)
    dashboard/[feature]/page.tsx      (new)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/lib/registry.tsx` | Create | Central type-safe API for feature contribution discovery. |
| `src/features/dashboard/.../dashboard-overview.tsx` | Modify | Generalize content to render feature-contributed widgets. |
| `src/features/user-management/registry.ts` | Create | Self-registration entry for User Management module. |
| `src/config/features-index.ts` | Create | Explicit list of active features for SSR hydration. |
| `src/app/layout.tsx` | Modify | Bootstrap the registry on app initialize. |
| `src/app/dashboard/[feature]/page.tsx` | Create | Dynamic routing layer to render registered feature pages. |

## Existing Pattern Audit
- **Config-Driven**: `dashboard-config.ts` and `admin-config.ts` already use objects to drive the UI. This refactor moves this to a many-to-one model.
- **Lucide Icon Injection**: Use the established `LucideIcon` as a component reference pattern (Violation 5 fix).
- **Zod Schemas**: Use `adminConfig.pages.users.table` patterns for feature-local configuration.
- **Next.js Server Components**: Ensure registry items are serializable or can be hydrated cleanly without client-only dependency loops.

## Execution Plan

### Step 1 — Create the Feature Registry API
Establish the contract by which features contribute to the platform.
- **Files Touched**: `src/lib/registry.tsx`.
- **Reasoning**: To allow decoupled development, we need a standard interface (Port) for features (Adapters).

### Step 2 — Generalize Dashboard Layout & Overview
Refactor core components to consume the registry instead of local config files.
- **Files Touched**: `src/features/dashboard/components/layout/dashboard-layout.tsx`, `src/features/dashboard/components/overview/dashboard-overview.tsx`.
- **Reasoning**: The platform layer shouldn't know about specific user-management or billing features.

### Step 3 — Feature Self-Registration
Refactor User Management to register itself.
- **Files Touched**: `src/features/user-management/config/feature-metadata.ts`, `src/features/user-management/config/admin-config.ts`.
- **Reasoning**: Feature folders become self-contained and "plug-and-play".

## File-by-File Changes

### `src/lib/registry.tsx`
**Action:** Create  
**Why:** Provide the singleton/container for feature discovery.  
**Impact:** Central point of truth for sidebar, dashboard widgets, and actions.

#### After
```tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface FeatureWidget {
  id: string;
  title: string;
  description?: string;
  component: ReactNode;
  size?: "sm" | "md" | "lg" | "full";
}

export interface FeatureNavigation {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  position?: "sidebar" | "navbar" | "footer";
}

export interface FeatureMetadata {
  id: string;
  name: string;
  navigation?: FeatureNavigation[];
  widgets?: FeatureWidget[];
  publicPaths?: string[]; 
  page?: ReactNode; // <-- New: Features can define a full-page view
  quickActions?: {
    href: string;
    label: string;
    icon: LucideIcon;
    external?: boolean;
  }[];
}

class Registry {
  private features: Map<string, FeatureMetadata> = new Map();

  register(metadata: FeatureMetadata) {
    this.features.set(metadata.id, metadata);
  }

  getFeature(id: string) {
    return this.features.get(id);
  }

  getPublicPaths() {
    return Array.from(this.features.values()).flatMap((f) => f.publicPaths || []);
  }

  getNavigation(
    role: "admin" | "user" = "user",
    position: "sidebar" | "navbar" | "footer" = "sidebar"
  ) {
    return Array.from(this.features.values())
      .flatMap((f) => f.navigation || [])
      .filter((n) => (n.position || "sidebar") === position)
      .filter((n) => !n.adminOnly || role === "admin");
  }

  getWidgets() {
    return Array.from(this.features.values()).flatMap((f) => f.widgets || []);
  }

  getQuickActions() {
    return Array.from(this.features.values()).flatMap((f) => f.quickActions || []);
  }
}

export const featureRegistry = new Registry();
```

### `src/config/features-index.ts`
**Action:** Create  
**Why:** The Single Source of Truth for feature activation.  
**Impact:** Controls the "Plugin" lifecycle. 

> [!NOTE]
> **Circular Dependency Guard**: This file IS the bridge. Features export metadata ONLY. This file imports that metadata and pushes it into the Registry. Features MUST NOT import the Registry or this index.

#### After
```ts
import { featureRegistry } from "@/lib/registry";
import { userManagementMetadata } from "@/features/user-management/registry";
import { authMetadata } from "@/features/auth/registry";

// Registration happens here, maintaining a unidirectional dependency flow:
// Feature Metadata -> features-index -> Registry
featureRegistry.register(authMetadata);
featureRegistry.register(userManagementMetadata);

export { featureRegistry };
```

### `src/features/dashboard/components/layout/dashboard-layout.tsx`
**Action:** Modify  
**Why:** Remove tight coupling to dashboard entries only; allow global feature injection.  
**Impact:** Sidebar items are now dynamically sourced from enabled features.

#### Before
```tsx
import { dashboardConfig } from "@/features/dashboard/config/dashboard-config";
// ... in component
<Sidebar items={dashboardConfig.nav} />
```

#### After
```tsx
import { featureRegistry } from "@/lib/registry";
// ... in component (assume server session provided)
const navItems = featureRegistry.getNavigation(session.user.role);
<Sidebar items={navItems} />
```

#### Reasoning
- Generalizes the dashboard layout.
- Decouples the sidebar from a single config file.

### `src/features/dashboard/components/overview/dashboard-overview.tsx`
**Action:** Modify  
**Why:** Transition from hardcoded sections to a widget-based grid.  
**Impact:** Home dashboard becomes a pluggable assembly of feature widgets.

#### Before
```tsx
<CardTitle>{dashboardConfig.quickActions.title}</CardTitle>
{dashboardConfig.quickActions.items.map(...)}
```

#### After
```tsx
const actions = featureRegistry.getQuickActions();
const widgets = featureRegistry.getWidgets();

<CardTitle>Quick Actions</CardTitle>
{actions.map(...)}

<div className="grid gap-4">
  {widgets.map(w => <WidgetContainer key={w.id} {...w} />)}
</div>
```

#### Reasoning
- Allows features to provide specialized data cards without modifying the dashboard domain.

### `src/app/dashboard/[feature]/page.tsx`
**Action:** Create  
**Why:** Provide the dynamic routing layer for registered feature pages.  
**Impact:** Features automatically inherit the dashboard layout/auth context.

#### After
```tsx
import { featureRegistry } from "@/config/features-index";

export default async function DynamicFeaturePage({ params }) {
  const { feature: featureId } = await params;
  const feature = featureRegistry.getFeature(featureId);

  if (!feature || !feature.page) notFound();

  return <div className="..."> {feature.page} </div>;
}
```

### `src/app/layout.tsx`
**Action:** Modify  
**Why:** Ensure registry is populated before any child component accesses it.  
**Impact:** Global registration logic is bundled once at the root.

#### After
```tsx
import "@/config/features-index";
// ... rest of file
```

#### Reasoning
- Single point of entry for feature bootstrapping.

## Validation Plan
1. **Nav Consistency**: Verify `dashboard-layout.tsx` renders icons from the registry.
2. **Access Control**: Log in as a non-admin and verify Registry-contributed admin items are hidden.
3. **Pluggability**: Creating a new feature folder and adding it to `features-index.ts` should update the dashboard automatically.

## Risk Notes
- **Cold Boot/Hydration**: Registry must be a singleton initialized once. In Next.js SSR, we must ensure it's predictable during hydration.
- **Circular Imports**: Features must not import from `features-index.ts`; they must only export their own metadata.

## Feature Design Standard (The "Correct" way)

Follow this 5-step workflow to add any new functionality to the platform:

### 1. Create the Feature Directory
All logic must be contained in `src/features/[feature-name]`.
```text
src/features/[feature-name]/
  components/    (UI components)
  hooks/         (Business logic)
  registry.tsx   (The Export Port)
```

### 2. Define High-Value Widgets
Ensure your widgets use the `FeatureWidget` interface. 
- Use `size: "md"` (6 columns) for charts/activity.
- Use `size: "sm"` (3 columns) for stat counters.
- Use `size: "full"` (12 columns) for tables.

### 3. Implement Lazy Loading (Crucial)
To keep the dashboard fast, always wrap your feature components in `dynamic()` before registering them:
```tsx
import dynamic from 'next/dynamic';
const MyLargeWidget = dynamic(() => import('./components/Widget'), { 
  loading: () => <Skeleton className="h-full w-full" /> 
});
```

### 4. Create the Registry Port
Export a `FeatureMetadata` object highlighting navigation, widgets, and your main page.
```tsx
export const myFeatureMetadata: FeatureMetadata = {
  id: "my-feature",
  name: "My Feature",
  navigation: [{ href: "/dashboard/my-feature", label: "My Feature", icon: Sparkles }],
  page: <MyFeaturePage />, // Lazy loaded
  widgets: [{ id: "stats", title: "Stats", component: <MyStats />, size: "sm" }]
};
```

### 5. Final Activation
Import your metadata into `src/config/features-index.ts` and call `featureRegistry.register()`.

---
Status: **Architectural Specification Finalized.**
