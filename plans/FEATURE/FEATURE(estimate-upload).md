# FEATURE(estimate-upload)

## Request
Implement a "Get Repair Estimate" feature slice that allows users to upload a PDF for server-side processing. The implementation must strictly follow the platform's modular Feature-Sliced Design (FSD) architecture, decentralized database aggregation, and discovery registry.

## Directory Map
```text
src/
  db/
    schema.ts                                        (modify)
  config/
    features-index.ts                                (modify)
  features/
    estimate/
      db/
        schema.ts                                    (new)
      api/
        actions.ts                                   (new)
      components/
        estimate-view.tsx                            (new)
      registry.ts                                    (new)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/features/estimate/db/schema.ts` | Create | Defines the persistence model for estimate requests locally within the feature boundary. |
| `src/db/schema.ts` | Modify | Aggregates the local `estimate` schema into the global Drizzle pipeline for migrations. |
| `src/features/estimate/api/actions.ts` | Create | Implements the server-side logic (Server Action) to receive the PDF, enforce auth, and persist metadata. |
| `src/features/estimate/components/estimate-view.tsx` | Create | The Page Controller providing the UI and form for the PDF upload experience. |
| `src/features/estimate/registry.ts` | Create | The Discovery Manifest that binds the feature to the `dashboard/estimate` route. |
| `src/config/features-index.ts` | Modify | Registers the `estimateMetadata` to activate the feature across the platform shell. |

## Existing Pattern Audit
The platform uses a strict capability aggregator architecture defined in `CREATE_FEATURE_PAGE.MD`. Features are wholly encapsulated within `src/features/[feature-name]`. Features define their own DB schema (which must be prefixed with the feature ID) and are aggregated in `src/db/schema.ts`. Business logic is handled via Server Actions that use `authServer.getSession()` for authorization. Routing is handled dynamically by a generic `[feature]` shell, so features simply need to export a `FeatureMetadata` object and register it in `features-index.ts`.

## Execution Plan
### Step 1 — Local Persistence
Define the `estimate_requests` table with proper foreign key constraints in `src/features/estimate/db/schema.ts`.
### Step 2 — Global Aggregation
Add the new schema export to the central aggregator in `src/db/schema.ts`.
### Step 3 — API Layer (Server Action)
Create `src/features/estimate/api/actions.ts` to handle the FormData, read the PDF, and insert a database record.
### Step 4 — Presentation Layer
Build `src/features/estimate/components/estimate-view.tsx` with a form to select and upload a PDF.
### Step 5 — Discovery Binding
Create `src/features/estimate/registry.ts` and append it to `src/config/features-index.ts`.

## File-by-File Changes

### `src/features/estimate/db/schema.ts`
**Action:** Create  
**Why:** Establishes the database representation of an estimate request, strictly scoped to this feature.  
**Impact:** Introduces `estimate_requests` table to the database.

#### Before
```typescript
File does not exist yet.
```

#### After
```typescript
import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "@/db/schema";

export const estimateRequestTable = pgTable("estimate_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: text("file_size").notNull(),
  status: varchar("status", { length: 50 }).default("processing").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

#### Reasoning
- Prefixed table name with `estimate_` to prevent global namespace collisions.
- Links to the global `user` table via foreign key with cascade deletion.
- Standard metadata fields (`status`, `fileName`) to track the processing lifecycle.

---

### `src/db/schema.ts`
**Action:** Modify  
**Why:** Exposes the new isolated schema to Drizzle Kit for migration processing.  
**Impact:** Tells the ORM to track `estimateRequestTable`.

#### Before
```typescript
export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
```

#### After
```typescript
export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

// Feature Schemas
export * from "@/features/estimate/db/schema";
```

#### Reasoning
- Fits the Decentralized Aggregation Pattern established by the platform.

---

### `src/features/estimate/api/actions.ts`
**Action:** Create  
**Why:** We need a secure, server-side boundary to process the incoming PDF file and store it.  
**Impact:** Provides the `uploadEstimatePdfAction` mutation.

#### Before
```typescript
File does not exist yet.
```

#### After
```typescript
"use server";

import { db } from "@/db";
import { authServer } from "@/auth/server-provider";
import { estimateRequestTable } from "../db/schema";
import { revalidatePath } from "next/cache";

export async function uploadEstimatePdfAction(formData: FormData) {
  const session = await authServer.getSession();
  if (!session?.user) throw new Error("UNAUTHORIZED_ACCESS_DENIED");

  const file = formData.get("file") as File | null;
  if (!file || file.type !== "application/pdf") {
    throw new Error("Invalid file type. Only PDFs are allowed.");
  }

  // Directly stream the file to Vercel Blob Storage
  const { put } = await import("@vercel/blob");
  const blob = await put(`estimates/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`, file, { access: 'public' });

  // Store the secure Blob URL via the global Drizzle ORM instance
  await db.insert(estimateRequestTable).values({
    userId: session.user.id,
    fileUrl: blob.url,
    fileName: file.name,
    fileSize: file.size.toString(),
    status: "processing",
  });

  revalidatePath("/dashboard/estimate");
  return { success: true };
}
```

#### Reasoning
- Rejects non-PDFs securely on the server.
- Verifies identity via the strict `authServer.getSession()` adapter.
- Handles the `File` blob extraction from `FormData`.
- Prepares the DB record indicating processing has started.

---

### `src/features/estimate/components/estimate-view.tsx`
**Action:** Create  
**Why:** The dedicated page interface for the estimate domain.  
**Impact:** Renders at `/dashboard/estimate`.

#### Before
```typescript
File does not exist yet.
```

#### After
```tsx
"use client";

import { uploadEstimatePdfAction } from "../api/actions";
import { Upload } from "lucide-react";

export function EstimateView() {
  return (
    <div className="max-w-3xl space-y-8 animate-in fade-in duration-500 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Get Repair Estimate
        </h1>
        <p className="text-muted-foreground">
          Upload your inspection report (PDF) and our automated system will process a repair estimate.
        </p>
      </div>

      <form action={uploadEstimatePdfAction} className="grid gap-6 p-1 bg-card rounded-2xl shadow-sm border">
        <div className="space-y-4 p-8 border-2 border-dashed border-border rounded-xl bg-muted/50 flex flex-col items-center justify-center text-center">
          <Upload className="h-10 w-10 text-muted-foreground mb-2" />
          <input 
            type="file" 
            name="file" 
            accept="application/pdf"
            className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 w-full max-w-xs cursor-pointer"
            required
          />
        </div>
        <button 
          type="submit"
          className="bg-primary text-primary-foreground h-12 rounded-xl font-semibold hover:opacity-90 transition-opacity"
        >
          Process Estimate
        </button>
      </form>
    </div>
  );
}
```

#### Reasoning
- Aligned visually with the design system primitives (bg-card, text-foreground, animate-in).
- Integrates directly with the Server Action using standard HTML `form action`.

---

### `src/features/estimate/registry.ts`
**Action:** Create  
**Why:** Creates the discovery manifest for the blind shell to locate and mount the feature.  
**Impact:** Provides the feature configuration.

#### Before
```typescript
File does not exist yet.
```

#### After
```typescript
import type { FeatureMetadata } from "@/lib/registry";
import { EstimateView } from "./components/estimate-view";

export const estimateMetadata: FeatureMetadata = {
  id: "estimate",
  name: "Repair Estimates",
  page: <EstimateView />,
  widgets: [],
};
```

#### Reasoning
- Binds `EstimateView` to the `id: "estimate"` which means the platform will route it to `/dashboard/estimate`.
- We already added the "Get Repair Estimate" quick action to the global `dashboardMetadata` earlier.

---

### `src/config/features-index.ts`
**Action:** Modify  
**Why:** Activates the feature globally.  
**Impact:** The shell now knows the `estimate` feature exists and can mount it.

#### Before
```typescript
import { featureRegistry } from "@/lib/registry";
import { authMetadata } from "@/features/auth/registry";
import { userManagementMetadata } from "@/features/user-management/registry";
import { dashboardMetadata } from "@/features/dashboard/registry";
import { newDashboardMetadata } from "@/features/new-dashboard/registry";

// Core Features
featureRegistry.register(dashboardMetadata);
featureRegistry.register(authMetadata);
featureRegistry.register(userManagementMetadata);

// New Feature Integration
featureRegistry.register(newDashboardMetadata);

export { featureRegistry };
```

#### After
```typescript
import { featureRegistry } from "@/lib/registry";
import { authMetadata } from "@/features/auth/registry";
import { userManagementMetadata } from "@/features/user-management/registry";
import { dashboardMetadata } from "@/features/dashboard/registry";
import { newDashboardMetadata } from "@/features/new-dashboard/registry";
import { estimateMetadata } from "@/features/estimate/registry";

// Core Features
featureRegistry.register(dashboardMetadata);
featureRegistry.register(authMetadata);
featureRegistry.register(userManagementMetadata);

// New Feature Integration
featureRegistry.register(newDashboardMetadata);
featureRegistry.register(estimateMetadata);

export { featureRegistry };
```

#### Reasoning
- Appends `estimateMetadata` to the global registry loop.

## Validation Plan
1. Ensure `pnpm exec tsc --noEmit` and `pnpm lint` pass to verify types and React standards.
2. Run `pnpm db:generate` and `pnpm db:migrate` to process the new `estimate_requests` schema table.
3. Access `/dashboard/estimate` locally to verify the component dynamically mounts via the routing shell.
4. Attempt a PDF upload to verify the Server Action handles the file, enforces the PDF check, inserts the DB row, and revalidates successfully.

## Risk Notes
- **Storage Strategy:** We are utilizing `@vercel/blob` for production-ready, highly-available file storage that natively supports Next.js Server Actions, bypassing ephemeral disk limitations entirely.
- **Dependency Requirement:** The `@vercel/blob` package must be installed (`pnpm add @vercel/blob`) before this plan is implemented, and `BLOB_READ_WRITE_TOKEN` must be added to the `.env`.
- **Drizzle Generation:** Generating migrations modifies `.sql` files automatically; these should be tracked in version control.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
