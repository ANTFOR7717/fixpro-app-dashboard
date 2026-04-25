# REFACTOR(deep-domain-isolation)

## Request
Perform a full codebase audit and identify any remaining business domains, configurations, hooks, or schema logics currently "hiding" inside generic application paths like `src/utils/`, `src/hooks/`, or `src/lib/`. Extract all violations perfectly into their respective feature domain boundaries.

## Directory Map
```text
src/
  features/
    auth/
      api/
        register.ts                       (modify)
      components/
        login-form.tsx                    (modify)
        register-form.tsx                 (modify)
      schemas/
        register-schema.ts                (create)
        login-schema.ts                   (create)
    user-management/
      api/
        admin-actions.ts                  (move from src/utils/auth.ts)
      components/
        dialogs/
          user-add-dialog.tsx             (modify)
          user-delete-dialog.tsx          (modify)
          user-revoke-sessions-dialog.tsx (modify)
          user-role-dialog.tsx            (modify)
          user-unban-dialog.tsx           (modify)
        table/
          user-actions.tsx                (modify)
          users-table.tsx                 (modify)
      hooks/
        use-users-table.ts                (move from src/hooks/use-users-table.ts)
      utils/
        format.ts                         (create)
  lib/
    utils.ts                              (modify)
    schemas.ts                            (modify)
  utils/
    auth.ts                               (move)
  hooks/
    use-users-table.ts                    (move)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/features/user-management/api/admin-actions.ts` | Move | Server action library completely dedicated to Admin operations |
| `src/features/user-management/hooks/use-users-table.ts` | Move | Domain specific SWR hook isolating admin pagination bindings |
| `src/features/auth/schemas/register-schema.ts` | Create | Isolates pure domain logic Zod payloads from generic network types |
| `src/features/auth/schemas/login-schema.ts` | Create | Isolates UI inline schema directly into domain logics |
| `src/features/user-management/utils/format.ts` | Create | Separates UI copy definitions from Tailwind CSS merge functions |
| `src/lib/schemas.ts` | Modify | Removes the `registerSchema` while keeping generic `ActionResult` |
| `src/lib/utils.ts` | Modify | Removes domain specific formatting |
| `src/features/user-management/components/table/users-table.tsx` | Modify | Paths updated for SWR hook and format util |
| `src/features/user-management/components/dialogs/user-role-dialog.tsx` | Modify | Paths updated for admin actions |
| `src/features/user-management/components/dialogs/user-delete-dialog.tsx` | Modify | Paths updated for admin actions |
| `src/features/user-management/components/dialogs/user-unban-dialog.tsx` | Modify | Paths updated for admin actions |
| `src/features/user-management/components/dialogs/user-add-dialog.tsx` | Modify | Paths updated for admin actions |
| `src/features/user-management/components/dialogs/user-revoke-sessions-dialog.tsx` | Modify | Paths updated for admin actions |
| `src/features/user-management/components/table/user-actions.tsx` | Modify | Paths updated for admin actions |
| `src/features/auth/api/register.ts` | Modify | Bounds to domain schema module |
| `src/features/auth/components/register-form.tsx` | Modify | Bounds to domain schema module |
| `src/features/auth/components/login-form.tsx` | Modify | Bounds to domain schema module |

## Existing Pattern Audit
The project currently enforces a strict Feature Slice Architecture (`src/features/{domain}`). However, generic root folders like `/lib`, `/utils`, and `/hooks` had accumulated domain-specific logic prior to the DDD evacuation. Moving `auth.ts` out of `/utils` aligns with the recent `admin` scope migrations. Breaking `formatShowingCount` out of `twMerge` boundaries follows the strict separation of CSS compilation utilities and localized UI strings.

## Execution Plan
### Step 1 — Move Admin Actions
Target `src/utils/auth.ts` into a dedicated schema and remap its bounds to all Admin Dialogs.
### Step 2 — Move Table Hook
Target `src/hooks/use-users-table.ts` and remap bounds directly inside the User Table scope.
### Step 3 — Extract Form Schemas
Target schema logic inside the Form UI components and `/lib/schemas.ts` and isolate them inside `features/auth/schemas`.
### Step 4 — Extract Analytics Formatting
Strip string formatting tools from structural Tailwind tools.

## File-by-File Changes

### `src/utils/auth.ts`
**Action:** Move  
**Why:** File contains pure Better-Auth user mutation actions logically paired to the Admin interface  
**Impact:** Eliminates auth boundary crossing from the generic utils space

#### Before
File located at `src/utils/auth.ts`

#### After
File relocated to `src/features/user-management/api/admin-actions.ts`

#### Reasoning
- Safe structural move without implementation divergence

### `src/hooks/use-users-table.ts`
**Action:** Move  
**Why:** SWR query bounds tightly coupled to the admin `/api/admin/users` pagination handler  
**Impact:** Restores logical feature bounds

#### Before
File located at `src/hooks/use-users-table.ts`

#### After
File relocated to `src/features/user-management/hooks/use-users-table.ts`

#### Reasoning
- Avoids misrepresenting a tightly coupled endpoint fetcher as a generic application hook

### `src/features/user-management/utils/format.ts`
**Action:** Create  
**Why:** Isolates localized string manipulation  
**Impact:** Creates a pure logic bucket for tabular copy

#### Before
`File does not exist yet.`

#### After
```tsx
export function formatShowingCount(shown: number, total: number): string {
  return `Showing ${shown} of ${total} users`;
}
```

#### Reasoning
- Clean isolation of string templating to prevent polluting core generic structural UI imports

### `src/lib/utils.ts`
**Action:** Modify  
**Why:** Strip domain specific logic leaked into the global CSS engine utilities  
**Impact:** Restores `twMerge` purity

#### Before
```ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatShowingCount(shown: number, total: number): string {
  return `Showing ${shown} of ${total} users`;
}
```

#### After
```ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

#### Reasoning
- Strict domain isolation

### `src/features/auth/schemas/register-schema.ts`
**Action:** Create  
**Why:** Isolates strictly bound application domain schemas out of the generalized `ActionResult` domain  
**Impact:** Establishes pure bounds for Zod implementations

#### Before
`File does not exist yet.`

#### After
```ts
import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .regex(/[0-9]/, { message: "Password must contain at least one number" })
    .regex(/[a-z]/, {
      message: "Password must contain at least one lowercase letter",
    })
    .regex(/[A-Z]/, {
      message: "Password must contain at least one uppercase letter",
    }),
  name: z.string().min(2).max(100),
});

export type RegisterSchema = z.infer<typeof registerSchema>;
```

#### Reasoning
- Follows exact `features/{domain}/schemas` specification

### `src/lib/schemas.ts`
**Action:** Modify  
**Why:** Purge Zod parsing logic off general cross-API generic boundary responses  
**Impact:** Pure HTTP typing remains

#### Before
```ts
export type ActionResult<T = unknown> = {
  success: { reason: string } | null;
  error: { reason: string } | null;
  data?: T;
};

export const registerSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .regex(/[0-9]/, { message: "Password must contain at least one number" })
    .regex(/[a-z]/, {
      message: "Password must contain at least one lowercase letter",
    })
    .regex(/[A-Z]/, {
      message: "Password must contain at least one uppercase letter",
    }),
  name: z.string().min(2).max(100),
});

export type RegisterSchema = z.infer<typeof registerSchema>;
```

#### After
```ts
export type ActionResult<T = unknown> = {
  success: { reason: string } | null;
  error: { reason: string } | null;
  data?: T;
};
```

#### Reasoning
- Cleans architectural debt

### `src/features/auth/schemas/login-schema.ts`
**Action:** Create  
**Why:** Inline form component schemas severely reduce testing surface  
**Impact:** Extracts form definitions to a strongly-typed schema boundary

#### Before
`File does not exist yet.`

#### After
```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

export type LoginSchema = z.infer<typeof loginSchema>;
```

#### Reasoning
- Modular scaling and Zod schema isolation

### `src/features/auth/components/login-form.tsx`
**Action:** Modify  
**Why:** Relocate schema definition off file bindings to dedicated domain schema  
**Impact:** Uses `loginSchema` generic pathing

#### Before
```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { loginUser } from "@/features/auth/api/login";
import { FormSuccess, FormError } from "@/components/ui/form-messages";

const schema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

type FormData = z.infer<typeof schema>;

interface LoginFormProps {
  onLoginSuccess: () => void;
}

const LoginForm = ({ onLoginSuccess }: LoginFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
```

#### After
```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { loginUser } from "@/features/auth/api/login";
import { FormSuccess, FormError } from "@/components/ui/form-messages";
import { loginSchema, type LoginSchema } from "@/features/auth/schemas/login-schema";

interface LoginFormProps {
  onLoginSuccess: () => void;
}

const LoginForm = ({ onLoginSuccess }: LoginFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
```

#### Reasoning
- Exact extraction of typing and inline parsing schema. Eliminates technical debt by stripping inline variable parsing.

### `src/features/auth/components/register-form.tsx`
**Action:** Modify  
**Why:** Map schema to explicit isolated layer  
**Impact:** Import reference change

#### Before
```tsx
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/features/auth/components/password-input";
import { registerSchema } from "@/lib/schemas";
import { registerUser } from "@/features/auth/api/register";
import { FormSuccess, FormError } from "@/components/ui/form-messages";

const RegisterForm = () => {
  const [formState, setFormState] = React.useState<{
    success?: string;
    error?: string;
  }>({});

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    control,
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = async (data: import("@/lib/schemas").RegisterSchema) => {
```

#### After
```tsx
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/features/auth/components/password-input";
import { registerSchema, type RegisterSchema } from "@/features/auth/schemas/register-schema";
import { registerUser } from "@/features/auth/api/register";
import { FormSuccess, FormError } from "@/components/ui/form-messages";

const RegisterForm = () => {
  const [formState, setFormState] = React.useState<{
    success?: string;
    error?: string;
  }>({});

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    control,
  } = useForm<RegisterSchema>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = async (data: RegisterSchema) => {
```

#### Reasoning
- Explicitly binds `RegisterSchema` type injection internally over `useForm` replacing the deprecated generic module namespace.

### `src/features/auth/api/register.ts`
**Action:** Modify  
**Why:** Relocate bindings  
**Impact:** Corrects API import map

#### Before
```ts
import { auth } from "@/lib/auth";
import { APIError } from "better-auth/api";
import { ActionResult } from "@/lib/schemas";
import { registerSchema, RegisterSchema } from "@/lib/schemas";
import { DEFAULT_LOGIN_REDIRECT } from "@/lib/config";
```

#### After
```ts
import { auth } from "@/lib/auth";
import { APIError } from "better-auth/api";
import { ActionResult } from "@/lib/schemas";
import { registerSchema, type RegisterSchema } from "@/features/auth/schemas/register-schema";
import { DEFAULT_LOGIN_REDIRECT } from "@/lib/config";
```

#### Reasoning
- Decouples API mutation handlers from the generic scope schema

### `src/features/user-management/components/table/users-table.tsx`
**Action:** Modify  
**Why:** Re-route the format function and SWR hook bounds  
**Impact:** Domain integrity restored

#### Before
```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatShowingCount } from "@/lib/utils";
import { useUsersTable } from "@/hooks/use-users-table";
import { UsersTableToolbar } from "./users-table-toolbar";
```

#### After
```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatShowingCount } from "@/features/user-management/utils/format";
import { useUsersTable } from "@/features/user-management/hooks/use-users-table";
import { UsersTableToolbar } from "./users-table-toolbar";
```

#### Reasoning
- Both the hook and function now cleanly point horizontally inside the feature boundaries

### `src/features/user-management/components/dialogs/user-role-dialog.tsx`
**Action:** Modify  
**Why:** Hook bindings relocated  
**Impact:** Changes root mutation bindings

#### Before
```tsx
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { adminConfig } from "@/features/user-management/config/admin-config";
import { updateUserRole } from "@/utils/auth";
```

#### After
```tsx
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { adminConfig } from "@/features/user-management/config/admin-config";
import { updateUserRole } from "@/features/user-management/api/admin-actions";
```

#### Reasoning
- Safely targets the precise backend bindings

### `src/features/user-management/components/dialogs/user-delete-dialog.tsx`
**Action:** Modify  
**Why:** Hook bindings relocated  
**Impact:** Changes root mutation bindings

#### Before
```tsx
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { adminConfig } from "@/features/user-management/config/admin-config";
import { deleteUser } from "@/utils/auth";
```

#### After
```tsx
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { adminConfig } from "@/features/user-management/config/admin-config";
import { deleteUser } from "@/features/user-management/api/admin-actions";
```

#### Reasoning
- Target updated logically

### `src/features/user-management/components/dialogs/user-unban-dialog.tsx`
**Action:** Modify  
**Why:** Hook bindings relocated  
**Impact:** Changes root mutation bindings

#### Before
```tsx
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { adminConfig } from "@/features/user-management/config/admin-config";
import { unbanUser } from "@/utils/auth";
```

#### After
```tsx
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { adminConfig } from "@/features/user-management/config/admin-config";
import { unbanUser } from "@/features/user-management/api/admin-actions";
```

#### Reasoning
- Target updated logically

### `src/features/user-management/components/dialogs/user-add-dialog.tsx`
**Action:** Modify  
**Why:** Hook bindings relocated  
**Impact:** Changes root mutation bindings

#### Before
```tsx
  DialogTitle,
} from "@/components/ui/dialog";
import { createUser } from "@/utils/auth";
import { adminConfig } from "@/features/user-management/config/admin-config";
```

#### After
```tsx
  DialogTitle,
} from "@/components/ui/dialog";
import { createUser } from "@/features/user-management/api/admin-actions";
import { adminConfig } from "@/features/user-management/config/admin-config";
```

#### Reasoning
- Target updated logically

### `src/features/user-management/components/dialogs/user-revoke-sessions-dialog.tsx`
**Action:** Modify  
**Why:** Hook bindings relocated  
**Impact:** Changes root mutation bindings

#### Before
```tsx
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { adminConfig } from "@/features/user-management/config/admin-config";
import { revokeUserSessions } from "@/utils/auth";
```

#### After
```tsx
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { adminConfig } from "@/features/user-management/config/admin-config";
import { revokeUserSessions } from "@/features/user-management/api/admin-actions";
```

#### Reasoning
- Target updated logically

### `src/features/user-management/components/table/user-actions.tsx`
**Action:** Modify  
**Why:** Hook bindings relocated  
**Impact:** Changes root mutation bindings

#### Before
```tsx
import { User } from "@/features/user-management/types";
import { UserRoleDialog } from "../dialogs/user-role-dialog";
import { banUser } from "@/utils/auth";
import { UserDeleteDialog } from "../dialogs/user-delete-dialog";
```

#### After
```tsx
import { User } from "@/features/user-management/types";
import { UserRoleDialog } from "../dialogs/user-role-dialog";
import { banUser } from "@/features/user-management/api/admin-actions";
import { UserDeleteDialog } from "../dialogs/user-delete-dialog";
```

#### Reasoning
- Correct internal alignment

## Validation Plan
Post-implementation, we will run `npm run build` to execute the Next.js Turbopack compiler. This guarantees zero broken module resolution links and ensures complete edge runtime type safety. 

## Risk Notes
- Module Pathing Risk: Heavy relative import structure mappings might throw static compilation warnings if any layer misses a bound.
- SWR Hook Caching Risk: Moving the hook technically shifts bundler caching keys, but standard Next.js architecture accommodates this flawlessly.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
