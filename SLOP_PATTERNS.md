# SLOP_PATTERNS.md

A running catalog of anti-patterns ("slop") that have been added to this
project by AI agents and removed after review. Each entry must include:
the pattern, why it is slop, where it appeared, and the rule that prevents
it from coming back.

The bar: **if code does not contribute to the feature's behavior, it does
not belong in the feature.** Logging that nobody reads, callbacks that
nobody depends on, abstractions that have no second caller, fields that
nobody validates against — all slop.

---

## Classification

Slop is classified by the kind of waste it produces:

- **D — Dead code.** Code that executes but whose output is unused, or
  code that never executes.
- **R — Redundant signal.** Code that re-derives or re-reports
  information another code path already produces authoritatively.
- **C — Ceremony.** Wrappers, indirection, or "structure" added without a
  caller that justifies it.
- **S — Speculative.** Code added for a future requirement that does not
  exist yet.
- **U — Unsafe default.** Defaults that mask real failures (silent
  catches, log-and-continue, optional fields treated as guaranteed).
- **M — Misleading naming.** Names that suggest behavior the code does
  not implement.

A single pattern can carry more than one tag.

---

## Entries

### SLOP-001 — `onUploadCompleted` handler that only logs

**Classification:** D, R

**Where:** `src/app/api/estimate/upload/route.ts` (`handleUpload`
options), introduced in `feat/client-side-blob-upload` and removed in
commit `540437a`.

**What it looked like:**

```ts path=null start=null
onUploadCompleted: async ({ blob }) => {
  console.log("Estimate blob uploaded:", blob.url);
},
```

**Why it is slop:**

- The client `upload()` promise already resolves only after the bytes are
  stored at Vercel Blob, and the component immediately dispatches the
  Server Action with the resulting `blobUrl`. The Server Action writes
  the DB row with `status='uploaded'`, which is the authoritative
  "upload completed" signal. The webhook re-reports information the
  app already has (**R**).
- The handler's body was a single `console.log` that nobody consumes
  (**D**). Logging is not a feature.
- It introduced a hard runtime requirement (`VERCEL_BLOB_CALLBACK_URL`
  or a publicly reachable host) that broke local dev with
  `onUploadCompleted provided but no callbackUrl could be determined`.
  Hidden infrastructure coupling for zero behavior.

**Rule to prevent regression:** Do not add Vercel Blob `onUploadCompleted`
(or any webhook handler) unless there is a concrete server-side side
effect that **cannot** be performed by the code path that already awaits
`upload()`. "Logging" and "future analytics" do not qualify.

---

### SLOP-002 — Monolithic Server Action mixing parsing, persistence, and orchestration

**Classification:** C, D, U, M

**Where:** `src/features/estimate/api/actions.ts` —
`uploadEstimatePdfAction`. Existed prior to
`feat/client-side-blob-upload`; broken apart into
`src/features/estimate/lib/{upload-input,contacts,workflow}.ts` in
commit `2ff0f02`.

**What it looked like:** a single ~120-line `async` function that:

```ts path=null start=null
// 1. authenticated the session
// 2. extracted the File and hand-checked the MIME
// 3. declared a Zod schema inline and then manually re-mapped every
//    key from Object.fromEntries(formData.entries()) back into safeParse
//    one property at a time
// 4. dynamically `await import("@/features/contacts/db/schema")`'d the
//    contacts table to push 0–2 rows into a local array and insert them
// 5. dynamically `await import("@vercel/blob")`'d put() and streamed
//    the file
// 6. inserted the estimate row
// 7. inlined an `after(async () => { ... })` block that ran the Mastra
//    workflow, logged on non-success, and had a guarded fallback
//    db.update(...) — the *exact same* block was duplicated verbatim
//    inside retryEstimateAction
// 8. wrapped the whole thing in `} catch (error: any) {`
```

**Why it is slop:**

- **C — Ceremony with no factoring.** Six unrelated responsibilities
  (auth, validation, contact persistence, blob I/O, row insert, async
  orchestration) lived in one function. The function name promised
  "upload a PDF"; the body did six things. None of the other 5
  concerns were named.
- **D — Duplication.** The `after(async () => { ... mastra workflow ...
  guarded fallback ... revalidatePath('/dashboard') })` block was
  copy-pasted verbatim into `retryEstimateAction`. Two copies of an
  orchestration block guarantees drift on the next edit. Replaced by a
  single `triggerSummarizeEstimate()` helper called from both sites.
- **D — Inline schema re-mapping.** The action declared a Zod schema
  and then wrote 10 lines spelling out `submitterRole: rawData.submitterRole,
  listingAgentName: rawData.listingAgentName, ...`. `Object.fromEntries(
  formData.entries())` is the natural input shape; the re-map produced
  zero validation benefit and grew linearly with every new field.
- **U — `catch (error: any)`.** Disabled type checking on the error
  path and used `error.message || "..."` which silently degrades when
  the thrown value is not an `Error`. Replaced with
  `catch (error)` + `error instanceof Error ? error.message : "..."`
  in the touched functions.
- **U — Dynamic `await import(...)` for server-only modules.** The
  contacts table and `@vercel/blob` were lazy-loaded for no benefit;
  this is a Server Action, not a client bundle. The dynamic imports
  hid dependencies from grep and from the type checker's reach.
- **M — Function name lies.** `uploadEstimatePdfAction` implied a
  single responsibility; behaviorally it was a `do-everything` action.
  Renaming would not have fixed it — the function had to be cut apart.

**Authoritative alternative (now in the codebase):**

- `src/features/estimate/lib/upload-input.ts` — `parseUploadInput(formData)`
  returns a discriminated `{ ok: true, data, ...flags } | { ok: false,
  error }`. No inline re-mapping.
- `src/features/estimate/lib/contacts.ts` — `saveSelectedContacts(...)`
  with a static import of `contactsTable`.
- `src/features/estimate/lib/workflow.ts` — `triggerSummarizeEstimate({
  estimateRequestId, fileUrl, errorLabel? })` collapses both call
  sites' `after()` blocks.
- `src/features/estimate/api/actions.ts` — `uploadEstimatePdfAction`
  and `retryEstimateAction` are now thin coordinators: auth → parse →
  side effects → return.

**Rule to prevent regression:** Server Actions are *coordinators*, not
workbenches. If an action's body exceeds ~40 lines, or names more than
one responsibility (parsing **and** persistence **and** orchestration),
the extra responsibilities must live in `lib/` helpers in the same
feature slice. A block of code that appears verbatim in two actions
must be a helper, not a copy. `catch (error: any)` and dynamic
`await import(...)` for server-only modules are not permitted.

---

## How to add an entry

When a reviewer flags slop:

1. Assign the next `SLOP-NNN` id.
2. Title it with the offending symbol or pattern, not a vague phrase.
3. Tag it from the classification list (combine tags when more than one
   applies).
4. Quote the offending snippet with `path=null start=null` so it is not
   indexed as live source.
5. State the authoritative alternative that already exists in the
   codebase (or note that no alternative was needed because the
   requirement itself was invented).
6. Write a one-sentence forward rule that an AI agent can apply
   mechanically on the next review.
