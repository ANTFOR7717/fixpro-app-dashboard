# REFACTOR(extraction-classification-boundary)

## Request

Three things, decided together this session because they're one causal
chain:

1. **`document/`'s mechanical sentence-chunking + unused pgvector
   embedding pipeline is dead weight** — confirmed via grep (nothing
   ever calls `.query()` on the vector store) and against Mastra's own
   docs (a real Mastra RAG pipeline requires a retrieval step this code
   never had). Replace it with semantic sentence selection performed by
   the extraction agent's own single read of the document.

2. **Extraction currently does classification's job.** Its structured
   output assigns `trade` (1 of 11 categories) and `extent.unit` (1 of 4
   categories) — picking a label from a fixed taxonomy based on domain
   knowledge, not pulling a fact stated in the text. That's a Single
   Responsibility violation: two independent reasons to change
   (extraction criteria vs. trade/unit taxonomy) live in one file, one
   LLM call. Extraction must be cut down to ONLY what it's named for:
   grounding meaningful sentences and pulling out facts actually stated
   in the text (action language, location, an explicitly-stated count,
   explicitly-stated inspector hours).

3. **`classification/` currently doesn't classify anything — assume
   everything in it is bugged and rebuild it.** It receives
   already-trade/unit-typed items from extraction and just copies those
   fields through untouched. Its one real decision — material vs. labor
   — is `ACTION_COST_PROFILE` (`rules.ts`), a static table keyed ONLY on
   the action verb: `repair` is unconditionally "labor-only," even for
   `"repair damaged siding board"`, which obviously needs a replacement
   board (material) AND labor. This has been a confirmed, live-observed
   bug. Classification must actually own trade/unit assignment and a
   real per-item material/labor judgment, replacing the hardcoded table.

4. **Swap the shared model gateway from Kilo to Pioneer AI (Fastino
   Labs), AND the model itself from `openai/gpt-5.4-mini` to
   `claude-fable-5`.** `shared/gateway.ts`'s `kiloGateway` — the single
   `createOpenAI(...)` instance every agent in this pipeline routes
   through — is replaced by `pioneerGateway`, pointed at
   `https://api.pioneer.ai/v1` with a new `PIONEER_API_KEY`. Confirmed
   via web search that Pioneer AI is a real inference gateway with an
   OpenAI-compatible chat completions endpoint (not assumed). The exact
   model-ID string was given directly, not guessed: `'claude-fable-5'`,
   used bare (no `openai/`-style prefix) at every call site that
   previously read `kiloGateway('openai/gpt-5.4-mini')`. This touches
   every agent (`findingExtractorAgent`,
   `lineClassifierAgent`, `itemPricerAgent`, `extractionConsistencyScorer`),
   making it the highest blast-radius change in this plan.

**Slop identified this session, removed here:**
- `document/embed.ts` / `document/vector-store.ts` — mechanical
  sentence-chunker + embed + upsert into a pgvector table nothing ever
  queries.
- `classification/index.ts`'s `scopeIsRenderable` — a silent heuristic
  filter that drops real items with zero logging, zero surfaced signal,
  duplicating a rule the extraction prompt already states.
- `classification/index.ts`'s double dedup (normalized-quote AND
  structural-key, simultaneously) — two overlapping heuristics for the
  same failure mode.
- `classification/index.ts`'s `generateItemId` sha256 content-hash — a
  brand-new id computed from scratch when extraction already assigns
  every finding a stable per-run id; nothing in the pipeline compares
  ids across separate runs, so "stable across re-runs" solves a problem
  that doesn't exist.
- `classification/rules.ts`'s `pricingBasisFor`/`PricingBasis` — pricing
  domain logic ("what must this price cover") that only `pricing/` ever
  calls, parked in classification's file and reached through its door.

## Directory Map

```text
src/features/estimate-extraction-pipeline/
├── document/
│   ├── schema.ts                   [MODIFY] drop documentChunkRecordSchema/DocumentChunkRecord
│   ├── embed.ts                    [DELETE]
│   ├── vector-store.ts             [DELETE]
│   └── index.ts                    [MODIFY] drop indexDocument + chunk-record exports
├── extraction/
│   ├── schema.ts                   [MODIFY] drop TRADE/EXTENT_UNIT (move out); meaningfulSentenceSchema; findings replace items
│   ├── agent.ts                    [MODIFY] rename + rewrite: semantic sentence selection, facts-only findings, no trade/unit; pioneerGateway import
│   ├── scorer.ts                   [MODIFY] pioneerGateway import (was kiloGateway) — no other change
│   └── index.ts                    [MODIFY] rename extractWorkItems -> extractFindings; page-indexed prompt; drop indexDocument/dead RequestContext
├── classification/
│   ├── schema.ts                   [MODIFY] TRADE/EXTENT_UNIT move in; +pricingBasis field; +lineClassificationSchema
│   ├── agent.ts                    [CREATE] lineClassifierAgent — real per-item trade + material/labor judgment
│   ├── rules.ts                    [DELETE] ACTION_COST_PROFILE + pricingBasisFor both removed/relocated
│   └── index.ts                    [MODIFY] rebuilt classifyLines: dedup once, call the agent, no silent drops, no hash ids
├── pricing/
│   ├── schema.ts                   [MODIFY] drop estimatedHours from laborPriceResponseSchema — classification resolves hours now
│   ├── agent.ts                    [MODIFY] drop estimatedHours request — itemPricerAgent prices, never estimates hours
│   └── price-line.ts               [MODIFY] read line.pricingBasis directly; drop the whole hours-resolution branch (line.quantity is always already resolved); pioneerGateway import via itemPricerAgent
├── shared/
│   └── gateway.ts                  [MODIFY] kiloGateway -> pioneerGateway; api.pioneer.ai base URL, PIONEER_API_KEY
├── pipeline.ts                     [MODIFY] findings/sentences threading; classifyStep becomes async with retries
└── index.ts                        [MODIFY] register lineClassifierAgent; rename extraction agent import

src/features/estimate/
├── lib/
│   ├── envelope.ts                 [MODIFY] chunks -> sentences, import source document/ -> extraction/
│   └── workflow.ts                 [MODIFY] chunks -> sentences
└── components/
    ├── items-section.tsx           [MODIFY] chunks prop -> sentences prop, debug label, import source
    └── estimate-report.tsx         [MODIFY] chunks -> sentences

AGENTS.md                           [MODIFY] document/ grep drops vector-store|embed; classification/ grep drops rules, adds agent
package.json                        [MODIFY] drop @mastra/pg, @mastra/rag (zero remaining consumers); add @mastra/tavily
.env                                 [MODIFY] add TAVILY_API_KEY, PIONEER_API_KEY, PIONEER_API_URL (gitignored, real values already set); KILO_API_KEY kept
.env.example                        [MODIFY] KILO_API_KEY placeholder -> PIONEER_API_KEY/PIONEER_API_URL + TAVILY_API_KEY placeholders
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `document/embed.ts`, `document/vector-store.ts` | Delete | Mechanical chunk/embed/upsert; embeddings never queried. |
| `document/schema.ts`, `document/index.ts` | Modify | Drop the chunk-record concept — it now lives in `extraction/` as `meaningfulSentenceSchema`, since it requires semantic judgment `document/` (pdf-parse only) never had. |
| `extraction/schema.ts` | Modify | `TRADE`/`EXTENT_UNIT` move to `classification/` (they're taxonomy assignments, not text extraction). `meaningfulSentenceSchema` drops `impliesMaterial`/`impliesLabor` (had no consumer, was itself a classification judgment in the wrong module). New `ExtractedFinding`/`RawFinding` shapes replace `ExtractedWorkItem`/`RawWorkItem` — facts only: `action`, `scope`, `location`, `statedQuantity` (literal count, only if the text states one), `inspectorHours`, grounding. |
| `extraction/agent.ts` | Modify | Renamed `findingExtractorAgent` (was `billableItemExtractorAgent` — it no longer produces billable *items*, it produces grounded *findings*). Instructions: select meaningful sentences from the full page text (not a pre-built list), extract only stated facts, no trade/unit assignment, no material/labor rules. Imports `pioneerGateway` (was `kiloGateway`). |
| `extraction/scorer.ts` | Modify | Only change: `pioneerGateway` import (was `kiloGateway`) — the judge model routes through the same gateway swap as every other agent. |
| `extraction/index.ts` | Modify | `extractFindings()` (was `extractWorkItems`). Prompt built from `parsedDocument.pages` directly. Drops the `indexDocument` call and the dead `RequestContext` (`chunkMap`/`estimateRequestId` — zero consumers, confirmed via grep; their only consumer, `ExtractionQualityGuard`, was already deleted in prior work). |
| `classification/schema.ts` | Modify | Gains `TRADE`/`EXTENT_UNIT`. `materialLineSchema`/`laborLineSchema` gain a `pricingBasis` field (computed once, here, instead of re-derived by `pricing/` via a cross-module function call). New `lineClassificationSchema`/`classificationOutputSchema` for the new agent's structured output. |
| `classification/agent.ts` | Create | `lineClassifierAgent` — one LLM call per pipeline run, given all deduped findings, judges trade + material presence + labor presence + material quantity/unit PER FINDING from its actual content, not a verb lookup table. |
| `classification/rules.ts` | Delete | `ACTION_COST_PROFILE` is replaced by the agent's real per-item judgment. `pricingBasisFor`/`PricingBasis` had zero consumers inside `classification/` itself — only `pricing/` called it — so it's not relocated as a function, it's replaced by a plain `pricingBasis` field classification stamps onto each line it already constructs. |
| `classification/index.ts` | Modify | Rebuilt `classifyLines` (now `async`): ONE dedup pass (sourceQuote+action), calls the web-search-equipped `lineClassifierAgent` once for the whole batch, builds fully-resolved `BillableLine[]` — every material line and the one labor line per finding carry real, grounded, non-null quantities and a `pricingBasis` stamped per line. No `scopeIsRenderable` silent filter. No sha256 id — reuses the finding's own stable id, suffixed. An unresolved/unclassified finding THROWS (handled by `classifyStep`'s `retries: 2`), not a fabricated fallback line — no guessing anywhere in this module. |
| `pricing/schema.ts` | Modify | Drop `estimatedHours` from `laborPriceResponseSchema` (and its `superRefine` check) — classification now resolves every labor line's hours before pricing ever runs; pricing only ever needs a rate. |
| `pricing/agent.ts` | Modify | Drop the whole `estimatedHours` request from `itemPricerAgent`'s instructions/output contract — this is the exact ungrounded-guess mechanism confirmed this session (zero tools, "no research was done just guessing"); classification's real, web-search-grounded hours replace it entirely, not just relocate it. Imports `pioneerGateway` (was `kiloGateway`). |
| `pricing/price-line.ts` | Modify | Reads `line.pricingBasis` directly — no `pricingBasisFor` import/call. Drops the entire labor-hours-resolution branch (`line.quantity !== null ? ... : l.estimatedHours !== null ? ... : ...`) — `line.quantity` is never null anymore, so pricing passes it through unchanged instead of re-resolving it. |
| `shared/gateway.ts` | Modify | ADD `pioneerGateway`: `createOpenAI({ apiKey: PIONEER_API_KEY, baseURL: 'https://api.pioneer.ai/v1' })`. `kiloGateway` stays defined, unused, not deleted (explicit instruction — a one-line rollback path per agent if Pioneer proves unreliable). Every agent in the pipeline switches its import to `pioneerGateway` and model string to `'claude-fable-5'` — highest blast-radius change in this plan; see its own File-by-File section and Risk Notes. |
| `pipeline.ts` | Modify | `workItems`/`chunks` → `findings`/`sentences`. `classifyStep` becomes `async` with `retries: 2` (it now makes an LLM call, same transient-failure handling `extractStep` already has). |
| `estimate-extraction-pipeline/index.ts` | Modify | Register `lineClassifierAgent` (`'line-classifier'`) alongside the renamed `findingExtractorAgent` (`'finding-extractor'`, was `'billable-item-extractor'`). |
| `estimate/lib/envelope.ts`, `estimate/lib/workflow.ts` | Modify | `chunks` → `sentences`, same as before. |
| `estimate/components/items-section.tsx`, `estimate/components/estimate-report.tsx` | Modify | `chunks` → `sentences`, debug label update, same as before. |
| `AGENTS.md` | Modify | `document/` grep drops `vector-store\|embed`. `classification/` grep drops `rules`, adds `agent` (new internal file). |
| `package.json` | Modify | Drop `@mastra/pg`, `@mastra/rag` — confirmed zero remaining imports anywhere in `src/`. Add `@mastra/tavily` — `classification/agent.ts`'s web-search tool. |
| `.env` | Modify | Add `TAVILY_API_KEY`, `PIONEER_API_KEY`, `PIONEER_API_URL` (gitignored, already set to real values this session). `KILO_API_KEY` line left in place (harmless once nothing imports it) rather than removed — dropping a credential line is a separate decision from adding new ones. |
| `.env.example` | Modify | `KILO_API_KEY` placeholder → `PIONEER_API_KEY`/`PIONEER_API_URL` placeholders; add a `TAVILY_API_KEY` placeholder. Already done this session — template only, no real secrets. |

## Existing Pattern Audit

- **Vector store confirmed dead via grep** (`documentVectorStore` has
  exactly two hits, both `createIndex`/`upsert` in the files being
  deleted; zero `.query()` calls anywhere) and **confirmed against
  Mastra's own docs** (`mcp__mastra__mastraDocs`: `docs/rag/overview`,
  `docs/rag/retrieval`) that a real Mastra RAG pipeline requires a
  retrieval step (`pgVector.query()` / `createVectorQueryTool()`) this
  code never had.
- **`extraction/scorer.ts` confirmed to have zero dependency on
  `chunkMap`/`RequestContext`** (only reads `run.output`) — its only
  consumer was the already-deleted `ExtractionQualityGuard`. Safe to
  drop, not repoint.
- **`pricingBasisFor` confirmed to have exactly one consumer** —
  `pricing/price-line.ts:53` — via grep across the whole `pricing/`
  folder. `classification/index.ts` itself never calls it. Confirms it's
  misplaced, not merely underused.
- **`@mastra/pg`/`@mastra/rag`/`kiloGateway.embedding` confirmed to have
  zero other consumers** in `src/` via grep.
- **No external consumer of `ExtractedWorkItem`/`extractedWorkItemSchema`/
  `extractWorkItems`/`classifyLines`/`ACTION_COST_PROFILE`/
  `pricingBasisFor` outside the pipeline package itself** — confirmed via
  grep — so these renames are contained to
  `estimate-extraction-pipeline/` plus the already-known `chunks`→
  `sentences` rename in `estimate/`.
- **The "one attempt, throws on failure" model is preserved and
  extended, not replaced.** `classifyLines` becomes an LLM call and
  therefore gets the same treatment `extractFindings` already has:
  `pipeline.ts`'s `retries: 2` on the step, one `generate()` call inside,
  throws if `result.object` is missing. No tool loop, no retry-with-guard
  mechanism — consistent with this session's `FIX(remove-extraction-quality-guard)`
  precedent (single pass, not a retry gate).
- **Deliberately no new validation/guard layer for unit-material
  plausibility.** The prior `ItemContractGuard` (semantic unit
  plausibility check) was already removed earlier in this project on the
  view that a lengthened prompt should carry that weight instead of a
  deterministic guard-and-retry mechanism — this plan keeps that same
  posture for the NEW agent's unit-assignment judgment (prompt discipline
  + structured output, no separate guard), for consistency with the
  standing "no replacement quality check" decision already made this
  session for extraction. If this turns out wrong in practice, the fix is
  a real guard, not more prose — same lesson already on record.
- **A finding that fails to resolve at extraction's citation step still
  degrades visibly** (`resolveWorkItem`'s `chunk?.text ?? '(unresolved
  citation)'` pattern, kept) — but a finding `classifyLines` never
  received a classification line for THROWS instead, per explicit
  correction later in this same plan (see `classification/index.ts`'s
  own Reasoning): a fabricated fallback line (`trade: 'other'`, guessed
  `pricingBasis`) is itself still guessing, which is the opposite of what
  this whole rebuild exists to remove. Two different failure points, two
  different — deliberately different — behaviors.

## Execution Plan

### Step 1 — `document/`: shrink to parsing only
Delete `embed.ts`/`vector-store.ts`; trim `schema.ts`/`index.ts`.

### Step 2 — `extraction/`: cut to grounding + stated facts only
Move `TRADE`/`EXTENT_UNIT` out. Rebuild `schema.ts`, `agent.ts`,
`index.ts` around `sentences` + `findings`.

### Step 3 — `classification/`: rebuild as real per-item judgment
`TRADE`/`EXTENT_UNIT` land here. New `agent.ts`. Delete `rules.ts`.
Rebuild `index.ts`'s `classifyLines` as an async, agent-backed function
with one dedup pass and no silent drops.

### Step 4 — `pricing/`: consume `pricingBasis` as data, not a function call
### Step 5 — `pipeline.ts` + registration: thread `findings`/`sentences`,
make `classifyStep` async with retries, register the new agent.
### Step 6 — `estimate/`: thread `sentences` through envelope/report,
same as already-scoped.
### Step 7 — `AGENTS.md` + `package.json` housekeeping.

## File-by-File Changes

### `src/features/estimate-extraction-pipeline/document/embed.ts`
**Action:** Delete

### `src/features/estimate-extraction-pipeline/document/vector-store.ts`
**Action:** Delete

---

### `src/features/estimate-extraction-pipeline/document/schema.ts`
**Action:** Modify

#### After
```ts
import { z } from 'zod';

/**
 * One physical page of the source PDF, extracted as plain text. 1-indexed
 * to match how pageHint ("p. 14") and pdf-parse's own page numbering both
 * count pages.
 */
export const documentPageSchema = z.object({
  pageNumber: z.number().int().min(1),
  content: z.string(),
});

export const parsedDocumentSchema = z.object({
  pages: z.array(documentPageSchema),
});

export type DocumentPage = z.infer<typeof documentPageSchema>;
export type ParsedDocument = z.infer<typeof parsedDocumentSchema>;
```
(`documentChunkRecordSchema`/`DocumentChunkRecord` removed — the concept
now lives in `extraction/schema.ts` as `meaningfulSentenceSchema`, not a
renamed copy of this one.)

---

### `src/features/estimate-extraction-pipeline/document/index.ts`
**Action:** Modify

#### After
```ts
/**
 * THE DOOR — document's complete public contract. document/ does exactly
 * one job: parse the source PDF into page-level plain text. It does not
 * chunk, embed, or store anything — semantic judgment about which
 * sentences matter belongs to extraction/, which actually reads the
 * document with reasoning; document/ never has.
 */
export {
  parsedDocumentSchema,
  type ParsedDocument,
  type DocumentPage,
} from './schema';
export { parsePdfFromUrl } from './parse';
```

---

### `src/features/estimate-extraction-pipeline/extraction/schema.ts`
**Action:** Modify

#### After
```ts
import { z } from 'zod';

export const ACTION = [
  'repair',
  'replace',
  'install',
  'remove',
  'service',
  'evaluate',
] as const;

export type Action = (typeof ACTION)[number];

/**
 * One sentence the extraction agent judged MEANINGFUL while reading the
 * report — one a billable finding can be inferred from. NOT a mechanical,
 * exhaustive inventory of every sentence in the document — only what the
 * model itself selected as it reasoned over the source. Every
 * `RawFinding.sourceSentenceId` must reference one of these by id.
 */
export const meaningfulSentenceSchema = z.object({
  /** Stable per-run id, e.g. "p14-1" (page 14, first meaningful sentence found on it). */
  id: z.string().min(1),
  pageNumber: z.number().int().min(1),
  /** Verbatim sentence text, copied exactly from the source page. */
  text: z.string().min(1),
  /** One-line explanation of why this sentence is meaningful. */
  reasoning: z.string().min(1),
});

export type MeaningfulSentence = z.infer<typeof meaningfulSentenceSchema>;

/**
 * PUBLIC shape — what extraction hands to classification. Facts actually
 * stated in the text ONLY: no trade, no unit, no material/labor judgment
 * — those require domain-taxonomy knowledge, not text extraction, and are
 * classification's job. `sourceQuote`/`pageHint` are computed from the
 * sentence the model cited (see `rawFindingSchema` below), not model-typed
 * independently.
 */
export const extractedFindingSchema = z.object({
  /** Stable per-run id, e.g. "finding-001". */
  id: z.string(),
  action: z.enum(ACTION),
  /** Short, specific noun phrase naming what is acted on. */
  scope: z.string().min(1),
  /** Verbatim location language from the report. */
  location: z.string().min(1),
  /**
   * Literal count ONLY when the text states one (a digit, a written-out
   * number, or "both" -> 2). Null in every other case — including
   * open-ended language like "all"/"every"/"remaining", since deciding
   * how that bills (e.g. "1 = the whole job") is a classification
   * convention, not a fact extraction observed. Never a default.
   */
  statedQuantity: z.number().int().min(1).nullable(),
  /**
   * Hours ONLY when the inspector explicitly stated them. Null otherwise —
   * classification/pricing estimate missing hours downstream. Never invented.
   */
  inspectorHours: z.number().positive().nullable(),
  sourceQuote: z.string().min(8).max(500),
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
});

export type ExtractedFinding = z.infer<typeof extractedFindingSchema>;

/**
 * MODEL-FACING shape. `sourceSentenceId` replaces `sourceQuote`/`pageHint`
 * — the model cites the id of one of ITS OWN entries in this same
 * response's `sentences` array; `extraction/index.ts` resolves the
 * citation into the public shape's verbatim quote and page number
 * deterministically. Removes "the model retyped a quote that doesn't
 * match its own citation" as a possible failure mode.
 */
export const rawFindingSchema = z.object({
  id: z.string(),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  statedQuantity: z.number().int().min(1).nullable(),
  inspectorHours: z.number().positive().nullable(),
  /** Id of the entry in this same response's "sentences" array that anchors this finding. */
  sourceSentenceId: z.string().min(1),
});

export type RawFinding = z.infer<typeof rawFindingSchema>;

export const extractionOutputSchema = z.object({
  /** Every sentence the model judged meaningful while reading the report. */
  sentences: z.array(meaningfulSentenceSchema),
  findings: z.array(rawFindingSchema),
});

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
```

#### Reasoning
- `TRADE`/`EXTENT_UNIT` deleted from this file — they move to
  `classification/schema.ts` since assigning them is now
  classification's job.
- `extractedWorkItemSchema`/`ExtractedWorkItem` → `extractedFindingSchema`/
  `ExtractedFinding`; `rawWorkItemSchema`/`RawWorkItem` →
  `rawFindingSchema`/`RawFinding`; `workItemExtractionSchema` →
  `extractionOutputSchema`. "Item" implied a finished billable line;
  "finding" is accurate — a grounded, factual observation, not yet
  classified into a billable line.

---

### `src/features/estimate-extraction-pipeline/extraction/agent.ts`
**Action:** Modify

#### After
```ts
import { Agent } from '@mastra/core/agent';
import { pioneerGateway } from '../shared/gateway';
import { extractionConsistencyScorer } from './scorer';

/**
 * The agent has exactly one job: read an inspection PDF and emit every
 * grounded FINDING the inspector explicitly identifies, so classification
 * can turn each one into a properly-typed billable line. It does not
 * assign a trade, a unit, or a material/labor split — those require
 * domain-taxonomy judgment classification owns, not text extraction. It
 * does not summarize, advise, prioritize, price, or estimate hours.
 *
 * Internal to the extraction module — only extraction/index.ts calls
 * `.generate()` on this.
 */
export const findingExtractorAgent = new Agent({
  id: 'finding-extractor',
  name: 'Inspection Finding Extractor',
  instructions: `
You read a home inspection PDF and emit two things: (1) every sentence you
find MEANINGFUL, and (2) every BILLABLE FINDING those sentences support.

DEFINITION
A "billable finding" is a discrete action a contractor would quote: a
repair, replacement, installation, removal, service call, or specialist
evaluation that the inspector explicitly recommends, OR that the inspector
explicitly states is defective and needs work. If the inspector did not
call for an action and did not flag a defect, it is NOT a billable
finding. Background descriptions, condition observations, age statements,
system overviews, and code-of-the-day commentary are NOT billable
findings.

SENTENCE SELECTION (do this first, as you read)
Your message includes the full report, page by page. As you read it,
identify every sentence meaningful enough that a billable finding can be
inferred from it. Emit each one into "sentences":
- "id": a stable id you invent, formatted "p{page}-{n}" where {n} counts
  meaningful sentences found on that page starting at 1 (e.g. "p14-1",
  "p14-2", "p15-1").
- "pageNumber": the page it came from.
- "text": the sentence copied VERBATIM from the source — do not paraphrase.
- "reasoning": one line on why this sentence is meaningful.
Do NOT emit descriptive, background, or condition-overview sentences —
only ones a billable finding is actually inferable from.

GROUNDING VIA YOUR OWN SENTENCE SELECTION
"sourceSentenceId" must be the id of an entry YOU emitted in "sentences"
above, in this same response. For every candidate finding:
1. Confirm you already emitted a "sentences" entry naming both the defect
   and the required action.
2. Cite that entry's id as "sourceSentenceId".
3. If you did not emit a supporting entry, do NOT emit the finding.
Never invent a sentence id. Never cite an id whose text you have not
actually confirmed supports the finding.

HARD RULES
1. GROUNDED ONLY. Every emitted finding's "sourceSentenceId" must be an id
   present in this same response's "sentences" array, and that entry's
   text must actually name the defect and action you claim. No paraphrase,
   no merging of separate entries, no inference.
2. ONE FINDING PER FIX. If the inspector lists two distinct fixes (e.g.
   "replace the angle stop AND re-secure the supply line"), emit TWO
   findings. Do NOT split on "or"-worded uncertainty about which single
   material is affected (e.g. "trim or wood siding shows signs of
   damage") — that is the inspector expressing uncertainty about ONE
   observed defect, not confirming two separate ones. Emit ONE finding;
   which specific material(s) it involves is classification's job, not
   yours.
3. NO PROSE, NO NARRATIVE, NO DESCRIPTIONS.
4. NO ADVICE, NO PRIORITIZATION, NO SEVERITY.
5. NO PRICING, NO TRADE, NO UNIT, NO MATERIAL/LABOR SPLIT, EVER. Those are
   NOT your job — classification assigns them from your finding's content.
   \`inspectorHours\` is filled ONLY when the inspector explicitly stated
   an hour count — never your own estimate.
6. WHEN UNSURE, OMIT. "Unsure" means the sentence is DESCRIPTIVE rather
   than actionable.
7. NO INVENTION of parts, quantities, scope, or location wording. Only
   emit fields the inspector wrote or which are directly and obviously
   implied by the inspector's verbatim wording.

FIELDS YOU MUST PRODUCE PER FINDING
- id: stable per-run identifier like "finding-001", "finding-002" in order.
- action: one of repair, replace, install, remove, service, evaluate.
  "service" is for recurring maintenance the inspector explicitly called
  out. "evaluate" is for specialist inspections.
- scope: a short noun phrase naming the item. Be specific enough that a
  contractor knows exactly what it is.
  NEVER emit a bare trade-category word as scope — "siding", "foundation",
  "chimney", "receptacles", "plumbing", "roof" are NOT valid scope on
  their own. Find the actual noun phrase from the inspector's sentence.
  BAD -> GOOD:
    "siding" -> "loose siding panel" / "damaged siding board"
    "foundation" -> "foundation moisture intrusion" / "foundation crack"
    "chimney" -> "leaning chimney structure" / "chimney movement"
    "receptacles" -> "loose wall receptacle" / "ungrounded receptacle"
  If the report's wording is genuinely too vague to produce a real noun
  phrase, omit the finding rather than emit a one-word category label.
- location: verbatim location language from the report. e.g. "Kitchen",
  "Roof — north slope", "Basement — northeast corner".
- statedQuantity: a literal count ONLY when the text states one:
    - Specific digit ("3 shingles", "20% of shingles" -> 20): that number.
    - Written-out number ("two outlets"): that number.
    - "both" -> 2.
  Otherwise null — including "all"/"every"/"each"/"the remaining" language.
  Do NOT invent a default; do NOT try to guess a unit-based convention —
  that is not your job.
- inspectorHours: hours as a number ONLY when the inspector explicitly
  stated an hour count. In every other case: null.
- sourceSentenceId: the id of the entry in YOUR OWN "sentences" array that
  names both the defect and the action for this finding.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly. The
schema contains "sentences" and "findings". If the report contains no
billable findings, "findings" may be empty, but "sentences" should still
reflect what you actually found meaningful.

Do not include any commentary, explanation, preamble, or text outside the
JSON.
`,
  model: pioneerGateway('claude-fable-5'),
  scorers: {
    consistency: {
      scorer: extractionConsistencyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
});
```

---

### `src/features/estimate-extraction-pipeline/extraction/index.ts`
**Action:** Modify

#### After
```ts
import { findingExtractorAgent } from './agent';
import { extractionConsistencyScorer } from './scorer';
import {
  extractionOutputSchema,
  type ExtractedFinding,
  type RawFinding,
  type MeaningfulSentence,
} from './schema';
import type { ParsedDocument } from '../document';

export {
  ACTION,
  extractedFindingSchema,
  meaningfulSentenceSchema,
  type Action,
  type MeaningfulSentence,
} from './schema';
export type { ExtractedFinding };
export { findingExtractorAgent, extractionConsistencyScorer };

export interface ExtractFindingsInput {
  estimateRequestId: string;
  fileUrl: string;
  parsedDocument: ParsedDocument;
}

export interface ExtractFindingsOutput {
  findings: ExtractedFinding[];
  sentences: MeaningfulSentence[];
}

/**
 * THE EXTRACTION API. Reads one inspection PDF (already parsed into
 * page-level text), returns every grounded billable finding the inspector
 * identifies plus the meaningful sentences the model itself selected
 * while reading — one `generate()` call does both, since selecting a
 * meaningful sentence and extracting the finding it supports are the same
 * semantic act.
 *
 * ONE ATTEMPT. Throws on any failure — malformed structured output, empty
 * response, transport error. Retrying is an orchestration decision
 * (`pipeline.ts`'s `retries: 2`), not something this function decides.
 */
export async function extractFindings(
  input: ExtractFindingsInput,
): Promise<ExtractFindingsOutput> {
  const result = await findingExtractorAgent.generate(
    [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Read this inspection report page by page. First identify every ' +
              'sentence meaningful enough that a billable finding can be ' +
              'inferred from it and emit it into "sentences". Then extract ' +
              'every billable finding, citing one of your own sentence ids ' +
              'for each. Follow the rules in your instructions exactly. When ' +
              'in doubt, omit. Return JSON matching the provided schema.',
          },
          {
            type: 'text',
            text: formatPagedDocument(input.parsedDocument),
          },
        ],
      },
    ],
    {
      structuredOutput: { schema: extractionOutputSchema },
    },
  );

  const extraction = result.object;
  if (!extraction) {
    throw new Error('Extraction returned no structured object');
  }

  const sentenceMap = new Map(extraction.sentences.map((s) => [s.id, s]));
  const findings = extraction.findings.map((f) => resolveFinding(f, sentenceMap));
  return { findings, sentences: extraction.sentences };
}

/** Renders the parsed document as page-indexed plain text for the model to read and reason over directly. */
function formatPagedDocument(parsed: ParsedDocument): string {
  const lines = parsed.pages.map((page) => `[p. ${page.pageNumber}]\n${page.content}`);
  return `INSPECTION REPORT (by page):\n\n${lines.join('\n\n')}`;
}

/**
 * Resolve a raw model finding's sourceSentenceId into the public shape's
 * verbatim sourceQuote/pageHint. This fallback exists so a citation that
 * fails to resolve degrades to an honest "(unresolved citation)" state
 * instead of throwing and losing every other finding in the batch.
 */
function resolveFinding(
  f: RawFinding,
  sentenceMap: Map<string, MeaningfulSentence>,
): ExtractedFinding {
  const sentence = sentenceMap.get(f.sourceSentenceId);
  return {
    id: f.id,
    action: f.action,
    scope: f.scope,
    location: f.location,
    statedQuantity: f.statedQuantity,
    inspectorHours: f.inspectorHours,
    sourceQuote: sentence?.text ?? '(unresolved citation)',
    pageHint: sentence ? `p. ${sentence.pageNumber}` : null,
  };
}
```
(`estimateRequestId` stays on `ExtractFindingsInput` only because
`pipeline.ts`'s `extractStep` passes it through unchanged for step-input
consistency — it's not used inside this function anymore; there is no
pgvector `indexName` left to build. The dead `RequestContext`
(`chunkMap`/`estimateRequestId`) is removed outright.)

---

### `src/features/estimate-extraction-pipeline/classification/schema.ts`
**Action:** Modify

#### After
```ts
import { z } from 'zod';
import { ACTION } from '../extraction';

/**
 * What trade would actually do this work. Assigned HERE, not by
 * extraction — this is a domain-taxonomy judgment, not a fact stated in
 * the report's text.
 */
export const TRADE = [
  'electrical',
  'plumbing',
  'hvac',
  'roofing',
  'structural',
  'carpentry',
  'masonry',
  'appliance',
  'exterior',
  'interior',
  'other',
] as const;
export type Trade = (typeof TRADE)[number];

/**
 * Physical units a MATERIAL extent can be measured in. `hrs` is
 * deliberately absent — hours are not a physical extent. Assigned HERE
 * for the same reason as TRADE above. NOT a category->unit lookup table —
 * the agent determines the unit per material name it itself names (see
 * agent.ts); this is just the closed set of valid values.
 */
export const EXTENT_UNIT = ['ea', 'lf', 'sf', 'cy'] as const;
export type ExtentUnit = (typeof EXTENT_UNIT)[number];

export const COST_TYPE = ['labor', 'material'] as const;
export type CostType = (typeof COST_TYPE)[number];

/**
 * What the pricer's number must cover for one line — computed ONCE, here,
 * at the same moment classification decides a finding's material/labor
 * lines, since that decision is exactly what determines this:
 *
 *   - 'material-part-only'   — a material line with at least one labor sibling.
 *   - 'labor-install-hourly' — the labor line when at least one material sibling exists.
 *     HOURLY RATE for installing the material(s); excludes part cost.
 *   - 'labor-all-in-hourly'  — labor with NO material sibling. The hourly
 *     rate must be the all-in rate a contractor quotes.
 *
 * A plain data field on each line, not a function pricing calls with
 * (action, costType) — pricing already has the line; it just reads this.
 */
export const PRICING_BASIS = [
  'material-part-only',
  'labor-install-hourly',
  'labor-all-in-hourly',
] as const;
export type PricingBasis = (typeof PRICING_BASIS)[number];

const itemIdentityFields = {
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  sourceQuote: z.string().min(8).max(500),
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
} as const;

/**
 * ONE material billable line. A single finding can produce MULTIPLE of
 * these — e.g. "trim or wood siding" names two materials with two
 * DIFFERENT units (lf vs sf); collapsing them into one line would mean
 * silently picking a unit and hiding the other. `quantity` is NEVER
 * null — classification always resolves a real number (see agent.ts);
 * there is no "pending" state left for pricing to fill in.
 */
export const materialLineSchema = z.object({
  ...itemIdentityFields,
  costType: z.literal('material'),
  /** What the material actually is, e.g. "wood siding board", "exterior trim board". */
  material: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.enum(EXTENT_UNIT),
  /** Grounding for this number: a document citation, or a web-search citation. Never absent. */
  amountSource: z.string().min(1),
  pricingBasis: z.literal('material-part-only'),
});

/**
 * ONE labor billable line. `quantity` (hours) is NEVER null — same
 * reasoning as `materialLineSchema.quantity`. `hoursSource` replaced the
 * old closed enum (`'inspector' | 'estimated' | 'fallback'`) with a free
 * text citation, because "estimated" used to mean an ungrounded LLM guess
 * (`pricing/agent.ts`'s `itemPricerAgent`, confirmed zero tools) — this
 * field must always name where the number actually came from (a stated
 * inspector hour count, a specific web-search result), not a vague label.
 */
export const laborLineSchema = z.object({
  ...itemIdentityFields,
  costType: z.literal('labor'),
  /** What the labor actually is, e.g. "siding/trim repair labor". */
  laborType: z.string().min(1),
  /** Hours, in quarter-hour increments — the v3 mock's 0.25 / 1.5 / 3.5 / 4.5. */
  quantity: z.number().multipleOf(0.25).min(0.25),
  unit: z.literal('hrs'),
  hoursSource: z.string().min(1),
  pricingBasis: z.enum(['labor-install-hourly', 'labor-all-in-hourly']),
});

export const billableLineSchema = z.discriminatedUnion('costType', [
  materialLineSchema,
  laborLineSchema,
]);

export type MaterialLine = z.infer<typeof materialLineSchema>;
export type LaborLine = z.infer<typeof laborLineSchema>;
export type BillableLine = z.infer<typeof billableLineSchema>;

/**
 * One finding's classification, as the agent returns it. `materials` is
 * an ARRAY, not a single nullable object — 0, 1, or many entries, each
 * with its own unit, because one finding can genuinely span multiple
 * differently-unit-typed materials (see agent.ts). Empty array is a
 * valid, honest "no material" state; there is no null anywhere in this
 * schema — every number the agent emits is a real, grounded value.
 */
export const lineClassificationSchema = z.object({
  findingId: z.string(),
  trade: z.enum(TRADE),
  materials: z.array(
    z.object({
      material: z.string().min(1),
      quantity: z.number().positive(),
      unit: z.enum(EXTENT_UNIT),
      amountSource: z.string().min(1),
    }),
  ),
  laborType: z.string().min(1),
  laborHours: z.number().positive(),
  laborHoursSource: z.string().min(1),
  reasoning: z.string().min(1),
});

export type LineClassification = z.infer<typeof lineClassificationSchema>;

export const classificationOutputSchema = z.object({
  lines: z.array(lineClassificationSchema),
});

export type ClassificationOutput = z.infer<typeof classificationOutputSchema>;
```

#### Reasoning
- `pendingLaborLineSchema`/`pendingLineSchema` are GONE entirely — there
  is no more "pending" state. The old design let a labor line leave
  classification with `quantity: null`, to be resolved later by
  `pricing/price-line.ts`'s own hour-estimation branch. That branch is
  confirmed ungrounded (`itemPricerAgent` has zero tools — ADR-equivalent
  finding this session). Classification now resolves hours itself, for
  real, before a line ever reaches pricing — so pricing never receives an
  unresolved line, and the two-stage pending/resolved split has no reason
  to exist anymore.
- `hoursSource`'s old closed enum (`'inspector' | 'estimated' | 'fallback'`)
  is replaced with a free-text grounding citation — the enum implied three
  equally-legitimate sourcing states, but `'estimated'` was never actually
  grounded (see above). The new field must always say where a number came
  from, not label it from a fixed vocabulary.

---

### `src/features/estimate-extraction-pipeline/classification/agent.ts`
**Action:** Create

```ts
import { Agent } from '@mastra/core/agent';
import { createTavilySearchTool } from '@mastra/tavily';
import { pioneerGateway } from '../shared/gateway';

/**
 * The agent has exactly one job: given a batch of already-grounded
 * findings, classify EACH ONE — trade, every material involved (name,
 * amount, unit), and the labor (type, hours) — from the finding's ACTUAL
 * CONTENT, grounded in real signal, NEVER a bare guess and NEVER null.
 *
 * Signal priority, in order:
 *   1. The finding's own sourceQuote.
 *   2. The rest of the source document (a nearby sentence may state a
 *      measurement the flagged sentence itself doesn't).
 *   3. A real web search — grounded in an actual market/industry
 *      reference (a typical job-scope convention, a sourced labor
 *      productivity rate) — used ONLY when steps 1-2 give nothing. This
 *      is a lookup against real external facts, not the model guessing
 *      from its own training data (that class of guess — see
 *      pricing/agent.ts's old itemPricerAgent, confirmed zero tools — is
 *      exactly what this replaces).
 *
 * Internal to the classification module — only classification/index.ts
 * calls `.generate()` on this.
 */
export const lineClassifierAgent = new Agent({
  id: 'line-classifier',
  name: 'Billable Line Classifier',
  instructions: `
You read a batch of already-grounded billable findings from a home
inspection report. For EACH finding, determine:
1. Which TRADE would actually do the work.
2. Every MATERIAL involved, by name, with a real quantity and unit.
3. The LABOR involved: what type, and how many hours.

NOTHING IS EVER NULL. Every material you list has a real quantity. Every
finding gets a real labor hour count. If the finding's own text and the
rest of the document give you no number, use your web search tool to
ground a real one — never leave a gap, and never fabricate a number with
no basis.

READ THE CONTENT, NOT JUST THE ACTION VERB. "repair" does not always mean
labor-only; "install"/"replace" does not always mean material-and-labor.
Read what is actually being worked on.
  action=repair, scope="damaged wood siding board" -> material present
    (the board), labor present (installing it)
  action=repair, scope="loose door hinge" -> no material, labor only
  action=evaluate, scope="heat exchanger leak test" -> no material, labor
    only (a specialist's time)

MULTIPLE MATERIALS. If a finding names components that are DIFFERENT
material types with DIFFERENT units (e.g. "trim or wood siding" — trim is
linear-foot, siding is square-foot), list them as SEPARATE entries in
"materials", each with its own name, quantity, and unit. Never collapse
two differently-unit-typed materials into one line by picking only one
unit and discarding the other.

MATERIAL IDENTITY AND UNIT
unit is the unit REAL CONTRACTORS use to quote that TYPE of material —
determine it from what the material actually is, not from a fixed
category table:
  - Area-installed materials (siding, drywall, roofing, flooring,
    sheathing, insulation, stucco, plaster) are quoted in "sf".
  - Length-installed materials (trim, fascia, soffit, gutter, downspout,
    fencing, railing, baseboard, casing, molding, flashing) are quoted in
    "lf".
  - Bulk volume (concrete, fill dirt) is quoted in "cy".
  - Discrete, individually-purchased items (a receptacle, a breaker, a
    valve, a damper door, a water heater, a single fixture) are quoted in
    "ea".

DETERMINING A REAL AMOUNT WHEN NONE IS STATED
1. Check the finding's own sourceQuote for a stated number.
2. Check the rest of the document you were given for a nearby stated
   measurement (a different sentence, elsewhere on the page or report,
   may state a dimension for the same area/component).
3. If neither gives you a number, use your web search tool. Ground the
   amount in a real, defensible convention for the SPECIFIC scope
   described — e.g. how contractors scope and price a single unmeasured
   spot repair of this material type (many trades price small, unmeasured
   repairs as a bounded minimum job, not an entire elevation/surface —
   use that real convention, not an arbitrary number). Cite what you
   found in "amountSource".
Never use "1" as a silent default. Every quantity must trace to something
real — a stated number, a document-wide reference, or a cited search
result.

DETERMINING REAL LABOR HOURS
1. If the finding's inspectorHours is present, use it.
2. Otherwise, use your web search tool to find a real labor-productivity
   rate for this type of work (hours per unit of the material involved,
   or a typical service-call duration for labor-only work). Apply that
   rate to the material amount you determined. Cite the search result in
   "laborHoursSource".
Never invent hours with no basis, and never leave hours unset.

TRADE
One of: electrical, plumbing, hvac, roofing, structural, carpentry,
masonry, appliance, exterior, interior, other. Pick the trade that would
actually do the work. Use "other" freely when the work is real but
doesn't fit cleanly into a single trade — never force a wrong fit.

OUTPUT FORMAT
Return JSON matching the provided structured-output schema exactly: a
single field "lines", one entry per finding you were given, each citing
its "findingId" exactly as given, with "materials" as an array (possibly
empty for labor-only work) and "laborType"/"laborHours"/"laborHoursSource"
always populated. Classify every finding you receive — do not omit any.

Do not include any commentary, explanation, preamble, or text outside the
JSON.
`,
  model: pioneerGateway('claude-fable-5'),
  tools: {
    webSearch: createTavilySearchTool({
      // Restricted to the reputable cost-estimating sources this session
      // already validated by hand (homeguide, homewyse, angi, fixr,
      // inchcalculator) — not an unrestricted open web search. Keeps
      // results consistent and traceable instead of whatever a bare
      // query happens to surface.
      // NOTE: confirm at implementation time whether createTavilySearchTool
      // accepts per-call domain defaults here vs. requiring includeDomains
      // to be passed at call time — check reference/tools/tavily via the
      // Mastra MCP before assuming this shape is correct.
    }),
  },
});
```

**Implementation note:** Uses `@mastra/tavily`'s `createTavilySearchTool()` — a
real Mastra tool package (confirmed via `mcp__mastra__mastraDocs`,
`reference/tools/tavily`), not a hand-rolled fetch-based tool. Chosen
over `pioneerGateway.tools.webSearch()` (OpenAI's native search, proxied
through whatever gateway `pioneerGateway` points at) because it doesn't
depend on an unverified third-party gateway correctly proxying a
provider-native feature — Tavily is a standard function-calling tool
that works the same regardless of what gateway sits in front of the
model. Requires
`TAVILY_API_KEY` (already added to `.env`, gitignored — not the
`.env.example` template) and `@mastra/tavily` in `package.json`.

---

### `src/features/estimate-extraction-pipeline/classification/rules.ts`
**Action:** Delete

---

### `src/features/estimate-extraction-pipeline/classification/index.ts`
**Action:** Modify

#### After
```ts
import type { ExtractedFinding } from '../extraction';
import {
  billableLineSchema,
  classificationOutputSchema,
  type BillableLine,
} from './schema';
import { lineClassifierAgent } from './agent';
import { pioneerGateway } from '../shared/gateway';

export type { BillableLine };
export { billableLineSchema, lineClassifierAgent };

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** A duplicate finding is the same quote cited for the same action — nothing more, nothing less. */
function dedupeKey(f: ExtractedFinding): string {
  return `${norm(f.sourceQuote)}|${f.action}`;
}

export interface ClassifyLinesOutput {
  lines: BillableLine[];
}

/**
 * THE CLASSIFICATION API. Given grounded findings, classifies each one
 * (trade, every material, labor) via one `lineClassifierAgent` call for
 * the whole batch, then builds the fully-resolved BillableLine(s) each
 * finding produces. Every line this returns is complete — no pending
 * state, no null quantity; pricing consumes these directly. ONE ATTEMPT
 * — throws on any failure, same failure model as extraction;
 * `pipeline.ts`'s `retries: 2` on `classifyStep` handles transient
 * failures.
 */
export async function classifyLines(
  findings: readonly ExtractedFinding[],
): Promise<ClassifyLinesOutput> {
  const seen = new Set<string>();
  const deduped: ExtractedFinding[] = [];
  for (const f of findings) {
    const key = dedupeKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }

  if (deduped.length === 0) {
    return { lines: [] };
  }

  const result = await lineClassifierAgent.generate(
    [
      {
        role: 'user',
        content:
          'Classify each finding below. Ground every material amount and ' +
          'labor hour count in the document or a web search — never null, ' +
          'never a bare guess. Return JSON matching the provided schema.\n\n' +
          deduped
            .map(
              (f) =>
                `[${f.id}] action=${f.action} scope="${f.scope}" ` +
                `location="${f.location}" statedQuantity=${f.statedQuantity ?? 'none'} ` +
                `inspectorHours=${f.inspectorHours ?? 'none'} quote="${f.sourceQuote}"`,
            )
            .join('\n'),
      },
    ],
    {
      // structuredOutput.model: the documented Mastra fix for "an agent
      // with both tools and structured output configured" — some models
      // don't support both in the same API call (confirmed via
      // mcp__mastra__mastraDocs, docs/agents/structured-output). Passing
      // a model here runs a SEPARATE internal structuring agent after
      // the main agent finishes its tool-calling turns, instead of
      // asking one call to do both at once. This is the same class of
      // failure already recorded in this project's history
      // ("tool-calling loop fighting Mastra's maxSteps default and the
      // tools+structuredOutput incompatibility") — fixed here properly
      // instead of repeating it.
      structuredOutput: {
        schema: classificationOutputSchema,
        model: pioneerGateway('claude-fable-5'),
      },
      // maxSteps defaults to 5. A batch with several ungrounded findings
      // can need one web search per unstated material amount AND one per
      // unstated labor-hour count — plausibly more than 5 tool calls in
      // one run. Set explicitly rather than silently hitting the default
      // and truncating mid-search (the other half of the same prior bug).
      maxSteps: 20,
    },
  );

  const classification = result.object;
  if (!classification) {
    throw new Error('Classification returned no structured object');
  }

  const byFindingId = new Map(classification.lines.map((l) => [l.findingId, l]));
  const lines: BillableLine[] = [];

  for (const f of deduped) {
    const cls = byFindingId.get(f.id);
    if (!cls) {
      // Unresolved — the agent didn't classify a finding it was given.
      // Throw rather than silently drop: an unclassified finding is a
      // real failure of this call, not a case to paper over with a
      // fabricated fallback line (that's exactly the slop being removed).
      throw new Error(`Classification did not return a line for finding ${f.id}`);
    }

    const common = {
      trade: cls.trade,
      action: f.action,
      scope: f.scope,
      location: f.location,
      sourceQuote: f.sourceQuote,
      pageHint: f.pageHint,
    };

    const hasMaterial = cls.materials.length > 0;
    cls.materials.forEach((m, i) => {
      lines.push({
        ...common,
        id: cls.materials.length > 1 ? `${f.id}-material-${i}` : `${f.id}-material`,
        costType: 'material',
        material: m.material,
        quantity: m.quantity,
        unit: m.unit,
        amountSource: m.amountSource,
        pricingBasis: 'material-part-only',
      });
    });

    lines.push({
      ...common,
      id: hasMaterial ? `${f.id}-labor` : f.id,
      costType: 'labor',
      laborType: cls.laborType,
      unit: 'hrs',
      quantity: cls.laborHours,
      hoursSource: cls.laborHoursSource,
      pricingBasis: hasMaterial ? 'labor-install-hourly' : 'labor-all-in-hourly',
    });
  }

  return { lines };
}
```

#### Reasoning
- `scopeIsRenderable` removed entirely — no replacement heuristic. Scope
  quality is extraction's prompt's job (already states the bare-category-
  word rule); classification doesn't second-guess it with a silent filter.
- `generateItemId`'s sha256 hash removed — lines reuse `f.id` (extraction's
  own stable per-run id) directly, suffixed `-material`/`-material-{i}`/
  `-labor` only as needed, instead of a freshly computed hash.
- Dedup collapsed to one strategy: normalized `sourceQuote` + `action`.
  The old structural key (`trade|action|scope|location`) is gone because
  `trade` no longer exists before classification runs.
- **Unresolved finding now THROWS, not a visible fallback line.** This
  supersedes an earlier draft of this plan that proposed a
  `trade: 'other'` fallback line — that was itself still a form of
  guessing (a fabricated trade/pricing-basis for a finding the agent
  never actually reasoned about). Per this session's "no null, no
  fabrication anywhere" rule, an unclassified finding is a real failure
  of the one `generate()` call, and the existing `retries: 2` on
  `classifyStep` is what handles it — consistent with extraction's own
  failure model (throw, let the step's retry re-run the whole call).
- Every material line now carries `material` (its name) and
  `amountSource` (its grounding); every labor line carries `laborType`
  and a real `hoursSource` citation — nothing defaults silently.
- **`structuredOutput.model` + explicit `maxSteps: 20` are load-bearing,
  not optional polish.** `lineClassifierAgent` is the first agent in this
  pipeline to combine `tools` with `structuredOutput` in the same call.
  Confirmed via Mastra's own docs (`docs/agents/structured-output`) that
  this combination is unreliable on some models unless one of three
  documented fixes is applied; this project's own history already hit
  the exact same failure mode once (`tools+structuredOutput`
  incompatibility fighting the `maxSteps` default) building the
  now-deleted embedding pipeline. Passing a `model` to `structuredOutput`
  runs a separate internal structuring agent after tool-calling finishes,
  instead of asking one call to do both — the documented fix, not a
  workaround invented here.

---

### `src/features/estimate-extraction-pipeline/pricing/schema.ts`
**Action:** Modify

#### Before
```ts
/** Response for a LABOR line: an HOURLY RATE plus the hours the job takes. */
export const laborPriceResponseSchema = z
  .object({
    hourlyRate: z.number().int().min(0).nullable(),
    estimatedHours: z.number().positive().max(160).nullable(),
    ...priceEvidenceFields,
  })
  .superRefine((r, ctx) => {
    xorUnavailable(r.hourlyRate, r.unavailableReason, ctx);
    if (r.hourlyRate !== null && r.estimatedHours === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['estimatedHours'],
        message: 'estimatedHours is required when hourlyRate is returned',
      });
    }
  });
```

#### After
```ts
/** Response for a LABOR line: an HOURLY RATE. Hours are classification's job now — every line pricing receives already has a real, resolved hour count. */
export const laborPriceResponseSchema = z
  .object({
    hourlyRate: z.number().int().min(0).nullable(),
    ...priceEvidenceFields,
  })
  .superRefine((r, ctx) => xorUnavailable(r.hourlyRate, r.unavailableReason, ctx));
```

#### Reasoning
`estimatedHours` was the exact ungrounded-guess mechanism confirmed this
session — `itemPricerAgent` has zero tools, so its "estimate" was pure
training-data recall with no verification. Classification's
`lineClassifierAgent` now determines hours BEFORE pricing ever runs, with
real web-search grounding. Keeping this field would mean two competing,
differently-grounded hour numbers existing at once for the same line — the
new one (real, cited) and the old one (never actually used downstream
anyway, since `pricedLineItemSchema` never included hours in the first
place). Removed, not relocated.

---

### `src/features/estimate-extraction-pipeline/pricing/agent.ts`
**Action:** Modify

#### Before
```ts
OUTPUT
MATERIAL lines: unitPrice (integer whole USD, or null), currency, confidence,
source, unavailableReason.
LABOR lines: hourlyRate (integer whole USD/hr, or null), estimatedHours
(number, required whenever hourlyRate is returned), currency, confidence,
source, unavailableReason.

HARD RULES
...
6. LABOR lines: hourlyRate is a whole-USD-per-hour rate for that trade in
   that zip code; estimatedHours is how many hours the described work takes
   for the stated extent. If inspector-stated hours were provided in the
   input, return your own estimate anyway — the caller decides which to use.
   - "labor-install-hourly": rate for installing the sibling material
     line's part. Include NO part cost.
   - "labor-all-in-hourly": no material sibling — the rate must be the
     all-in rate a contractor quotes: labor PLUS incidental materials PLUS
     haul-away/disposal where the action implies it.
```

#### After
```ts
OUTPUT
MATERIAL lines: unitPrice (integer whole USD, or null), currency, confidence,
source, unavailableReason.
LABOR lines: hourlyRate (integer whole USD/hr, or null), currency,
confidence, source, unavailableReason.

HARD RULES
...
6. LABOR lines: hourlyRate is a whole-USD-per-hour rate for that trade in
   that zip code. The hours the job takes are already resolved by the time
   you see this line (classification's job, not yours) — you price the
   RATE only.
   - "labor-install-hourly": rate for installing the sibling material
     line's part. Include NO part cost.
   - "labor-all-in-hourly": no material sibling — the rate must be the
     all-in rate a contractor quotes: labor PLUS incidental materials PLUS
     haul-away/disposal where the action implies it.
```
(Also update the file's own doc comment — "return a single defensible
price — a per-unit material price, or an hourly labor rate plus the hours
the job takes" — to drop "plus the hours the job takes"; the INPUT section
already says the line's `quantity` is supplied, not asked for.)

---

### `src/features/estimate-extraction-pipeline/pricing/price-line.ts`
**Action:** Modify

#### Before
```ts
import { roundToQuarter } from '../shared/quarter-hour';
import { pricingBasisFor } from '../classification';
import { createModuleLogger } from '../shared/logger';

...
  execute: async ({ inputData }) => {
    const { line, zipCode, estimateRequestId } = inputData;
    const basis = pricingBasisFor(line.action, line.costType);

    const userText = /* ... */;

    try {
      /* ... */
      const result = await itemPricerAgent.generate(
        [{ role: 'user', content: [{ type: 'text', text: userText }] }],
        { structuredOutput: { schema: laborPriceResponseSchema }, requestContext },
      );
      const l = result.object;
      if (!l) throw new Error('pricer returned no structured object');

      const resolved: BillableLine =
        line.quantity !== null
          ? { ...line, quantity: line.quantity, hoursSource: 'inspector' }
          : l.estimatedHours !== null
            ? { ...line, quantity: roundToQuarter(l.estimatedHours), hoursSource: 'estimated' }
            : { ...line, quantity: 1, hoursSource: 'fallback' };
      return {
        line: resolved,
        price: {
          itemId: line.id,
          unitPrice: l.hourlyRate,
          currency: l.currency,
          confidence: l.confidence,
          source: l.source,
          unavailableReason: l.unavailableReason,
        },
      };
    } catch (e) {
      /* ... */
      const fallbackLine: BillableLine =
        line.costType === 'labor'
          ? {
              ...line,
              quantity: line.quantity ?? 1,
              hoursSource: line.quantity !== null ? 'inspector' : 'fallback',
            }
          : line;
      return { line: fallbackLine, price: { /* lookup-failed */ } };
    }
  },
```

#### After
```ts
import { createModuleLogger } from '../shared/logger';

...
  execute: async ({ inputData }) => {
    const { line, zipCode, estimateRequestId } = inputData;

    const userText = /* pricingBasis: ${line.pricingBasis}, no change to the rest */;

    try {
      /* ... */
      const schema =
        line.costType === 'material' ? materialPriceResponseSchema : laborPriceResponseSchema;
      const result = await itemPricerAgent.generate(
        [{ role: 'user', content: [{ type: 'text', text: userText }] }],
        { structuredOutput: { schema }, requestContext },
      );
      const p = result.object;
      if (!p) throw new Error('pricer returned no structured object');

      return {
        line,
        price: {
          itemId: line.id,
          unitPrice: line.costType === 'material' ? p.unitPrice : p.hourlyRate,
          currency: p.currency,
          confidence: p.confidence,
          source: p.source,
          unavailableReason: p.unavailableReason,
        },
      };
    } catch (e) {
      /* ... */
      return {
        line,
        price: {
          itemId: line.id,
          unitPrice: null,
          currency: 'USD' as const,
          confidence: 'low' as const,
          source: 'lookup-failed',
          unavailableReason: 'Pricing lookup failed; needs contractor quote.',
        },
      };
    }
  },
```

#### Reasoning
`line` passes through completely unchanged in both the success and
failure paths — pricing never mutates `quantity`/`hoursSource` anymore
because there's nothing left to resolve; classification already gave it a
real number. This also removes `roundToQuarter`'s import here (still used
by `classifyLines`, not by pricing) and the `BillableLine` reconstruction
logic entirely — `priceLineStep` now purely enriches a line with a price,
never touches the line's own fields.

---

### `src/features/estimate-extraction-pipeline/shared/gateway.ts`
**Action:** Modify

#### Before
```ts
import { createOpenAI } from '@ai-sdk/openai';

/**
 * The single Kilo AI-gateway instance every agent and scorer routes
 * through. This is infrastructure (a transport client), not a pipeline
 * responsibility — it carries no business logic and holds no state a
 * module's output depends on. Model selection stays at each call site
 * (e.g. `kiloGateway('openai/gpt-5.4-mini')`); only transport config
 * (URL, auth) lives here.
 */
export const kiloGateway = createOpenAI({
  apiKey: process.env.KILO_API_KEY!,
  baseURL: 'https://api.kilo.ai/api/gateway',
});
```

#### After
```ts
import { createOpenAI } from '@ai-sdk/openai';

/**
 * The single Kilo AI-gateway instance. Kept, not removed — every agent
 * in this pipeline has switched to `pioneerGateway` below, but this stays
 * defined so reverting to it (if Pioneer proves unreliable) is a one-line
 * import change per file, not re-deriving this config from scratch.
 * Currently unused by any agent; not deleted on purpose.
 */
export const kiloGateway = createOpenAI({
  apiKey: process.env.KILO_API_KEY!,
  baseURL: 'https://api.kilo.ai/api/gateway',
});

/**
 * The single Pioneer AI (Fastino Labs) gateway instance every agent and
 * scorer now routes through. Confirmed via web search that Pioneer AI is
 * a real inference gateway offering an OpenAI-compatible chat completions
 * endpoint (not assumed). Model selection stays at each call site — every
 * call site in this pipeline now reads `pioneerGateway('claude-fable-5')`,
 * the exact model id given directly (not guessed from Pioneer's own
 * mixed-format catalog).
 */
export const pioneerGateway = createOpenAI({
  apiKey: process.env.PIONEER_API_KEY!,
  baseURL: process.env.PIONEER_API_URL ?? 'https://api.pioneer.ai/v1',
});
```

#### Reasoning
This is infrastructure — a transport client, not a pipeline
responsibility — so the change is contained to this one file. `kiloGateway`
is deliberately kept defined (per explicit instruction), not deleted —
this is an ADD, not a replace. Every other file that imports it
(`extraction/agent.ts`, `extraction/scorer.ts`, `classification/agent.ts`,
`pricing/agent.ts`) switches its import from `kiloGateway` to
`pioneerGateway` and its model string from `'openai/gpt-5.4-mini'` to
`'claude-fable-5'`; none of them change their own logic for this swap.
`baseURL` reads from `PIONEER_API_URL` with the literal URL as a
fallback, matching this repo's existing pattern of not hardcoding values
that could reasonably vary by environment (see `GATEWAY_API_URL` already
in `.env` for the unrelated Mastra Gateway). Because `kiloGateway` stays
exported and unused, the one-door boundary grep for `shared/` isn't
affected — nothing outside this file imports either export except through
`shared/gateway.ts` itself.

---

### `src/features/estimate-extraction-pipeline/extraction/scorer.ts`
**Action:** Modify

Only line 3's import changes:
```ts
import { kiloGateway } from '../shared/gateway';
```
becomes
```ts
import { pioneerGateway } from '../shared/gateway';
```
and its one usage (`model: kiloGateway('openai/gpt-5.4-mini')` on the
judge's `judge.model` field) becomes `pioneerGateway('claude-fable-5')`.
No other change — `extractionConsistencyScorer`'s logic, prompt, and
scoring are untouched.

---

### `src/features/estimate-extraction-pipeline/pipeline.ts`
**Action:** Modify

#### After
```ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractFindings, extractedFindingSchema, meaningfulSentenceSchema } from './extraction';
import { classifyLines, billableLineSchema } from './classification';
import { priceLines, pricedLineItemSchema } from './pricing';
import { parsePdfFromUrl, parsedDocumentSchema } from './document';

const parseDocumentStep = createStep({
  id: 'parse-document',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    parsedDocument: parsedDocumentSchema,
  }),
  retries: 2,
  execute: async ({ inputData }) => ({
    ...inputData,
    parsedDocument: await parsePdfFromUrl(inputData.fileUrl),
  }),
});

const extractStep = createStep({
  id: 'extract',
  inputSchema: parseDocumentStep.outputSchema,
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    findings: z.array(extractedFindingSchema),
    parsedDocument: parsedDocumentSchema,
    sentences: z.array(meaningfulSentenceSchema),
  }),
  retries: 2,
  execute: async ({ inputData }) => {
    const { findings, sentences } = await extractFindings({
      estimateRequestId: inputData.estimateRequestId,
      fileUrl: inputData.fileUrl,
      parsedDocument: inputData.parsedDocument,
    });
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      findings,
      parsedDocument: inputData.parsedDocument,
      sentences,
    };
  },
});

const classifyStep = createStep({
  id: 'classify',
  inputSchema: extractStep.outputSchema,
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    lines: z.array(billableLineSchema),
    parsedDocument: parsedDocumentSchema,
    sentences: z.array(meaningfulSentenceSchema),
  }),
  retries: 2,
  execute: async ({ inputData }) => {
    const { lines } = await classifyLines(inputData.findings);
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines,
      parsedDocument: inputData.parsedDocument,
      sentences: inputData.sentences,
    };
  },
});

const priceStep = createStep({
  id: 'price',
  inputSchema: classifyStep.outputSchema,
  outputSchema: z.object({
    lines: z.array(billableLineSchema),
    prices: z.array(pricedLineItemSchema),
    parsedDocument: parsedDocumentSchema,
    sentences: z.array(meaningfulSentenceSchema),
  }),
  execute: async ({ inputData }) => {
    const priced = await priceLines({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines: inputData.lines,
    });
    return { ...priced, parsedDocument: inputData.parsedDocument, sentences: inputData.sentences };
  },
});

export const summarizeEstimateWorkflow = createWorkflow({
  id: 'summarize-estimate',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  outputSchema: priceStep.outputSchema,
})
  .then(parseDocumentStep)
  .then(extractStep)
  .then(classifyStep)
  .then(priceStep)
  .commit();
```

---

### `src/features/estimate-extraction-pipeline/index.ts`
**Action:** Modify

#### After
```ts
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import {
  findingExtractorAgent,
  extractionConsistencyScorer,
} from './extraction';
import { lineClassifierAgent } from './classification';
import { itemPricerAgent } from './pricing';
import { summarizeEstimateWorkflow } from './pipeline';

export const mastra = new Mastra({
  agents: {
    'finding-extractor': findingExtractorAgent,
    'line-classifier': lineClassifierAgent,
    'item-pricer': itemPricerAgent,
  },
  scorers: { 'extraction-consistency': extractionConsistencyScorer },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
  logger: new PinoLogger({ name: 'estimate-extraction-pipeline' }),
});
```

---

### `src/features/estimate/lib/envelope.ts`
**Action:** Modify (same as previously scoped — `chunks` → `sentences`)

#### After (relevant excerpt)
```ts
import {
  parsedDocumentSchema,
  type ParsedDocument,
} from '@/features/estimate-extraction-pipeline/document';
import {
  meaningfulSentenceSchema,
  type MeaningfulSentence,
} from '@/features/estimate-extraction-pipeline/extraction';

...

export const summaryEnvelopeV3Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_3),
  lines: z.array(billableLineSchema),
  prices: z.array(pricedLineItemSchema),
  parsedDocument: parsedDocumentSchema.default({ pages: [] }),
  sentences: z.array(meaningfulSentenceSchema).default([]),
});

export type SummaryEnvelopeV3 = z.infer<typeof summaryEnvelopeV3Schema>;

...

export type ParsedEnvelope =
  | { kind: 'v1'; items: LegacyBillableItem[]; prices: [] }
  | { kind: 'v2'; items: LegacyBillableItem[]; prices: PricedLineItem[] }
  | {
      kind: 'v3';
      lines: BillableLine[];
      prices: PricedLineItem[];
      parsedDocument: ParsedDocument;
      sentences: MeaningfulSentence[];
    }
  | { kind: 'unparseable'; raw: string }
  | { kind: 'absent' };

export function parseSummaryEnvelope(summary: string | null): ParsedEnvelope {
  ...
  const v3 = summaryEnvelopeV3Schema.safeParse(json);
  if (v3.success) {
    return {
      kind: 'v3',
      lines: v3.data.lines,
      prices: v3.data.prices,
      parsedDocument: v3.data.parsedDocument,
      sentences: v3.data.sentences,
    };
  }
  ...
}
```

---

### `src/features/estimate/lib/workflow.ts`
**Action:** Modify

#### Before
```ts
        const envelope: SummaryEnvelopeV3 = {
          kind: SUMMARY_ENVELOPE_KIND,
          version: SUMMARY_ENVELOPE_VERSION_3,
          lines: result.result.lines,
          prices: result.result.prices,
          parsedDocument: result.result.parsedDocument,
          chunks: result.result.chunks,
        };
```

#### After
```ts
        const envelope: SummaryEnvelopeV3 = {
          kind: SUMMARY_ENVELOPE_KIND,
          version: SUMMARY_ENVELOPE_VERSION_3,
          lines: result.result.lines,
          prices: result.result.prices,
          parsedDocument: result.result.parsedDocument,
          sentences: result.result.sentences,
        };
```

---

### `src/features/estimate/components/items-section.tsx`
**Action:** Modify

Same shape of change as previously scoped: `chunks: DocumentChunkRecord[]`
prop → `sentences: MeaningfulSentence[]` (imported from the `extraction`
door, not `document`), debug panel label "Indexed Sentence Chunks" →
"Meaningful Sentences (Semantic Selection)".

---

### `src/features/estimate/components/estimate-report.tsx`
**Action:** Modify

```tsx
  const sentences = envelope.kind === 'v3' ? envelope.sentences : [];

  return (
    <ItemsSection
      items={items}
      prices={prices}
      parsedDocument={parsedDocument}
      sentences={sentences}
    />
  );
```

---

### `AGENTS.md`
**Action:** Modify

#### Before
```
    grep -rn "from '.*\/document\/\(schema\|parse\|vector-store\|embed\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/document/"
    grep -rn "from '.*\/classification\/\(schema\|rules\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/classification/"
```

#### After
```
    grep -rn "from '.*\/document\/\(schema\|parse\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/document/"
    grep -rn "from '.*\/classification\/\(schema\|agent\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/classification/"
```

---

### `package.json`
**Action:** Modify

Remove `@mastra/pg` and `@mastra/rag` from `dependencies`. Add
`@mastra/tavily` (and its peer, `@tavily/core`, per
`mcp__mastra__mastraDocs`'s install instructions). Run `pnpm install`
afterward to regenerate `pnpm-lock.yaml`.

---

### `.env`
**Action:** Modify

Add `TAVILY_API_KEY=<key>` under a new `# Tavily (web search tool for
classification/agent.ts)` comment, next to the existing `KILO_API_KEY`
line — already done this session (gitignored, not committed). Do NOT
add the real value to `.env.example` — that file stays a placeholder
template, matching every other real credential already in `.env`.

## Validation Plan

0. **Live-verify `pioneerGateway` itself, FIRST, before anything else in
   this list.** A single throwaway `agent.generate('say hi')` call
   through `pioneerGateway('claude-fable-5')` — confirm it returns a real
   response (auth works, `baseURL` is correct, `'claude-fable-5'` is
   accepted as given). Every agent in the pipeline depends on this one
   file; nothing else in this plan can be meaningfully tested until it's
   confirmed working end to end.
1. **Live-verify `createTavilySearchTool()` COMBINED WITH
   `structuredOutput.model`, together, FIRST** — before writing any other
   code. Not just "does search work," but "does the exact
   tools+structuredOutput.model+maxSteps combination `classification/index.ts`
   uses actually produce both real tool-call events AND a valid
   `result.object`." Run `lineClassifierAgent.generate()` with a query
   that has no answer in training data and confirm: (a) a real Tavily
   search tool call executes (check `result.toolCalls`, not just a
   plausible answer), (b) `result.object` still validates against the
   schema afterward. This project has already hit the tools+
   structuredOutput failure mode once; verify the specific fix
   (`structuredOutput.model`) actually resolves it for this model before
   trusting it.
2. `pnpm exec tsc --noEmit` — clean.
3. `pnpm exec eslint <all touched files>` — clean.
4. One-door boundary gate, all four grep patterns from the updated
   `AGENTS.md` — zero results.
5. `grep -rn "documentChunkRecordSchema\|DocumentChunkRecord\|indexDocument\|documentVectorStore\|sourceChunkId\|ExtractedWorkItem\|extractWorkItems\|ACTION_COST_PROFILE\|pricingBasisFor\|scopeIsRenderable\|generateItemId\|pendingLineSchema\|PendingLine\|estimatedHours\|hasMaterial\|hasLabor\|kiloGateway\|KILO_API_KEY" src/` —
   zero results anywhere, confirming complete removal (the last two
   confirm the gateway rename touched every consumer, not just some).
6. `pnpm build` — clean.
7. `pnpm install` after the `package.json` edit.
8. Live test against the REAL Sparrow House PDF (or any real report) via
   `pnpm dev`:
   - Confirm "Meaningful Sentences (Semantic Selection)" debug panel
     shows coherent, judged sentences (not mechanical fragments), and NO
     `impliesMaterial`/`impliesLabor` fields on them.
   - Confirm the real page-13 "Trim or wood siding" finding produces TWO
     material lines (different names, different units — `lf` for trim,
     `sf` for siding) under one finding, not one collapsed line and not
     two separately-invented "defects."
   - Confirm every material line and every labor line has a non-null
     `quantity`, and a real (not generic) `amountSource`/`hoursSource` —
     grep the persisted envelope's JSON for `"quantity":null` or
     `"hoursSource":"fallback"` and confirm zero matches.
   - Confirm at least one real material-repair finding produces BOTH a
     material line and a labor line — the exact case the old
     `ACTION_COST_PROFILE` got wrong.
   - Confirm a true labor-only finding (a loose hinge, a filter change)
     produces only a labor line, with `materials: []`.
   - Confirm no finding silently vanishes between extraction's count and
     the report's rendered line count beyond genuine dedup — and that a
     genuinely unclassifiable finding FAILS the run loudly (visible
     `status: 'failed'` on the estimate row) rather than rendering a
     fabricated fallback line.
   - Confirm no new `doc_<id>` Postgres table is created for the run.

## Risk Notes

- **Two new LLM tool calls per run that didn't exist before**: one
  `lineClassifierAgent.generate()` call (was already planned), now
  additionally making 1+ real web searches per un-stated
  amount/duration. This is real added cost and latency per estimate, not
  free — a deliberate tradeoff, since the alternative
  (`ACTION_COST_PROFILE` / `itemPricerAgent`'s ungrounded `estimatedHours`)
  was confirmed wrong, not just imperfect. If a single finding needs
  multiple ungrounded numbers (say, two materials with no stated amount),
  this could mean several search calls per finding, several findings per
  run — worth watching in the live test for actual latency, not assumed
  fine.
- **`createTavilySearchTool()` combined with `structuredOutput.model` is
  unverified for this specific agent/model** — flagged explicitly in the
  `classification/agent.ts` section above and validation step 1. Real
  quantity/hour grounding depends on it actually working. Lower risk than
  an equivalent `pioneerGateway.tools.webSearch()` approach would be
  (Tavily doesn't depend on the gateway correctly proxying an
  OpenAI-native feature), but the tools+structuredOutput combination
  itself still needs the live check regardless of which search tool is
  used.
- **The Pioneer gateway (+ model) swap is now the single highest-risk
  unknown in this whole plan** — it changes what every agent in the
  pipeline actually talks to, not just classification's. Specifically:
  - **`'claude-fable-5'` acceptance by Pioneer's endpoint is unverified**
    (see `shared/gateway.ts`'s own section and Validation Plan step 0) —
    the exact id was given directly, not guessed from Pioneer's own
    mixed-format catalog, but "given directly" still isn't "confirmed
    live." If it's rejected, every single agent call in the pipeline
    fails at once, not just one.
  - **Claude models + `tools`/`structuredOutput` together** haven't been
    exercised anywhere in this pipeline before (every prior agent used an
    OpenAI-family model). `classification/agent.ts` is both the first
    agent to combine `tools` with `structuredOutput` AND the first to run
    on a Claude model — validation step 1 (Tavily + structuredOutput)
    needs to be read as testing BOTH of those at once now, not just the
    tools+structuredOutput question in isolation.
  - **Pioneer AI / Fastino Labs is a newer product** (their own
    announcement is titled "Fastino Launches Pioneer") — no established
    track record in this codebase the way Kilo had. Rate limits, uptime,
    and latency characteristics are unknown until exercised in practice.
  - **`kiloGateway` is kept defined but unused**, per explicit
    instruction — not a loose end, a deliberate rollback path. If Pioneer
    proves unreliable, reverting any single agent is a one-line import
    change (`pioneerGateway` → `kiloGateway`, `'claude-fable-5'` →
    `'openai/gpt-5.4-mini'`), not a rebuild.
- **No guard on the WEB SEARCH RESULT's plausibility** — if the model
  misreads a search result (e.g. picks an outlier price/duration from a
  bad source), nothing catches that; the "grounded" number is only as
  good as the source cited. Consistent with this session's standing "no
  replacement quality-guard" decision (per
  [[feedback-research-before-hand-rolling]], the fix if this proves wrong
  in practice is a real check, not more prompt text) — noted as an
  informed tradeoff, not an oversight.
- **`@mastra/pg`/`@mastra/rag` removal** and **`0006_enable_pgvector.sql`
  disposition** are unchanged from the prior draft of this plan — deps
  removed (zero consumers), Postgres extension left enabled but unused
  (dropping it is a separate, riskier decision out of scope here).
- **Existing persisted v3 rows will fail to re-parse.** They have the old
  `chunks` key (ignored fine, `sentences` defaults to `[]`) but their
  `lines` are the OLD flat shape — no `material`/`amountSource` on
  material lines, no `laborType` on labor lines, `hoursSource` as a closed
  enum value instead of free text, no `pricingBasis` at all. None of
  these have defaults (no correct default exists for any of them). Old
  rows fall through to `'unparseable'` and show raw JSON instead of the
  normal report. Deliberate, not fixed silently — a migration script is
  out of scope unless asked for.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
