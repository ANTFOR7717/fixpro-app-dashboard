# SLOP_PATTERNS.md
Named anti-patterns. Call them out by name in PRs: "This is a Phantom Receiver — drop it."
## Tags
- **D** Dead Path — runs, no consumer.
- **R** Redundant Signal — duplicates an authoritative signal.
- **C** Ceremony — structure without a caller.
- **S** Speculative — built for a need that doesn't exist.
- **U** Unsafe Default — hides failures.
- **M** Misleading Name — promises behavior it doesn't deliver.
- **G** God Function — one unit, many unrelated jobs.
## SLOP-001 — Phantom Receiver
**Tags:** D, R
**Pattern:** A second observer (webhook/callback/listener) for an event the caller already awaits.
**Rule:** One observer per event. The observer must have a consumer the primary path can't supply.
**Bad**
```ts path=null start=null
const { url } = await upload(file);
await recordUpload({ url });          // primary observer

onUploadCompleted: async ({ blob }) => {
  console.log("uploaded:", blob.url); // second observer, nothing consumes it
},
```
**Good**
```ts path=null start=null
const { url } = await upload(file);
await recordUpload({ url });          // only observer
```
**Seen:** `onUploadCompleted` in `src/app/api/estimate/upload/route.ts`. Removed in `540437a`.
## SLOP-002 — God Action
**Tags:** G, C, M
**Pattern:** An entry-point function that authenticates, parses, persists, calls external services, and orchestrates background work — all inline.
**Rule:** Entry points coordinate: auth → parse → side effects → return. Each side effect is a named helper.
**Bad**
```ts path=null start=null
export async function createOrderAction(_p, fd) {
  const session = await getSession();
  if (!session) throw new Error("UNAUTH");
  const parsed = z.object({ sku: z.string() }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { stripe } = await import("@/lib/stripe");
  await stripe.charges.create({ /* … */ });
  await db.insert(ordersTable).values({ /* … */ });
  after(async () => { /* workflow + fallback + revalidate */ });
  return { ok: true };
}
```
**Good**
```ts path=null start=null
export async function createOrderAction(_p, fd): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.ok) return session.error;
  const parsed = parseOrderInput(fd);
  if (!parsed.ok) return { success: false, error: parsed.error };
  await chargeOrder({ userId: session.user.id, ...parsed.data });
  const order = await insertOrder({ userId: session.user.id, ...parsed.data });
  triggerFulfillment({ orderId: order.id });
  return { success: true };
}
```
**Seen:** `uploadEstimatePdfAction`. Split into `lib/{upload-input,contacts,workflow}.ts` in `2ff0f02`.
## SLOP-003 — Copy-Paste Orchestration
**Tags:** D, C
**Pattern:** The same nontrivial block (background work, recovery, notifications) appears at two call sites that differ only in parameters.
**Rule:** Two copies = one helper. No exceptions.
**Bad**
```ts path=null start=null
// site A
after(async () => { try { await run(rowA.id); } catch { await markFailed(rowA.id); } });
// site B — same body, different id
after(async () => { try { await run(rowB.id); } catch { await markFailed(rowB.id); } });
```
**Good**
```ts path=null start=null
triggerRun(rowA.id);
triggerRun(rowB.id);
```
**Seen:** Duplicated `after()` Mastra blocks in `uploadEstimatePdfAction` and `retryEstimateAction`. Collapsed into `triggerSummarizeEstimate()` in `2ff0f02`.
## SLOP-004 — Type-Erased Catch
**Tags:** U
**Pattern:** `catch (e: any)` or unguarded `e.message` on the failure path.
**Rule:** `catch (error)` + `instanceof Error` guard with an explicit fallback string.
**Bad**
```ts path=null start=null
try { await doThing(); }
catch (error: any) {
  return { error: error.message || "Failed." };
}
```
**Good**
```ts path=null start=null
try { await doThing(); }
catch (error) {
  return { error: error instanceof Error ? error.message : "Failed." };
}
```
**Seen:** `uploadEstimatePdfAction`, `retryEstimateAction`. Tightened in `2ff0f02`. `deleteEstimateAction` still uses it.
## SLOP-005 — Lazy-Loaded Server Module
**Tags:** C, M
**Pattern:** `await import("…")` for a server-only module that is used unconditionally and has no client-bundle, conditional-branch, or circular-import reason to be dynamic.
**Rule:** Static `import` at the top. Dynamic only for client bundle boundaries, rare conditionals, or breaking real cycles.
**Bad**
```ts path=null start=null
export async function saveContact(fd) {
  const { contactsTable } = await import("@/features/contacts/db/schema");
  await db.insert(contactsTable).values(/* … */);
}
```
**Good**
```ts path=null start=null
import { contactsTable } from "@/features/contacts/db/schema";

export async function saveContact(fd) {
  await db.insert(contactsTable).values(/* … */);
}
```
**Seen:** Dynamic imports of `contactsTable` and `@vercel/blob` in `uploadEstimatePdfAction`. Replaced with static imports in `2ff0f02`.
## Adding an entry
Every entry has exactly these sections, in this order, and nothing else:
1. `## SLOP-NNN — Name` (two-three word capitalized name).
2. `**Tags:**` from the tag list.
3. `**Pattern:**` one sentence.
4. `**Rule:**` one sentence.
5. `**Bad**` code block (`path=null start=null`), ≤ 12 lines, self-contained.
6. `**Good**` code block (`path=null start=null`), ≤ 12 lines, self-contained.
7. `**Seen:**` one line citing the repo symbol and the commit. Omit if no incident.
No "Why it's slop," no detection-cue lists, no rationale paragraphs. The tags + Pattern + Bad/Good carry the meaning. Drift comes from repetition; keep each entry boring and uniform.
