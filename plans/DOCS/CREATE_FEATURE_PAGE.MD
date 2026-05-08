# Manual: Comprehensive Domain Feature Engineering

This technical manual details the definitive, production-grade standard for implementing a **Full Domain Feature Slice** within the platform's modular architecture. This system leverages **Feature-Sliced Design (FSD)**, **Hexagonal Ports & Adapters**, and the **Database Aggregation Pattern** to achieve absolute domain isolation and near-infinite scalability.

---

## 1. Architectural Vision & Domain Isolation

The platform is designed to be a "capability aggregator." Instead of a monolithic application where features are tightly coupled to the routing and layout layers, this architecture treats every domain capability as an autonomous unit.

### 1.1 The "Blind Shell" Principle
The platform shell (sidebars, navbars, dashboard grid) has **zero knowledge** of the features it hosts. It operates as a "Blind Shell" that queries a central discovery registry at boot time. This ensures that features can be added, removed, or refactored with zero impact on the core infrastructure.

### 1.2 Domain Boundary Enforcement
Each feature is localized within `src/features/[feature-name]/`. To prevent "Leaky Abstractions," strict boundary rules are enforced:
- **Unidirectional Imports**: Features may import from `@/lib`, `@/db`, and `@/auth`, but the core platform or other features must never import a feature's internal components directly unless they are exposed via the `registry.ts`.
- **Port-Based Auth**: Features never import the `better-auth` SDK. They interact only with the `IAuthServerAdapter` and `IAuthClientAdapter` ports provided by the auth layer.

---

## 2. Exhaustive Directory Anatomy

A production-grade feature slice requires a robust sub-directory structure to manage the separation of concerns.

```text
src/features/[name]/
├── api/                 # Logic Boundary (Server Actions)
│   ├── index.ts         # Exported public API
│   ├── actions.ts       # Mutative operations
│   └── queries.ts       # Read-only data resolution
├── components/          # Presentation Layer (UI)
│   ├── [name]-view.tsx  # The "Page Controller"
│   └── ui/              # Feature-specific atomic primitives
├── db/                  # Persistence Layer (The Aggregation Pattern)
│   ├── schema.ts        # Local table definitions
│   └── relations.ts     # Internal data relationships
├── hooks/               # State & React Lifecycle
│   └── use-[name].ts    # Local reactive logic
├── schemas/             # Structural Contracts (Zod)
│   └── validation.ts    # Input/Output sanitization
├── types/               # Type Definitions
│   └── index.ts         # Domain interfaces
├── utils/               # Domain Logic Helpers
│   └── formatters.ts    # Specialized calculations
└── registry.ts          # The Discovery Manifest (Platform Glue)
```

---

## 3. Persistence: The Decentralized Aggregation Pattern

The most critical challenge in modular architecture is database schema management. Traditionally, a central `schema.ts` becomes a bottleneck and a source of merge conflicts. This platform uses **Decentralized Aggregation**.

### 3.1 Local Schema Ownership
A feature owns its data model. In `src/features/[name]/db/schema.ts`, you define your tables as standard Drizzle PG tables.

**Rule: Namespacing Protocol**
Because PostgreSQL table names are global, you **must** prefix every table with the feature ID to prevent collisions during aggregation.
- **Incorrect**: `pgTable("orders", ...)`
- **Correct**: `pgTable("e_commerce_orders", ...)`

### 3.2 The Aggregating Registry
To bridge local schemas into the global migration pipeline, the central `src/db/schema.ts` acts as a collector.

```typescript
// src/db/schema.ts
// ... Core Platform Tables
// Aggregation Point for Modular Features
export * from "@/features/user-management/db/schema";
export * from "@/features/analytics/db/schema";
export * from "@/features/your-new-feature/db/schema";
```

### 3.3 Migration Orchestration
Drizzle Kit tracks the central aggregator. When you run `pnpm db:generate`, the engine follows the imports into your feature slice and calculates the diff.
1. Author local `db/schema.ts`.
2. Add export to `src/db/schema.ts`.
3. Run `pnpm db:generate`.
4. Run `pnpm db:migrate`.

---

## 4. Logic Boundary: Server Actions & API Access

The logic layer exists in the `api/` directory. By using Next.js **Server Actions**, we avoid the overhead of REST/Route-handling and maintain type-safety across the network boundary.

### 4.1 Session-Guarded Data Operations
Features never trust the client. Every action must verify identity via the `authServer` adapter.

```typescript
"use server";

import { db } from "@/db";
import { authServer } from "@/auth/server-provider";
import { featureTable } from "../db/schema";

export async function submitFeatureData(payload: z.infer<typeof schema>) {
  // 1. Resolve Identity via Port
  const session = await authServer.getSession();
  if (!session?.user) throw new Error("UNAUTHORIZED_ACCESS_DENIED");
  
  // 2. Perform persistence via aggregated DB instance
  const [result] = await db
    .insert(featureTable)
    .values({
      userId: session.user.id,
      ...payload,
    })
    .returning();
    
  return result;
}
```

---

## 5. Discovery & Platform Integration (registry.ts)

The `registry.ts` file is the **Manifest of Record**. It tells the platform how to render the feature and where to put its navigation nodes.

### 5.1 The FeatureMetadata Contract
The manifest must implement the `FeatureMetadata` interface from `@/lib/registry`.

| Field | Requirement | Impact |
|---|---|---|
| `id` | Unique String | Defines the dynamic route (`/dashboard/id`). |
| `name` | String | Used for breadcrumbs and labels. |
| `navigation` | Array | Injects links into Sidebar, Navbar, or Footer. |
| `widgets` | Array | Injects cards into the Dashboard Overview grid. |
| `page` | ReactNode | The root component rendered at the dynamic route. |
| `publicPaths` | Array | Whitelists URLs to bypass auth middleware. |

---

## 6. Conflict Mitigation & Safety Rules

As the project scales to hundreds of features, the following safety protocols are mandatory:

### 6.1 Circular Dependency Guarding
Feature A must never import from Feature B if Feature B also imports from Feature A.
- **The Aggregator Rule**: If Feature A needs a relationship with Feature B, the `relations()` object for Drizzle **must** be defined in the central `src/db/schema.ts` (the aggregator layer), not inside the specific feature's schema. This breaks the cycle.

### 6.2 Export Aliasing
If a feature utilizes a generic constant name (e.g., `schema`), it must use **Named Exports** during aggregation to avoid shadowing.
- **Correct**: `export { feedbackSchema as schema } from "./..."`

---

## 7. Master Walkthrough: "Feedback Portal" (Start-to-Finish)

This section provides an exhaustive, 1-to-1 implementation of a functional domain feature.

### Step 1: Local Data Architecture
Define the persistence model with strict foreign key constraints.

**File**: `src/features/feedback/db/schema.ts`
```typescript
import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { user } from "@/db/schema"; 

// Prefix ensures no collision with global tables
export const feedbackTable = pgTable("feedback_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  isResolved: boolean("is_resolved").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### Step 2: Global Aggregation
Bridge the table to the migration engine.

**File**: `src/db/schema.ts`
```typescript
// ... existing core exports
export * from "@/features/feedback/db/schema"; // <-- Manual Injection
```

### Step 3: Migration Execution
Update the infrastructure.

**Shell**:
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

### Step 4: Logic Implementation (The API Layer)
Author an authenticated server action.

**File**: `src/features/feedback/api/actions.ts`
```typescript
"use server";

import { db } from "@/db"; 
import { feedbackTable } from "../db/schema";
import { authServer } from "@/auth/server-provider";
import { revalidatePath } from "next/cache";

export async function submitFeedbackAction(formData: FormData) {
  const session = await authServer.getSession();
  if (!session?.user) throw new Error("UNAUTHORIZED");

  const subject = formData.get("subject") as string;
  const content = formData.get("content") as string;

  await db.insert(feedbackTable).values({
    userId: session.user.id,
    subject,
    content,
  });

  revalidatePath("/dashboard/feedback");
  return { success: true };
}
```

### Step 5: Presentation Implementation (The Page Controller)
Author the domain view.

**File**: `src/features/feedback/components/feedback-view.tsx`
```tsx
"use client";

import { submitFeedbackAction } from "../api/actions";
import { MessageCircle } from "lucide-react";

export function FeedbackView() {
  return (
    <div className="max-w-2xl space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          Domain Feedback
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          This feature slice owns its logic and data boundary.
        </p>
      </div>

      <form action={submitFeedbackAction} className="grid gap-6 p-1 bg-zinc-50 dark:bg-zinc-900 rounded-2xl">
        <div className="space-y-4 p-6 bg-white dark:bg-black rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <input 
            name="subject" 
            placeholder="Feedback Subject"
            className="w-full bg-transparent border-none focus:ring-0 text-lg font-medium"
            required
          />
          <div className="h-px bg-zinc-100 dark:bg-zinc-900" />
          <textarea 
            name="content" 
            placeholder="What technical gaps should we address?"
            className="w-full bg-transparent border-none focus:ring-0 min-h-[120px] resize-none"
            required
          />
        </div>
        <button 
          type="submit"
          className="bg-zinc-900 text-white dark:bg-white dark:text-black h-12 rounded-xl font-semibold hover:opacity-90 transition-opacity"
        >
          Dispatch to Registry
        </button>
      </form>
    </div>
  );
}
```

### Step 6: Platform Activation (Discovery Binding)
Connect the fully implementation feature to the platform activator.

**File**: `src/features/feedback/registry.ts`
```typescript
import { FeatureMetadata } from "@/lib/registry";
import { MessageCircle } from "lucide-react";
import { FeedbackView } from "./components/feedback-view";

export const feedbackMetadata: FeatureMetadata = {
  id: "feedback",
  name: "Platform Feedback",
  navigation: [
    {
      href: "/dashboard/feedback",
      label: "Support Feedback",
      icon: MessageCircle,
      position: "sidebar",
    }
  ],
  page: <FeedbackView />,
};
```

---

## 8. Technical Constraints & Troubleshooting

### Why is my new route 404?
1. **Activator Check**: Ensure `src/config/features-index.ts` has a `featureRegistry.register(metadata)` call.
2. **Metadata ID**: Ensure the `id` field in `registry.ts` matches the expected URL segment.
3. **Build Error**: Next.js App Router requires `page.tsx`. This is handled by a dynamic segment: `src/app/dashboard/[feature]/page.tsx`. If it is missing, the router fails.

### Drizzle Relation Errors?
1. **Aggregation Order**: Ensure the base table is exported **before** the relations object in the central aggregator.
2. **Namespacing**: Triple-check that your table names in `pgTable()` are prefixed with the feature ID.

---

## 9. Conclusion: The High-Fidelity Standard

Creating a feature page in this platform is a structured, disciplined engineering exercise. By adhering to the **Registration Manifest** and the **Aggregation Pattern**, you ensure that the project remains modular, testable, and production-ready at any scale.

[EOF]
