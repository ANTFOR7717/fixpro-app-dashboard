# Admin Reference Architecture

## Purpose
Apply the same canonical pattern established by the dashboard reference architecture to the admin section. Documents both what is already correct and what needs to change.

---

## What Is Already Correct

These files comply with the reference pattern and require no structural changes:

| File | Status | Reason |
|---|---|---|
| `app/admin/layout.tsx` | ✅ Correct | Session guard + role check, mounts client boundary |
| `app/admin/page.tsx` | ✅ Correct | Thin redirect shell, reads `adminConfig.defaultRoute` |
| `components/admin/dashboard-layout.tsx` | ✅ Correct | Re-export shim pointing to `components/dashboard/` |
| `components/admin/dashboard-sidebar.tsx` | ✅ Correct | Re-export shim pointing to `components/dashboard/` |
| `src/config/admin.ts` | ✅ Correct | Nav, footerNav, title, version, rootHref, pages.users |
| `app/admin/users/page.tsx` | ⚠️ Minor violation | Contains `<div>` layout wrapper — see Violation A2 |

---

## Violations Found

### Violation A — `admin-layout-client.tsx` naming inconsistency

`app/admin/admin-layout-client.tsx` follows the old naming convention. The dashboard reference pattern established `client.tsx` as the canonical name for the client boundary file within a route directory.

**Fix:** `mv app/admin/admin-layout-client.tsx app/admin/client.tsx`. Update import in `app/admin/layout.tsx`.

---

### Violation B — `users-table.tsx` is a 510-line god component

`components/admin/users-table.tsx` owns four distinct responsibilities that should be separated:

1. **Filter toolbar** (lines 81–150): search input, role dropdown, "Add a user" button — assembled inline as a JSX variable `filterControls`. This is a component, not a variable.
2. **Skeleton loading state** (lines 154–225): full table skeleton duplicates the column header definition and row structure independently from the real table.
3. **Column definitions** (lines 161–169 and 307–315): the column array `[{ label: "Name" }, { label: "Verification" }, ...]` is **defined twice** — once inside the skeleton block and once inside the real table render. Identical 8-item arrays in the same file.
4. **Pagination logic** (lines 230–298): inlined as `renderPagination()` function — 68 lines building page number windows, ellipsis logic, and UI.

**Fix:** Extract into the following structure:

```
components/admin/
  users-table.tsx           Reduced to <200 lines: composes toolbar + content + pagination
  users-table-toolbar.tsx   Filter controls: search, role dropdown, add button
  users-table-columns.ts    COLUMNS const (shared between skeleton and data table)
  users-table-skeleton.tsx  Loading skeleton rows only
  users-table-pagination.tsx Pagination logic and UI
```

---

### Violation C — Column definition duplicated (specific sub-issue of B)

**`users-table.tsx` lines 161–169 and 307–315:** Identical 8-column array defined twice in the same file.

```tsx
// Appears at line 161 (skeleton) AND line 307 (real table) — identical:
[
  { label: "Name" },
  { label: "Verification" },
  { label: "Linked Accounts" },
  { label: "Role" },
  { label: "Status" },
  { label: "Last Sign In" },
  { label: "Created At" },
  { label: "Actions", className: "w-[80px]" },
]
```

**Fix:** Extract to `users-table-columns.ts` as a `const COLUMNS` array. Both skeleton and data table import and use it.

---

### Violation D — Hardcoded copy in `users-table.tsx`

All user-facing strings in the table are hardcoded inline:

| Line | Hardcoded value |
|---|---|
| 89 | `"Search email..."` placeholder |
| 115–117 | `"All Roles"` dropdown label |
| 124 | `"All Roles"` option |
| 130 | `"Admin"` option |
| 135 | `"User"` option |
| 147 | `"Add a user"` button |
| 152 | `"Failed to load users"` error |
| 498 | `"Showing X of Y users"` count format |

**Fix:** Add to `adminConfig.pages.users.table` (see Config Additions). Use a `formatShowingCount(shown, total)` utility function in `src/utils/users.ts` instead of a config function — keeps config purely serializable data, avoids breaking `as const`.

---

### Violation E — Hardcoded copy in `user-actions.tsx` (action menu labels)

All dropdown menu labels hardcoded at lines 53–108:

| Line | Hardcoded value |
|---|---|
| 47 | `"Open menu"` (sr-only) |
| 53 | `"Actions"` menu label |
| 63 | `"Update Role"` |
| 75 | `"Unban User"` |
| 86 | `"Ban User"` |
| 97 | `"Delete User"` |
| 107 | `"Revoke All Sessions"` |

**Fix:** Add `adminConfig.pages.users.actions` with these strings.

---

### Violation F — `BAN_DURATIONS` and all copy in `user-ban-dialog.tsx`

**`BAN_DURATIONS` (lines 25–33):** Duration options `[{ label: "1 day", value: "1" }, ..., { label: "Permanent", value: "permanent" }]` defined as a file-level constant inside a component file. This is content configuration, not component logic.

**Hardcoded dialog copy (lines 67–88):**
- `"Reason for ban (optional)"` label
- `"Enter reason for banning this user (default: Spamming)"` placeholder
- `"Ban duration"` label
- `"Select duration"` placeholder
- `"This will prevent the user from accessing the platform."` description
- `"Processing..."` / `"Ban User"` confirm button text

**Fix:** Add `adminConfig.pages.users.banDialog` with copy and durations array.

---

### Violation G — `user-role-dialog.tsx`: `ROLE_OPTIONS` inline + hardcoded copy

**`ROLE_OPTIONS` (line 23–26):** `[{ label: "User", value: "user" }, { label: "Admin", value: "admin" }]` — same violation pattern as `BAN_DURATIONS`. Belongs in config.

**Hardcoded copy:**
- `"Change the user's role in the system."` — description
- `"Select role"` — dropdown placeholder
- `"Select Role"` — label
- `"Processing..."` / `"Update Role"` — confirm button

**Fix:** Move `ROLE_OPTIONS` to `adminConfig.pages.users.roleOptions`. Add `adminConfig.pages.users.roleDialog`.

---

### Violation H — `user-add-dialog.tsx`: hardcoded copy throughout

| Location | Hardcoded value |
|---|---|
| Line 72 | `"Add New User"` — dialog title |
| Line 73 | `"Create a new user account with the following details."` — description |
| Line 74 | `"Creating..."` / `"Create User"` — confirm button |
| Line 78 | `"Name"` — field label |
| Line 85 | `"Enter user's name"` — placeholder |
| Line 90 | `"Email"` — field label |
| Line 98 | `"Enter user's email"` — placeholder |
| Line 103 | `"Password"` — field label |
| Line 111 | `"Enter user's password"` — placeholder |
| Line 116 | `"Role"` — field label |
| Line 124 | `"Select role"` — placeholder |
| Line 127–128 | `"User"` / `"Admin"` options — duplicate of `ROLE_OPTIONS` in `user-role-dialog.tsx` |
| Line 133–134 | `"Auto-verify email"` — toggle label |
| Line 44–46 | Toast success messages — `"User created and verified successfully"` / `"User created successfully. Verification email sent."` |

> **Role options duplication:** `user-add-dialog.tsx` inline JSX role options and `user-role-dialog.tsx` `ROLE_OPTIONS` constant are the same data defined in two places in different formats. Moving to `adminConfig.pages.users.roleOptions` unifies both.

**Fix:** Add `adminConfig.pages.users.addDialog`.

---

### Violation I — `user-delete-dialog.tsx`: hardcoded copy

- `"This action cannot be undone. This will permanently delete the user and remove their data from the system."` — description (line 42)
- `"Processing..."` / `"Delete User"` — confirm button (line 43)

**Fix:** Add `adminConfig.pages.users.deleteDialog`.

---

### Violation J — `user-revoke-sessions-dialog.tsx`: hardcoded copy

- `"This will log the user out of all devices. They will need to log in again to access their account."` — description (line 45)
- `"Processing..."` / `"Revoke Sessions"` — confirm button (line 46)

**Fix:** Add `adminConfig.pages.users.revokeSessionsDialog`.

---

### Violation K — `user-unban-dialog.tsx`: hardcoded copy

- `"This will restore the user's access to the platform."` — description (line 42)
- `"Processing..."` / `"Unban User"` — confirm button (line 43)

**Fix:** Add `adminConfig.pages.users.unbanDialog`.

---

## Config Additions Required (`src/config/admin.ts`)

```ts
pages: {
  users: {
    title: "Users | Admin Dashboard",
    description: "Manage users in the admin dashboard",
    table: {
      searchPlaceholder: "Search email...",
      addUserLabel: "Add a user",
      errorMessage: "Failed to load users",
      // showingCount is NOT a config function — use formatShowingCount(shown, total) util in src/utils/users.ts
      roleOptions: [
        { value: "all", label: "All Roles" },    // for filter toolbar
        { value: "admin", label: "Admin" },
        { value: "user", label: "User" },
      ],
    },
    // Shared role options (excludes "all") — used by user-role-dialog + user-add-dialog
    roleOptions: [
      { label: "User", value: "user" },
      { label: "Admin", value: "admin" },
    ],
    actions: {
      menuLabel: "Actions",
      openMenuSr: "Open menu",
      updateRole: "Update Role",
      banUser: "Ban User",
      unbanUser: "Unban User",
      deleteUser: "Delete User",
      revokeSessions: "Revoke All Sessions",
    },
    banDialog: {
      description: "This will prevent the user from accessing the platform.",
      reasonLabel: "Reason for ban (optional)",
      reasonPlaceholder: "Enter reason for banning this user (default: Spamming)",
      durationLabel: "Ban duration",
      durationPlaceholder: "Select duration",
      confirmText: "Ban User",
      confirmingText: "Processing...",
      durations: [
        { label: "1 day", value: "1" },
        { label: "3 days", value: "3" },
        { label: "7 days", value: "7" },
        { label: "14 days", value: "14" },
        { label: "30 days", value: "30" },
        { label: "90 days", value: "90" },
        { label: "Permanent", value: "permanent" },
      ],
    },
    unbanDialog: {
      description: "This will restore the user's access to the platform.",
      confirmText: "Unban User",
      confirmingText: "Processing...",
    },
    deleteDialog: {
      description: "This action cannot be undone. This will permanently delete the user and remove their data from the system.",
      confirmText: "Delete User",
      confirmingText: "Processing...",
    },
    revokeSessionsDialog: {
      description: "This will log the user out of all devices. They will need to log in again to access their account.",
      confirmText: "Revoke Sessions",
      confirmingText: "Processing...",
    },
    roleDialog: {
      description: "Change the user's role in the system.",
      roleLabel: "Select Role",
      rolePlaceholder: "Select role",
      confirmText: "Update Role",
      confirmingText: "Processing...",
    },
    addDialog: {
      title: "Add New User",
      description: "Create a new user account with the following details.",
      nameLabel: "Name",
      namePlaceholder: "Enter user's name",
      emailLabel: "Email",
      emailPlaceholder: "Enter user's email",
      passwordLabel: "Password",
      passwordPlaceholder: "Enter user's password",
      roleLabel: "Role",
      rolePlaceholder: "Select role",
      autoVerifyLabel: "Auto-verify email",
      confirmText: "Create User",
      confirmingText: "Creating...",
      successVerified: "User created and verified successfully",
      successUnverified: "User created successfully. Verification email sent.",
    },
  },
},
```

> **`showingCount` resolution:** Do NOT add a function to config — functions break `as const` on the outer object. Instead, add a `formatShowingCount(shown: number, total: number): string` utility to `src/utils/users.ts`. Config stays purely serializable data.

> **`as const` compatibility:** With all values as plain data (no functions), `as const` on `adminConfig` remains intact. Individual arrays use `satisfies` for type safety.

---

## Updated File Map (After Refactor)

```
app/admin/
  layout.tsx                  ✅ Unchanged — session + role guard
  client.tsx                  RENAMED from admin-layout-client.tsx
  page.tsx                    ✅ Unchanged — thin redirect
  users/
    page.tsx                  MODIFIED — remove <div> wrapper, mount <UsersTable /> directly

components/admin/
  users-table.tsx             MODIFIED — reduced, composes sub-components, adds top padding
  users-table-toolbar.tsx     NEW — search, role filter, add button
  users-table-columns.ts      NEW — shared COLUMNS const
  users-table-skeleton.tsx    NEW — skeleton rows only
  users-table-pagination.tsx  NEW — pagination logic + UI
  user-actions.tsx            MODIFIED — reads labels from adminConfig
  user-ban-dialog.tsx         MODIFIED — reads copy + durations from adminConfig
  user-unban-dialog.tsx       MODIFIED — reads copy from adminConfig
  user-delete-dialog.tsx      MODIFIED — reads copy from adminConfig
  user-revoke-sessions-dialog.tsx  MODIFIED — reads copy from adminConfig
  user-role-dialog.tsx        MODIFIED — reads ROLE_OPTIONS + copy from adminConfig
  user-add-dialog.tsx         MODIFIED — reads all copy + roleOptions from adminConfig
  dashboard-layout.tsx        ✅ Unchanged — re-export shim
  dashboard-sidebar.tsx       ✅ Unchanged — re-export shim

config/
  admin.ts                    MODIFIED — adds table, roleOptions, actions, all dialog configs

utils/
  users.ts                    MODIFIED — adds formatShowingCount(shown, total) utility
```

---

## Implementation Order

1. `mv admin-layout-client.tsx client.tsx` + update `layout.tsx` import (2 file touches)
2. Add config additions to `admin.ts` (1 file touch)
3. Add `formatShowingCount` utility to `src/utils/users.ts` (1 file touch)
4. Fix `users/page.tsx` — remove `<div>` wrapper, update `UsersTable` to own its padding (2 file touches)
5. Create `users-table-columns.ts` (1 new file)
6. Create `users-table-toolbar.tsx` (1 new file)
7. Create `users-table-skeleton.tsx` (1 new file)
8. Create `users-table-pagination.tsx` (1 new file)
9. Modify `users-table.tsx` — remove extracted code, compose sub-components, own top padding
10. Modify `user-actions.tsx` — replace hardcoded labels with config reads
11. Modify `user-ban-dialog.tsx` — replace `BAN_DURATIONS` + copy with config
12. Modify `user-unban-dialog.tsx` — replace copy with config
13. Modify `user-delete-dialog.tsx` — replace copy with config
14. Modify `user-revoke-sessions-dialog.tsx` — replace copy with config
15. Modify `user-role-dialog.tsx` — replace `ROLE_OPTIONS` + copy with config
16. Modify `user-add-dialog.tsx` — replace all copy + role options with config

---

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
