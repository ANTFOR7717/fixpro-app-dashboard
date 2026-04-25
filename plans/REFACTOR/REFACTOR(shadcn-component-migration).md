# REFACTOR(shadcn-component-migration)

## Request
Migrate all React/Tailwind components from `src/components/ui/` into the new `src/design-systems/shadcn/components/` path and update all absolute import paths (`@/components/ui/*`) across the entire repository. This enforces total design system accountability and empties the generic unstructured `src/components/` folder.

## Directory Map

```text
src/
  components/
    ui/                                                (delete dir)
      alert-dialog.tsx                               (delete)
      avatar.tsx                                     (delete)
      badge.tsx                                      (delete)
      breadcrumb.tsx                                 (delete)
      button.tsx                                     (delete)
      card.tsx                                       (delete)
      confirmation-dialog.tsx                        (delete)
      dropdown-menu.tsx                              (delete)
      form-messages.tsx                              (delete)
      form.tsx                                       (delete)
      icons.tsx                                      (delete)
      input.tsx                                      (delete)
      label.tsx                                      (delete)
      pagination.tsx                                 (delete)
      select.tsx                                     (delete)
      separator.tsx                                  (delete)
      sheet.tsx                                      (delete)
      sidebar.tsx                                    (delete)
      skeleton.tsx                                   (delete)
      switch.tsx                                     (delete)
      table.tsx                                      (delete)
      textarea.tsx                                   (delete)
      tooltip.tsx                                    (delete)
  design-systems/
    shadcn/
      components/                                      (new dir)
        alert-dialog.tsx                             (new/move)
        avatar.tsx                                   (new/move)
        badge.tsx                                    (new/move)
        breadcrumb.tsx                               (new/move)
        button.tsx                                   (new/move)
        card.tsx                                     (new/move)
        confirmation-dialog.tsx                      (new/move)
        dropdown-menu.tsx                            (new/move)
        form-messages.tsx                            (new/move)
        form.tsx                                     (new/move)
        icons.tsx                                    (new/move)
        input.tsx                                    (new/move)
        label.tsx                                    (new/move)
        pagination.tsx                               (new/move)
        select.tsx                                   (new/move)
        separator.tsx                                (new/move)
        sheet.tsx                                    (new/move)
        sidebar.tsx                                  (new/move)
        skeleton.tsx                                 (new/move)
        switch.tsx                                   (new/move)
        table.tsx                                    (new/move)
        textarea.tsx                                 (new/move)
        tooltip.tsx                                  (new/move)
src/
  app/
    auth/
      login/
        login-page-client.tsx                      (modify)
src/
  app/
    auth/
      register/
        register-page-client.tsx                   (modify)
src/
  features/
    auth/
      components/
        login-form.tsx                             (modify)
        password-input.tsx                         (modify)
        register-form.tsx                          (modify)
src/
  features/
    dashboard/
      components/
        layout/
          dashboard-layout.tsx                     (modify)
          dashboard-sidebar.tsx                    (modify)
src/
  features/
    dashboard/
      components/
        overview/
          dashboard-overview.tsx                   (modify)
src/
  features/
    marketing/
      components/
        animated-hero.tsx                          (modify)
        features-grid.tsx                          (modify)
        navbar.tsx                                 (modify)
        tech-stack.tsx                             (modify)
src/
  features/
    user-management/
      components/
        dialogs/
          user-add-dialog.tsx                      (modify)
          user-ban-dialog.tsx                      (modify)
          user-delete-dialog.tsx                   (modify)
          user-revoke-sessions-dialog.tsx          (modify)
          user-role-dialog.tsx                     (modify)
          user-unban-dialog.tsx                    (modify)
src/
  features/
    user-management/
      components/
        table/
          user-actions.tsx                         (modify)
          users-table-pagination.tsx               (modify)
          users-table-skeleton.tsx                 (modify)
          users-table-toolbar.tsx                  (modify)
          users-table.tsx                          (modify)
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `src/components/ui/alert-dialog.tsx` | Move to `src/design-systems/shadcn/components/alert-dialog.tsx` | Core migration requirement | 
| `src/components/ui/avatar.tsx` | Move to `src/design-systems/shadcn/components/avatar.tsx` | Core migration requirement | 
| `src/components/ui/badge.tsx` | Move to `src/design-systems/shadcn/components/badge.tsx` | Core migration requirement | 
| `src/components/ui/breadcrumb.tsx` | Move to `src/design-systems/shadcn/components/breadcrumb.tsx` | Core migration requirement | 
| `src/components/ui/button.tsx` | Move to `src/design-systems/shadcn/components/button.tsx` | Core migration requirement | 
| `src/components/ui/card.tsx` | Move to `src/design-systems/shadcn/components/card.tsx` | Core migration requirement | 
| `src/components/ui/confirmation-dialog.tsx` | Move to `src/design-systems/shadcn/components/confirmation-dialog.tsx` | Core migration requirement | 
| `src/components/ui/dropdown-menu.tsx` | Move to `src/design-systems/shadcn/components/dropdown-menu.tsx` | Core migration requirement | 
| `src/components/ui/form-messages.tsx` | Move to `src/design-systems/shadcn/components/form-messages.tsx` | Core migration requirement | 
| `src/components/ui/form.tsx` | Move to `src/design-systems/shadcn/components/form.tsx` | Core migration requirement | 
| `src/components/ui/icons.tsx` | Move to `src/design-systems/shadcn/components/icons.tsx` | Core migration requirement | 
| `src/components/ui/input.tsx` | Move to `src/design-systems/shadcn/components/input.tsx` | Core migration requirement | 
| `src/components/ui/label.tsx` | Move to `src/design-systems/shadcn/components/label.tsx` | Core migration requirement | 
| `src/components/ui/pagination.tsx` | Move to `src/design-systems/shadcn/components/pagination.tsx` | Core migration requirement | 
| `src/components/ui/select.tsx` | Move to `src/design-systems/shadcn/components/select.tsx` | Core migration requirement | 
| `src/components/ui/separator.tsx` | Move to `src/design-systems/shadcn/components/separator.tsx` | Core migration requirement | 
| `src/components/ui/sheet.tsx` | Move to `src/design-systems/shadcn/components/sheet.tsx` | Core migration requirement | 
| `src/components/ui/sidebar.tsx` | Move to `src/design-systems/shadcn/components/sidebar.tsx` | Core migration requirement | 
| `src/components/ui/skeleton.tsx` | Move to `src/design-systems/shadcn/components/skeleton.tsx` | Core migration requirement | 
| `src/components/ui/switch.tsx` | Move to `src/design-systems/shadcn/components/switch.tsx` | Core migration requirement | 
| `src/components/ui/table.tsx` | Move to `src/design-systems/shadcn/components/table.tsx` | Core migration requirement | 
| `src/components/ui/textarea.tsx` | Move to `src/design-systems/shadcn/components/textarea.tsx` | Core migration requirement | 
| `src/components/ui/tooltip.tsx` | Move to `src/design-systems/shadcn/components/tooltip.tsx` | Core migration requirement | 
| `src/components/ui/form.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/components/ui/confirmation-dialog.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/components/ui/pagination.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/components/ui/sidebar.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/components/ui/alert-dialog.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/user-management/components/dialogs/user-role-dialog.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/user-management/components/dialogs/user-add-dialog.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/user-management/components/table/users-table-pagination.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/user-management/components/table/user-actions.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/user-management/components/table/users-table-skeleton.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/user-management/components/table/users-table-toolbar.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/user-management/components/dialogs/user-delete-dialog.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/user-management/components/dialogs/user-ban-dialog.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/user-management/components/table/users-table.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/user-management/components/dialogs/user-unban-dialog.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/user-management/components/dialogs/user-revoke-sessions-dialog.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/marketing/components/animated-hero.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/marketing/components/tech-stack.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/marketing/components/features-grid.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/marketing/components/navbar.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/dashboard/components/overview/dashboard-overview.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/dashboard/components/layout/dashboard-layout.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/dashboard/components/layout/dashboard-sidebar.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/auth/components/login-form.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/auth/components/password-input.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/features/auth/components/register-form.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/app/auth/register/register-page-client.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 
| `src/app/auth/login/login-page-client.tsx` | Modify | Update import path from `@/components/ui` to `@/design-systems/shadcn/components` | 


## Existing Pattern Audit
- The project follows a strict feature-slice and domain-isolation architecture.
- `src/components/ui` is a legacy flat folder that violates the domain routing rules. 
- The recent `FEATURE(design-system-registry)` established `src/design-systems/shadcn/` as the domain root for the shadcn/ui components.

## Execution Plan
### Step 1 — Move Component Files
Use `git mv` to deeply move `src/components/ui/*` to `src/design-systems/shadcn/components/`. Also remove the newly emptied `src/components/ui/` folder.

### Step 2 — Update Global Imports
Run a `sed` search-and-replace to rewrite the import targets inside the 28 consumer files precisely as documented in the file section.

## File-by-File Changes

### `src/design-systems/shadcn/components/alert-dialog.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/alert-dialog.tsx`

#### After
File moved to `src/design-systems/shadcn/components/alert-dialog.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/avatar.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/avatar.tsx`

#### After
File moved to `src/design-systems/shadcn/components/avatar.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/badge.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/badge.tsx`

#### After
File moved to `src/design-systems/shadcn/components/badge.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/breadcrumb.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/breadcrumb.tsx`

#### After
File moved to `src/design-systems/shadcn/components/breadcrumb.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/button.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/button.tsx`

#### After
File moved to `src/design-systems/shadcn/components/button.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/card.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/card.tsx`

#### After
File moved to `src/design-systems/shadcn/components/card.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/confirmation-dialog.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/confirmation-dialog.tsx`

#### After
File moved to `src/design-systems/shadcn/components/confirmation-dialog.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/dropdown-menu.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/dropdown-menu.tsx`

#### After
File moved to `src/design-systems/shadcn/components/dropdown-menu.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/form-messages.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/form-messages.tsx`

#### After
File moved to `src/design-systems/shadcn/components/form-messages.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/form.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/form.tsx`

#### After
File moved to `src/design-systems/shadcn/components/form.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/icons.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/icons.tsx`

#### After
File moved to `src/design-systems/shadcn/components/icons.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/input.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/input.tsx`

#### After
File moved to `src/design-systems/shadcn/components/input.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/label.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/label.tsx`

#### After
File moved to `src/design-systems/shadcn/components/label.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/pagination.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/pagination.tsx`

#### After
File moved to `src/design-systems/shadcn/components/pagination.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/select.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/select.tsx`

#### After
File moved to `src/design-systems/shadcn/components/select.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/separator.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/separator.tsx`

#### After
File moved to `src/design-systems/shadcn/components/separator.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/sheet.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/sheet.tsx`

#### After
File moved to `src/design-systems/shadcn/components/sheet.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/sidebar.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/sidebar.tsx`

#### After
File moved to `src/design-systems/shadcn/components/sidebar.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/skeleton.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/skeleton.tsx`

#### After
File moved to `src/design-systems/shadcn/components/skeleton.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/switch.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/switch.tsx`

#### After
File moved to `src/design-systems/shadcn/components/switch.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/table.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/table.tsx`

#### After
File moved to `src/design-systems/shadcn/components/table.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/textarea.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/textarea.tsx`

#### After
File moved to `src/design-systems/shadcn/components/textarea.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/design-systems/shadcn/components/tooltip.tsx`
**Action:** Move  
**Why:** Relocating shadcn primitive wrappers to proper registry ownership.  
**Impact:** Path change only. Zero behavior change.

#### Before
File existed at `src/components/ui/tooltip.tsx`

#### After
File moved to `src/design-systems/shadcn/components/tooltip.tsx`. Content is identical except internal cross-imports now point to adjacent files.

#### Reasoning
- Moving components solidifies the registry structure.

### `src/components/ui/form.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Label } from "@/components/ui/label"
```

#### After
```tsx
import { Label } from "@/design-systems/shadcn/components/label"
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/components/ui/confirmation-dialog.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
} from "@/components/ui/alert-dialog";
```

#### After
```tsx
} from "@/design-systems/shadcn/components/alert-dialog";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/components/ui/pagination.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Button, buttonVariants } from "@/components/ui/button"
```

#### After
```tsx
import { Button, buttonVariants } from "@/design-systems/shadcn/components/button"
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/components/ui/sidebar.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
} from "@/components/ui/tooltip"
```

#### After
```tsx
import { Button } from "@/design-systems/shadcn/components/button"
import { Input } from "@/design-systems/shadcn/components/input"
import { Separator } from "@/design-systems/shadcn/components/separator"
} from "@/design-systems/shadcn/components/sheet"
import { Skeleton } from "@/design-systems/shadcn/components/skeleton"
} from "@/design-systems/shadcn/components/tooltip"
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/components/ui/alert-dialog.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { buttonVariants } from "@/components/ui/button"
```

#### After
```tsx
import { buttonVariants } from "@/design-systems/shadcn/components/button"
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/user-management/components/dialogs/user-role-dialog.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Label } from "@/components/ui/label";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
} from "@/components/ui/select";
```

#### After
```tsx
import { Label } from "@/design-systems/shadcn/components/label";
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
} from "@/design-systems/shadcn/components/select";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/user-management/components/dialogs/user-add-dialog.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
```

#### After
```tsx
import { Label } from "@/design-systems/shadcn/components/label";
import { Input } from "@/design-systems/shadcn/components/input";
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
} from "@/design-systems/shadcn/components/select";
import { Switch } from "@/design-systems/shadcn/components/switch";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/user-management/components/table/users-table-pagination.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
} from "@/components/ui/pagination";
```

#### After
```tsx
} from "@/design-systems/shadcn/components/pagination";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/user-management/components/table/user-actions.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
```

#### After
```tsx
} from "@/design-systems/shadcn/components/dropdown-menu";
import { Button } from "@/design-systems/shadcn/components/button";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/user-management/components/table/users-table-skeleton.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
```

#### After
```tsx
import { TableBody, TableCell, TableRow } from "@/design-systems/shadcn/components/table";
import { Skeleton } from "@/design-systems/shadcn/components/skeleton";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/user-management/components/table/users-table-toolbar.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
} from "@/components/ui/select";
```

#### After
```tsx
} from "@/design-systems/shadcn/components/select";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/user-management/components/dialogs/user-delete-dialog.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
```

#### After
```tsx
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/user-management/components/dialogs/user-ban-dialog.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Label } from "@/components/ui/label";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Textarea } from "@/components/ui/textarea";
} from "@/components/ui/select";
```

#### After
```tsx
import { Label } from "@/design-systems/shadcn/components/label";
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
import { Textarea } from "@/design-systems/shadcn/components/textarea";
} from "@/design-systems/shadcn/components/select";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/user-management/components/table/users-table.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
} from "@/components/ui/table";
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GithubIcon, GoogleIcon } from "@/components/ui/icons";
```

#### After
```tsx
} from "@/design-systems/shadcn/components/table";
} from "@/design-systems/shadcn/components/tooltip";
import { Badge } from "@/design-systems/shadcn/components/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/design-systems/shadcn/components/avatar";
import { GithubIcon, GoogleIcon } from "@/design-systems/shadcn/components/icons";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/user-management/components/dialogs/user-unban-dialog.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
```

#### After
```tsx
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/user-management/components/dialogs/user-revoke-sessions-dialog.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
```

#### After
```tsx
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/marketing/components/animated-hero.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Button } from "@/components/ui/button";
```

#### After
```tsx
import { Button } from "@/design-systems/shadcn/components/button";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/marketing/components/tech-stack.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
```

#### After
```tsx
} from "@/design-systems/shadcn/components/card";
import { Badge } from "@/design-systems/shadcn/components/badge";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/marketing/components/features-grid.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
} from "@/components/ui/card";
```

#### After
```tsx
} from "@/design-systems/shadcn/components/card";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/marketing/components/navbar.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Button } from "@/components/ui/button";
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
```

#### After
```tsx
import { Button } from "@/design-systems/shadcn/components/button";
} from "@/design-systems/shadcn/components/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/design-systems/shadcn/components/avatar";
import { Badge } from "@/design-systems/shadcn/components/badge";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/dashboard/components/overview/dashboard-overview.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
```

#### After
```tsx
} from "@/design-systems/shadcn/components/card";
import { Badge } from "@/design-systems/shadcn/components/badge";
import { Button } from "@/design-systems/shadcn/components/button";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/dashboard/components/layout/dashboard-layout.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
} from "@/components/ui/sidebar";
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
```

#### After
```tsx
} from "@/design-systems/shadcn/components/sidebar";
} from "@/design-systems/shadcn/components/breadcrumb";
import { Separator } from "@/design-systems/shadcn/components/separator";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/dashboard/components/layout/dashboard-sidebar.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
} from "@/components/ui/sidebar";
```

#### After
```tsx
} from "@/design-systems/shadcn/components/sidebar";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/auth/components/login-form.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormSuccess, FormError } from "@/components/ui/form-messages";
```

#### After
```tsx
import { Input } from "@/design-systems/shadcn/components/input";
import { Label } from "@/design-systems/shadcn/components/label";
import { Button } from "@/design-systems/shadcn/components/button";
import { FormSuccess, FormError } from "@/design-systems/shadcn/components/form-messages";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/auth/components/password-input.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Input } from "@/components/ui/input";
```

#### After
```tsx
import { Input } from "@/design-systems/shadcn/components/input";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/features/auth/components/register-form.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormSuccess, FormError } from "@/components/ui/form-messages";
```

#### After
```tsx
import { Input } from "@/design-systems/shadcn/components/input";
import { Label } from "@/design-systems/shadcn/components/label";
import { Button } from "@/design-systems/shadcn/components/button";
import { FormSuccess, FormError } from "@/design-systems/shadcn/components/form-messages";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/app/auth/register/register-page-client.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GoogleIcon, GithubIcon } from "@/components/ui/icons";
```

#### After
```tsx
import { Button } from "@/design-systems/shadcn/components/button";
import { Card, CardContent } from "@/design-systems/shadcn/components/card";
import { GoogleIcon, GithubIcon } from "@/design-systems/shadcn/components/icons";
```

#### Reasoning
- Single-responsibility refactoring of paths.

### `src/app/auth/login/login-page-client.tsx`
**Action:** Modify  
**Why:** Match the relocated component paths.  
**Impact:** Re-links imports to the new registry location.

#### Before
```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GoogleIcon, GithubIcon } from "@/components/ui/icons";
```

#### After
```tsx
import { Button } from "@/design-systems/shadcn/components/button";
import { Card, CardContent } from "@/design-systems/shadcn/components/card";
import { GoogleIcon, GithubIcon } from "@/design-systems/shadcn/components/icons";
```

#### Reasoning
- Single-responsibility refactoring of paths.


## Validation Plan
```bash
# 1. TypeScript Validation
pnpm exec tsc --noEmit

# 2. Next.js Build
pnpm build
```

## Risk Notes
| Risk | Severity | Mitigation |
|---|---|---|
| Missed imports causing build failure | High | `tsc --noEmit` acts as a blanket gate to verify 100% of internal paths were re-linked successfully. |

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
