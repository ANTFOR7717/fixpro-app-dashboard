# FIX(document-vector-store-postgres-migration)

## Request

The just-shipped document-embedding architecture (`FEATURE(extraction-embedding-reference-grounding).md`) used `LibSQLVector` against a local file/in-memory SQLite database. That design is fundamentally incompatible with this app's actual hosting environment: **Vercel serverless functions have an ephemeral, per-invocation filesystem** — `/tmp` is not shared across invocations or instances, and neither is process memory. Live-verified this session: a temporary API route reproducing the exact `after()` pattern `workflow.ts` uses showed `indexDocument()`'s writes were invisible to a `query()` call moments later, even within what should be "the same" background task — confirming this class of failure is real, not theoretical, before it ever reached production.

The user's direction: since `estimate_requests` (Postgres, via `DATABASE_URL`, already used for every other piece of this app's data) already stores the estimate this embedding belongs to, store the embeddings there too — **permanently**, not cleaned up after each run. Reasons stated directly: no harm in keeping it, it's naturally scoped per estimate (hence per account, since every `estimate_requests` row has a `userId`), and permanent storage helps debugging (you can inspect exactly what a past run embedded and retrieved, not just what it produced).

## Research this plan is grounded on (verified this session, with citations)

1. **Why the LibSQL approach fails on Vercel specifically.** Vercel's own documentation states `/tmp` is writable but not shared across separate function invocations or instances; process memory is equally instance-scoped. Live-verified locally first (not assumed): bare `:memory:` failed even within one process (`createIndex`/`upsert` succeeded, but `listIndexes()`/`query()` on the identical singleton object returned empty — a SQLite behavior where bare `:memory:` is private to whichever connection opened it). `file::memory:?cache=shared` fixed that specific case, live-verified across two genuinely separate OS processes. It *still* failed once wired into the real Next.js app (`after()`-triggered pipeline), reproduced with a minimal, faithful test route before concluding anything — confirming the cross-invocation problem is real, not an artifact of the local test harness.
2. **`PgVector`** (`reference/vectors/pg`, fetched this session) — same interface every other Mastra vector store implements (`createIndex`/`upsert`/`query`/`deleteIndex`/`listIndexes`/`describeIndex`), so this is a swap inside `document/vector-store.ts` only, nothing else in the codebase changes shape. Constructor accepts `connectionString` directly — this project's existing `DATABASE_URL` works as-is.
3. **`createIndex()` auto-DDL and idempotency.** The reference doc's `disableInit` option description confirms `createIndex()` by default performs "automatic DDL (schema, extension, table, and index creation)" — it does not need to be told the `vector` extension exists first. The same reference's "Index Recreation Behavior" section states unchanged configuration means "Index is kept (no recreation)" — confirming it is safe to call `createIndex()` on every run for an index that already exists, which this plan's design (see below) requires.
4. **Live-verified directly against this project's actual Supabase database this session** (read-only checks only — no schema changes made without approval):
   - `pg_available_extensions` shows `{ name: 'vector', default_version: '0.8.0', installed_version: null }` — pgvector is available on this instance, not yet enabled.
   - Repeated and concurrent parameterized queries against the existing pooled `DATABASE_URL` (Supabase's port-6543 pooler) both succeeded cleanly. This directly answers the one real, well-known risk with pooled Postgres connections — PgBouncer/Supavisor transaction-mode pooling can conflict with `pg`'s (node-postgres, which both Drizzle and `@mastra/pg` use) server-side prepared statements for parameterized queries. It does not reproduce on this instance. Not asserted from general knowledge — tested against the real database.
5. **Data isolation is a hard requirement, not a preference**, given this is now a *shared, permanent* table space instead of ephemeral. This plan deliberately does **not** use `createVectorQueryTool`'s `enableFilter`/agent-driven metadata filtering for scoping to the current estimate — that mechanism (`docs/rag/retrieval.md`, fetched earlier this session) lets the model itself supply the filter value as a tool argument, which is the wrong trust boundary for "must never be able to read another user's report." Instead, this plan keeps the already-built, already-tested design of one physical table per estimate (`indexName = doc_{estimateRequestId}`) — isolation enforced by Postgres's own table boundary, not by trusting a filter the model could theoretically get wrong or omit. The only change from the already-shipped design is removing the cleanup step; the isolation mechanism is unchanged and was already correct.

## Directory Map

```text
falcon-bighorn/
├── drizzle/
│   └── 0006_enable_pgvector.sql                            [GENERATE] one-time CREATE EXTENSION migration
├── package.json                                              [MODIFY] remove @mastra/libsql, add @mastra/pg
└── src/features/estimate-extraction-pipeline/
    ├── document/
    │   ├── vector-store.ts                                  [MODIFY] LibSQLVector → PgVector, same DATABASE_URL
    │   ├── embed.ts                                         [MODIFY] drop cleanupDocumentIndex; createIndex uses indexConfig: { type: 'flat' }
    │   └── index.ts                                         [MODIFY] drop cleanupDocumentIndex re-export
    └── extraction/
        └── index.ts                                          [MODIFY] drop cleanup call; index persists after the run
```

No changes to `document/query-tool.ts`, any `extraction/quality-guard*.ts`, `extraction/schema.ts`, `extraction/agent.ts`, `pipeline.ts`, `classification/`, `pricing/`, or any report component — this is entirely a storage-backend swap inside `document/`, exactly as the original design's "swappable in one file" comment promised.

## Modification Table

| File | Action | Why |
|---|---|---|
| `drizzle/0006_enable_pgvector.sql` | Generate + fill in | One-time `CREATE EXTENSION IF NOT EXISTS vector;` as an explicit, reviewable migration — matches this project's own `AGENTS.md` discipline ("Any DB schema change must be accompanied by a drizzle-kit generated migration") rather than relying silently on `PgVector`'s own runtime auto-DDL for a change to shared production infrastructure. Generated via `drizzle-kit generate --custom`, NOT hand-created — confirmed this session (`drizzle-kit generate --help`) that `drizzle-kit migrate` reads `drizzle/meta/_journal.json` as its authoritative list of migrations, not a directory glob; a hand-created `.sql` file with no matching journal entry would silently never be applied. `--custom` is drizzle-kit's own documented flag for exactly this case ("Prepare empty migration file for custom SQL") — it creates the file AND the journal entry together. |
| `package.json` | Modify | Remove `@mastra/libsql` (no longer used anywhere once this lands). Add `@mastra/pg`. |
| `document/vector-store.ts` | Modify | `LibSQLVector` → `PgVector`, `connectionString: process.env.DATABASE_URL`, `ssl: { rejectUnauthorized: false }` (matching `src/db/index.ts`'s existing, production-proven Postgres config exactly — not omitted). Same singleton pattern, same swappability comment, updated reasoning. |
| `document/embed.ts` | Modify | Remove `cleanupDocumentIndex` — nothing to clean up when storage is permanent. Also pass `indexConfig: { type: 'flat' }` to `createIndex()` — the default `ivfflat` is an approximate, clustered index tuned for large datasets and sensitive to being built before data exists (this code creates the index before its one `upsert()` call); each table here holds a few dozen chunks at most, where exhaustive/`flat` search is both simpler and not meaningfully slower. Everything else in `indexDocument` is unchanged (same chunking, same embedding calls, same per-estimate `indexName`). |
| `document/index.ts` | Modify | Drop the `cleanupDocumentIndex` re-export. |
| `extraction/index.ts` | Modify | Drop the `finally { await cleanupDocumentIndex(...) }` block — `indexDocument` still runs at the start of every extraction, but nothing tears it down afterward. |

## Existing Pattern Audit

- **Per-estimate table, not one shared table with a metadata filter — deliberate, not a leftover.** A single shared `inspection_report_chunks`-style table with `estimateRequestId` as a metadata filter was considered: it avoids table-count growth and is the more "normal" long-term Postgres pattern. Rejected for this plan specifically because `createVectorQueryTool`'s filtering is designed to be agent-driven (the model constructs the filter from the query, per `docs/rag/retrieval.md`'s own "Agent-Driven Metadata Filtering" framing) — that is the wrong mechanism to lean on for a hard cross-account data-isolation boundary. Keeping one physical table per estimate means the tool literally cannot reach another estimate's data regardless of what the model does, because it was never given a connection to it. Table-count growth over time is a real, accepted tradeoff (see Risk Notes), not an oversight.
- **Extension creation goes through a real migration; per-estimate table/index creation stays inside `PgVector.createIndex()`'s own automatic DDL.** These are different categories of change: the extension is global, one-time, and belongs in this project's existing migration discipline; per-estimate tables are inherently dynamic (created for report IDs that don't exist yet) and are exactly what `createIndex()`'s documented auto-DDL behavior exists for. Not mixing the two.
- **Why `cleanupDocumentIndex` is deleted outright, not just stopped from being called.** An unused exported function is dead code; per this project's own convention (confirmed throughout this session's prior work), unused code gets deleted, not left in place "in case." The concept of "this run's index is temporary" no longer exists in this design at all.
- **Connection pool sizing.** `PgVector`'s default `max: 20` pool connections would run alongside Drizzle's own separate pool against the same Supabase pooler. Since Supabase's port-6543 pooler already multiplexes many logical app connections onto a smaller number of real Postgres backend connections (that is what the pooler is for), two independent client-side pools hitting it is not inherently a problem — but this plan sets `PgVector`'s `max` to a modest `5` rather than accepting the default `20`, since a document's embedding traffic (one index/upsert pass, occasional queries during one extraction run) does not need anywhere near 20 concurrent connections, and a smaller pool reduces unnecessary pressure on the shared pooler.
- **`indexDocument`'s chunk-ID scheme already prevents accidental overwrite/duplication on re-runs.** Chunk IDs are deterministic (`{indexName}-p{page}-{ordinal}`, derived from page number and position, not randomly generated) and `indexName` already includes `estimateRequestId`. If the same estimate is ever reprocessed, `upsert()`'s documented behavior ("Updates existing vectors if they share the same ID") means the second run's chunks correctly overwrite the first run's for that same estimate, rather than duplicating — this was already true in the original design and needs no new code.
- **Considered and rejected:**
  - *Metadata-filter-scoped shared table* — see first bullet above.
  - *Relying on `PgVector.createIndex()`'s auto-DDL for the extension itself* — rejected in favor of an explicit migration; extension creation is infrequent, global, and worth being reviewable, unlike per-estimate table creation which must be dynamic.
  - *Keeping `LibSQLVector` for local dev and `PgVector` only in production* — rejected as needless divergence between environments (exactly the kind of thing that hides a bug until it's live); one code path, tested the same way everywhere, per this session's established practice of live-verifying against real infrastructure rather than trusting environment-specific assumptions.

## Execution Plan

1. Run `pnpm exec drizzle-kit generate --custom --name=enable_pgvector` — creates `drizzle/0006_enable_pgvector.sql` (empty) and registers it in `drizzle/meta/_journal.json`. Fill in the file's contents (see File-by-File below). Apply via `pnpm db:migrate` against the dev DB before anything else.
2. `package.json` — swap the dependency; `pnpm install`.
3. `document/vector-store.ts` — swap the store implementation.
4. `document/embed.ts` — drop `cleanupDocumentIndex`; add `indexConfig: { type: 'flat' }` to `createIndex()`.
5. `document/index.ts` — drop the re-export.
6. `extraction/index.ts` — drop the cleanup call.
7. Validation gates (below), including a live round-trip against the real Postgres instance mirroring the earlier LibSQL verification, then stop for review.

## File-by-File Changes

### `drizzle/0006_enable_pgvector.sql`

**Action:** Generate (`pnpm exec drizzle-kit generate --custom --name=enable_pgvector`), then fill in

#### After (file contents, complete)

```sql
-- Enables the pgvector extension this Supabase instance already has
-- available (confirmed via pg_available_extensions this session) but not
-- yet installed. One-time, global — required before PgVector's own
-- automatic per-index DDL (createIndex/upsert) can create vector columns.
CREATE EXTENSION IF NOT EXISTS vector;
```

#### Reasoning

- **Must be generated via `drizzle-kit generate --custom`, not hand-created.** Confirmed this session (`pnpm exec drizzle-kit generate --help`): `--custom` is drizzle-kit's own documented flag for "Prepare empty migration file for custom SQL." Also confirmed by reading `drizzle/meta/_journal.json` directly — `drizzle-kit migrate` treats that journal as the authoritative list of migrations (each entry has `idx`/`version`/`when`/`tag`), not a directory listing. A hand-created `.sql` file with no matching journal entry would sit in `drizzle/` and never actually run via `pnpm db:migrate`. `--custom` creates both the file and its journal entry together, which is why this plan does not just specify raw file contents the way every other File-by-File entry does.
- Filename `0006_enable_pgvector.sql` follows this repo's existing sequence (`0000`–`0005` already present, default `--prefix index` numbering) — the actual name drizzle-kit assigns should be treated as authoritative over this plan if they ever diverge (e.g., if another migration lands first).
- `IF NOT EXISTS` makes this safe to run even if the extension were ever enabled out-of-band.

---

### `package.json`

**Action:** Modify

#### Reasoning

- `@mastra/libsql` removed — after this plan lands, nothing in the codebase imports it.
- `@mastra/pg` added — version resolved by `pnpm add @mastra/pg`, matching this project's already-established practice (see the `@mastra/core`/`@mastra/libsql`/`@mastra/rag` upgrade earlier this session) of letting the package manager resolve the correct version against this project's already-installed `@mastra/core`, rather than hand-pinning.

---

### `src/features/estimate-extraction-pipeline/document/vector-store.ts`

**Action:** Modify

#### Before

```ts
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibSQLVector } from '@mastra/libsql';

/**
 * The single vector store every pipeline run's document embeddings live
 * in. A real file in the OS temp directory, NOT `:memory:` in any form.
 * ...
 */
export const documentVectorStore = new LibSQLVector({
  id: 'document-vector-store',
  url: `file:${join(tmpdir(), 'fixpro-document-vectors.db')}`,
});
```

#### After

```ts
import { PgVector } from '@mastra/pg';

/**
 * The single vector store every pipeline run's document embeddings live
 * in. Postgres (via pgvector), NOT any form of local/in-memory SQLite.
 *
 * Local SQLite storage (`:memory:`, `file::memory:?cache=shared`, and a
 * real file in `os.tmpdir()`) was tried and live-verified broken in
 * order, each for a different reason, before landing here — see
 * FIX(document-vector-store-postgres-migration).md's Research section.
 * The root cause common to all of them: this app is hosted on Vercel,
 * where serverless functions do not share a filesystem or process memory
 * across invocations/instances. No local-storage variant can work
 * reliably there. Postgres is a real, network-accessible, already-trusted
 * service this exact app already depends on for every other piece of its
 * data — using it here removes the whole class of problem instead of
 * working around it again.
 *
 * `connectionString: process.env.DATABASE_URL` — the SAME connection
 * Drizzle already uses for `estimate_requests` and everything else.
 * Live-verified this session (read-only checks against the real
 * instance): the pooled connection handles repeated and concurrent
 * parameterized queries cleanly, so the well-known PgBouncer/Supavisor
 * transaction-pooling + prepared-statement conflict does not apply here.
 *
 * `ssl: { rejectUnauthorized: false }` — matches `src/db/index.ts`'s own
 * `pg.Pool` configuration exactly, not omitted. My own local read-only
 * verification connected fine without an explicit `ssl` option, but that
 * only proves it works from this machine's own CA trust store — it does
 * not prove Vercel's production runtime resolves the same certificate
 * chain the same way. Drizzle's config already made this override
 * explicit for a reason, presumably exactly this kind of environment
 * difference; matching it removes the risk instead of assuming local
 * behavior generalizes to production, which is the mistake this whole
 * plan exists to correct.
 *
 * `max: 5` — deliberately below PgVector's own default (20). This
 * store's traffic (one index/upsert pass and a handful of queries per
 * extraction run) doesn't need many connections, and Drizzle's own pool
 * (`src/db/index.ts`, `pg.Pool` with no explicit `max`, so `pg`'s own
 * default of 10) already competes for connections against the same
 * Supabase pooler.
 *
 * Permanent, not per-run-cleaned-up: every estimate's embeddings persist
 * in their own table (`doc_{estimateRequestId}`, see `embed.ts`) for the
 * lifetime of the `estimate_requests` row they belong to — deliberate,
 * not an oversight; helps debugging, and there's no cost to keeping data
 * that's already scoped one-to-one with a permanent database row.
 *
 * Swappable in exactly this one file: every Mastra vector store shares
 * the same createIndex/upsert/query/deleteIndex interface, so this is
 * the second time this exact swappability has paid off (LibSQL → this)
 * without touching any other file in the pipeline.
 */
export const documentVectorStore = new PgVector({
  id: 'document-vector-store',
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
  max: 5,
});
```

#### Reasoning

- `process.env.DATABASE_URL!` — non-null assertion matches how this exact variable is already consumed elsewhere in this codebase (Drizzle's own client construction); this module already fails loudly and immediately if it's missing, consistent with existing practice, not a new pattern.
- Historical failure narrative kept in the comment (not deleted and rewritten as if this were the first attempt) — matches this session's own established practice of documenting what was tried and why it didn't work, not just what shipped, so a future reader doesn't reintroduce a known-broken local-storage variant.

---

### `src/features/estimate-extraction-pipeline/document/embed.ts`

**Action:** Modify (two changes: the index type, and removing cleanup)

#### Before

```ts
  await documentVectorStore.createIndex({ indexName, dimension: EMBEDDING_DIMENSION });
```

```ts
/**
 * Delete this run's slice of the singleton store. Called from a `finally`
 * block in `extraction/index.ts` so a failed or successful run both clean
 * up — the in-memory store is process-lifetime, not request-lifetime, so
 * without this every run would leak memory into the next one.
 */
export async function cleanupDocumentIndex(indexName: string): Promise<void> {
  await documentVectorStore.deleteIndex({ indexName });
}
```

#### After

```ts
  // indexConfig: { type: 'flat' } — deliberately NOT the default
  // 'ivfflat'. Confirmed against reference/vectors/pg's own
  // documentation: ivfflat is an approximate, clustered index whose
  // quality depends on data existing before the index is built, and
  // pgvector's own guidance is to create it AFTER loading data — but
  // this code calls createIndex() before any upsert(), on a table that
  // will only ever hold a few dozen chunks. 'flat' (sequential/exhaustive
  // scan, per the same reference doc) has no build-order sensitivity, no
  // clustering overhead, and is not meaningfully slower than an
  // approximate index at this table's actual scale — it's a better fit
  // for "created once, queried a handful of times, done," not a
  // performance regression accepted for correctness.
  await documentVectorStore.createIndex({
    indexName,
    dimension: EMBEDDING_DIMENSION,
    indexConfig: { type: 'flat' },
  });
```

```ts
/* cleanupDocumentIndex removed entirely — nothing to clean up when storage is permanent */
```

#### Reasoning

- The index-type change applies regardless of backend, but only actually matters now: `LibSQLVector` didn't expose `indexConfig`/ivfflat-style tuning the same way, so this wasn't a live concern before this plan.
- Storage is permanent now — there is nothing to clean up after a run, so `cleanupDocumentIndex` has no remaining purpose. Everything else in `indexDocument()` (sentence-chunking, embedding via `kiloGateway`, `upsert`) is unchanged — only the backend it writes to, and the index type, changed.

---

### `src/features/estimate-extraction-pipeline/document/index.ts`

**Action:** Modify

#### Before

```ts
export { indexDocument, cleanupDocumentIndex, type DocumentChunkRecord } from './embed';
```

#### After

```ts
export { indexDocument, type DocumentChunkRecord } from './embed';
```

---

### `src/features/estimate-extraction-pipeline/extraction/index.ts`

**Action:** Modify

#### Before

```ts
import {
  indexDocument,
  cleanupDocumentIndex,
  type ParsedDocument,
  type DocumentChunkRecord,
} from '../document';
```

```ts
  const indexName = `doc_${input.estimateRequestId.replace(/-/g, '_')}`;
  const chunkMap = await indexDocument(indexName, input.parsedDocument);

  try {
    const result = await billableItemExtractorAgent.generate(
      /* ... */
    );

    const extraction = result.object;
    if (!extraction) {
      throw new Error('Extraction returned no structured object');
    }

    const workItems = extraction.items.map((item) => resolveWorkItem(item, chunkMap));
    return { workItems };
  } finally {
    await cleanupDocumentIndex(indexName);
  }
}
```

#### After

```ts
import {
  indexDocument,
  type ParsedDocument,
  type DocumentChunkRecord,
} from '../document';
```

```ts
  const indexName = `doc_${input.estimateRequestId.replace(/-/g, '_')}`;
  const chunkMap = await indexDocument(indexName, input.parsedDocument);

  const result = await billableItemExtractorAgent.generate(
    /* ... */
  );

  const extraction = result.object;
  if (!extraction) {
    throw new Error('Extraction returned no structured object');
  }

  const workItems = extraction.items.map((item) => resolveWorkItem(item, chunkMap));
  return { workItems };
}
```

#### Reasoning

- The `try`/`finally` wrapper existed for exactly one purpose — guaranteeing cleanup ran even on failure. With nothing left to clean up, the wrapper is dead structure; removing it is not a behavior change, it's deleting a now-pointless control-flow shape. If `billableItemExtractorAgent.generate(...)` throws, the error still propagates exactly as before (this function's own doc comment already states "ONE ATTEMPT. Throws on any failure").
- `indexName`'s hyphen-to-underscore handling (fixed live earlier this session for libSQL's naming rules) is kept as-is. Unquoted Postgres identifiers have the same letter/underscore-start, letters/digits/underscores-only rule libSQL enforces, so the existing scheme is valid for Postgres too regardless of whether `PgVector` quotes generated identifiers internally (not verified either way, and irrelevant here since the code never produces a hyphenated `indexName` in the first place) — no reason to change this.

## Validation Plan

1. `pnpm db:migrate` against the dev database — applies the `CREATE EXTENSION` migration. Confirm via a read-only query (`SELECT * FROM pg_extension WHERE extname = 'vector'`) that it's actually installed afterward.
2. `pnpm install` — swaps `@mastra/libsql` for `@mastra/pg`.
3. `pnpm exec tsc --noEmit` — clean.
4. `pnpm exec eslint` on all modified files — clean.
5. One-door boundary gate (unchanged grep set from the prior plan) — zero results.
6. `pnpm build` — clean.
7. **Live round-trip against the real Postgres instance**, mirroring the earlier LibSQL verification exactly: call `indexDocument()` with a real fixture document, confirm the chunk map is populated, then query `documentVectorStore` directly and confirm results come back with correct `metadata.pageNumber`/`text`. Additionally confirm data is visible from a **separate OS process** (the specific failure mode that broke every local-storage variant) — this is the test that actually matters given what broke before.
8. **Live QA via `pnpm dev`**: run a real estimate upload end to end. Confirm the extraction agent's tool calls succeed (no `SQLITE_ERROR`/connection errors in logs), confirm the table `doc_{estimateRequestId}` exists in Postgres afterward (`SELECT * FROM pg_tables WHERE tablename LIKE 'doc_%'`), and confirm it's still there on a second, later check (proving nothing cleaned it up).
9. **Explicitly re-run the exact failure reproduction from earlier this session** against this Postgres-backed implementation, to directly confirm the specific bug that motivated this plan is fixed, not just that the code compiles: a temporary API route using `after()` calling `indexDocument()` then immediately querying, under a real `next build && next start` (production-mode) server — same technique that correctly diagnosed the original failure, done once as a deliberate step inside this approved plan rather than ad-hoc mid-debugging. Created, run, and deleted as part of this same validation pass — not left in the codebase.

## Risk Notes

- **Table count grows without bound over time** — one table per estimate, forever, by design (see Existing Pattern Audit). At this app's current scale this is a non-issue; if estimate volume grows into the tens of thousands, Postgres catalog bloat (`pg_class`, introspection tooling slowing down) becomes a real, revisit-worthy concern. Not a blocker now — explicitly accepted by the user ("no harm in permanent").
- **`CREATE EXTENSION vector` requires sufficient privilege on the DB role.** `pg_available_extensions` confirms it's available; it does not confirm the app's specific role can install it. If the migration fails on privilege grounds, this needs a one-time manual grant (or running the migration as a more privileged role), which is normal for Supabase-hosted pgvector setups but not yet confirmed for this specific role.
- **No per-estimate storage cap or expiry.** Nothing currently limits how much text/how many chunks accumulate per estimate, or removes data if an `estimate_requests` row is ever deleted (no cascade currently wired between `estimate_requests` and its `doc_*` table). Out of scope for this plan — flagged for whoever owns data-retention policy later, not invented here without being asked.
- **This plan does not revisit the classification material-derivation or pricing hour-estimation work** — still deferred, still tracked in `[[project_extraction-pipeline-embedding-architecture-vision]]`, unaffected by this storage-backend swap either way.
- **Permanent storage introduces a schema-evolution concern that didn't exist under the ephemeral design.** Every table created by this code lives forever, so if `DocumentChunkRecord`'s shape or the sentence-chunking scheme (`maxSize`/`minSize`, tuned this session) ever changes in a future deployment, old estimates' tables will carry whatever metadata shape the code had *when they were created*, permanently. Metadata is stored as loosely-typed JSON (not a fixed SQL schema), so this degrades gracefully rather than breaking — old rows simply won't have a field newer code expects, same as this app's own `estimate_requests.summary` envelope already handles v1/v2/v3 shape differences — but it's a real category of concern that only exists because this plan makes storage permanent, and is worth naming rather than leaving implicit.
- **`@mastra/pg`'s exact type strictness has not been verified against its installed `.d.ts` files, unlike `@mastra/libsql`'s.** Earlier this session, `@mastra/libsql`'s actual types diverged from its own prose docs in two concrete ways (`deleteIndex` takes an options object, not a bare string; `createVectorQueryTool`'s `indexName` is required at the type level despite docs saying it "can be overridden at runtime"). `@mastra/pg` is not installed in this project yet, so this plan's code is grounded in `reference/vectors/pg`'s prose only, not a cross-check against real `.d.ts` files the way the LibSQL work eventually was. `tsc --noEmit` (Validation step 3) is what will actually surface any such gap — expect it to, and fix on sight rather than being surprised by it, consistent with how the LibSQL discrepancies were handled.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
