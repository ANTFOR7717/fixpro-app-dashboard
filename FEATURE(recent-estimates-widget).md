# FEATURE(recent-estimates-widget)

## Request
Add a "Recent Uploads" container to the main dashboard displaying recently uploaded estimate PDFs and their processing state (currently "processing"), matching the existing modern design system and FSD architecture without hardcoding it into the core dashboard files.

## Directory Map
```text
src/
  features/
    estimate/
      components/
        recent-estimates-widget.tsx    (new)
      registry.tsx                     (modify)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/features/estimate/components/recent-estimates-widget.tsx` | Create | To encapsulate the data-fetching and UI rendering of recent estimate uploads. |
| `src/features/estimate/registry.tsx` | Modify | To expose the new widget to the global dashboard via the FSD registry architecture. |

## Existing Pattern Audit
- **Decentralized Dashboard Grid:** The `DashboardOverview` component maps over `featureRegistry.getWidgets()` to build the grid. We will inject our widget via `registry.tsx` rather than editing `DashboardOverview`.
- **Server Components & Auth:** We use `authServerProvider.getSession({ headers: await headers() })` in React Server Components to fetch scoped data from Drizzle ORM safely.
- **Styling:** The project relies heavily on `lucide-react` icons, Tailwind utilities (e.g. `text-muted-foreground`), and Shadcn components.

## Execution Plan
### Step 1 — Create the Widget Component
Create the RSC that fetches the 5 most recent uploads from Drizzle and renders them as clickable links (navigating to their detail views) in a beautiful, modern list format utilizing Shadcn badges and Lucide icons.

### Step 2 — Expose the Widget via the Registry
Update `estimateMetadata` to include the `recent-estimates` widget so the core dashboard dynamically discovers and mounts it.

## File-by-File Changes

### `src/features/estimate/components/recent-estimates-widget.tsx`
**Action:** Create  
**Why:** A dedicated feature component keeps data fetching localized to the estimate slice, adhering strictly to FSD.  
**Impact:** Fetches user-scoped rows from Drizzle and outputs a clean, interactive UI for the dashboard grid.

#### Before
```ts
File does not exist yet.
```

#### After
```tsx
import { db } from "@/db";
import { estimateRequestTable } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { authServerProvider } from "@/auth/server-provider";
import { headers } from "next/headers";
import { FileText, Loader2, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import { Badge } from "@/design-systems/shadcn/components/badge";
import { Button } from "@/design-systems/shadcn/components/button";
import Link from "next/link";

export async function RecentEstimatesWidget() {
  const session = await authServerProvider.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  const recentUploads = await db
    .select()
    .from(estimateRequestTable)
    .where(eq(estimateRequestTable.userId, session.user.id))
    .orderBy(desc(estimateRequestTable.createdAt))
    .limit(5);

  if (recentUploads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-border rounded-xl bg-muted/30">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground tracking-tight">No estimates processed</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mb-6">
          Upload your first inspection report to begin generating accurate repair estimates.
        </p>
        <Button asChild>
          <Link href="/dashboard/estimate">Upload PDF</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
      <div className="divide-y divide-border">
        {recentUploads.map((upload) => (
          <Link 
            href={`/dashboard/estimate/${upload.id}`}
            key={upload.id} 
            className="group flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-4 overflow-hidden">
              <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {upload.fileName}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {new Date(upload.createdAt).toLocaleDateString(undefined, { 
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0 pl-4">
              {upload.status === "processing" && (
                <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border-0 flex items-center gap-1.5 font-medium px-2.5 py-0.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Processing
                </Badge>
              )}
              {upload.status === "failed" && (
                <Badge variant="secondary" className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-0 flex items-center gap-1.5 font-medium px-2.5 py-0.5">
                  <XCircle className="h-3.5 w-3.5" />
                  Failed
                </Badge>
              )}
              {upload.status === "completed" && (
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-0 flex items-center gap-1.5 font-medium px-2.5 py-0.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ready
                </Badge>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-2 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

#### Reasoning
- Binds directly to the FSD data layer without polluting the global dashboard module.
- Interactive layout: Rows are actual `<Link>` components so users can click directly into the detail view. Added `ChevronRight` icon and `group-hover` transitions to signal interactivity.
- Removed inline JS utility slop.

### `src/features/estimate/registry.tsx`
**Action:** Modify  
**Why:** To seamlessly inject the new component into the dashboard overview grid.  
**Impact:** `recent-estimates` widget will appear for all authenticated users on the dashboard route.

#### Before
```tsx
import type { FeatureMetadata } from "@/lib/registry";
import { EstimateView } from "./components/estimate-view";

export const estimateMetadata: FeatureMetadata = {
  id: "estimate",
  name: "Repair Estimates",
  page: <EstimateView />,
  widgets: [],
};
```

#### After
```tsx
import type { FeatureMetadata } from "@/lib/registry";
import { EstimateView } from "./components/estimate-view";
import { RecentEstimatesWidget } from "./components/recent-estimates-widget";

export const estimateMetadata: FeatureMetadata = {
  id: "estimate",
  name: "Repair Estimates",
  page: <EstimateView />,
  widgets: [
    {
      id: "recent-estimates",
      title: "Recent Estimates",
      description: "Track the processing status of your uploaded inspection reports.",
      component: <RecentEstimatesWidget />,
      size: "lg",
    }
  ],
};
```

#### Reasoning
- Fits seamlessly into the decentralized registry. 
- Using `size: "lg"` aligns perfectly with the 12-column grid (`md:col-span-9`) giving the list enough width to avoid cramped text truncation.

## Validation Plan
1. Check the local dashboard route (`/dashboard`).
2. Confirm the widget appears inside the Grid layout with `size: "lg"`.
3. Confirm that recently uploaded PDFs appear in the list as clickable links that route to `/dashboard/estimate/[id]`.

## Risk Notes
- **Drizzle Imports:** Must ensure `desc` and `eq` are imported from `drizzle-orm` correctly.
- **Server Component Suspense:** Since this widget directly calls the DB, `DashboardOverview` must properly handle the async load if it isn't wrapped in a Suspense boundary (Next.js App Router naturally handles async components in the tree).

## Approval
Status: Awaiting explicit user approval. Do not implement yet.
