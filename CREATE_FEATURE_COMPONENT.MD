# Manual: High-Fidelity Component Feature Engineering

This technical manual details the definitive standard for implementing **Partial Feature Slices (Widgets)** within the platform's modular architecture. These modules focus on contributing atomic units of UI—specifically data-aware "Widgets"—into the Dashboard Bento Grid without requiring independent routing.

---

## 1. The Philosophy of the "Partial Slice"

In this architecture, a "Component Feature" is a unit of capability that is **discovered but not routed**. Unlike Page Features that register full views, Component Features register specialized, self-contained fragments of functionality.

### 1.1 Portability & Encapsulation
A Widget must be "Logic-Pure." It should not rely on global state from the Dashboard page. Instead, it should utilize **Server-Side Data Resolution** within its own logic boundary to ensure it can be moved from the Dashboard Overview to an Admin Panel or a User Profile with zero code changes.

---

## 2. Exhaustive Directory Anatomy

Component-centric features use a focused subset of the Feature-Sliced Design (FSD) structure.

```text
src/features/[name]/
├── api/                 # Data Resolution (Logic Boundary)
│   └── actions.ts       # Async Fetching / Server Actions
├── components/          # The Widget Implementation
│   ├── widget.tsx       # The primary entry point
│   └── ui/              # Internal atomic components
├── types/               # TypeScript Contracts
│   └── index.ts         # Data interfaces
└── registry.ts          # The Discovery Manifest (Widget Specs)
```

---

## 3. Data-Aware Metrics & Async Rendering

Modern widgets are not static. To provide a "Zero-Prop" implementation, we leverage **Async Server Components (RSC)**.

### 3.1 The Fetch-Then-Render Pattern
A widget should define its own data-fetching requirement. This prevents the parent layout from needing to know what data the widget needs.

**Example Logic Boundary**: `src/features/metrics/api/actions.ts`
```typescript
"use server";

import { db } from "@/db";
import { user } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function getActiveUserSparsity() {
  // Direct logic resolution within the feature boundary
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(user);
  
  return result.count;
}
```

**Example Presenter**: `src/features/metrics/components/sparsity-card.tsx`
```tsx
import { getActiveUserSparsity } from "../api/actions";

export async function SparsityCard() {
  // The widget resolves its own state asynchronously
  const count = await getActiveUserSparsity();

  return (
    <div className="p-4 bg-muted rounded-xl">
      <h3 className="text-sm font-medium">Platform Sparsity</h3>
      <p className="text-3xl font-bold">{count}</p>
    </div>
  );
}
```

---

## 4. The Bento Grid Orchestration Engine

The dashboard utilizes a **Bento Grid Engine** that reconciles widgets based on the `size` property defined in the `registry.ts`.

### 4.1 Grid Scaling Specifications
The size mapping translates into Tailwind CSS grid-span classes during the reconciliation phase.

| Size | Grid Dimension | Best Use Case |
|---|---|---|
| `sm` | 1x1 Units | KPIs, Indicators, Status Pills |
| `md` | 2x1 Units | Mini-charts, Recent Activities, Summary Lists |
| `lg` | 2x2 Units | Graphs, Data Tables, Map Views |
| `full` | 4x1+ Units | Large analytic dashboards, Multi-series charts |

---

## 5. Performance: Streaming & Suspense

Because widgets are rendered within the dashboard grid, they participate in Next.js **Streaming**.

### 5.1 Individual Loading States
By making the widget an Async Server Component, Next.js will automatically handle its resolution. However, to provide a "not-lazy" user experience, you should wrap heavy widgets in a **Skeleton Boundary** at the reconciliation layer.

**Rule: Skeleton Provisioning**
Every production-grade widget should provide a fallback UI. The Dashboard shell looks for an exported `Skeleton` component within the feature folder to use during data hydration.

---

## 6. Registration: The FeatureManifest Contract

The `registry.ts` manifest bridges the localized component to the platform's discovery system.

### 6.1 Manifest Definition
```typescript
import { FeatureMetadata } from "@/lib/registry";
import { SparsityCard } from "./components/sparsity-card";

export const metricsMetadata: FeatureMetadata = {
  id: "metrics-sparsity",
  name: "User Sparsity Metrics",
  widgets: [
    {
      id: "sparsity-widget-01",
      title: "Active Sparsity",
      description: "Calculated growth density",
      component: <SparsityCard />, // The Async Component
      size: "sm",
    }
  ],
};
```

---

## 7. Master Walkthrough: "Infrastructure Health" Widget

This walkthrough demonstrates the start-to-finish implementation of a logic-driven widget.

### Step 1: Logic Authorization
Create a server-side data resolver that interacts with the infrastructure.

**File**: `src/features/health/api/actions.ts`
```typescript
"use server";

import { db } from "@/db";

export async function getDetailedSystemStatus() {
  // Simulate infrastructure health check
  // In production, this might query a 'system_logs' table
  return {
    uptime: "99.98%",
    services: 12,
    latency: "4ms"
  };
}
```

### Step 2: Component Architecture (RSC)
Build the presentation layer. Use **Lucide React** for visual iconography.

**File**: `src/features/health/components/health-widget.tsx`
```tsx
import { getDetailedSystemStatus } from "../api/actions";
import { ShieldCheck, Zap, Activity } from "lucide-react";

export async function HealthWidget() {
  const status = await getDetailedSystemStatus();

  return (
    <div className="flex h-full flex-col justify-between p-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-green-500/10 rounded-lg">
            <Activity className="h-4 w-4 text-green-500" />
          </div>
          <span className="text-sm font-semibold">Service Health</span>
        </div>
        <span className="text-[10px] font-mono text-zinc-400">ID: HW-GRID</span>
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <span className="text-3xl font-bold tracking-tighter">{status.uptime}</span>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mt-1">
            Global Availability
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-4">
          <div className="space-y-1">
            <p className="text-[10px] text-zinc-400">Latency</p>
            <p className="text-xs font-bold font-mono">{status.latency}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-zinc-400">Services</p>
            <p className="text-xs font-bold font-mono">{status.services}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Step 3: Registration Binding
Bridge the implementation to the Registry singleton.

**File**: `src/features/health/registry.ts`
```typescript
import { FeatureMetadata } from "@/lib/registry";
import { HealthWidget } from "./components/health-widget";

export const healthMetadata: FeatureMetadata = {
  id: "health-monitor",
  name: "Infra Health Monitor",
  widgets: [
    {
      id: "health-main-widget",
      title: "Core Infrastructure",
      description: "Real-time service availability",
      component: <HealthWidget />,
      size: "md", // Larger size for detailed metrics
    }
  ],
};
```

### Step 4: Platform Activation
Register the feature in the global index to trigger the discovery reconciliation loop.

**File**: `src/config/features-index.ts`
```typescript
import { featureRegistry } from "@/lib/registry";
import { healthMetadata } from "@/features/health/registry";

export function registerFeatures() {
  // Existing features...
  featureRegistry.register(healthMetadata);
}
```

---

## 8. Technical Constraints & Safety

### Context-Aware Rendering
Widgets are rendered inside a `Layout` context. If your widget needs to communicate with the Sidebar or Page-level state, use a **Global Event Bus** or a **Shared React Context** defined in `@/lib/events`. Avoid direct DOM manipulation.

### Responsive Design Rule
Widgets must be fluid. Always use **CSS Grid** or **Flexbox** with `w-full` and `h-full`. The parent Bento Grid enforces the container's footprint; the widget must adapt to fill that footprint without overflow.

---

## 9. Troubleshooting

### My widget isn't showing up?
1. **Registry Singleton**: Is the manifest registered in `features-index.ts`?
2. **Component Reference**: Ensure you are passing a **React Element** (e.g., `<MyWidget />`) and not just the function reference to the `component` property.
3. **Auth Guards**: Ensure the widget logic doesn't throw and error inside the RSC; wrap it in a `try/catch` or use an **Error Boundary**.

---

## 10. Conclusion: The Modular Component Standard

Partial Feature Slices allow for the rapid injection of new capabilities into the platform with zero impact on existing routes. By following this **Logic-Pure** and **Discoverable** standard, you ensure the platform remains a robust, high-performance ecosystem for collaborative capability scaling.

[EOF]
