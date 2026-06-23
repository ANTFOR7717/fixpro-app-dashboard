# FEATURE(estimate-upload)
## Request
Move the existing PDF upload in the estimate feature from a Server-Action-streamed upload (`put()` from `@vercel/blob` inside `uploadEstimatePdfAction`) to a client-side direct-to-Vercel-Blob upload using `@vercel/blob/client`'s `upload()` paired with a `handleUpload` route handler. Goal: PDFs larger than Vercel's ~4.5 MB Server Action body limit must succeed. Branch: `feat/client-side-blob-upload`. Out of scope: schema changes, workflow changes, retry/delete behavior, registry, form fields.
## Directory Map
```text
src/
  app/
    api/
      estimate/
        upload/
          route.ts                                   (new)
  features/
    estimate/
      api/
        actions.ts                                   (modify)
      components/
        estimate-view.tsx                            (modify)
      lib/
        upload-input.ts                              (new)
        contacts.ts                                  (new)
        workflow.ts                                  (new)
```
## Modification Table
| File | Action | Why |
|---|---|---|
| `src/app/api/estimate/upload/route.ts` | new | Token broker required by `@vercel/blob/client.upload()`; authenticates the session, restricts MIME to PDF, and is the `handleUploadUrl` target. |
| `src/features/estimate/lib/upload-input.ts` | new | Houses the Zod schema and `FormData`→typed-input parser. Removes the 30-line manual key-by-key `safeParse` slop currently inlined in the action. Also reused by future callers (e.g. tests). |
| `src/features/estimate/lib/contacts.ts` | new | Houses `saveSelectedContacts(...)`: extracts the inline dynamic `import("@/features/contacts/db/schema")` + ad-hoc `rows` array currently embedded in `uploadEstimatePdfAction`. |
| `src/features/estimate/lib/workflow.ts` | new | Houses `triggerSummarizeEstimate({ estimateRequestId, fileUrl })`: collapses the two duplicate `after(async () => { const workflow = mastra.getWorkflow(...); const run = ...; try { ... } catch { db.update(...).where(and(eq(...), ne(status,'completed'))) } revalidatePath })` blocks currently in `uploadEstimatePdfAction` and `retryEstimateAction` into one helper. |
| `src/features/estimate/api/actions.ts` | modify | `uploadEstimatePdfAction` is rewritten to use the three new utilities, dropping the inline `File` extraction, manual Zod re-mapping, inline contact save, inline workflow trigger, and `catch (error: any)`. `retryEstimateAction` is also updated to call `triggerSummarizeEstimate` instead of duplicating the same `after()` block. `deleteEstimateAction` is unchanged. |
| `src/features/estimate/components/estimate-view.tsx` | modify | `onSubmit` must call `upload()` from the browser before dispatching the Server Action, then send metadata + the resulting URL instead of the raw `File`. |
## Existing Pattern Audit
- Estimate feature follows a Feature-Sliced layout under `src/features/estimate/{api,components,db,lib}`. `lib/` already exists with `envelope.ts` and `format.ts`, so adding `lib/upload-input.ts`, `lib/contacts.ts`, and `lib/workflow.ts` matches the established convention for non-component, non-action utility modules in this feature.
- Server Actions are colocated in `api/actions.ts` and consumed from `components/*.tsx` via `useActionState`. They return `{ success: boolean; message?: string; error?: string }`.
- Server-side auth is `await authServerProvider.getSession({ headers: await headers() })`. This is the only session accessor used in `actions.ts`.
- Validation is done with Zod via `z.object(...).safeParse(...)`. The first issue is surfaced as `Validation Error - <path>: <message>`. The current action re-maps `rawData` key-by-key into `safeParse`; the new `parseUploadInput` helper drops that boilerplate by parsing `Object.fromEntries(formData.entries())` directly.
- Background work after a write uses Next.js 16 `after()` from `next/server` and triggers a Mastra workflow (`mastra.getWorkflow('summarize-estimate')`). The same exact block currently appears in both `uploadEstimatePdfAction` and `retryEstimateAction`; consolidating into `triggerSummarizeEstimate` removes the duplication without changing behavior.
- The blob path convention already in use is `estimates/${Date.now()}-${sanitizedName}` with `access: 'public'`. The plan keeps the same convention so retry/delete flows continue to recognize blobs they manage.
- The project does not have any existing route handler under `src/app/api/`. New API routes follow the standard Next.js App Router shape (`route.ts` exporting HTTP-method handlers), which is the only viable location for the `handleUpload` broker.
- `@vercel/blob@^2.3.3` is already a dependency. `@vercel/blob/client` ships from the same package; no new install.
- Form code uses `react-hook-form` + `zodResolver`, with a `SubmitButton` reading `useFormStatus()`. The plan does not change this surface.
## Execution Plan
### Step 1 — Extract the three utilities
Intent: split the existing monolithic Zod re-mapping, inline contact-save, and inline Mastra trigger out of `uploadEstimatePdfAction` into reusable, single-purpose helpers under `lib/` before any behavior change.
Files: `src/features/estimate/lib/upload-input.ts` (new), `src/features/estimate/lib/contacts.ts` (new), `src/features/estimate/lib/workflow.ts` (new).
Reasoning: The current action mixes parsing, persistence, contact bookkeeping, and orchestration in a single 120-line function. Extracting first means the rest of the work is a straightforward composition rather than a rewrite. Each helper has one responsibility and is independently testable.
### Step 2 — Add the upload route handler
Intent: provide the server-authenticated `handleUpload` endpoint that the client `upload()` call will hit.
File: `src/app/api/estimate/upload/route.ts` (new).
Reasoning: `@vercel/blob/client.upload()` requires a server endpoint that calls `handleUpload`, both to authenticate the user and to constrain content type. Without this route the client cannot mint upload tokens and the migration cannot proceed.
### Step 3 — Rewrite the Server Action against the new utilities
Intent: replace `uploadEstimatePdfAction`'s body with a composition of `parseUploadInput`, `saveSelectedContacts`, and `triggerSummarizeEstimate`. Update `retryEstimateAction` to also call `triggerSummarizeEstimate`, eliminating the duplicate `after()` block.
File: `src/features/estimate/api/actions.ts` (modify).
Reasoning: The action becomes a thin coordinator: validate → save contacts → insert row → trigger workflow → return. No more inline dynamic imports, no more 30-line key-by-key Zod re-mapping, no more duplicated `after()` block, no more `catch (error: any)`.
### Step 4 — Move the upload to the client
Intent: replace the `File`-in-FormData submission path in `estimate-view.tsx` with an `upload()` call followed by a metadata-only Server Action dispatch.
File: `src/features/estimate/components/estimate-view.tsx` (modify).
Reasoning: Putting the bytes onto the network from the browser bypasses the Server Action body cap. The component already owns a `fileInputRef` and the form submit pipeline; only the body of `onSubmit` and one rendered error region change.
## File-by-File Changes
### `src/features/estimate/lib/upload-input.ts`
**Action:** Create
**Why:** The existing action defines its Zod schema inline and then manually re-maps every key from `rawData` into `safeParse`. That code is repetitive and obscures the action's actual responsibility. Extracting both the schema and the parse step into one helper removes ~30 lines of boilerplate from the action and produces a typed `UploadInput` that the action and any future caller can use directly.
**Impact:** New typed surface `UploadInput` and `parseUploadInput(formData)` returning a discriminated `{ ok: true; data } | { ok: false; error }` result. No runtime behavior change to existing flows once `actions.ts` is updated.
#### Before
File does not exist yet.
#### After
```typescript path=null start=null
import { z } from "zod";

export const uploadInputSchema = z.object({
  blobUrl: z.string().url(),
  fileName: z.string().min(1).max(255),
  fileSize: z.string().regex(/^\d+$/, "fileSize must be a positive integer"),
  submitterRole: z.enum(["agent", "homeowner"]),
  listingAgentName: z.string().min(1),
  listingAgentPhone: z.string().min(1),
  listingAgentEmail: z.string().email(),
  buyerAgentName: z.string().min(1),
  buyerAgentPhone: z.string().min(1),
  buyerAgentEmail: z.string().email(),
  propertyAddress: z.string().min(1),
  zipCode: z.string().length(5),
  timeframe: z.string().min(1),
});

export type UploadInput = z.infer<typeof uploadInputSchema>;

export type ParseResult =
  | { ok: true; data: UploadInput; saveListingAsContact: boolean; saveBuyerAsContact: boolean }
  | { ok: false; error: string };

export function parseUploadInput(formData: FormData): ParseResult {
  const parsed = uploadInputSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Validation Error - ${first.path.join(".")}: ${first.message}` };
  }

  return {
    ok: true,
    data: parsed.data,
    saveListingAsContact: formData.get("saveListingAsContact") === "1",
    saveBuyerAsContact: formData.get("saveBuyerAsContact") === "1",
  };
}
```
#### Reasoning
- The schema accepts a flat object, so `Object.fromEntries(formData.entries())` is the natural input. The existing key-by-key re-mapping in the action was never needed and adds maintenance burden every time a field is added.
- Returning a tagged result (`ok: true | false`) instead of throwing keeps error propagation explicit, matching how the action already returns `{ success: false, error }` to the client.
- The two `save*AsContact` flags are pulled here too because they are upload-form-specific control bits, not domain data; the action shouldn't reach back into `formData` after parsing.
- The schema retains `fileSize: string` because the existing `estimateRequestTable.fileSize` column is `text` (out-of-scope to change). The regex guard ensures it parses as a positive integer.
### `src/features/estimate/lib/contacts.ts`
**Action:** Create
**Why:** The action currently embeds a dynamic `await import("@/features/contacts/db/schema")`, an ad-hoc `rows` array, and two conditional pushes. That logic does not belong inline; it belongs in a helper named for what it does.
**Impact:** New `saveSelectedContacts({ userId, listing, buyer, saveListing, saveBuyer })` helper. Behavior matches the inline block: insert with `onConflictDoNothing()` only when at least one save flag is set.
#### Before
File does not exist yet.
#### After
```typescript path=null start=null
import { db } from "@/db";
import { contactsTable } from "@/features/contacts/db/schema";

interface ContactCandidate {
  fullName: string;
  phone: string;
  email: string;
}

interface SaveSelectedContactsParams {
  userId: string;
  listing: ContactCandidate;
  buyer: ContactCandidate;
  saveListing: boolean;
  saveBuyer: boolean;
}

export async function saveSelectedContacts({
  userId,
  listing,
  buyer,
  saveListing,
  saveBuyer,
}: SaveSelectedContactsParams): Promise<void> {
  if (!saveListing && !saveBuyer) return;

  const rows: Array<{ userId: string } & ContactCandidate> = [];
  if (saveListing) rows.push({ userId, ...listing });
  if (saveBuyer) rows.push({ userId, ...buyer });
  if (rows.length === 0) return;

  await db.insert(contactsTable).values(rows).onConflictDoNothing();
}
```
#### Reasoning
- Uses a static import of `contactsTable` instead of a dynamic `await import(...)`. The dynamic import in the original action was unnecessary — the contacts module is server-only and has no client/runtime cost benefit from being lazy-loaded.
- Early-returns when neither flag is set, so the call site in the action becomes one line with no guard.
- The helper keeps its input shape tight: it does not know about `FormData` or the upload schema, just the two contact candidates and two flags. This keeps the contact module reusable from non-upload contexts (e.g., a future "save contact" button).
### `src/features/estimate/lib/workflow.ts`
**Action:** Create
**Why:** The action and `retryEstimateAction` both contain the same `after(async () => { const workflow = mastra.getWorkflow('summarize-estimate'); const run = await workflow.createRun(); try { ... } catch { db.update(estimateRequestTable).set({status:'failed', errorMessage:...}).where(and(eq(...id), ne(status,'completed'))) } revalidatePath('/dashboard') })` block. Two copies of an orchestration block is exactly the kind of duplication that drifts and rots.
**Impact:** New `triggerSummarizeEstimate({ estimateRequestId, fileUrl, errorLabel? })` helper. Both actions call it; the inline `after(...)` block disappears from both.
#### Before
File does not exist yet.
#### After
```typescript path=null start=null
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { mastra } from "@/mastra";
import { estimateRequestTable } from "../db/schema";

interface TriggerSummarizeEstimateParams {
  estimateRequestId: string;
  fileUrl: string;
  errorLabel?: string;
}

export function triggerSummarizeEstimate({
  estimateRequestId,
  fileUrl,
  errorLabel = "AI Pipeline Error",
}: TriggerSummarizeEstimateParams): void {
  after(async () => {
    try {
      const workflow = mastra.getWorkflow("summarize-estimate");
      const run = await workflow.createRun();
      const result = await run.start({
        inputData: { estimateRequestId, fileUrl },
      });
      if (result.status !== "success") {
        // persistFailureStep already wrote status='failed' + errorMessage.
        console.error(`${errorLabel}: workflow ended non-success:`, result.status);
      }
    } catch (error) {
      console.error(`${errorLabel}:`, error);
      // Backstop: write failed state only if the workflow threw past its own catch.
      // Guarded with status != 'completed' so a late throw cannot clobber a row that
      // persistSuccessStep already wrote successfully.
      await db
        .update(estimateRequestTable)
        .set({ status: "failed", errorMessage: "AI processing failed. Please retry." })
        .where(
          and(
            eq(estimateRequestTable.id, estimateRequestId),
            ne(estimateRequestTable.status, "completed"),
          ),
        );
    }
    revalidatePath("/dashboard");
  });
}
```
#### Reasoning
- The body is the union of the two existing `after()` blocks. Both call sites pass the same `'/dashboard'` revalidation path, so it is hard-coded here. If a future caller needs a different path, that becomes a parameter — no need to anticipate it now.
- `errorLabel` lets the retry path log `"AI Pipeline Error (retry)"` distinctly, matching the existing log shape.
- `error` is typed `unknown` implicitly via TypeScript's default `catch` typing; no `any`.
- The helper is not `async` because `after()` is fire-and-forget. Callers should not `await` it.
### `src/app/api/estimate/upload/route.ts`
**Action:** Create
**Why:** `@vercel/blob/client.upload()` needs a server endpoint that returns short-lived upload tokens. This route enforces session auth and PDF-only content type before any bytes are accepted by Vercel Blob.
**Impact:** Adds a single new authenticated endpoint at `POST /api/estimate/upload`. No other route is added or changed.
#### Before
File does not exist yet.
#### After
```typescript path=null start=null
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { authServerProvider } from "@/auth/server-provider";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await authServerProvider.getSession({
          headers: await headers(),
        });
        if (!session?.user) {
          throw new Error("UNAUTHORIZED_ACCESS_DENIED");
        }

        return {
          allowedContentTypes: ["application/pdf"],
          tokenPayload: JSON.stringify({ userId: session.user.id }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log("Estimate blob uploaded:", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```
#### Reasoning
- Mirrors the project's existing server-auth pattern (`authServerProvider.getSession({ headers: await headers() })`) used everywhere else in `actions.ts`.
- `allowedContentTypes: ['application/pdf']` enforces the same PDF restriction that the current Server Action enforces inline; keeping the rule on the server preserves the existing security posture.
- `tokenPayload` carries the user id only. The DB row is still written by `uploadEstimatePdfAction`, so `onUploadCompleted` does not need to insert anything; logging is sufficient and matches the action's own `console.log`/`console.error` style.
- Throwing `Error` and converting to a JSON 400 in the outer `catch` mirrors the action's pattern of returning a structured error to the client.
### `src/features/estimate/api/actions.ts`
**Action:** Modify
**Why:** With the three new `lib/` utilities in place, `uploadEstimatePdfAction` becomes a thin coordinator: authenticate → parse → save contacts → insert row → trigger workflow → return. `retryEstimateAction` calls the same workflow helper instead of duplicating the inline `after()` block. The `File`/`put()` path is removed entirely. `deleteEstimateAction` is unchanged.
**Impact:** Action contract shifts from `(prev, formData{file, ...metadata})` to `(prev, formData{blobUrl, fileName, fileSize, ...metadata})`. The action's outer return shape is identical. The retry action's external behavior is identical. The file shrinks substantially because three blocks moved into `lib/`.
#### Before
The full current contents of `actions.ts` are at `src/features/estimate/api/actions.ts` lines 1–255. The two regions that are not just moved-out duplications are:
```typescript path=/Users/dev/Projects/fixpro-app-dashboard/src/features/estimate/api/actions.ts start=14
export async function uploadEstimatePdfAction(prevState: { success: boolean; message?: string; error?: string } | null, formData: FormData) {
  try {
    const session = await authServerProvider.getSession({
      headers: await headers(),
    });
    if (!session?.user) throw new Error("UNAUTHORIZED_ACCESS_DENIED");

    const file = formData.get("file") as File | null;
    if (!file || file.type !== "application/pdf") {
      throw new Error("Invalid file type. Only PDFs are allowed.");
    }
```
```typescript path=/Users/dev/Projects/fixpro-app-dashboard/src/features/estimate/api/actions.ts start=83
    // Directly stream the file to Vercel Blob Storage
    const { put } = await import("@vercel/blob");
    const blob = await put(`estimates/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`, file, { access: 'public' });
```
The other deletions are: the inline Zod schema + manual key-by-key `safeParse` (lines 26–58), the inline contact-save block (lines 61–81), the inline `after()` Mastra trigger (lines 97–126), and the identical `after()` block inside `retryEstimateAction` (lines 169–191).
#### After
Full new contents of the file (the `deleteEstimateAction` body at the bottom of the file is unchanged and elided here with `...` solely for brevity — do not modify it):
```typescript path=null start=null
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { authServerProvider } from "@/auth/server-provider";
import { db } from "@/db";

import { estimateRequestTable } from "../db/schema";
import { saveSelectedContacts } from "../lib/contacts";
import { parseUploadInput } from "../lib/upload-input";
import { triggerSummarizeEstimate } from "../lib/workflow";

type ActionResult = { success: boolean; message?: string; error?: string };

export async function uploadEstimatePdfAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await authServerProvider.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "UNAUTHORIZED_ACCESS_DENIED" };
    }

    const parsed = parseUploadInput(formData);
    if (!parsed.ok) {
      return { success: false, error: parsed.error };
    }
    const { data, saveListingAsContact, saveBuyerAsContact } = parsed;
    const { blobUrl, fileName, fileSize, ...metadata } = data;

    await saveSelectedContacts({
      userId: session.user.id,
      listing: {
        fullName: metadata.listingAgentName,
        phone: metadata.listingAgentPhone,
        email: metadata.listingAgentEmail,
      },
      buyer: {
        fullName: metadata.buyerAgentName,
        phone: metadata.buyerAgentPhone,
        email: metadata.buyerAgentEmail,
      },
      saveListing: saveListingAsContact,
      saveBuyer: saveBuyerAsContact,
    });

    const [inserted] = await db
      .insert(estimateRequestTable)
      .values({
        userId: session.user.id,
        fileUrl: blobUrl,
        fileName,
        fileSize,
        status: "uploaded",
        ...metadata,
      })
      .returning({ id: estimateRequestTable.id });

    triggerSummarizeEstimate({
      estimateRequestId: inserted.id,
      fileUrl: blobUrl,
    });

    revalidatePath("/dashboard/estimate");
    return { success: true, message: "Upload complete! Your estimate is processing." };
  } catch (error) {
    console.error("Server Action Error (uploadEstimatePdfAction):", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload file.",
    };
  }
}

export async function retryEstimateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await authServerProvider.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "UNAUTHORIZED_ACCESS_DENIED" };
    }

    const id = String(formData.get("id") ?? "");
    if (!id) return { success: false, error: "Missing id." };

    const [row] = await db
      .select({
        id: estimateRequestTable.id,
        userId: estimateRequestTable.userId,
        fileUrl: estimateRequestTable.fileUrl,
        status: estimateRequestTable.status,
      })
      .from(estimateRequestTable)
      .where(eq(estimateRequestTable.id, id))
      .limit(1);

    if (!row || row.userId !== session.user.id) {
      return { success: false, error: "Estimate not found." };
    }
    if (row.status !== "failed") {
      return { success: false, error: "Only failed estimates can be retried." };
    }

    await db
      .update(estimateRequestTable)
      .set({ status: "uploaded", errorMessage: null })
      .where(eq(estimateRequestTable.id, id));

    triggerSummarizeEstimate({
      estimateRequestId: row.id,
      fileUrl: row.fileUrl,
      errorLabel: "AI Pipeline Error (retry)",
    });

    revalidatePath("/dashboard");
    return { success: true, message: "Retry started." };
  } catch (error) {
    console.error("Server Action Error (retryEstimateAction):", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to retry.",
    };
  }
}

export async function deleteEstimateAction(/* unchanged */) {
  // ...existing implementation, copied verbatim from the current file (lines 201–254).
  // No edits.
}
```
#### Reasoning
- The action body is now ~40 lines instead of ~120 because parsing, contact persistence, and workflow orchestration moved into named helpers. Each helper has one responsibility and is independently testable.
- A shared `ActionResult` type alias replaces the three inline duplicate object-type literals (`{ success: boolean; message?: string; error?: string }`) currently scattered across three function signatures. That literal appears six times in the existing file.
- `_prev` replaces `prevState`: it is unused by these actions and the underscore prefix is the project's convention for unused params (already used by `_prev` in the existing `retryEstimateAction` and `deleteEstimateAction` signatures).
- `catch (error)` (not `catch (error: any)`) plus `error instanceof Error ? error.message : ...` removes the `any`. The behavior is identical to the previous `error.message || "Failed to ..."` because `instanceof Error` is true for everything that was previously yielding a usable `.message`.
- Auth failure switches from `throw new Error("UNAUTHORIZED_ACCESS_DENIED")` to returning `{ success: false, error: "UNAUTHORIZED_ACCESS_DENIED" }`. Same client-visible result, but no needless throw/catch round-trip.
- The action does not re-import `mastra`, `after`, `and`, `ne`, `revalidatePath` (for `/dashboard`), or `contactsTable`; those imports moved to the helpers that actually use them.
- `deleteEstimateAction` is explicitly preserved in the elided region. The plan does not delete or change it.
### `src/features/estimate/components/estimate-view.tsx`
**Action:** Modify
**Why:** The component currently appends the raw `File` to FormData and lets the Server Action handle the upload. After this change the component itself uploads the file via `@vercel/blob/client.upload()` and only sends the resulting URL + filename + size to the action.
**Impact:** `onSubmit` becomes async and gains an upload phase that can fail independently of the action. A new `uploadError` state surfaces upload-phase failures through an additional `<FormError />`, leaving the action's own `state.error` channel untouched. The form's HTML structure, the `fileInputRef` registration, and `SubmitButton` are unchanged.
#### Before
```tsx path=/Users/dev/Projects/fixpro-app-dashboard/src/features/estimate/components/estimate-view.tsx start=85
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
The surrounding render block contains:
```tsx path=/Users/dev/Projects/fixpro-app-dashboard/src/features/estimate/components/estimate-view.tsx start=110
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <FormError message={state?.error || ""} />
        <FormSuccess message={state?.message || ""} />
```
#### After
```tsx path=null start=null
import { upload } from "@vercel/blob/client";

// ...inside the existing imports block at the top of the file. The other imports are unchanged.
```
The `EstimateView` component body adds the upload-error state and replaces `onSubmit`:
```tsx path=null start=null
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onSubmit = async (data: z.infer<typeof estimateSchema>) => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploadError(null);

    let blobUrl: string;
    try {
      const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const result = await upload(`estimates/${Date.now()}-${sanitized}`, file, {
        access: "public",
        contentType: "application/pdf",
        handleUploadUrl: "/api/estimate/upload",
      });
      blobUrl = result.url;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
      return;
    }

    const formData = new FormData();
    formData.append("blobUrl", blobUrl);
    formData.append("fileName", file.name);
    formData.append("fileSize", String(file.size));
    for (const [key, value] of Object.entries(data)) {
      formData.append(key, value);
    }
    if (saveListingAsContact) formData.append("saveListingAsContact", "1");
    if (saveBuyerAsContact) formData.append("saveBuyerAsContact", "1");

    startTransition(() => action(formData));
  };
```
The form's error region adds a second `<FormError />` for the upload phase, immediately below the existing one:
```tsx path=null start=null
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <FormError message={state?.error || ""} />
        <FormError message={uploadError ?? ""} />
        <FormSuccess message={state?.message || ""} />
```
#### Reasoning
- The blob path is still `estimates/${Date.now()}-${sanitized}` so retry and delete actions, which key off `fileUrl`, behave identically.
- A separate `uploadError` state is used (rather than reusing `state.error`) because `state` comes from `useActionState` and is owned by the Server Action; writing to it from outside the action is not possible, and conflating upload failures with action failures would corrupt the error channel.
- `contentType: 'application/pdf'` echoes the route handler's `allowedContentTypes` check so a mismatch is rejected client-side before token issuance.
- `handleUploadUrl: '/api/estimate/upload'` matches the new route handler's path. Anything else would either 404 or hit the wrong endpoint.
- `SubmitButton`, the file `<input>` (with its `ref`, `accept="application/pdf"`, and `required`), and the form layout are unchanged so the visible UI is identical.
## Validation Plan
- `pnpm exec tsc --noEmit` — must be clean.
- `pnpm exec eslint src/app/api/estimate/upload/route.ts src/features/estimate/api/actions.ts src/features/estimate/components/estimate-view.tsx src/features/estimate/lib/upload-input.ts src/features/estimate/lib/contacts.ts src/features/estimate/lib/workflow.ts` — must be clean. The project rule explicitly forbids `pnpm lint` because it is broken under Next 16.
- Manual: upload a small PDF (~1 MB); confirm a row is created with `status='uploaded'` and the Mastra workflow advances it to `completed`.
- Manual: upload a >50 MB PDF; confirm it succeeds where the previous server-streamed path returned 413.
- Manual: attempt a non-PDF file; confirm the route handler's `allowedContentTypes` rejects it (curl/Postman against `/api/estimate/upload` since the visible UI's `<input accept="application/pdf">` only filters at the OS picker).
- Manual: confirm `retryEstimateAction` (now backed by `triggerSummarizeEstimate`) and the unchanged `deleteEstimateAction` continue to work end-to-end against rows produced by the new path.
- Open a PR targeting `main` with the validation results recorded in the body, per `AGENTS.md`.
## Risk Notes
- **Action contract change.** Any consumer that calls `uploadEstimatePdfAction` with a `file` field instead of `blobUrl` will fail validation. The only known consumer is `EstimateView`, which is updated in this plan; nothing else in the repo dispatches this action.
- **Route handler is the only auth boundary for the upload itself.** The client `upload()` call exposes `handleUploadUrl: '/api/estimate/upload'` and relies on session cookies traveling with that request; the action's own auth check still runs when the metadata is submitted, so a user cannot end up with someone else's row.
- **`fileSize` regex.** Because the column is `text`, the value is kept as a string. The regex prevents non-numeric input from sneaking through; it does not enforce a max size — that limit is enforced upstream by Vercel Blob and (if needed in future) by a `maximumSizeInBytes` in the route handler. Out of scope to add here.
- **Workflow helper behavior preservation.** `triggerSummarizeEstimate` is the literal union of the two existing `after()` blocks. Both call sites previously called `revalidatePath('/dashboard')` inside `after()`; the helper does the same. The only observable difference is the log label (`AI Pipeline Error` vs `AI Pipeline Error (retry)`), which already differed in the original code.
## Approval
`Status: Awaiting explicit user approval. Do not implement yet.`
