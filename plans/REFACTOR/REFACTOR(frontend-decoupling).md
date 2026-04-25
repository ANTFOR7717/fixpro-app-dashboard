# REFACTOR(frontend-decoupling)

## Request
Decouple the frontend React architecture to achieve framework independence inside `src/components/`. Execute three targeted phases:
1. Abstract Framework Hooks: Remove `useRouter` and `usePathname` from UI components.
2. Standardize API Mutations: Isolate API direct calls (such as `banUser`) from generic dialog components into callback props.
3. State Extraction: Extract heavy fetching, URL-pushing, and state-binding logic from the massive `UsersTable` into a dedicated logic hook so the UI component remains pristine.

## Directory Map
```text
src/
  components/
    admin/
      dashboard-layout.tsx      (modify)
      dashboard-sidebar.tsx     (modify)
      users-table.tsx           (modify)
      user-ban-dialog.tsx       (modify)
    auth/
      login-form.tsx            (modify)
  app/
    admin/
      layout.tsx                (modify)
      admin-layout-client.tsx   (new)
  hooks/
    use-users-table.ts          (new)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/components/admin/dashboard-layout.tsx` | Modify | Strip `usePathname` and adapt to a React prop injection pattern tightly bound to standard primitives. |
| `src/components/admin/dashboard-sidebar.tsx` | Modify | Strip `useRouter` and `usePathname` allowing routing and auth-client signOut behaviors to be injected via props. |
| `src/components/admin/users-table.tsx` | Modify | Strip all SWR fetching, debouncing, and router logic cleanly into the dedicated custom hook. |
| `src/components/admin/user-ban-dialog.tsx` | Modify | Lift the `banUser()` execution and Toast notifications out, relying strictly on `onConfirmBan`. |
| `src/components/auth/login-form.tsx` | Modify | Strip `useRouter` dependency, abstracting Next.js redirection to `onLoginSuccess`. |
| `src/app/admin/layout.tsx` | Modify | Re-route the Server Component to wrap `children` inside the new `AdminLayoutClient` bridge. |
| `src/app/admin/admin-layout-client.tsx` | Create | Intermediary Client boundary to execute `usePathname()` bridging strictly into the generic UI. |
| `src/hooks/use-users-table.ts` | Create | Isolate table URL interpolation and debounced searching hooks, separating Next.js Router dependencies from the table UI. |

## Existing Pattern Audit
Next.js projects heavily benefit from separated Client / Server abstractions. The current components freely mingle `useRouter` and `useSWR` fetching inherently locking the UI into the App Router structure. By applying the **Adapter Pattern (Inversion of Control)**, we maintain standard Next.js functionality natively within `src/app/*` boundaries or logic hooks, keeping `src/components/*` blissfully "dumb", pure, and easily portable or unit testable.

## Execution Plan
### Step 1 — Abstract Framework Hooks
Remove `next/navigation` from `dashboard-layout.tsx`, `dashboard-sidebar.tsx`, and `login-form.tsx`, replacing them with prop callbacks. Secure the break via `admin-layout-client.tsx`.
### Step 2 — Standardize API Mutations
Isolate direct Drizzle/Server executions in `user-ban-dialog.tsx` forcing it to emit promises cleanly.
### Step 3 — State Extraction via Logic Hooks
Migrate `searchParams`, debouncing, and `useSWR` from `users-table.tsx` into `use-users-table.ts`. Provide a clean interface back to the UI.

## File-by-File Changes

### `src/components/admin/dashboard-layout.tsx`

**Action:** Modify  
**Why:** Eliminate implicit dependency on `next/navigation` internal state.  
**Impact:** Component expects `pathname` securely as a primitive prop.

#### Before
```tsx
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { DashboardSidebar } from "@/components/admin/dashboard-sidebar";

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const pathSegments = pathname.split("/").filter((segment) => segment);

  const relevantSegments =
    pathSegments[0] === "admin" ? pathSegments.slice(1) : pathSegments;

  return (
    <SidebarProvider>
      <DashboardSidebar />
```

#### After
```tsx
import React from "react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { DashboardSidebar } from "@/components/admin/dashboard-sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  pathname: string;
  onLogout: () => Promise<void>;
}

const DashboardLayout = ({ children, pathname, onLogout }: DashboardLayoutProps) => {
  const pathSegments = pathname.split("/").filter((segment) => segment);

  const relevantSegments =
    pathSegments[0] === "admin" ? pathSegments.slice(1) : pathSegments;

  return (
    <SidebarProvider>
      <DashboardSidebar pathname={pathname} onLogout={onLogout} />
```

#### Reasoning
- Binds rendering securely to standard primitives instead of React context lifecycles natively tied to Next.js interceptors. Propogates bindings perfectly to the sidebar inherently.

### `src/components/admin/dashboard-sidebar.tsx`

**Action:** Modify  
**Why:** Eliminate routing locks on sidebar items.  
**Impact:** Extracts `router` and `authClient`.

#### Before
```tsx
"use client";

import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, Settings, LogOut, GalleryVerticalEnd } from "lucide-react";
import { authClient } from "@/lib/auth-client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const sidebarNavItems = [
  {
    href: "/admin/users",
    icon: Users,
    label: "Users",
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = authClient;

  const handleLogout = async () => {
    try {
      await signOut();
      router.push("/auth/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
```

#### After
```tsx
"use client";

import Link from "next/link";
import { Users, Settings, LogOut, GalleryVerticalEnd } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const sidebarNavItems = [
  {
    href: "/admin/users",
    icon: Users,
    label: "Users",
  },
];

interface DashboardSidebarProps {
  pathname: string;
  onLogout: () => Promise<void>;
}

export function DashboardSidebar({ pathname, onLogout }: DashboardSidebarProps) {
  const handleLogout = async () => {
    try {
      await onLogout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
```

#### Reasoning
- Removes `authClient` and `next/navigation` fully from the UI layer making testing and sharing trivial.

### `src/components/auth/login-form.tsx`

**Action:** Modify  
**Why:** Login Form dictates redirects inherently currently locking it internally to Next.js router.  
**Impact:** Converts component to signal `onSuccess` solely via prop.

#### Before
```tsx
"use client";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import React, { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginUser } from "../../app/auth/login/action";
import { FormSuccess, FormError } from "../ui/form-messages";

const schema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
});

type FormData = z.infer<typeof schema>;

const LoginForm = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const [isVisible, setIsVisible] = useState(false);
  const [formState, setFormState] = useState<{
    success?: string;
    error?: string;
  }>({});

  const id = useId();
  const router = useRouter();

  const toggleVisibility = () => setIsVisible((prev) => !prev);

  const onSubmit = async (data: FormData) => {
    setFormState({});
    const result = await loginUser(data);
    if (result.success) {
      setFormState({ success: result.success.reason });
      router.push("/dashboard");
    } else if (result.error) {
      setFormState({ error: result.error.reason });
    }
  };

  return (
```

#### After
```tsx
"use client";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import React, { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginUser } from "../../app/auth/login/action";
import { FormSuccess, FormError } from "../ui/form-messages";

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

  const [isVisible, setIsVisible] = useState(false);
  const [formState, setFormState] = useState<{
    success?: string;
    error?: string;
  }>({});

  const id = useId();

  const toggleVisibility = () => setIsVisible((prev) => !prev);

  const onSubmit = async (data: FormData) => {
    setFormState({});
    const result = await loginUser(data);
    if (result.success) {
      setFormState({ success: result.success.reason });
      onLoginSuccess();
    } else if (result.error) {
      setFormState({ error: result.error.reason });
    }
  };

  return (
```

#### Reasoning
- The form executes authentication but safely delegates routing side-effects outwards matching decoupling standards perfectly.

### `src/components/admin/user-ban-dialog.tsx`

**Action:** Modify  
**Why:** Decouples direct `banUser` API bindings into a generic promise execution.  
**Impact:** UI component only passes structured user payload outwards.

#### Before
```tsx
"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { banUser } from "@/utils/auth";
import { Label } from "@/components/ui/label";
import { UserWithDetails } from "@/utils/users";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserBanDialogProps {
  user: UserWithDetails;
  isOpen: boolean;
  onClose: () => void;
}

// Ban duration options in days
const BAN_DURATIONS = [
  { label: "1 day", value: "1" },
  { label: "3 days", value: "3" },
  { label: "7 days", value: "7" },
  { label: "14 days", value: "14" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "Permanent", value: "permanent" },
];

export function UserBanDialog({ user, isOpen, onClose }: UserBanDialogProps) {
  const [reason, setReason] = useState("");
  const [banDuration, setBanDuration] = useState("7"); // Default to 7 days
  const [isLoading, setIsLoading] = useState(false);

  const handleBanUser = async () => {
    try {
      setIsLoading(true);
      // Convert duration from days to seconds
      let banExpiresIn: number | undefined;
      if (banDuration === "permanent") {
        banExpiresIn = undefined;
      } else {
        banExpiresIn = parseInt(banDuration) * 24 * 60 * 60; // Days to seconds
      }

      await banUser(user.id, reason, banExpiresIn);
      toast.success(`${user.name || user.email} has been banned.`);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
```

#### After
```tsx
"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Label } from "@/components/ui/label";
import { UserWithDetails } from "@/utils/users";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserBanDialogProps {
  user: UserWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onConfirmBan: (userId: string, reason: string, banExpiresIn?: number) => Promise<void>;
}

// Ban duration options in days
const BAN_DURATIONS = [
  { label: "1 day", value: "1" },
  { label: "3 days", value: "3" },
  { label: "7 days", value: "7" },
  { label: "14 days", value: "14" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "Permanent", value: "permanent" },
];

export function UserBanDialog({ user, isOpen, onClose, onConfirmBan }: UserBanDialogProps) {
  const [reason, setReason] = useState("");
  const [banDuration, setBanDuration] = useState("7"); // Default to 7 days
  const [isLoading, setIsLoading] = useState(false);

  const handleBanUser = async () => {
    try {
      setIsLoading(true);
      // Convert duration from days to seconds
      let banExpiresIn: number | undefined;
      if (banDuration === "permanent") {
        banExpiresIn = undefined;
      } else {
        banExpiresIn = parseInt(banDuration) * 24 * 60 * 60; // Days to seconds
      }

      await onConfirmBan(user.id, reason, banExpiresIn);
      toast.success(`${user.name || user.email} has been banned.`);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
```

#### Reasoning
- Eliminates hardcoded dependency on `utils/auth`, allowing injection for tests without mocking DB.

### `src/app/admin/layout.tsx`

**Action:** Modify  
**Why:** Server layout needs to pass responsibility to a Client Component wrapper to access `pathname`.  
**Impact:** Injects `AdminLayoutClient` wrapper instead of rendering `DashboardLayout` natively.

#### Before
```tsx
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/admin/dashboard-layout";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== "admin") {
    return notFound();
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
```

#### After
```tsx
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AdminLayoutClient } from "./admin-layout-client";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== "admin") {
    return notFound();
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
```

#### Reasoning
- Binds server-level session auth cleanly, handing off strictly React Client interaction bounds down to the adapter.

### `src/app/admin/admin-layout-client.tsx`

**Action:** Create  
**Why:** Orchestrates routing bindings locally preventing prop-pollution lower down the tree.  
**Impact:** Creates the vital connection bridge.

#### Before
File does not exist yet.

#### After
```tsx
"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import DashboardLayout from "@/components/admin/dashboard-layout";
import { authClient } from "@/lib/auth-client";

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      router.push("/auth/login");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <DashboardLayout pathname={pathname} onLogout={handleLogout}>
      {children}
    </DashboardLayout>
  );
}
```

#### Reasoning
- Perfectly fulfills the Adapter Pattern cleanly restricting Next.js hooks strictly inside `app/` bounds.

### `src/hooks/use-users-table.ts`

**Action:** Create  
**Why:** Extracts complex `useSWR` URL-mirroring dependencies natively from UI space.  
**Impact:** Isolates states and fetches fully independent of UI DOM logic.

#### Before
File does not exist yet.

#### After
```ts
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useUsersTable() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [role, setRole] = useState(searchParams.get("role") || "all");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [debouncedEmail, setDebouncedEmail] = useState(email);
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);
  const limit = 10;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedEmail(email), 300);
    return () => clearTimeout(timer);
  }, [email]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (role && role !== "all") params.set("role", role);
    if (debouncedEmail) params.set("email", debouncedEmail);
    if (page) params.set("page", String(page));
    params.set("limit", String(limit));
    router.replace(`?${params.toString()}`);
  }, [role, debouncedEmail, page, router]);

  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    if (role && role !== "all") params.set("role", role);
    if (debouncedEmail) params.set("email", debouncedEmail);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return `/api/admin/users?${params.toString()}`;
  }, [role, debouncedEmail, page, limit]);

  const { data, error, mutate, isLoading } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 2000,
  });

  return {
    state: { role, email, page, limit },
    mutators: { setRole, setEmail, setPage, mutate },
    data,
    error,
    isLoading,
  };
}
```

#### Reasoning
- Concentrates React lifecycles and routing parameters cleanly enabling the UI element to purely render data shapes implicitly.

### `src/components/admin/users-table.tsx`

**Action:** Modify  
**Why:** Relies on massive `useEffect` block coupled to the router, polluting UI component.  
**Impact:** Eradicates 63 lines of implicit data-binding entirely offloading it to the hook.

#### Before
```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserWithDetails } from "@/utils/users";
import { GithubIcon, GoogleIcon } from "../ui/icons";
import { UserActions } from "./user-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { UserAddDialog } from "./user-add-dialog";

// Fetcher function for SWR
const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Helper function to render account icons
const getAccountIcon = (account: string) => {
  switch (account) {
    case "credential":
      return <Mail className="h-4 w-4 dark:text-neutral-300" />;
    case "github":
      return <GithubIcon className="h-4 w-4 dark:text-neutral-300" />;
    case "google":
      return <GoogleIcon className="h-4 w-4 dark:text-neutral-300" />;
    default:
      return null;
  }
};

export function UsersTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Filters and sort state, initialized from URL
  const [role, setRole] = useState(searchParams.get("role") || "all");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [debouncedEmail, setDebouncedEmail] = useState(email);
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);
  const limit = 10;

  // Debounce email search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEmail(email);
    }, 300);

    return () => clearTimeout(timer);
  }, [email]);

  // Update URL when filters/sort/page change
  useEffect(() => {
    const params = new URLSearchParams();
    if (role && role !== "all") params.set("role", role);
    if (debouncedEmail) params.set("email", debouncedEmail);
    if (page) params.set("page", String(page));
    params.set("limit", String(limit));
    router.replace(`?${params.toString()}`);
  }, [role, debouncedEmail, page, router]);

  // Build SWR key with all params
  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    if (role && role !== "all") params.set("role", role);
    if (debouncedEmail) params.set("email", debouncedEmail);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return `/api/admin/users?${params.toString()}`;
  }, [role, debouncedEmail, page, limit]);

  const { data, error, mutate, isLoading } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 2000,
  });

  const handleActionComplete = () => {
    mutate();
  };
```

#### After
```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserWithDetails } from "@/utils/users";
import { GithubIcon, GoogleIcon } from "../ui/icons";
import { UserActions } from "./user-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { UserAddDialog } from "./user-add-dialog";

// Helper function to render account icons
const getAccountIcon = (account: string) => {
  switch (account) {
    case "credential":
      return <Mail className="h-4 w-4 dark:text-neutral-300" />;
    case "github":
      return <GithubIcon className="h-4 w-4 dark:text-neutral-300" />;
    case "google":
      return <GoogleIcon className="h-4 w-4 dark:text-neutral-300" />;
    default:
      return null;
  }
};

export function UsersTable() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  const { state, mutators, data, error, isLoading } = useUsersTable();
  const { role, email, page } = state;
  const { setRole, setEmail, setPage, mutate } = mutators;

  const handleActionComplete = () => {
    mutate();
  };
```

#### Reasoning
- Cleanly truncates the file's responsibility solely to displaying the visual Table primitives reliably.

## Validation Plan
We validate execution explicitly by utilizing the repository's native systems:
- Validate typescript strict prop signature definitions via layout mappings using `pnpm lint`.
- Validate Next.js production server boundary logic checks using `pnpm build`.

## Risk Notes
### Risk: Broken Session Navigation Limits
The `AdminLayoutClient` component bridges context to standard react hierarchies. This runs the danger of creating hydration mismatch bugs if `window.location` routes desync from Next state internally. 
**Mitigation:** `usePathname` is strictly evaluated under React hooks bound firmly preventing layout flashing on load natively handling transitions securely.

## Approval
Implementation must not begin until the user explicitly approves this whiteboard.
