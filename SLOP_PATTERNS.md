# SLOP_PATTERNS.md

A catalog of **named anti-patterns** to watch for in this codebase and
in any code an AI agent proposes. Each entry is named like a design
pattern so reviewers can call it out by name in PRs:

> "This is a Phantom Receiver — drop it."

Entries describe the pattern at a level general enough to recognize in
unrelated code. The specific incident that produced the entry lives
only as an Example, never as the definition.

## The bar

If code does not contribute to the feature's behavior, it does not
belong in the feature. Wrappers without callers, callbacks nobody
depends on, abstractions invented for a hypothetical second use,
silent error paths — all slop.

## Classification tags

Each anti-pattern carries one or more tags:

- **D — Dead Path.** Executes but no consumer reads its effect.
- **R — Redundant Signal.** Re-derives information another code path
  already produces authoritatively.
- **C — Ceremony.** Wrappers, indirection, or "structure" added
  without a justifying caller.
- **S — Speculative.** Built for a future requirement that does not
  exist.
- **U — Unsafe Default.** Defaults that hide failures (broad catches,
  log-and-continue, optional treated as guaranteed).
- **M — Misleading Name.** Names that imply behavior the code does
  not perform.
- **G — God Function.** One unit holds multiple unrelated
  responsibilities.

## Anti-patterns

### SLOP-001 — Phantom Receiver

**Tags:** D, R

A handler, callback, webhook, listener, or subscriber that fires on an
event that the caller already observes directly. The receiver's body
either logs, no-ops, or recomputes a value the primary code path
already has in hand.

**Detection cues:**

- Two code paths react to the same event; only one has a downstream
  consumer.
- The "secondary" path's body is mostly `console.log`, metrics-only,
  or a TODO.
- Removing the receiver leaves all feature behavior intact.
- The receiver introduces an infrastructure requirement (public URL,
  open port, additional env var) disproportionate to what it does.

**Why it's slop:** It re-reports what is already known (R), runs code
nobody consumes (D), and trades real infrastructure coupling for zero
behavior.

**Rule:** Do not add a second observer for an event the primary code
path already awaits. If a server-side side effect is genuinely
required *and* the primary path cannot perform it, justify the
receiver in the PR description by naming the side effect.

**Example (this repo):** `onUploadCompleted` on the Vercel Blob
`handleUpload` route. The client `upload()` promise already resolved
on completion and the Server Action wrote the DB row from that
resolution. The webhook body was a `console.log`, and its presence
required `VERCEL_BLOB_CALLBACK_URL`, breaking local dev. Removed in
commit `540437a`.

### SLOP-002 — God Action

**Tags:** G, C, M

A Server Action (or any single entry-point function) that names one
responsibility but performs many: authentication, input parsing,
multi-table persistence, external I/O, background orchestration, and
error shaping all inlined into one body. Helpers exist nowhere; the
function grows linearly with every new requirement.

**Detection cues:**

- Body exceeds ~40 lines or spans more than one logical "phase."
- The function's name describes only one of its responsibilities; the
  rest are invisible from the call site.
- Imports inside the body include the DB client, validation library,
  blob/SDK clients, async orchestration primitives, and cache
  revalidation calls all at once.
- A reviewer can identify ≥3 distinct concerns without reading
  closely.

**Why it's slop:** The function's name lies about its scope (M), it
accretes ceremony around each new concern (C), and it concentrates
unrelated responsibilities into a single change-risk unit (G). The
next edit either grows the monolith or rewrites it.

**Rule:** Entry-point functions are **coordinators**: auth → parse →
side effects → return. Each named responsibility beyond coordination
lives in a `lib/` helper in the same feature slice. If a body grows
past ~40 lines, extract before adding more.

**Example (this repo):** `uploadEstimatePdfAction` previously inlined
auth, MIME check, Zod schema declaration, contact persistence, blob
`put()`, row insert, and a Mastra `after()` block. Broken apart in
commit `2ff0f02` into `lib/upload-input.ts`, `lib/contacts.ts`, and
`lib/workflow.ts`.

### SLOP-003 — Copy-Paste Orchestration

**Tags:** D, C

A nontrivial block — typically background work, error recovery, or
notification logic — appears verbatim (or near-verbatim) in two or
more call sites instead of behind a named helper. The duplicates are
guaranteed to drift on the next edit; one site gets a fix and the
other does not.

**Detection cues:**

- Searching for a distinctive substring of the block returns ≥2 hits.
- The duplicate sites differ only in 1–2 parameters (an id, a label,
  a path).
- The block has its own try/catch and side effects; it is not a
  trivial one-liner.

**Why it's slop:** Each copy is dead weight at the second site (D) and
adds ceremony to every future edit (C). Drift between copies becomes a
silent bug.

**Rule:** A block of code that appears verbatim in two call sites with
only parameter differences must be a helper. No second copy.

**Example (this repo):** Identical `after(async () => { … mastra
workflow … guarded fallback … revalidatePath('/dashboard') })` blocks
in `uploadEstimatePdfAction` and `retryEstimateAction`. Collapsed into
`triggerSummarizeEstimate()` in commit `2ff0f02`.

### SLOP-004 — Type-Erased Catch

**Tags:** U

`catch (e: any)` (or `catch (e)` followed by `e.message` access
without a type guard) on the failure path. The error shape is assumed
rather than discriminated; non-`Error` throws degrade silently to
default strings, and the type checker stops protecting the recovery
path.

**Detection cues:**

- `catch (… : any)` anywhere in the diff.
- `error.message || "fallback"` without an `instanceof Error` guard.
- The catch body references properties that exist only on `Error`.

**Why it's slop:** Disables type checking exactly where the program is
already in a degraded state (U). Real failure modes get coerced into
the fallback string and disappear from logs.

**Rule:** `catch (error)` plus `error instanceof Error ? error.message
: <explicit fallback>`. No `any` on error paths.

**Example (this repo):** Both `uploadEstimatePdfAction` and
`retryEstimateAction` previously used `catch (error: any)`. Tightened
in commit `2ff0f02`. (`deleteEstimateAction` still uses the pattern
and is queued for the next pass.)

### SLOP-005 — Lazy-Loaded Server Module

**Tags:** C, M

`await import("…")` used for a module that is server-only and has no
runtime cost reason to be lazy: no client bundle size to protect, no
conditional code-splitting, no circular-import workaround. The
dynamic import hides the dependency from `grep`, from the type
checker's reach at the call site, and from build-time analysis.

**Detection cues:**

- `await import(...)` inside a Server Action, route handler, or other
  server-only module.
- The imported symbol is used unconditionally on every call.
- The same symbol is statically imported elsewhere in the codebase.

**Why it's slop:** Costs ceremony (C) for no payoff and misleads
readers into thinking the dependency is conditional (M).

**Rule:** Use `await import(...)` only when (a) the target is a client
bundle boundary, (b) the import is conditional and the conditional
branch is rare, or (c) it breaks a real circular import. Otherwise,
static `import` at the top of the file.

**Example (this repo):** `await import("@/features/contacts/db/schema")`
and `await import("@vercel/blob")` inside `uploadEstimatePdfAction`.
Replaced with static imports inside `lib/contacts.ts` in commit
`2ff0f02`.

## How to add an entry

1. Assign the next `SLOP-NNN` id.
2. **Give the pattern a name** (two or three words, capitalized like a
   design pattern).
3. Tag from the classification list (combine tags when more than one
   applies).
4. Write the **definition** at a level that lets a reviewer recognize
   the pattern in unrelated code. The definition must not depend on
   the specific incident.
5. List 3–4 **detection cues** a reviewer can apply mechanically.
6. State **why it is slop** in one paragraph that maps to the tags.
7. State the **rule** as a single forward-looking sentence.
8. Optionally include an **Example (this repo)** subsection citing the
   commit that introduced or removed the instance. Never let the
   example overtake the definition.
