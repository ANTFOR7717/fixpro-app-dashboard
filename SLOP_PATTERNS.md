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
