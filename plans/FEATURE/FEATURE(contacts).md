# FEATURE(contacts)

## Request
Add a minimal "Contacts" feature so users can save real-estate agent contacts (name, phone, email) once and pick them on the Get Repair Estimate form, instead of re-typing the same listing/buyer agent fields on every submission. Stay within existing conventions: feature-slice + registry, Drizzle, `react-hook-form` + `zod`, shadcn primitives, server actions. No new dependencies. No FK from `estimate_requests` to `contacts`. No soft-delete, tabs, labels, companies, notes, or JSON API route in v1.

## Directory Map
```text
src/
  features/
    contacts/
      db/
        schema.ts                       (new)
      api/
        actions.ts                      (new)
        get-contacts.ts                 (new)
      components/
        contacts-view.tsx               (new)
        contact-form.tsx                (new)
        contact-row-actions.tsx         (new)
        contact-picker.tsx              (new)
      registry.tsx                      (new)
    estimate/
      api/
        actions.ts                      (modify)
      components/
        estimate-view.tsx               (modify)
  app/
    dashboard/
      estimate/
        page.tsx                        (new)
  db/
    schema.ts                           (modify)
  config/
    features-index.ts                   (modify)
```

## Modification Table
| File | Action | Why |
|---|---|---|
| `src/features/contacts/db/schema.ts` | new | Drizzle `contacts` table scoped to `user.id`. |
| `src/db/schema.ts` | modify | Re-export `contactsTable` so `drizzle-kit` picks it up (mirrors how `estimate_requests` got into migration `0002`). |
| `src/features/contacts/api/get-contacts.ts` | new | Single server helper `listContactsForUser(userId)` used by page + estimate wrapper. |
| `src/features/contacts/api/actions.ts` | new | `createContactAction`, `updateContactAction`, `deleteContactAction` — matches the shape of `uploadEstimatePdfAction`. |
| `src/features/contacts/components/contacts-view.tsx` | new | Server component: list contacts in a card + inline add/edit form. Page rendered through `[feature]/page.tsx` via registry. |
| `src/features/contacts/components/contact-form.tsx` | new | Client form using `react-hook-form` + `zod` + shadcn `Input`/`Label`, posts to the create/update server action. Doubles as add form and edit form. |
| `src/features/contacts/components/contact-row-actions.tsx` | new | Client buttons that call the delete action (hard delete, confirm via existing `ConfirmationDialog`). |
| `src/features/contacts/components/contact-picker.tsx` | new | Client `<select>` (shadcn `Select`) populated from a server-provided `contacts` prop; on change, calls parent setters with `{name, phone, email}`. |
| `src/features/contacts/registry.tsx` | new | Registers sidebar nav item `/dashboard/contacts` + `page: <ContactsView />`. |
| `src/config/features-index.ts` | modify | Register `contactsMetadata`. |
| `src/app/dashboard/estimate/page.tsx` | new | Server wrapper that loads the user's contacts and renders `<EstimateView contacts={…} />`. Overrides the dynamic `[feature]/page.tsx` resolution for this single route. |
| `src/features/estimate/registry.tsx` | modify | Drop the `page` field. With the route now owned by `src/app/dashboard/estimate/page.tsx`, the registry no longer needs (and can no longer cleanly construct) a default `<EstimateView />` element since `EstimateView` will require a `contacts` prop. |
| `src/features/estimate/components/estimate-view.tsx` | modify | Accept `contacts` prop; render `<ContactPicker>` above each agent block; on selection, `setValue` the three fields; track two checkbox booleans in component state and append them to `FormData` at submit time. |
| `src/features/estimate/api/actions.ts` | modify | Accept optional `saveListingAsContact` / `saveBuyerAsContact` form fields; if true, upsert the contact `(userId, email)` before inserting the estimate. |

## Existing Pattern Audit
- **Feature slices**: `src/features/<feature>/{api,components,db,registry.*}` (see `src/features/estimate`, `src/features/user-management`). The new slice copies that layout exactly.
- **Registry**: `FeatureMetadata` in `src/lib/registry.tsx`. Slice page is exposed via the catch-all in `src/app/dashboard/[feature]/page.tsx`. We use that mechanism for `/dashboard/contacts`. The estimate route gets a dedicated `src/app/dashboard/estimate/page.tsx` because it now needs server-side data for the picker; Next.js resolves specific segments before dynamic ones, so the catch-all stops handling `/dashboard/estimate`. Sidebar nav still works via `registry.tsx`.
- **DB / migrations**: `drizzle.config.ts` points to `./src/db/schema.ts` only, yet `drizzle/0002_normal_invisible_woman.sql` already creates `estimate_requests` (defined in `src/features/estimate/db/schema.ts`). `src/db/schema.ts` does **not** currently re-export `estimateRequestTable`, so the migration must have been generated with a different schema source (likely a one-off `drizzle-kit generate --schema=...` or a transient edit to the config). To make the new migration deterministic without changing existing migrations, the plan re-exports `contactsTable` from `src/db/schema.ts`. If `pnpm db:generate` does not pick it up, fall back to `pnpm drizzle-kit generate --schema=./src/db/schema.ts,./src/features/contacts/db/schema.ts,./src/features/estimate/db/schema.ts` (see Validation Plan).
- **Server actions**: `src/features/estimate/api/actions.ts` — auth gate via `authServerProvider.getSession({ headers: await headers() })`, `Object.fromEntries(formData.entries())`, `safeParse`, return `{ success: boolean; message?: string; error?: string }`, `revalidatePath` afterwards. We mirror this verbatim.
- **Forms**: `src/features/estimate/components/estimate-view.tsx` and `src/features/auth/components/register-form.tsx` — `useForm` + `zodResolver`, shadcn `Input`/`Label`/`Select`, errors as `<p className="text-xs text-red-500">`, `useActionState` + `startTransition` to invoke the action.
- **Confirmation dialogs**: `src/features/user-management/components/dialogs/user-delete-dialog.tsx` uses `ConfirmationDialog` from `@/design-systems/shadcn/components/confirmation-dialog`. We reuse that primitive for delete.
- **Server-rendered widgets that read user-scoped data**: `src/features/estimate/components/recent-estimates-widget.tsx` is an `async` server component that calls `authServerProvider.getSession`, then queries Drizzle directly. `contacts-view.tsx` follows the same shape.
- **No SWR / no client fetch hook** is needed; the estimate page becomes a server component that passes data down as a prop, matching how `RecentEstimatesWidget` does its work.

## Execution Plan

### Step 1 — Database
Add the `contacts` table and re-export it from the canonical schema so `pnpm db:generate` produces a migration.

- Files: `src/features/contacts/db/schema.ts`, `src/db/schema.ts`.
- Run `pnpm db:generate` then `pnpm db:migrate`. Confirm a new `drizzle/000X_*.sql` exists creating `contacts`.

### Step 2 — Server access (read + write)
Add the read helper and the three server actions. All gated on `session.user.id`; all enforce `userId` in their queries.

- Files: `src/features/contacts/api/get-contacts.ts`, `src/features/contacts/api/actions.ts`.

### Step 3 — Contacts UI
Build the page (server component) and the small client islands (form + row actions). Hard-delete is acceptable in v1 because no FK references `contacts.id` from `estimate_requests`.

- Files: `src/features/contacts/components/contacts-view.tsx`, `src/features/contacts/components/contact-form.tsx`, `src/features/contacts/components/contact-row-actions.tsx`.

### Step 4 — Register the slice
Add `registry.tsx` and register it in `features-index.ts`. Sidebar gets a "Contacts" item.

- Files: `src/features/contacts/registry.tsx`, `src/config/features-index.ts`.

### Step 5 — Picker + estimate integration
Create the picker component. Add a server page wrapper at `src/app/dashboard/estimate/page.tsx` that loads contacts and renders `<EstimateView contacts={...} />`. Modify `EstimateView` to accept `contacts` and render two pickers. Modify the upload action to optionally upsert a contact based on hidden flags.

- Files: `src/features/contacts/components/contact-picker.tsx`, `src/app/dashboard/estimate/page.tsx`, `src/features/estimate/components/estimate-view.tsx`, `src/features/estimate/api/actions.ts`.

### Step 6 — Validate
Run `pnpm lint`, walk the manual QA in the Validation Plan.

## File-by-File Changes

### `src/features/contacts/db/schema.ts`

**Action:** Create
**Why:** Per-feature table file matching `src/features/estimate/db/schema.ts`.
**Impact:** New table `contacts` with per-user uniqueness on email.

#### Before
File does not exist yet.

#### After
```ts
import { pgTable, text, timestamp, uuid, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "@/db/schema";

export const contactsTable = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqUserEmail: uniqueIndex("contacts_user_email_idx").on(t.userId, t.email),
  })
);

export type Contact = typeof contactsTable.$inferSelect;
```

#### Reasoning
- Three fields only (`fullName`, `phone`, `email`) — exactly what the estimate form re-uses per agent block. No labels/company/notes/kind/archive — none of these are needed for the stated goal.
- `(userId, email)` unique index lets the upsert path in the estimate action be idempotent and prevents accidental duplicates.
- Cascade on user delete keeps cleanup automatic, matching `estimate_requests`.

### `src/db/schema.ts`

**Action:** Modify
**Why:** `drizzle.config.ts` only reads `src/db/schema.ts`. Re-export so the new table participates in `pnpm db:generate`. This matches the de-facto pattern that already makes `estimate_requests` appear in migration `0002_normal_invisible_woman.sql`.
**Impact:** One added line at the bottom; no runtime change for existing code.

#### Before
```ts
export const accountRelations = relations(account, ({ one }) => ({
    user: one(user, { fields: [account.userId], references: [user.id] }),
}));
```

#### After
```ts
export const accountRelations = relations(account, ({ one }) => ({
    user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export { contactsTable } from "@/features/contacts/db/schema";
```

#### Reasoning
- Smallest possible touch to the canonical schema file. No other change.
- Does not pull `estimateRequestTable` into this file too — out of scope; the team already has a working pipeline for that one.

### `src/features/contacts/api/get-contacts.ts`

**Action:** Create
**Why:** Single read helper used by the contacts page and the estimate page wrapper. Avoids spreading inline Drizzle queries across components.
**Impact:** New module.

#### Before
File does not exist yet.

#### After
```ts
import { db } from "@/db";
import { contactsTable, type Contact } from "../db/schema";
import { eq, desc } from "drizzle-orm";

export async function listContactsForUser(userId: string): Promise<Contact[]> {
  return db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.userId, userId))
    .orderBy(desc(contactsTable.updatedAt));
}
```

#### Reasoning
- Mirrors the directly-imported `db` + Drizzle helpers used in `recent-estimates-widget.tsx`.
- One function, one return type. No filtering by kind, no pagination — fewer than ~25 contacts per user is the realistic ceiling for this product.

### `src/features/contacts/api/actions.ts`

**Action:** Create
**Why:** Three server actions for CRUD, identical contract to `uploadEstimatePdfAction` (`{ success, message?, error? }`).
**Impact:** New module.

#### Before
File does not exist yet.

#### After
```ts
"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { db } from "@/db";
import { authServerProvider } from "@/auth/server-provider";
import { contactsTable } from "../db/schema";

const contactInputSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Invalid email"),
});

type ActionState = { success: boolean; message?: string; error?: string } | null;

async function requireUserId() {
  const session = await authServerProvider.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED_ACCESS_DENIED");
  return session.user.id;
}

export async function createContactAction(_prev: ActionState, formData: FormData) {
  try {
    const userId = await requireUserId();
    const parsed = contactInputSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { success: false, error: `Validation Error - ${first.path.join(".")}: ${first.message}` };
    }
    try {
      await db.insert(contactsTable).values({ userId, ...parsed.data });
    } catch (e: any) {
      // unique_violation on (userId, email)
      if (e?.code === "23505") {
        return { success: false, error: "A contact with that email already exists." };
      }
      throw e;
    }
    revalidatePath("/dashboard/contacts");
    return { success: true, message: "Contact saved." };
  } catch (error: any) {
    console.error("Server Action Error (createContactAction):", error);
    return { success: false, error: error.message || "Failed to save contact." };
  }
}

export async function updateContactAction(_prev: ActionState, formData: FormData) {
  try {
    const userId = await requireUserId();
    const id = String(formData.get("id") ?? "");
    if (!id) return { success: false, error: "Missing id." };
    const parsed = contactInputSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { success: false, error: `Validation Error - ${first.path.join(".")}: ${first.message}` };
    }
    const updated = await db
      .update(contactsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(contactsTable.id, id), eq(contactsTable.userId, userId)))
      .returning({ id: contactsTable.id });
    if (updated.length === 0) {
      return { success: false, error: "Contact not found." };
    }
    revalidatePath("/dashboard/contacts");
    return { success: true, message: "Contact updated." };
  } catch (error: any) {
    if (error?.code === "23505") {
      return { success: false, error: "A contact with that email already exists." };
    }
    console.error("Server Action Error (updateContactAction):", error);
    return { success: false, error: error.message || "Failed to update contact." };
  }
}

export async function deleteContactAction(_prev: ActionState, formData: FormData) {
  try {
    const userId = await requireUserId();
    const id = String(formData.get("id") ?? "");
    if (!id) return { success: false, error: "Missing id." };
    await db
      .delete(contactsTable)
      .where(and(eq(contactsTable.id, id), eq(contactsTable.userId, userId)));
    revalidatePath("/dashboard/contacts");
    return { success: true, message: "Contact deleted." };
  } catch (error: any) {
    console.error("Server Action Error (deleteContactAction):", error);
    return { success: false, error: error.message || "Failed to delete contact." };
  }
}
```

#### Reasoning
- Same import order, auth helper, parse pattern, return shape, and `revalidatePath` as `src/features/estimate/api/actions.ts`. Nothing invented.
- All mutations are double-guarded by `userId` to prevent cross-tenant writes.
- Hard delete (no `archivedAt`) is safe in v1: no other table references `contacts.id`.
- Postgres unique-violation code `23505` is intercepted for both create and update to return a clean user-facing error instead of leaking the raw driver message.
- `updateContactAction` uses `.returning()` to detect a no-op (bad id or cross-tenant id) and returns `"Contact not found."` instead of a silent success.

### `src/features/contacts/components/contact-form.tsx`

**Action:** Create
**Why:** Reusable add/edit form (single component, two modes). Uses the same `react-hook-form` + `zod` + shadcn pattern as `EstimateView`.
**Impact:** New module.

#### Before
File does not exist yet.

#### After
```tsx
"use client";

import { useActionState, startTransition, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFormStatus } from "react-dom";
import * as z from "zod";

import { Input } from "@/design-systems/shadcn/components/input";
import { Label } from "@/design-systems/shadcn/components/label";
import { Button } from "@/design-systems/shadcn/components/button";
import { FormError, FormSuccess } from "@/design-systems/shadcn/components/form-messages";
import { createContactAction, updateContactAction } from "../api/actions";
import type { Contact } from "../db/schema";

const contactSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Invalid email"),
});

type ContactFormValues = z.infer<typeof contactSchema>;

function SubmitButton({ mode }: { mode: "create" | "update" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : mode === "create" ? "Add contact" : "Save changes"}
    </Button>
  );
}

interface ContactFormProps {
  mode: "create" | "update";
  contact?: Contact;
  onDone?: () => void;
}

export function ContactForm({ mode, contact, onDone }: ContactFormProps) {
  const action = mode === "create" ? createContactAction : updateContactAction;
  const [state, formAction] = useActionState(action, null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      fullName: contact?.fullName ?? "",
      phone: contact?.phone ?? "",
      email: contact?.email ?? "",
    },
  });

  // After a successful action, clear the create form so the inputs don't keep stale values
  // (the server component re-renders the list separately via revalidatePath).
  // For update mode, collapse the inline editor by calling onDone.
  useEffect(() => {
    if (state?.success) {
      if (mode === "create") reset({ fullName: "", phone: "", email: "" });
      else onDone?.();
    }
  }, [state, mode, reset, onDone]);

  const onSubmit = (data: ContactFormValues) => {
    const formData = new FormData();
    if (mode === "update" && contact) formData.append("id", contact.id);
    Object.entries(data).forEach(([k, v]) => formData.append(k, v));
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormError message={state?.error || ""} />
      <FormSuccess message={state?.message || ""} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full Name *</Label>
          <Input id="fullName" {...register("fullName")} />
          {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone *</Label>
          <Input id="phone" type="tel" {...register("phone")} />
          {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>
      </div>
      <SubmitButton mode={mode} />
    </form>
  );
}
```

#### Reasoning
- Same control flow as `EstimateView`: `useActionState` + `startTransition` + manual `FormData` from `react-hook-form` values.
- One component covers both add and edit; no separate dialog file needed in v1.
- No `Dialog` primitive is introduced for the contacts page — the add form is rendered inline at the top of the list. Edit reuses the same component, swapping defaults. This is the lowest-friction shape that still feels native to the project.
- The `useEffect` watching `state?.success` is the canonical way to react to a `useActionState` result without racing the `startTransition` callback. For create, it resets the form so subsequent adds start empty; for update, it collapses the inline editor only after the server confirmed the change (avoiding the earlier race where `onDone()` fired before the action completed).
- `state.message` / `state.error` from `useActionState` continue to render inside the form via `FormError` / `FormSuccess` so the user sees the action's response.

### `src/features/contacts/components/contact-row-actions.tsx`

**Action:** Create
**Why:** Per-row Edit/Delete buttons. Delete confirms via the existing `ConfirmationDialog` already used by `user-management`.
**Impact:** New module.

#### Before
File does not exist yet.

#### After
```tsx
"use client";

import { useState, useTransition } from "react";
import toast from "react-hot-toast";
import { Button } from "@/design-systems/shadcn/components/button";
import { ConfirmationDialog } from "@/design-systems/shadcn/components/confirmation-dialog";
import { deleteContactAction } from "../api/actions";
import { ContactForm } from "./contact-form";
import type { Contact } from "../db/schema";

interface ContactRowActionsProps {
  contact: Contact;
}

export function ContactRowActions({ contact }: ContactRowActionsProps) {
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("id", contact.id);
      const result = await deleteContactAction(null, formData);
      if (result.success) toast.success("Contact deleted.");
      else toast.error(result.error ?? "Failed to delete contact.");
      setConfirmOpen(false);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancel" : "Edit"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          Delete
        </Button>
      </div>
      {editing && (
        <ContactForm mode="update" contact={contact} onDone={() => setEditing(false)} />
      )}
      <ConfirmationDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title={`Delete ${contact.fullName}?`}
        description="This will remove the saved contact. Estimates already submitted with this contact's details are unaffected."
        confirmText={isPending ? "Deleting..." : "Delete"}
        confirmVariant="destructive"
      />
    </div>
  );
}
```

#### Reasoning
- Mirrors `user-delete-dialog.tsx`'s use of `ConfirmationDialog` and `react-hot-toast` (already a dependency).
- Inline edit (no extra dialog) avoids adding a Dialog wrapper just for three fields.

### `src/features/contacts/components/contacts-view.tsx`

**Action:** Create
**Why:** Page rendered by the catch-all `[feature]/page.tsx` via the registry. Server component that fetches contacts and renders the add form + list.
**Impact:** New module; new screen at `/dashboard/contacts`.

#### Before
File does not exist yet.

#### After
```tsx
import { headers } from "next/headers";
import { authServerProvider } from "@/auth/server-provider";
import { Card, CardContent } from "@/design-systems/shadcn/components/card";
import { Separator } from "@/design-systems/shadcn/components/separator";
import { listContactsForUser } from "../api/get-contacts";
import { ContactForm } from "./contact-form";
import { ContactRowActions } from "./contact-row-actions";

export async function ContactsView() {
  const session = await authServerProvider.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const contacts = await listContactsForUser(session.user.id);

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Contacts</h1>
        <p className="text-muted-foreground">
          Save agents you work with so you don&apos;t have to retype them on every estimate.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <ContactForm mode="create" />
          <Separator />
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved contacts yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {contacts.map((c) => (
                <li key={c.id} className="py-4 flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="font-semibold">{c.fullName}</p>
                    <p className="text-sm text-muted-foreground">{c.email}</p>
                    <p className="text-sm text-muted-foreground">{c.phone}</p>
                  </div>
                  <ContactRowActions contact={c} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

#### Reasoning
- Server component matching `RecentEstimatesWidget`'s shape: session check, Drizzle read, JSX render. No client data fetching layer.
- One `<Card>` containing both add form and list. No tabs, no toolbar — three fields don't justify them.

### `src/features/contacts/components/contact-picker.tsx`

**Action:** Create
**Why:** Reusable `<Select>` used inside `EstimateView` to populate an agent block.
**Impact:** New module.

#### Before
File does not exist yet.

#### After
```tsx
"use client";

import { Label } from "@/design-systems/shadcn/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/design-systems/shadcn/components/select";
import type { Contact } from "../db/schema";

interface ContactPickerProps {
  label: string;
  contacts: Contact[];
  onSelect: (c: { fullName: string; phone: string; email: string }) => void;
}

const MANUAL_VALUE = "__manual__";

export function ContactPicker({ label, contacts, onSelect }: ContactPickerProps) {
  const handleChange = (value: string) => {
    if (value === MANUAL_VALUE) {
      onSelect({ fullName: "", phone: "", email: "" });
      return;
    }
    const c = contacts.find((x) => x.id === value);
    if (c) onSelect({ fullName: c.fullName, phone: c.phone, email: c.email });
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select onValueChange={handleChange} defaultValue={MANUAL_VALUE}>
        <SelectTrigger>
          <SelectValue placeholder="Choose a saved contact or enter manually" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={MANUAL_VALUE}>— Enter manually —</SelectItem>
          {contacts.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.fullName} · {c.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

#### Reasoning
- Receives `contacts` as a prop. No client fetch, no SWR, no `useEffect`. Data comes from the server page wrapper.
- "Enter manually" is the default so existing first-time users see no behavior change.

### `src/features/contacts/registry.tsx`

**Action:** Create
**Why:** Standard slice registration; adds `/dashboard/contacts` to the sidebar and binds the page.
**Impact:** New module.

#### Before
File does not exist yet.

#### After
```tsx
import { Users } from "lucide-react";
import type { FeatureMetadata } from "@/lib/registry";
import { ContactsView } from "./components/contacts-view";

export const contactsMetadata: FeatureMetadata = {
  id: "contacts",
  name: "Contacts",
  navigation: [
    {
      href: "/dashboard/contacts",
      label: "Contacts",
      icon: Users,
      position: "sidebar",
    },
  ],
  page: <ContactsView />,
};
```

#### Reasoning
- Same shape as `estimateMetadata` (`src/features/estimate/registry.tsx`), with an added `navigation` entry like `dashboardMetadata`.

### `src/config/features-index.ts`

**Action:** Modify
**Why:** Register the new slice so the registry resolves `/dashboard/contacts` and the sidebar shows the nav item.
**Impact:** One new import and one new register call.

#### Before
```ts
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

#### After
```ts
import { featureRegistry } from "@/lib/registry";
import { authMetadata } from "@/features/auth/registry";
import { userManagementMetadata } from "@/features/user-management/registry";
import { dashboardMetadata } from "@/features/dashboard/registry";
import { newDashboardMetadata } from "@/features/new-dashboard/registry";
import { estimateMetadata } from "@/features/estimate/registry";
import { contactsMetadata } from "@/features/contacts/registry";

// Core Features
featureRegistry.register(dashboardMetadata);
featureRegistry.register(authMetadata);
featureRegistry.register(userManagementMetadata);

// New Feature Integration
featureRegistry.register(newDashboardMetadata);
featureRegistry.register(estimateMetadata);
featureRegistry.register(contactsMetadata);

export { featureRegistry };
```

#### Reasoning
- Single import, single register call. Matches the existing comment grouping.

### `src/features/estimate/registry.tsx`

**Action:** Modify
**Why:** Once `EstimateView` requires a `contacts: Contact[]` prop, the existing `page: <EstimateView />` element in the metadata fails to type-check. The catch-all `[feature]/page.tsx` no longer needs to render this — the new `src/app/dashboard/estimate/page.tsx` segment handles the route — so the simplest fix is to drop the `page` field. The `widgets` registration is preserved; the dashboard overview still shows `RecentEstimatesWidget`.
**Impact:** Estimate slice keeps its widget registration; route is now exclusively served by the new server segment.

#### Before
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

#### After
```tsx
import type { FeatureMetadata } from "@/lib/registry";
import { RecentEstimatesWidget } from "./components/recent-estimates-widget";

export const estimateMetadata: FeatureMetadata = {
  id: "estimate",
  name: "Repair Estimates",
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
- The `page` field is now stale: the new `src/app/dashboard/estimate/page.tsx` segment owns `/dashboard/estimate` and Next.js resolves it before the catch-all `[feature]/page.tsx`.
- Removing the `EstimateView` import here also removes the only consumer that constructed `<EstimateView />` without props, restoring type safety after the component's signature change.
- `RecentEstimatesWidget` import and the `widgets` entry are untouched.

### `src/app/dashboard/estimate/page.tsx`

**Action:** Create
**Why:** The estimate form now needs server-side access to the user's contacts. The catch-all `[feature]/page.tsx` only renders a pre-built `FeatureMetadata.page` and can't pass props. A dedicated segment lets Next.js resolve `/dashboard/estimate` here instead of the catch-all and gives us a place to fetch + pass the prop.
**Impact:** Adds one server file. Registry no longer carries an `EstimateView` element; this segment is the sole renderer for the route.

#### Before
File does not exist yet.

#### After
```tsx
import { headers } from "next/headers";
import { authServerProvider } from "@/auth/server-provider";
import { EstimateView } from "@/features/estimate/components/estimate-view";
import { listContactsForUser } from "@/features/contacts/api/get-contacts";

export default async function EstimatePage() {
  const session = await authServerProvider.getSession({ headers: await headers() });
  const contacts = session?.user ? await listContactsForUser(session.user.id) : [];
  return (
    <div className="flex-1 w-full h-full p-4 md:p-6 overflow-auto">
      <EstimateView contacts={contacts} />
    </div>
  );
}
```

#### Reasoning
- Same outer wrapper `<div>` classes as `src/app/dashboard/[feature]/page.tsx` so layout is unchanged.
- Falling back to `[]` for an unauthenticated request is safe — the form's auth gate happens server-side in the action regardless.

### `src/features/estimate/components/estimate-view.tsx`

**Action:** Modify
**Why:** Accept `contacts` prop, render a picker above each agent block, and track two checkbox booleans in component state for the "Save as contact" flags. No new dependency.
**Impact:** Function signature changes from `()` to `({ contacts })`. Adds two `useState` booleans, two `<ContactPicker>` instances, and two `<input type="checkbox">` controls.

#### Before
```tsx
import { useActionState, startTransition, useRef } from "react";
import { uploadEstimatePdfAction } from "../api/actions";
```

#### After
```tsx
import { useActionState, startTransition, useRef, useState } from "react";
import { uploadEstimatePdfAction } from "../api/actions";
import { ContactPicker } from "@/features/contacts/components/contact-picker";
import type { Contact } from "@/features/contacts/db/schema";
```

#### Before
```tsx
export function EstimateView() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState(uploadEstimatePdfAction, null);
  const { register, setValue, handleSubmit, formState: { errors } } = useForm<z.infer<typeof estimateSchema>>({
    resolver: zodResolver(estimateSchema),
    defaultValues: {
      submitterRole: "agent",
      listingAgentName: "",
      listingAgentPhone: "",
      listingAgentEmail: "",
      buyerAgentName: "",
      buyerAgentPhone: "",
      buyerAgentEmail: "",
      propertyAddress: "",
      zipCode: "",
      timeframe: "ASAP (24-48 hours)",
    }
  });
```

#### After
```tsx
interface EstimateViewProps {
  contacts: Contact[];
}

export function EstimateView({ contacts }: EstimateViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveListingAsContact, setSaveListingAsContact] = useState(false);
  const [saveBuyerAsContact, setSaveBuyerAsContact] = useState(false);
  const [state, action] = useActionState(uploadEstimatePdfAction, null);
  const { register, setValue, handleSubmit, formState: { errors } } = useForm<z.infer<typeof estimateSchema>>({
    resolver: zodResolver(estimateSchema),
    defaultValues: {
      submitterRole: "agent",
      listingAgentName: "",
      listingAgentPhone: "",
      listingAgentEmail: "",
      buyerAgentName: "",
      buyerAgentPhone: "",
      buyerAgentEmail: "",
      propertyAddress: "",
      zipCode: "",
      timeframe: "ASAP (24-48 hours)",
    }
  });
```

#### Reasoning
- Single new import and a typed props object. Existing default values and submit flow untouched.

The agent blocks need the picker inserted at the top of each. Show the exact diff for that region too:

#### Before
```tsx
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <Label className="text-lg font-bold">Listing Agent Information</Label>
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentName">Full Name *</Label>
                    <Input id="listingAgentName" {...register("listingAgentName")} />
                    {errors.listingAgentName && <p className="text-xs text-red-500">{errors.listingAgentName.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentPhone">Cell Number *</Label>
                    <Input id="listingAgentPhone" type="tel" {...register("listingAgentPhone")} />
                    {errors.listingAgentPhone && <p className="text-xs text-red-500">{errors.listingAgentPhone.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentEmail">Email *</Label>
                    <Input id="listingAgentEmail" type="email" {...register("listingAgentEmail")} />
                    {errors.listingAgentEmail && <p className="text-xs text-red-500">{errors.listingAgentEmail.message}</p>}
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-lg font-bold">Buyer Agent Information</Label>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentName">Full Name *</Label>
                    <Input id="buyerAgentName" {...register("buyerAgentName")} />
                    {errors.buyerAgentName && <p className="text-xs text-red-500">{errors.buyerAgentName.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentPhone">Cell Number *</Label>
                    <Input id="buyerAgentPhone" type="tel" {...register("buyerAgentPhone")} />
                    {errors.buyerAgentPhone && <p className="text-xs text-red-500">{errors.buyerAgentPhone.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentEmail">Email *</Label>
                    <Input id="buyerAgentEmail" type="email" {...register("buyerAgentEmail")} />
                    {errors.buyerAgentEmail && <p className="text-xs text-red-500">{errors.buyerAgentEmail.message}</p>}
                  </div>
                </div>
              </div>
```

#### After
```tsx
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <Label className="text-lg font-bold">Listing Agent Information</Label>
                  <ContactPicker
                    label="Use saved contact"
                    contacts={contacts}
                    onSelect={(c) => {
                      setValue("listingAgentName", c.fullName, { shouldValidate: true });
                      setValue("listingAgentPhone", c.phone, { shouldValidate: true });
                      setValue("listingAgentEmail", c.email, { shouldValidate: true });
                    }}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentName">Full Name *</Label>
                    <Input id="listingAgentName" {...register("listingAgentName")} />
                    {errors.listingAgentName && <p className="text-xs text-red-500">{errors.listingAgentName.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentPhone">Cell Number *</Label>
                    <Input id="listingAgentPhone" type="tel" {...register("listingAgentPhone")} />
                    {errors.listingAgentPhone && <p className="text-xs text-red-500">{errors.listingAgentPhone.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listingAgentEmail">Email *</Label>
                    <Input id="listingAgentEmail" type="email" {...register("listingAgentEmail")} />
                    {errors.listingAgentEmail && <p className="text-xs text-red-500">{errors.listingAgentEmail.message}</p>}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={saveListingAsContact}
                      onChange={(e) => setSaveListingAsContact(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Save listing agent as a contact
                  </label>
                </div>

                <div className="space-y-4">
                  <Label className="text-lg font-bold">Buyer Agent Information</Label>
                  <ContactPicker
                    label="Use saved contact"
                    contacts={contacts}
                    onSelect={(c) => {
                      setValue("buyerAgentName", c.fullName, { shouldValidate: true });
                      setValue("buyerAgentPhone", c.phone, { shouldValidate: true });
                      setValue("buyerAgentEmail", c.email, { shouldValidate: true });
                    }}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentName">Full Name *</Label>
                    <Input id="buyerAgentName" {...register("buyerAgentName")} />
                    {errors.buyerAgentName && <p className="text-xs text-red-500">{errors.buyerAgentName.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentPhone">Cell Number *</Label>
                    <Input id="buyerAgentPhone" type="tel" {...register("buyerAgentPhone")} />
                    {errors.buyerAgentPhone && <p className="text-xs text-red-500">{errors.buyerAgentPhone.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerAgentEmail">Email *</Label>
                    <Input id="buyerAgentEmail" type="email" {...register("buyerAgentEmail")} />
                    {errors.buyerAgentEmail && <p className="text-xs text-red-500">{errors.buyerAgentEmail.message}</p>}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={saveBuyerAsContact}
                      onChange={(e) => setSaveBuyerAsContact(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Save buyer agent as a contact
                  </label>
                </div>
              </div>
```

The submit handler also forwards the two checkbox flags to the server action:

#### Before
```tsx
  const onSubmit = (data: z.infer<typeof estimateSchema>) => {
    const formData = new FormData();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    formData.append("file", file);
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });

    startTransition(() => {
      action(formData);
    });
  };
```

#### After
```tsx
  const onSubmit = (data: z.infer<typeof estimateSchema>) => {
    const formData = new FormData();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    formData.append("file", file);
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });

    if (saveListingAsContact) formData.append("saveListingAsContact", "1");
    if (saveBuyerAsContact) formData.append("saveBuyerAsContact", "1");

    startTransition(() => {
      action(formData);
    });
  };
```

#### Reasoning
- Two `useState` booleans drive controlled checkboxes — no DOM querying, no extra RHF fields, no change to the zod schema.
- `shouldValidate: true` on `setValue` clears stale error messages after a picker selection.
- No new dependency is added.

### `src/features/estimate/api/actions.ts`

**Action:** Modify
**Why:** Optionally upsert one or two contacts (`listing`, `buyer`) when the user opted in. Idempotent on `(userId, email)` via the unique index.
**Impact:** Two new branches before the file upload step; the existing happy path is unchanged when neither flag is set.

#### Before
```ts
    const metadata = validation.data;

    // Directly stream the file to Vercel Blob Storage
    const { put } = await import("@vercel/blob");
    const blob = await put(`estimates/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`, file, { access: 'public' });
```

#### After
```ts
    const metadata = validation.data;

    // Optionally persist contacts before processing the file.
    const saveListing = formData.get("saveListingAsContact") === "1";
    const saveBuyer = formData.get("saveBuyerAsContact") === "1";
    if (saveListing || saveBuyer) {
      const { contactsTable } = await import("@/features/contacts/db/schema");
      const rows: Array<{ userId: string; fullName: string; phone: string; email: string }> = [];
      if (saveListing) rows.push({
        userId: session.user.id,
        fullName: metadata.listingAgentName,
        phone: metadata.listingAgentPhone,
        email: metadata.listingAgentEmail,
      });
      if (saveBuyer) rows.push({
        userId: session.user.id,
        fullName: metadata.buyerAgentName,
        phone: metadata.buyerAgentPhone,
        email: metadata.buyerAgentEmail,
      });
      if (rows.length > 0) {
        await db.insert(contactsTable).values(rows).onConflictDoNothing();
      }
    }

    // Directly stream the file to Vercel Blob Storage
    const { put } = await import("@vercel/blob");
    const blob = await put(`estimates/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`, file, { access: 'public' });
```

#### Reasoning
- Dynamic `import` matches the existing pattern already used for `@vercel/blob` in this file.
- `onConflictDoNothing()` makes the upsert idempotent without throwing, so re-submitting with the same email never breaks the estimate flow.
- Contact persistence happens before file upload so a failure here returns early without consuming Blob storage. If the AI pipeline later fails, the contact still remains saved — that's desired (the user's intent was to save it, regardless of the estimate's downstream status).

## Validation Plan
- `pnpm lint` — must pass.
- `pnpm exec tsc --noEmit` — must pass (no `tsc` script is defined in `package.json`, so this must be invoked via `pnpm exec` or `npx`). Catches the `EstimateView` prop change and the registry update.
- `pnpm db:generate`:
  - **Primary path**: run as-is and inspect the produced `drizzle/000X_*.sql` for `CREATE TABLE "contacts"`.
  - **Fallback if `contacts` is missing**: `pnpm drizzle-kit generate --schema=./src/db/schema.ts,./src/features/contacts/db/schema.ts,./src/features/estimate/db/schema.ts`. Do not commit until the SQL contains `CREATE TABLE "contacts"` and `CREATE UNIQUE INDEX "contacts_user_email_idx"`.
- `pnpm db:migrate` — applies cleanly.
- Manual QA (must all pass):
  1. Sign in. Sidebar shows a new "Contacts" item.
  2. Navigate to `/dashboard/contacts`. List is empty, add form is visible.
  3. Add contact `Jane Doe / 555-0100 / jane@example.com`. Row appears.
  4. Try to add a second contact with the same email — error "A contact with that email already exists." surfaces; no duplicate row.
  5. Edit it to phone `555-0101`. Persisted on reload.
  6. Delete via confirm dialog. Row removed; reload confirms.
  7. Navigate to `/dashboard/estimate`. Page renders via the new server segment (network tab shows it serving the same path). Two new "Use saved contact" selectors appear above each agent block, defaulted to "Enter manually".
  8. Pick the saved contact in Listing Agent dropdown → the three fields populate; any prior validation error highlights clear.
  9. Submit estimate with a PDF; estimate succeeds (verify a new row in `estimate_requests`).
  10. Manually type a new agent, check "Save listing agent as a contact", submit; verify a new contacts row exists and the AI pipeline still kicks off (existing `recent-estimates-widget` shows the new estimate as `processing`).
  11. Re-submit the same email with the checkbox on — no duplicate row, no error (`onConflictDoNothing()`).
  12. Tick both "Save listing" and "Save buyer" with different emails — two new contact rows.

## Risk Notes
- **Drizzle picking up `contacts`**: `src/db/schema.ts` does **not** currently re-export `estimateRequestTable`, so the migration history (`drizzle/0002_*.sql`) was produced with a non-default schema source. The new re-export of `contactsTable` is the canonical fix going forward. If the default `pnpm db:generate` still misses it, use the explicit-schema fallback in the Validation Plan. Inspect the generated SQL before committing — do not assume.
- **Estimate route override**: `src/app/dashboard/estimate/page.tsx` takes precedence over `[feature]/page.tsx`. Sidebar nav and `dashboardMetadata.quickActions` continue to link to `/dashboard/estimate`. The registry's `page` field is dropped from `estimateMetadata` to keep typing clean now that `EstimateView` requires a `contacts` prop.
- **`useFormStatus` parity**: `ContactForm`'s `SubmitButton` uses `useFormStatus`, matching the existing `EstimateView` pattern. Because both forms are driven by `handleSubmit(onSubmit) + startTransition`, `pending` will not reflect the in-flight server action (the form does not submit via the native `<form action>` mechanism that `useFormStatus` observes). This is identical to current `EstimateView` behavior — out of scope to refactor. UX impact is limited to the button label not switching to "Saving..."; success / error feedback still surfaces via `state.message` / `state.error`.
- **`useEffect` + `useActionState` for post-success behavior**: `ContactForm` reads `state?.success` from `useActionState` inside a `useEffect` to reset the create form and collapse the edit form. This avoids the prior plan's race where `onDone?.()` was called inside the `startTransition` callback (which fires before the action result is known) and could close the edit form before any error message could surface.
- **PII in logs**: existing actions already log errors with `console.error`. New action error messages do not include phone/email values; unique-violation errors return generic copy.
- **Authenticated read in estimate page wrapper**: `listContactsForUser` is only called when `session?.user` is present. Unauthenticated requests get `contacts={[]}`; the upload server action still rejects with `UNAUTHORIZED_ACCESS_DENIED`, matching today's behavior.

## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
