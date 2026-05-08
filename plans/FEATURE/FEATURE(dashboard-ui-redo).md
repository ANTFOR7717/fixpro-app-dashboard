# FEATURE(dashboard-ui-redo)

## Request
Redo the UI of the dashboard by replacing the existing quick actions with a single quick action: "Get Repair Estimate" featuring an upload icon.

## Directory Map
```text
src/
  features/
    dashboard/
      registry.ts                      (modify)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/features/dashboard/registry.ts` | Modify | Update the dashboard metadata to only include the requested "Get Repair Estimate" quick action. |

## Existing Pattern Audit
The application registers feature metadata including `quickActions` via `src/lib/registry.tsx`. The dashboard feature defines its metadata in `src/features/dashboard/registry.ts`. It uses `lucide-react` for icons. This plan modifies the existing registry configuration to align with the new requirement.

## Execution Plan
### Step 1 — Update Dashboard Quick Actions
Update `dashboardMetadata.quickActions` in the registry to expose only the "Get Repair Estimate" action with an Upload icon.

## File-by-File Changes
### `src/features/dashboard/registry.ts`

**Action:** Modify  
**Why:** Replaces the current quick actions (Create Account, Admin Panel, Help Center) with the single required action for estimates.  
**Impact:** Modifies the quick actions rendered in the dashboard overview.

#### Before
```ts
import { LayoutDashboard, Users, Shield, Mail } from "lucide-react";
import type { FeatureMetadata } from "@/lib/registry";

export const dashboardMetadata: FeatureMetadata = {
  id: "dashboard",
  name: "Dashboard",
  navigation: [
    {
      href: "/dashboard",
      label: "Overview",
      icon: LayoutDashboard,
      position: "sidebar",
    },
  ],
  quickActions: [
    { href: "/auth/register", label: "Create Account", icon: Users },
    { href: "/admin", label: "Admin Panel", icon: Shield },
    {
      href: "https://fixpro.ai",
      label: "Help Center",
      icon: Mail,
      external: true,
    },
  ],
};
```

#### After
```ts
import { LayoutDashboard, Upload } from "lucide-react";
import type { FeatureMetadata } from "@/lib/registry";

export const dashboardMetadata: FeatureMetadata = {
  id: "dashboard",
  name: "Dashboard",
  navigation: [
    {
      href: "/dashboard",
      label: "Overview",
      icon: LayoutDashboard,
      position: "sidebar",
    },
  ],
  quickActions: [
    { href: "/dashboard/estimate", label: "Get Repair Estimate", icon: Upload },
  ],
};
```

#### Reasoning
- Matches the user's specific request for a single quick action.
- Uses `Upload` from `lucide-react` to satisfy the "upload icon" requirement.
- Points to `/dashboard/estimate` as a logical route for the action.
- Follows existing project patterns for feature registration.

## Validation Plan
1. Check that the TypeScript compiler (`pnpm lint` or `tsc`) passes.
2. Verify in the running dev server that the dashboard overview renders only one quick action button: "Get Repair Estimate".
3. Click the button to ensure it attempts to navigate properly.

## Risk Notes
- Removing the "Admin Panel" and "Create Account" quick actions might affect developer workflow, but this aligns with the requested UI cleanup.
- The route `/dashboard/estimate` might not exist yet; the user may need to create it in a follow-up step.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
