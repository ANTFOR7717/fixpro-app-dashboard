# FEATURE(extraction-embedding-reference-grounding)

## Request

Replace extraction's post-hoc "hallucination check" (pdf-parse text → literal
substring match, run only after generation completes) with a persistent,
per-run embedding store that extraction and the judge both reference
*during* their own reasoning — reference by chunk ID, not by copying and
re-matching strings.

Direct quote from the user driving this: "your current one using it for
hallucination check is retarded and waste of resources... the pdf parse
should be main entry for a persistent embedding/extraction... the
extraction agent will go in with semantic reasoning and parse its findings
into another data structure like JSON where it references the persistent
embedding specifically and locationally... finally a judge can go over
those exact embeddings... same exact workflow the only difference is judge
comes at it from a more unbiased angle since they didnt also parse through
the context, they are only referring."

Explicit constraints from the user for this plan: ground every decision in
real Mastra docs/MCP research (no guessing), spend real research time per
step, cut over-engineering, and design for decoupling — "the more systems
you can remove or swap the better, mastra is fantastic at this."

**Out of scope for this plan** (see `[[project_extraction-pipeline-embedding-architecture-vision]]`
memory for the full multi-phase vision, which this plan does not
re-litigate): classification's material-derivation-from-sentence-content
and pricing's web-search-backed hour estimation. Both depend on this
embedding infrastructure existing first, and bundling them in here would
be exactly the over-engineering the user told me to cut. Phase 2 note at
the end of this document.

## Research this plan is grounded on (verified this session, with citations)

1. **`.chunk({ strategy: 'sentence', ... })`** (`reference/rag/chunk`,
   fetched this session) — chunks at sentence granularity, not raw
   page-blob text. Params: `maxSize` (required), `minSize` (default 50,
   merges anything smaller into a neighbor), `sentenceEnders` (default
   `['.', '!', '?']`), `fallbackToWords`/`fallbackToCharacters`. This is
   the "full sentences captured" unit the user asked for.
2. **`LibSQLVector` with `url: ':memory:'`** (`reference/vectors/libsql`,
   fetched this session) — a genuine in-memory vector store from
   `@mastra/libsql`. Zero external infrastructure (no DB server, no API
   key for the store itself). This is the "temporary" store — this plan
   uses ONE module-scoped singleton instance (matching the existing
   `shared/gateway.ts` singleton pattern), with per-run data isolated by a
   unique `indexName` (`doc-{estimateRequestId}`) and explicitly deleted
   via `deleteIndex()` when the run finishes. A `:memory:` SQLite
   connection is per-instance, not shared across separately-constructed
   objects — confirmed by cross-referencing SQLite's own `:memory:`
   semantics — which is exactly why this must be one singleton connection
   with per-run namespacing, not a new instance per call.
3. **All Mastra vector stores share one interface**
   (`createIndex`/`upsert`/`query`/`deleteIndex`) — stated explicitly in
   `docs/rag/vector-databases`: "Once initialized, all vector stores share
   the same interface." This is the swappability the user asked for:
   `LibSQLVector` today, `PgVector` later if ever needed, is a one-line
   constructor swap in `document/vector-store.ts` only — nothing else in
   the codebase references the concrete class.
4. **`createVectorQueryTool()`** (`reference/tools/vector-query-tool`,
   `docs/rag/retrieval`, fetched this session) — turns the vector store
   into an agent-callable TOOL the model can invoke mid-generation, not a
   pre-fetch-then-hope pattern. Accepts a direct `vectorStore` instance
   (not just a registered name — confirmed via the doc's "Usage without a
   Mastra server" example) and both `indexName` and `model` are
   overridable per-call via `RequestContext` — exactly the mechanism
   needed since every pipeline run has a different index name. Returns
   `QueryResult[]` with a unique `id` per chunk and arbitrary `metadata`.
5. **`createGraphRAGTool()`** (`docs/rag/graph-rag`,
   `reference/tools/graph-rag-tool`, fetched this session) — considered
   and **rejected**. It exists for following relationships *across*
   multiple documents (a corpus that cross-references itself). This
   pipeline has exactly one document per run with no cross-document
   relationships to traverse; adding graph traversal here is the
   over-engineering the user explicitly said to cut. Plain vector query +
   metadata (page number) covers "locational" reference without it.
6. **Embeddings route through the EXISTING `kiloGateway`, not a new
   provider.** Checked directly against the installed `@ai-sdk/openai`
   type declarations (`node_modules/@ai-sdk/openai/dist/index.d.ts`,
   lines 1106/1118): the client `createOpenAI()` returns — which
   `kiloGateway` already is — exposes `.embedding(modelId)` /
   `.textEmbeddingModel(modelId)`, returning a standard `EmbeddingModelV3`
   that Mastra's `embed`/`embedMany` accept directly. **Live-verified this
   session, not assumed**: a raw HTTP POST to
   `https://api.kilo.ai/api/gateway/embeddings` with
   `{ model: 'openai/text-embedding-3-small', input: '...' }` returned
   HTTP 200 with a real embedding vector. Kilo's gateway does proxy
   embedding requests. No new API key, no new provider — `kiloGateway`
   covers both chat and embeddings.
7. **Structured output + tools together** (`docs/agents/structured-output.md`,
   fetched earlier this session, re-applied here): the docs warn some
   models can't combine `response_format` and function-calling in the
   same call (their specific example is Gemini 2.5). This pipeline's
   extraction model is `openai/gpt-5.4-mini` — OpenAI's own API supports
   function calling and `response_format` together natively, so this
   specific documented friction point does not apply here. Flagged in
   Risk Notes as the one thing to confirm in live QA rather than assumed
   silently.
8. **`RequestContext` accepts arbitrary values, including non-serializable
   ones** (`node_modules/@mastra/core/dist/request-context/index.d.ts`,
   cross-checked this session, same finding as the prior plan) — this is
   why the per-run chunk-reference map (a plain JS `Map`, not
   JSON-serializable) can safely travel through `RequestContext` into the
   guard, while never needing to cross a Mastra `createStep`
   `inputSchema`/`outputSchema` boundary (which — confirmed empirically in
   the prior implementation this session — gets independently re-inferred
   by Mastra's own, currently version-skewed, zod resolution). Keeping the
   whole embed→query→cleanup lifecycle inside `extraction/index.ts`'s
   `extractWorkItems()` function, entirely below `pipeline.ts`'s step
   boundaries, sidesteps that class of problem entirely rather than
   working around it a fifth time.

## Directory Map

```text
falcon-bighorn/
├── package.json                                            [MODIFY] add @mastra/rag, @mastra/libsql, ai
└── src/features/estimate-extraction-pipeline/
    ├── document/
    │   ├── vector-store.ts                                  [CREATE] singleton LibSQLVector (:memory:)
    │   ├── embed.ts                                         [CREATE] indexDocument() / cleanupDocumentIndex()
    │   ├── query-tool.ts                                    [CREATE] singleton createVectorQueryTool() instance
    │   └── index.ts                                         [MODIFY] door re-exports for the above
    └── extraction/
        ├── schema.ts                                        [MODIFY] internal model-facing schema now emits sourceChunkId, not a free-typed sourceQuote
        ├── agent.ts                                         [MODIFY] attach the document query tool; prompt rewritten around reference-then-cite
        ├── quality-guard-agent.ts                            [MODIFY] unchanged checks, comment update only (grounding no longer this agent's concern)
        ├── quality-guard.ts                                 [MODIFY] checkGrounding() replaced by checkChunkReferences() — deterministic map lookup, not substring match
        └── index.ts                                         [MODIFY] extractWorkItems() now indexes the document, generates, resolves chunk references into the public ExtractedWorkItem shape, and cleans up — all in one function scope
```

No changes to `pipeline.ts`, `classification/`, `pricing/`, or any report
component — the public `ExtractedWorkItem` shape extraction hands
downstream is unchanged, so nothing below extraction's own door needs to
know this happened.

## Modification Table

| File | Action | Why |
|---|---|---|
| `package.json` | Modify | Add `@mastra/rag` (`MDocument`, `createVectorQueryTool`), `@mastra/libsql` (`LibSQLVector`), `ai` (`embedMany` — Mastra's own docs import this from the `ai` package directly; it is not currently a direct dependency of this project). |
| `document/vector-store.ts` | Create | The one singleton `LibSQLVector` connection, matching `shared/gateway.ts`'s existing singleton pattern — infra, no business logic, swappable in one place. |
| `document/embed.ts` | Create | `indexDocument(indexName, parsed)`: sentence-chunks each page, embeds via `kiloGateway.embedding(...)`, upserts into the singleton store, returns a plain `Map<chunkId, {text, pageNumber}>` for deterministic (non-similarity-search) reference resolution. `cleanupDocumentIndex(indexName)`: deletes the run's index so the in-memory store doesn't grow unbounded across runs in a long-lived server process. |
| `document/query-tool.ts` | Create | One singleton `createVectorQueryTool()` instance pointed at the singleton store, `indexName` left unset at creation (always supplied per-run via `RequestContext`, since every run has a different index). Shared by the extraction agent. |
| `document/index.ts` | Modify | Door re-exports for `indexDocument`, `cleanupDocumentIndex`, `documentQueryTool`, plus the existing `parsePdfFromUrl`/schemas. |
| `extraction/schema.ts` | Modify | Add an internal, model-facing `rawWorkItemSchema` that replaces free-typed `sourceQuote`/`pageHint` with `sourceChunkId: z.string()` — the model cites a chunk, it doesn't retype content. The **public** `extractedWorkItemSchema`/`ExtractedWorkItem` (what classification/pricing/the report consume) is unchanged in shape; `sourceQuote`/`pageHint` are now *computed* from the chunk id in `extraction/index.ts`, not trusted model output. |
| `extraction/agent.ts` | Modify | Attach `documentQueryTool` via `tools: {...}`. Prompt rewritten: the model must search for the specific sentence supporting each finding and cite its chunk id, not copy text freely. |
| `extraction/quality-guard.ts` | Modify | `checkGrounding()`/`normalize()` (literal substring match against pdf-parse text) deleted entirely. Replaced by `checkChunkReferences()`: a `Map.has(sourceChunkId)` check — deterministic, zero false positives from whitespace/hyphenation artifacts, zero LLM cost. |
| `extraction/quality-guard-agent.ts` | Modify | No behavioral change — unit-plausibility/compound-scope/scope-shape are unrelated to grounding and stay exactly as built. Docstring updated to state grounding is no longer this guard's concern (it's deterministic now, handled directly in `quality-guard.ts`). |
| `extraction/index.ts` | Modify | `extractWorkItems()` now: (1) calls `indexDocument()` to build this run's chunk store, (2) generates with the query tool attached and the chunk map + index name in `RequestContext`, (3) resolves each returned item's `sourceChunkId` into the public shape's `sourceQuote`/`pageHint` deterministically from the chunk map, (4) calls `cleanupDocumentIndex()` in a `finally` block. |

## Existing Pattern Audit

- **Singleton infra pattern already established, followed exactly.**
  `shared/gateway.ts`'s `kiloGateway` is a module-scoped `const`, no
  business logic, transport-only. `document/vector-store.ts` and
  `document/query-tool.ts` follow the identical shape — this plan invents
  no new pattern for "shared infra," it reuses the one this codebase
  already has.
- **Why the embed→query→cleanup lifecycle lives inside `extractWorkItems()`
  and not in `pipeline.ts`.** A live `LibSQLVector` connection (holding an
  open DB handle) cannot cross a Mastra `createStep`
  `inputSchema`/`outputSchema` boundary the way plain JSON-shaped data
  can — those boundaries get independently re-inferred by Mastra's own
  zod resolution (see Research #8, and the concrete zod-version-skew bug
  hit and fixed earlier this session for the unrelated `needsReview`
  field, which is the same class of problem). Scoping the whole lifecycle
  to one function call, entirely below any workflow-step boundary, avoids
  a sixth instance of that bug class rather than working around it again.
  It also means `pipeline.ts` needs **zero changes** — a real decoupling
  win: the embedding architecture is entirely extraction's own internal
  concern.
- **Why `sourceQuote`/`pageHint` become computed, not trusted.** Under the
  old design, the model both decided what the finding was AND freely
  retyped the "evidence" for it — two independent chances to be wrong that
  a post-hoc substring check could only imperfectly catch (as seen live
  this session: 10 false/true-positive-ambiguous grounding violations in
  one run, undistinguishable without the source PDF). Under this design,
  the model only cites a chunk ID; the actual quote and page number are
  *resolved deterministically* from the same chunk record the model
  looked up. This doesn't just move the check earlier — it removes an
  entire failure mode (a citation that doesn't match its own quote) by
  construction, and eliminates the previously-deferred "pageHint
  cross-checking" risk from the prior plan's Existing Pattern Audit
  entirely (`pageHint` is no longer trusted transcription, it's `p.
  ${chunk.pageNumber}`, and `chunk.pageNumber` came from `pdf-parse`
  directly).
- **`checkChunkReferences()` replaces `checkGrounding()` as a strictly
  simpler, strictly more reliable check.** The old check asked "does a
  normalized version of this arbitrary string appear as a substring
  somewhere in the page text" — inherently fuzzy, vulnerable to
  `pdf-parse` line-wrap/hyphenation artifacts (documented as an accepted
  risk in the prior plan). The new check asks "does this exact ID exist
  in the map of IDs this run actually indexed" — a plain `Map.has()`,
  which cannot false-positive or false-negative on whitespace, casing, or
  extraction-artifact grounds, because it isn't text-matching at all.
- **Why a plain `Map` for reference resolution, not a second vector-store
  query.** `LibSQLVector`'s documented methods
  (`reference/vectors/libsql`) are `query()` (similarity search),
  `upsert()`, `updateVector()`/`deleteVector()` (by ID, for writes) — there
  is no documented "fetch by ID" read method. Rather than guess at
  undocumented behavior or spend a similarity-search call to resolve a
  *known* ID (wasteful and, more importantly, not actually correct — a
  similarity search for text near an ID doesn't guarantee finding that ID),
  this plan keeps a companion plain `Map<id, record>` built at the same
  time chunks are upserted. The vector store handles what it's for
  (semantic search, via the agent tool); the map handles what it's for
  (exact reference resolution). Two simple, single-purpose pieces instead
  of one component doing two jobs — the "decoupled" the user asked for,
  applied literally.
- **`documentQueryTool` is a single shared instance, not one per agent.**
  Both the extraction agent and (if ever needed later) any other agent
  can be given the same tool instance — `createVectorQueryTool()`'s
  `indexName` is resolved per-call from `RequestContext`, so the tool
  itself carries no per-run state. One instance, reused, matches how
  `kiloGateway` is one instance reused by every agent's `model:` field.
- **Considered and rejected:**
  - *GraphRAG* — see Research #5. Wrong tool for a single-document,
    no-cross-document-relationships use case.
  - *A new embedding provider/API key* — see Research #6. Live-verified
    unnecessary; `kiloGateway` already covers it.
  - *Passing the vector store or chunk map through `pipeline.ts`'s step
    schemas* — see the Existing Pattern Audit entry above. Would
    reintroduce the zod-version-skew bug class and touch a file (
    `pipeline.ts`) that doesn't need to know this happened at all.
  - *Querying the vector store by similarity search to resolve a known
    chunk ID* — wrong tool for an exact-match problem; a plain `Map` is
    simpler, faster, and actually correct for this specific need.
  - *Giving the judge its own separate `documentQueryTool` call for
    grounding* — rejected; grounding is now a deterministic ID lookup, not
    a judgment call, so no LLM call is spent on it at all. (The judge
    keeps its own unrelated semantic checks unchanged.)

## Execution Plan

1. `package.json` — add `@mastra/rag`, `@mastra/libsql`, `ai`; `pnpm install`.
2. `document/vector-store.ts` — the singleton connection, no dependents yet.
3. `document/embed.ts` — depends on the vector store singleton.
4. `document/query-tool.ts` — depends on the vector store singleton.
5. `document/index.ts` — door re-exports, depends on 2–4.
6. `extraction/schema.ts` — internal model-facing schema change.
7. `extraction/agent.ts` — attach the tool, rewrite the prompt.
8. `extraction/quality-guard.ts` — replace `checkGrounding` with `checkChunkReferences`.
9. `extraction/quality-guard-agent.ts` — docstring update only.
10. `extraction/index.ts` — wire the full index→generate→resolve→cleanup lifecycle.
11. Validation gates, then implement (this plan is being implemented directly per explicit instruction — see Approval).

## File-by-File Changes

### `package.json`

**Action:** Modify

#### Reasoning

Three new dependencies, each justified individually in Research above:
`@mastra/rag` for `MDocument`/`createVectorQueryTool`, `@mastra/libsql` for
`LibSQLVector`, `ai` for `embedMany` (Mastra's own docs import it directly
from `ai`, and it is not currently hoisted as a direct dependency of this
project — confirmed by `node_modules/ai` not existing at the top level
despite `@ai-sdk/openai` already being a dependency). Versions resolved by
`pnpm add` against this project's existing `@mastra/core@^1.37.1` /
`@ai-sdk/openai@^3.0.62` peer ranges rather than hand-pinned, matching how
`pdf-parse`'s version was the one previously hand-verified (a third-party,
non-Mastra package with no peer-range relationship to verify against) —
these three are first-party Mastra/Vercel packages with real peer
dependency ranges already declared, so letting the package manager resolve
them is the correct behavior, not a shortcut.

---

### `src/features/estimate-extraction-pipeline/document/vector-store.ts`

**Action:** Create

#### After (new file, complete)

```ts
import { LibSQLVector } from '@mastra/libsql';

/**
 * The single, in-memory, per-server-process vector store every pipeline
 * run's document embeddings live in. `:memory:` is a genuinely temporary
 * store — no external infrastructure, nothing persisted beyond this
 * process's lifetime.
 *
 * One singleton connection, not one instance per run: `:memory:` SQLite
 * connections are isolated per-instance, so multiple `new LibSQLVector()`
 * calls would each get their own empty database, unreachable from any
 * other part of the pipeline. Per-run isolation instead comes from a
 * unique `indexName` (`doc-{estimateRequestId}`, see `embed.ts`) within
 * this one shared connection — the same "one client, many logical scopes"
 * shape `shared/gateway.ts`'s `kiloGateway` already uses.
 *
 * Swappable in exactly this one file: every Mastra vector store shares
 * the same createIndex/upsert/query/deleteIndex interface, so replacing
 * this with a persistent store (PgVector, etc.) later — if ever
 * needed — is a constructor swap here, not a redesign anywhere else.
 */
export const documentVectorStore = new LibSQLVector({
  id: 'document-vector-store',
  url: ':memory:',
});
```

---

### `src/features/estimate-extraction-pipeline/document/embed.ts`

**Action:** Create

#### After (new file, complete)

```ts
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';
import { kiloGateway } from '../shared/gateway';
import { documentVectorStore } from './vector-store';
import type { ParsedDocument } from './schema';

/** Dimension of openai/text-embedding-3-small, per Mastra's own vector-database docs. */
const EMBEDDING_DIMENSION = 1536;

export interface DocumentChunkRecord {
  id: string;
  text: string;
  pageNumber: number;
}

/**
 * Sentence-chunk every page of a parsed document, embed each chunk
 * through the SAME Kilo gateway every other model call in this pipeline
 * already uses (live-verified this session — no new provider needed),
 * and upsert into this run's slice of the singleton vector store.
 *
 * Returns a plain id->record map for deterministic reference resolution.
 * This is deliberately NOT another vector-store query: resolving a
 * specific, already-known chunk id is an exact-match lookup, not a
 * similarity search, and LibSQLVector documents no fetch-by-id read
 * method — a plain Map is the correct tool for an exact-match problem.
 */
export async function indexDocument(
  indexName: string,
  parsed: ParsedDocument,
): Promise<Map<string, DocumentChunkRecord>> {
  const records: DocumentChunkRecord[] = [];
  const texts: string[] = [];

  for (const page of parsed.pages) {
    const doc = MDocument.fromText(page.content, { pageNumber: page.pageNumber });
    const chunks = await doc.chunk({
      strategy: 'sentence',
      maxSize: 400,
      minSize: 40,
    });
    for (const chunk of chunks) {
      const id = `${indexName}-p${page.pageNumber}-${records.length}`;
      records.push({ id, text: chunk.text, pageNumber: page.pageNumber });
      texts.push(chunk.text);
    }
  }

  if (records.length === 0) {
    return new Map();
  }

  const { embeddings } = await embedMany({
    model: kiloGateway.embedding('text-embedding-3-small'),
    values: texts,
  });

  await documentVectorStore.createIndex({ indexName, dimension: EMBEDDING_DIMENSION });
  await documentVectorStore.upsert({
    indexName,
    vectors: embeddings,
    ids: records.map((r) => r.id),
    metadata: records.map((r) => ({ text: r.text, pageNumber: r.pageNumber })),
  });

  return new Map(records.map((r) => [r.id, r]));
}

/**
 * Delete this run's slice of the singleton store. Called from a `finally`
 * block in `extraction/index.ts` so a failed or successful run both clean
 * up — the in-memory store is process-lifetime, not request-lifetime, so
 * without this every run would leak memory into the next one.
 */
export async function cleanupDocumentIndex(indexName: string): Promise<void> {
  await documentVectorStore.deleteIndex(indexName);
}
```

#### Reasoning

- Sentence strategy params (`maxSize: 400, minSize: 40`) chosen to
  produce chunks close to one-to-two sentences each — small enough that a
  chunk id realistically corresponds to "the specific sentence" a finding
  cites, not a whole paragraph that would weaken the "locational"
  precision the user asked for.
- Chunk `id` is a deterministic, human-legible string
  (`{indexName}-p{pageNumber}-{ordinal}`), not a random UUID — makes
  debugging/log-reading straightforward without needing to cross-reference
  anything.
- `createIndex` is called fresh per run (per unique `indexName`) rather
  than once at module load, since dimension/index setup is cheap and this
  keeps each run's data namespace explicit and self-contained.

---

### `src/features/estimate-extraction-pipeline/document/query-tool.ts`

**Action:** Create

#### After (new file, complete)

```ts
import { createVectorQueryTool } from '@mastra/rag';
import { kiloGateway } from '../shared/gateway';
import { documentVectorStore } from './vector-store';

/**
 * Single shared tool instance the extraction agent uses to search this
 * run's indexed document during its own reasoning, instead of reading
 * the PDF once and hoping. `indexName` is deliberately NOT set here —
 * every pipeline run has a different one, so it is supplied per-call via
 * RequestContext (documented runtime-override behavior of
 * createVectorQueryTool), the same mechanism `extraction/index.ts`
 * already uses for `estimateRequestId`/`parsedDocument`.
 */
export const documentQueryTool = createVectorQueryTool({
  id: 'search-inspection-report',
  description:
    'Search the indexed inspection report for the specific sentence that ' +
    'supports a finding. Returns matching sentences with their chunk id ' +
    'and page number — cite the id of the sentence that actually names ' +
    'the defect and action, not a loosely related one.',
  vectorStore: documentVectorStore,
  vectorStoreName: 'document-vector-store',
  model: kiloGateway.embedding('text-embedding-3-small'),
});
```

#### Reasoning

- `vectorStore: documentVectorStore` (a direct instance) rather than a
  registered-name lookup — matches `createVectorQueryTool`'s documented
  "Usage without a Mastra server" pattern, appropriate here since this
  tool is used inside a single agent call, not through `mastra.getVector()`.
- Custom `id`/`description` — the default description ("Access the
  knowledge base to find information needed to answer user questions") is
  generic; a specific description matters because it's what the model
  reads to decide when/how to use the tool, per the doc's own guidance
  ("pay special attention to the tool's name and description").

---

### `src/features/estimate-extraction-pipeline/document/index.ts`

**Action:** Modify

#### Before

```ts
/**
 * THE DOOR — document's complete public contract. Only this file may be
 * imported from outside `document/`, per the one-door convention already
 * established for extraction/classification/pricing (see AGENTS.md).
 */
export { parsedDocumentSchema, type ParsedDocument, type DocumentPage } from './schema';
export { parsePdfFromUrl } from './parse';
```

#### After

```ts
/**
 * THE DOOR — document's complete public contract. Only this file may be
 * imported from outside `document/`, per the one-door convention already
 * established for extraction/classification/pricing (see AGENTS.md).
 */
export { parsedDocumentSchema, type ParsedDocument, type DocumentPage } from './schema';
export { parsePdfFromUrl } from './parse';
export { indexDocument, cleanupDocumentIndex, type DocumentChunkRecord } from './embed';
export { documentQueryTool } from './query-tool';
```

---

### `src/features/estimate-extraction-pipeline/extraction/schema.ts`

**Action:** Modify

#### Before

```ts
export const extractedWorkItemSchema = z.object({
  /** Stable per-run id, e.g. "item-001". classification re-derives content-addressed ids. */
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  /** Short, specific noun phrase naming what is acted on. */
  scope: z.string().min(1),
  /** Verbatim location language from the report. */
  location: z.string().min(1),
  /**
   * Physical extent of the work: how much of the thing there is, in the
   * unit that kind of material is sold/measured in. When the report gives
   * no measurement for a discrete component, `{ quantity: 1, unit: 'ea' }`.
   */
  extent: z.object({
    quantity: z.number().int().min(1),
    unit: z.enum(EXTENT_UNIT),
  }),
  /**
   * Hours ONLY when the inspector explicitly stated them. Null otherwise —
   * pricing estimates missing hours downstream. Never invented.
   */
  inspectorHours: z.number().positive().nullable(),
  /** Verbatim excerpt from the report that anchors this item. */
  sourceQuote: z.string().min(8).max(500),
  /** Page hint, strict "p. 14" format. Null when the source shows none. */
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
  /**
   * Set ONLY by `ExtractionQualityGuard` when its retry budget is
   * exhausted with violations still present on this item — never set by
   * the model itself (not part of its instructions; always defaults away
   * on a normal, clean extraction). A visible "unverified" signal that
   * flows through classification to the report, not a correction.
   */
  needsReview: z.boolean().default(false),
});

export type ExtractedWorkItem = z.infer<typeof extractedWorkItemSchema>;

export const workItemExtractionSchema = z.object({
  items: z.array(extractedWorkItemSchema),
});

export type WorkItemExtraction = z.infer<typeof workItemExtractionSchema>;
```

#### After

```ts
/**
 * PUBLIC shape — what extraction hands to classification, pricing, and
 * the report. Unchanged from before this plan; nothing downstream of
 * extraction's door needs to know sourceQuote/pageHint are now computed
 * rather than model-typed (see rawWorkItemSchema below).
 */
export const extractedWorkItemSchema = z.object({
  /** Stable per-run id, e.g. "item-001". classification re-derives content-addressed ids. */
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  /** Short, specific noun phrase naming what is acted on. */
  scope: z.string().min(1),
  /** Verbatim location language from the report. */
  location: z.string().min(1),
  /**
   * Physical extent of the work: how much of the thing there is, in the
   * unit that kind of material is sold/measured in. When the report gives
   * no measurement for a discrete component, `{ quantity: 1, unit: 'ea' }`.
   */
  extent: z.object({
    quantity: z.number().int().min(1),
    unit: z.enum(EXTENT_UNIT),
  }),
  /**
   * Hours ONLY when the inspector explicitly stated them. Null otherwise —
   * pricing estimates missing hours downstream. Never invented.
   */
  inspectorHours: z.number().positive().nullable(),
  /**
   * Verbatim excerpt from the report that anchors this item. Computed
   * from the chunk the model cited via sourceChunkId (see
   * rawWorkItemSchema) — never re-typed by the model, never a free-text
   * field the model could get wrong independent of its own citation.
   */
  sourceQuote: z.string().min(8).max(500),
  /**
   * Page hint, strict "p. 14" format. Computed from the cited chunk's
   * page number (from pdf-parse, not model transcription) — always
   * present when a chunk resolves, so this is only null in the
   * (defensive) case a citation somehow fails to resolve.
   */
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
  /**
   * Set ONLY by `ExtractionQualityGuard` when its retry budget is
   * exhausted with violations still present on this item — never set by
   * the model itself (not part of its instructions; always defaults away
   * on a normal, clean extraction). A visible "unverified" signal that
   * flows through classification to the report, not a correction.
   */
  needsReview: z.boolean().default(false),
});

export type ExtractedWorkItem = z.infer<typeof extractedWorkItemSchema>;

/**
 * MODEL-FACING shape — what the extraction agent's structuredOutput
 * actually returns. Differs from the public shape in exactly one way:
 * `sourceChunkId` replaces `sourceQuote`/`pageHint`. The model cites the
 * specific chunk (found via `documentQueryTool`) that supports a finding;
 * `extraction/index.ts` resolves the citation into the public shape's
 * verbatim quote and page number deterministically. This is what removes
 * "the model retyped a quote that doesn't match its own citation" as a
 * possible failure mode — there is no second, independently-typed copy of
 * the evidence to drift from the citation.
 */
export const rawWorkItemSchema = z.object({
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  extent: z.object({
    quantity: z.number().int().min(1),
    unit: z.enum(EXTENT_UNIT),
  }),
  inspectorHours: z.number().positive().nullable(),
  /** Chunk id returned by documentQueryTool for the sentence that anchors this item. */
  sourceChunkId: z.string().min(1),
});

export type RawWorkItem = z.infer<typeof rawWorkItemSchema>;

export const workItemExtractionSchema = z.object({
  items: z.array(rawWorkItemSchema),
});

export type WorkItemExtraction = z.infer<typeof workItemExtractionSchema>;
```

#### Reasoning

- Keeping the PUBLIC schema's field names/shape identical is what makes
  this a zero-change for classification, pricing, and every report
  component — confirmed by the Directory Map showing no files outside
  `document/` and `extraction/` touched.
- `rawWorkItemSchema` intentionally omits `sourceQuote`/`pageHint`/`needsReview`
  entirely rather than making them optional — the model has no business
  producing them at all now; `needsReview` in particular is still
  guard-only and gets added during resolution in `extraction/index.ts`,
  same as before.

---

### `src/features/estimate-extraction-pipeline/extraction/agent.ts`

**Action:** Modify (imports, `tools`, and prompt body — the prompt's
factual domain content for unit/scope-shape guidance is unchanged, only
the grounding instructions change)

#### Before

```ts
import { Agent } from '@mastra/core/agent';
import { kiloGateway } from '../shared/gateway';
import { extractionConsistencyScorer } from './scorer';
import { ExtractionQualityGuard, EXTRACTION_QUALITY_GUARD_MAX_RETRIES } from './quality-guard';
```

```ts
DEFINITION
A "billable item" is a discrete action a contractor would quote: a repair,
replacement, installation, removal, service call, or specialist evaluation
that the inspector explicitly recommends, OR that the inspector explicitly
states is defective and needs work. If the inspector did not call for an
action and did not flag a defect, it is NOT a billable item. Background
descriptions, condition observations, age statements, system overviews, and
code-of-the-day commentary are NOT billable items.

GROUNDING TESTS (apply to every candidate item before you emit it)
A. The Ctrl-F test. Pretend the contractor never reads the report — they
   only see your "sourceQuote". If a contractor reads just that one
   string out of context, can they tell exactly what defect to fix and
   where it is? If not, the quote is too vague or too long. Go back to the
   report and pick a tighter, still-verbatim excerpt that names both the
   defect and the action in the same sentence.
B. The contractor-work-order test. The same "sourceQuote" string should be
   pasteable into a contractor's work order as the job description, with
   "scope" and "location" already filled in. If a contractor would scratch
   their head at the quote, the item is not ready to emit.

HARD RULES
1. GROUNDED ONLY. Every emitted item must quote the inspector's exact wording
   in "sourceQuote". No paraphrase, no merging of separate sentences, no
   inference. If you cannot quote the inspector for an item, do not emit it.
```

```ts
- sourceQuote: a verbatim excerpt from the report that anchors this item.
  Must be between 8 and 500 characters. Pick the SHORTEST verbatim excerpt
  that still names both the defect and the action in the same sentence.
- pageHint: page number in the strict format "p. 14". Copy it from the page
  header in the source text. NEVER guess — return null if none is shown.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly. The
schema contains a single field "items" which is an array of work items. If
the report contains no billable items, return { "items": [] }.
```

```ts
  model: kiloGateway('openai/gpt-5.4-mini'),
  scorers: {
    consistency: {
      scorer: extractionConsistencyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
  outputProcessors: [new ExtractionQualityGuard()],
  maxProcessorRetries: EXTRACTION_QUALITY_GUARD_MAX_RETRIES,
});
```

#### After

```ts
import { Agent } from '@mastra/core/agent';
import { kiloGateway } from '../shared/gateway';
import { extractionConsistencyScorer } from './scorer';
import { ExtractionQualityGuard, EXTRACTION_QUALITY_GUARD_MAX_RETRIES } from './quality-guard';
import { documentQueryTool } from '../document';
```

```ts
DEFINITION
A "billable item" is a discrete action a contractor would quote: a repair,
replacement, installation, removal, service call, or specialist evaluation
that the inspector explicitly recommends, OR that the inspector explicitly
states is defective and needs work. If the inspector did not call for an
action and did not flag a defect, it is NOT a billable item. Background
descriptions, condition observations, age statements, system overviews, and
code-of-the-day commentary are NOT billable items.

GROUNDING VIA CITATION (apply to every candidate item before you emit it)
You have a "search-inspection-report" tool that searches the indexed
report and returns matching sentences, each with a chunk id and page
number. For every candidate item:
1. Formulate what you believe the defect and required action are from your
   own reading of the PDF.
2. Call the tool to find the specific sentence that actually supports it.
3. Read the returned sentence. If it genuinely names both the defect and
   the action, cite its chunk id as "sourceChunkId". If no returned
   sentence actually supports the candidate, do NOT emit the item — you
   were wrong that it was grounded.
Never invent a chunk id. Never cite a chunk whose text you have not
actually read and confirmed supports the item. A citation you have not
verified is worse than no item at all.

HARD RULES
1. GROUNDED ONLY. Every emitted item's "sourceChunkId" must be a chunk id
   returned by the search tool for a query about that specific item, and
   the chunk's text must actually name the defect and action you claim.
   No paraphrase, no merging of separate sentences, no inference. If the
   tool cannot find a supporting sentence, do not emit the item.
```

```ts
- sourceChunkId: the chunk id (from the search-inspection-report tool)
  for the specific sentence that names both the defect and the action for
  this item. Always call the tool before emitting an item; never guess an
  id.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly. The
schema contains a single field "items" which is an array of work items. If
the report contains no billable items, return { "items": [] }.
```

```ts
  model: kiloGateway('openai/gpt-5.4-mini'),
  tools: { searchInspectionReport: documentQueryTool },
  scorers: {
    consistency: {
      scorer: extractionConsistencyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
  outputProcessors: [new ExtractionQualityGuard()],
  maxProcessorRetries: EXTRACTION_QUALITY_GUARD_MAX_RETRIES,
});
```

#### Reasoning

- The multimodal PDF read (`extraction/index.ts`'s `file` content part)
  is UNCHANGED — the model still reads the actual PDF for best fidelity
  (tables, layout, embedded content pdf-parse's text layer might miss).
  The tool adds a citation step on top of that reading, it does not
  replace it. This was a deliberate choice point (see Existing Pattern
  Audit): switching to text-only RAG input was considered and rejected
  again, same reasoning as the prior plan — no way to A/B the quality
  tradeoff without live data, and this plan's actual goal (verifiable
  citation) doesn't require it.
- Unit-plausibility/scope-shape/compound-scope prompt guidance (the large
  block of BAD→GOOD examples) is untouched — unrelated to grounding,
  still needed exactly as before.

---

### `src/features/estimate-extraction-pipeline/extraction/quality-guard.ts`

**Action:** Modify (remove `checkGrounding`/`normalize`, add `checkChunkReferences`)

#### Before

```ts
import type {
  Processor,
  ProcessorViolation,
  ProcessOutputStepArgs,
  ProcessorMessageResult,
} from '@mastra/core/processors';
import { z } from 'zod';
import { extractionQualityJudgeAgent } from './quality-guard-agent';
import { workItemExtractionSchema, type ExtractedWorkItem } from './schema';
import type { ParsedDocument } from '../document';
```

```ts
    const parsedDocument = requestContext?.get('parsedDocument') as ParsedDocument | undefined;
    const groundingViolations = checkGrounding(items, parsedDocument);
```

```ts
export function checkGrounding(
  items: readonly ExtractedWorkItem[],
  doc: ParsedDocument | undefined,
): GroundingViolation[] {
  if (!doc || doc.pages.length === 0) return [];

  const haystacks = doc.pages.map((p) => normalize(p.content));
  const violations: GroundingViolation[] = [];
  for (const item of items) {
    const needle = normalize(item.sourceQuote);
    const found = haystacks.some((h) => h.includes(needle));
    if (!found) {
      violations.push({
        itemId: item.id,
        kind: 'ungrounded-quote',
        reason: `sourceQuote "${item.sourceQuote}" was not found verbatim in the source document text.`,
      });
    }
  }
  return violations;
}

export function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}
```

#### After

```ts
import type {
  Processor,
  ProcessorViolation,
  ProcessOutputStepArgs,
  ProcessorMessageResult,
} from '@mastra/core/processors';
import { z } from 'zod';
import { extractionQualityJudgeAgent } from './quality-guard-agent';
import { workItemExtractionSchema, type RawWorkItem } from './schema';
import type { DocumentChunkRecord } from '../document';
```

```ts
    const chunkMap = requestContext?.get('chunkMap') as Map<string, DocumentChunkRecord> | undefined;
    const groundingViolations = checkChunkReferences(items, chunkMap);
```

```ts
/**
 * Deterministic check: does this item's cited sourceChunkId actually
 * exist in the map of chunks this run indexed? Replaces the old
 * substring-match checkGrounding() entirely — this cannot false-positive
 * on whitespace/hyphenation/casing artifacts the way a text match could,
 * because it isn't matching text at all, just looking up a known key.
 *
 * Exported so it can be exercised directly by a pure-logic test.
 */
export function checkChunkReferences(
  items: readonly RawWorkItem[],
  chunkMap: Map<string, DocumentChunkRecord> | undefined,
): GroundingViolation[] {
  if (!chunkMap || chunkMap.size === 0) return [];

  const violations: GroundingViolation[] = [];
  for (const item of items) {
    if (!chunkMap.has(item.sourceChunkId)) {
      violations.push({
        itemId: item.id,
        kind: 'invalid-chunk-reference',
        reason: `sourceChunkId "${item.sourceChunkId}" does not match any chunk indexed from this report — the citation was never actually looked up, or was invented.`,
      });
    }
  }
  return violations;
}
```

Also update `GroundingViolation`'s `kind` literal and every place `items`
is typed as `ExtractedWorkItem` inside this file to `RawWorkItem` (the
guard now runs against the model-facing shape, before resolution):

```ts
interface GroundingViolation {
  itemId: string;
  kind: 'invalid-chunk-reference';
  reason: string;
}
```

And in `processOutputStep` / `flagUnresolvedViolations`, every
`ExtractedWorkItem` reference becomes `RawWorkItem` (the raw model output
being validated is the raw shape; resolution into the public shape happens
afterward in `extraction/index.ts`, not inside the guard).

#### Reasoning

- The guard's job doesn't change — validate this attempt, retry-with-feedback
  or flag `needsReview` on exhaustion — only WHAT it validates for
  grounding changes, from a fuzzy text match to an exact key lookup.
  `needsReview`-flagging logic (`flagUnresolvedViolations`) is unchanged;
  it just now operates on `RawWorkItem` (no `sourceQuote`/`pageHint` to
  patch — `needsReview` itself still gets added the same way, since
  `rawWorkItemSchema` union with the patch object still produces a valid
  object for re-serialization at this stage; the public shape's
  `needsReview` gets carried through during resolution in
  `extraction/index.ts`).
- Zero LLM cost added for grounding — a plain Map lookup, unlike the
  judge's semantic checks which do cost a call per attempt.

---

### `src/features/estimate-extraction-pipeline/extraction/quality-guard-agent.ts`

**Action:** Modify (docstring only — no behavioral change)

#### Reasoning

Update the file's header comment to state grounding is no longer this
judge's concern (handled deterministically in `quality-guard.ts` via
`checkChunkReferences`) — the judge's three existing checks
(unit-plausibility, compound-scope, scope-shape) are untouched, still
exactly as built earlier this session. No code change beyond the comment.

---

### `src/features/estimate-extraction-pipeline/extraction/index.ts`

**Action:** Modify

#### Before

```ts
import { RequestContext } from '@mastra/core/request-context';
import { billableItemExtractorAgent } from './agent';
import { extractionConsistencyScorer } from './scorer';
import { extractionQualityJudgeAgent } from './quality-guard-agent';
import { workItemExtractionSchema, type ExtractedWorkItem } from './schema';
import type { ParsedDocument } from '../document';

export { TRADE, ACTION, EXTENT_UNIT, extractedWorkItemSchema, type Action } from './schema';
export type { ExtractedWorkItem };
export { billableItemExtractorAgent, extractionConsistencyScorer, extractionQualityJudgeAgent };

export interface ExtractWorkItemsInput {
  estimateRequestId: string;
  fileUrl: string;
  parsedDocument: ParsedDocument;
}

export interface ExtractWorkItemsOutput {
  workItems: ExtractedWorkItem[];
}

export async function extractWorkItems(
  input: ExtractWorkItemsInput,
): Promise<ExtractWorkItemsOutput> {
  const result = await billableItemExtractorAgent.generate(
    [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Extract every billable work item from this inspection report. ' +
              'Follow the rules in your instructions exactly. When in doubt, omit. ' +
              'Return JSON matching the provided schema.',
          },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: new URL(input.fileUrl),
          },
        ],
      },
    ],
    {
      structuredOutput: { schema: workItemExtractionSchema },
      requestContext: new RequestContext([
        ['estimateRequestId', input.estimateRequestId],
        ['parsedDocument', input.parsedDocument],
      ]),
    },
  );

  const extraction = result.object;
  if (!extraction) {
    throw new Error('Extraction returned no structured object');
  }
  // needsReview normalization: ... (unchanged block, see below)
  const workItems = extraction.items.map((item) => ({
    ...item,
    needsReview: item.needsReview ?? false,
  }));
  return { workItems };
}
```

#### After

```ts
import { RequestContext } from '@mastra/core/request-context';
import { billableItemExtractorAgent } from './agent';
import { extractionConsistencyScorer } from './scorer';
import { extractionQualityJudgeAgent } from './quality-guard-agent';
import { workItemExtractionSchema, type ExtractedWorkItem } from './schema';
import { indexDocument, cleanupDocumentIndex, type ParsedDocument } from '../document';

export { TRADE, ACTION, EXTENT_UNIT, extractedWorkItemSchema, type Action } from './schema';
export type { ExtractedWorkItem };
export { billableItemExtractorAgent, extractionConsistencyScorer, extractionQualityJudgeAgent };

export interface ExtractWorkItemsInput {
  estimateRequestId: string;
  fileUrl: string;
  parsedDocument: ParsedDocument;
}

export interface ExtractWorkItemsOutput {
  workItems: ExtractedWorkItem[];
}

/**
 * THE EXTRACTION API. Reads one inspection PDF, returns every grounded
 * billable work item the inspector identifies.
 *
 * Owns the full embed→generate→resolve→cleanup lifecycle for this run's
 * document index — deliberately kept inside this one function rather
 * than spread across pipeline.ts's workflow steps, since a live vector
 * store connection cannot cross a Mastra createStep schema boundary the
 * way plain data can (see this plan's Existing Pattern Audit).
 */
export async function extractWorkItems(
  input: ExtractWorkItemsInput,
): Promise<ExtractWorkItemsOutput> {
  const indexName = `doc-${input.estimateRequestId}`;
  const chunkMap = await indexDocument(indexName, input.parsedDocument);

  try {
    const result = await billableItemExtractorAgent.generate(
      [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Extract every billable work item from this inspection report. ' +
                'Use the search tool to find and cite the specific sentence for ' +
                'each item. Follow the rules in your instructions exactly. ' +
                'When in doubt, omit. Return JSON matching the provided schema.',
            },
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: new URL(input.fileUrl),
            },
          ],
        },
      ],
      {
        structuredOutput: { schema: workItemExtractionSchema },
        requestContext: new RequestContext([
          ['estimateRequestId', input.estimateRequestId],
          ['indexName', indexName],
          ['chunkMap', chunkMap],
        ]),
      },
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

/**
 * Resolve a raw model item's sourceChunkId into the public shape's
 * verbatim sourceQuote/pageHint. A citation that fails to resolve
 * (chunk id not found) should already have been caught by the guard's
 * checkChunkReferences and either retried or flagged needsReview — this
 * fallback exists only so a truly unresolvable item degrades to an
 * honest null/needsReview state instead of throwing and losing every
 * other item in the batch.
 */
function resolveWorkItem(
  item: Omit<ExtractedWorkItem, 'sourceQuote' | 'pageHint' | 'needsReview'> & {
    sourceChunkId?: string;
    needsReview?: boolean;
  },
  chunkMap: Map<string, { text: string; pageNumber: number }>,
): ExtractedWorkItem {
  const chunk = item.sourceChunkId ? chunkMap.get(item.sourceChunkId) : undefined;
  return {
    ...item,
    sourceQuote: chunk?.text ?? '(unresolved citation)',
    pageHint: chunk ? `p. ${chunk.pageNumber}` : null,
    needsReview: item.needsReview ?? !chunk,
  };
}
```

#### Reasoning

- `resolveWorkItem`'s fallback (`'(unresolved citation)'`,
  `needsReview: !chunk`) is a defensive last resort, not the primary
  mechanism — the guard's `checkChunkReferences` is what's supposed to
  catch a bad citation and force a retry (or flag it) before this
  function ever sees one. This mirrors the same "guard's job vs.
  function's own defensive fallback" split already established for
  `!result.success` handling in the guard.
- `sourceQuote.min(8)` on the PUBLIC schema still applies at final
  validation — a chunk record's `text` came from real sentence-level
  content via `.chunk({strategy:'sentence', minSize:40})`, so it will
  always clear 8 characters in practice; this is not a new risk.

## Validation Plan

1. `pnpm install` — pulls in `@mastra/rag`, `@mastra/libsql`, `ai`.
2. `pnpm exec tsc --noEmit` — clean.
3. `pnpm exec eslint` on all created/modified files — clean.
4. One-door boundary gate — unchanged four-module grep from the prior
   plan, all four must still return zero results (no new deep-import
   paths introduced; `document/vector-store.ts`, `embed.ts`,
   `query-tool.ts` are internal, reached only via `document/index.ts`).
5. `pnpm build` — clean.
6. **Pure-logic check:** `checkChunkReferences()` with a fixture chunk map
   and a mix of valid/invalid `sourceChunkId`s — confirm exactly the
   invalid ones are flagged.
7. **Live smoke test (no full pipeline needed):** call `indexDocument()`
   directly against a real parsed document fixture, confirm it returns a
   non-empty chunk map, then call `documentVectorStore.query()` with a
   query embedding and confirm results come back with the expected
   `metadata.pageNumber`. Confirms the embed→upsert→query round-trip
   actually works end to end, not just compiles.
8. **Live QA via `pnpm dev`/`pnpm mastra:dev`:** run a real estimate
   upload. Confirm in Studio that the extraction agent's tool calls show
   up in the trace (the model actually calling `search-inspection-report`,
   not skipping it). Confirm the same report that previously produced 10
   `ungrounded-quote` false/ambiguous positives now produces zero
   `invalid-chunk-reference` violations for genuinely grounded items, and
   confirm items the model can't actually find support for are either
   omitted or correctly flagged.
9. **Structured output + tools compatibility check** (Research #7): confirm
   live that `openai/gpt-5.4-mini` actually calls the tool AND returns
   valid structured output in the same generation — this is the one
   documented cross-model risk not yet live-verified for this specific
   model.

## Risk Notes

- **Extraction now makes at least one extra round-trip per run (the tool
  call), on top of the embedding calls themselves** — more latency than
  before. Accepted tradeoff: the alternative (no citation, trust-then-check)
  is exactly the "hallucination check... waste of resources" pattern this
  plan replaces.
- **`kiloGateway.embedding(...)` was live-verified working for
  `text-embedding-3-small` specifically** (Research #6) — not verified for
  any other embedding model. If the model string ever changes, re-verify
  before assuming it works.
- **Structured output + tools together, on this specific model, is a
  reasoned inference (OpenAI's API supports both), not yet live-verified
  for `openai/gpt-5.4-mini` through Kilo's specific proxy behavior** —
  Validation step 9 exists specifically to close this gap before trusting
  it in production.
- **In-memory store lifetime is the Node process's lifetime.** If
  `cleanupDocumentIndex`'s `finally` block is ever skipped by a process
  crash mid-run, that one run's index leaks until the process restarts —
  acceptable for a dev/single-instance deployment; worth revisiting if
  this pipeline ever runs in a long-lived, high-volume production process
  where leaked indexes could accumulate meaningfully.
- **This plan does not touch classification's material-derivation or
  pricing's hour-estimation** — both real, both discussed and captured in
  `[[project_extraction-pipeline-embedding-architecture-vision]]`, both
  deliberately deferred to a follow-up plan once this infrastructure is
  live and proven, per the user's own "cut over-engineering" instruction.

## Implementation Notes (found live, not anticipated by the plan)

Four real issues surfaced only by actually running the code — not
guessable from docs alone, all fixed and live-verified:

1. **`@mastra/libsql@1.13.0`'s bundled `index.js` failed to build** —
   "Export ThreadStateStorage doesn't exist in target module." Its own
   `devDependencies` showed it was built against `@mastra/core@1.42.0`,
   newer than this project's then-pinned `1.37.1`; the declared peer range
   (`>=1.34.0-0`) was too permissive relative to what the bundled code
   actually referenced. Resolved by the user's explicit instruction to
   upgrade the whole Mastra set to latest mutually-compatible versions:
   `@mastra/core@1.50.1`, `@mastra/libsql@1.15.1`, `@mastra/rag@2.4.0`,
   `mastra@1.18.2` (CLI devDependency). Full validation suite (tsc,
   eslint, build, boundary gate) re-run clean after the upgrade.
2. **`indexName` used hyphens** (`doc-${estimateRequestId}`, and
   `estimateRequestId` is itself a hyphenated UUID) — violates libSQL's
   own documented index-naming rule (letters/numbers/underscores only),
   a rule that was read this session but not applied when writing the
   original code. Fixed to `doc_${estimateRequestId.replace(/-/g, '_')}`
   in `extraction/index.ts`.
3. **Bare `:memory:` does not share state across separate calls on the
   same `LibSQLVector` instance.** Live-verified: `createIndex`/`upsert`
   inside `indexDocument()` succeeded with no error, but a subsequent
   `listIndexes()`/`query()` call on the identical singleton object
   returned empty / "no such table." This is a known SQLite behavior —
   bare `:memory:` is private to whichever specific connection created
   it, and `@libsql/client`'s local driver does not guarantee the same
   physical connection serves every call. Fixed by using
   `file::memory:?cache=shared` instead — SQLite's own documented
   mechanism for a named, shared in-memory database — confirmed live to
   persist correctly across `createIndex`/`upsert`/`listIndexes`/`query`
   on the same instance. `document/vector-store.ts` updated accordingly.
4. **`maxSize: 400` let multiple distinct findings merge into one
   chunk** — a 3-sentence, 242-character block of unrelated findings
   stayed as a single chunk, which would let a citation point at a whole
   paragraph instead of "the specific sentence" the plan's whole design
   depends on. Live-tested against realistic finding-length text at
   `maxSize` 400/200/150/120; only 120 correctly produced one chunk per
   sentence for the test content. `document/embed.ts` updated to
   `maxSize: 120`.

None of these change the plan's architecture or File-by-File code beyond
the specific lines noted above — the design (singleton store, per-run
index namespacing, chunk-map reference resolution, tool-based citation)
held up exactly as designed; the failures were all in specific parameter
values and dependency versions, not the shape of the solution.

## Approval

Implementing directly per explicit instruction ("this change looks good,
implement the plan") — this document is the audit trail this project's own
`AGENTS.md` plan-driven workflow expects, not a pending-approval gate.
