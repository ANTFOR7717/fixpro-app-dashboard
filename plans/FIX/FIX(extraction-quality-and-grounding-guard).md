# FIX(extraction-quality-and-grounding-guard)

## Request

Extraction currently enforces three separate correctness rules — unit
selection, compound-scope splitting, and scope noun-phrase shape — through
prompt prose alone, with zero deterministic verification. This is a known
regression: the prior architecture had a real Mastra `Processor`
(`ItemContractGuard`) that caught this class of error and forced the model to
retry with feedback; it was deleted and "compensated" for by lengthening the
prompt, which was the actual mistake (owned earlier this session).

On top of that, a second, previously undiscovered gap: extraction hands the
raw PDF straight to the LLM as a multimodal `file` part and simply *trusts*
that `sourceQuote` (the verbatim excerpt the model claims to have copied) and
`pageHint` (the page it claims the excerpt is on) are accurate. Nothing in
this codebase can check that, because nothing in this codebase has the
source document's actual text — the existing `extractionConsistencyScorer`
is explicitly PDF-blind by design (`extraction/scorer.ts:16-19`) and a prior
plan for closing this gap (`plans/FEATURE/FEATURE(docling-serve-integration).md`)
depends on a hosted, unimplemented Docling service. Mastra's own documented
template pattern for PDF text extraction (`pdf-parse`'s `PDFParse` class,
used in Mastra's `template-chat-with-pdf` / `template-flash-cards-from-pdf`
templates) makes this fixable with a plain npm dependency and no external
service — the pipeline can extract real, page-numbered text itself and use
it to deterministically verify `sourceQuote` was not fabricated.

**Non-negotiable constraints, stated directly by the user, still in force:**
- Zero hand-rolled mechanical code. No keyword-list `.includes()` heuristics
  in any form.
- Every design decision must be grounded in the Mastra MCP
  (`mcp__mastra__*`) or, where Mastra's own docs point outside the
  framework (as they do for PDF parsing), in the actual library docs — not
  guessed API shapes. Every claim below states where it was verified.
- No God functions, no duplication, no scope creep — classification's and
  pricing's already-correct discriminated union / one-door design are not
  touched.

This plan **supersedes and replaces**
`plans/FIX/FIX(extraction-unit-plausibility-guard).md` (deleted by this
plan), which only covered unit-plausibility and compound-scope, used a
two-file-per-rule abstraction that would not have scaled to a third rule,
and did not know about the grounding gap. This plan consolidates all four
checks (grounding, unit-plausibility, compound-scope, scope-shape) into
**one** guard.

**Unit-plausibility stays LLM-judged, not a hardcoded material→unit
lookup table.** A closed enum of material categories was considered and
rejected mid-design: home inspection reports surface an open-ended,
long-tail set of materials (copper vs. PEX pipe, a chimney cap, a cabinet
delamination, an egress window well — far more than any fixed list would
anticipate), so a hardcoded category enum would systematically
misclassify or dump anything unanticipated into an "other" bucket,
quietly reintroducing the same accuracy problem one level down. Two
independent LLM judgments (the extractor's own semantic read, checked by
the judge agent's independent semantic read) generalize to that open
domain; a fixed lookup table doesn't.

**Retry-exhaustion gets an explicit signal, not a silent pass-through.**
If the guard's retry budget (`EXTRACTION_QUALITY_GUARD_MAX_RETRIES`, see
`extraction/quality-guard.ts` below) is exhausted and violations remain,
the guard does not abort the whole run (that would drop otherwise-good
items) and does not silently ship the unverified item as if it were
clean. It flags exactly the still-violating items `needsReview: true`,
which flows through classification (both halves of a material/labor
split) to the report, where it renders as a visible badge. This is a
signal, not a correction — no guessing at the "right" answer, just an
honest flag that a human should check this one line before it's quoted
to a client.

## Research this plan is grounded on (verified this session)

1. **`Processor.processOutputStep` is the correct hook for a retry-capable
   guardrail**, confirmed by re-fetching `reference/processors/processor-interface.md`
   directly (not recalled from a prior session): "This is the ideal method
   for implementing guardrails that can trigger retries." Its args include
   `text` (the step's generated text), `abort(reason, { retry, metadata })`
   (throws a `TripWire`, and when `retry: true` re-runs the step with
   `reason` fed back as feedback, capped by `maxProcessorRetries`),
   `retryCount`, and — load-bearing for this plan — **`requestContext`**,
   documented as "Request-scoped context with execution metadata," passed
   into every processor method.
2. **Mastra's own built-in guardrails (`docs/agents/guardrails.md`,
   re-fetched this session) all follow "LLM classifies, then `abort()`
   based on a strategy"** (`ModerationProcessor`, `PIIDetector`,
   `PromptInjectionDetector`) — confirming an LLM-judged semantic check
   inside a `Processor` is Mastra's own idiomatic pattern, not a
   workaround, for judgment-call checks (unit-plausibility, compound-scope,
   scope-shape). The same doc's "Speed up guardrails" section explicitly
   endorses **mixing a deterministic check with an LLM-judged one** inside
   one guardrail pipeline and recommends a small/fast model for the judge
   (`GUARDRAIL_MODEL = 'openai/gpt-5-nano'` in their example) — this plan
   keeps the model unchanged (see Existing Pattern Audit) but the pattern
   itself (deterministic + judged checks coexisting) is exactly what this
   plan's single guard does.
3. **`RequestContext` accepts arbitrary keyed values**, confirmed against
   the installed type declaration
   (`node_modules/@mastra/core/dist/request-context/index.d.ts`, read as a
   secondary cross-check per standing instruction) as a documented
   secondary source: `constructor(iterable?: Iterable<readonly [string,
   unknown]>)`, `.set<K>(key, value)`, `.get<K,R>(key): R`. This is the
   same primitive `extraction/index.ts` and `pricing/price-line.ts` already
   construct (`new RequestContext([['estimateRequestId', ...]])`) — this
   plan is the first place in this codebase that also *reads* a
   caller-supplied value back out of it (inside the guard), which is a
   documented, intended use of the class, not a new mechanism.
4. **Mastra has no built-in PDF-to-text primitive.** `MDocument` (`@mastra/rag`,
   `reference/rag/document.md`, `docs/rag/chunking-and-embedding.md`,
   fetched this session) only constructs from `.fromText()` / `.fromHTML()`
   / `.fromMarkdown()` / `.fromJSON()` — there is no `.fromPDF()`. Mastra's
   own documented answer for "process and extract a PDF" (surfaced via
   Mastra's docs assistant, citing `template-chat-with-pdf`'s
   `index-pdf.ts` and `template-flash-cards-from-pdf`'s
   `extract-pdf-text.ts`) is the third-party `pdf-parse` package's
   `PDFParse` class for page-by-page text extraction, with `MDocument` only
   entering *after* that, for RAG chunking/embedding — which this pipeline
   does not do (no vector search here), so `@mastra/rag`/`MDocument` is
   **not** added by this plan; only `pdf-parse` is needed. The exact API
   (`new PDFParse({ data })`, `getInfo()` → `{ total, ... }`,
   `getText({ partial: [n] })` → `{ text }`, `destroy()`) was independently
   cross-checked against the package's own GitHub README (`mehmet-kozan/pdf-parse`)
   via `WebFetch` this session — latest version `2.4.5`, confirmed via
   `WebSearch` this session, not guessed.
5. **The existing pipeline's failure model is "steps throw"** (`pipeline.ts`,
   `AGENTS.md`: "steps THROW (per-step `retries` re-run them); the caller
   inspects `run.start().status`. Do NOT reintroduce in-workflow
   persistence or `.branch()` failure routing"). This directly contradicts
   the *parked* `FEATURE(docling-serve-integration).md` plan's non-throwing
   `parseFailed`/`errorMessage` step pattern — that pattern was designed
   for a different, no-longer-current workflow style
   (`mark-processing`/`.branch()`) that this codebase's own refactor
   (`adeab90`, `7b4d555`) retired. The new `parse-document` step in *this*
   plan follows the **current** pipeline's convention (throw, let
   `retries` handle it) instead, and does not reuse anything from the
   Docling plan beyond the general idea "parse the document before
   extraction."

## Directory Map

```text
falcon-bighorn/
├── plans/FIX/
│   ├── FIX(extraction-unit-plausibility-guard).md        [DELETE] superseded by this plan
│   └── FIX(extraction-quality-and-grounding-guard).md     [CREATE] this plan
├── AGENTS.md                                               [MODIFY] 3→4 one-door modules, new boundary grep line
├── package.json                                            [MODIFY] add `pdf-parse` dependency
└── src/features/estimate-extraction-pipeline/
    ├── document/                                           [CREATE dir] new one-door module
    │   ├── schema.ts                                        [CREATE] ParsedDocument/DocumentPage Zod contracts
    │   ├── parse.ts                                         [CREATE] parsePdfFromUrl() via pdf-parse
    │   └── index.ts                                         [CREATE] the door
    ├── extraction/
    │   ├── schema.ts                                        [MODIFY] add needsReview field, guard-set only
    │   ├── quality-guard-agent.ts                           [CREATE] one judge agent — unit-plausibility, compound-scope, scope-shape
    │   ├── quality-guard.ts                                 [CREATE] one Processor — grounding check + judge call + retry-exhaustion needsReview flag
    │   ├── agent.ts                                         [MODIFY] attach the guard via outputProcessors + maxProcessorRetries
    │   └── index.ts                                         [MODIFY] extractWorkItems() takes parsedDocument; door re-exports judge agent
    ├── classification/
    │   ├── schema.ts                                        [MODIFY] pass needsReview through the shared identity fields
    │   └── index.ts                                         [MODIFY] propagate needsReview onto both split-pair halves
    ├── pipeline.ts                                          [MODIFY] new parseDocumentStep before extractStep
    └── index.ts                                             [MODIFY] register the judge agent on the Mastra instance
src/features/estimate/components/
└── items-section.tsx                                        [MODIFY] "Needs Review" badge on flagged lines
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `document/schema.ts` | Create | Zod contract for a parsed PDF: `{ pages: { pageNumber, content }[] }`. Single source of truth other modules import from the door. |
| `document/parse.ts` | Create | `parsePdfFromUrl()` — fetches the PDF bytes and runs `pdf-parse`'s documented page-by-page extraction (Research #4). |
| `document/index.ts` | Create | The door — only file outside `document/` allowed to import from it, per the existing one-door convention. |
| `extraction/schema.ts` | Modify | Add `needsReview: z.boolean().default(false)` to `extractedWorkItemSchema` — a field the model never sets (defaults away), only ever flipped `true` by the guard on retry-exhaustion. |
| `extraction/quality-guard-agent.ts` | Create | One judge agent covering the three checks that are genuinely LLM judgment calls (unit-plausibility, compound-scope, scope-shape) — consolidated from the two separate rules the superseded plan would have produced two near-identical Processor/agent pairs for. |
| `extraction/quality-guard.ts` | Create | One `Processor`. Deterministically checks `sourceQuote` is actually present in the parsed document text (no LLM call needed — a substring check), then calls the judge agent once for the semantic checks. Below the retry budget, `abort(reason, {retry:true})`s on any violation; once the budget is exhausted, patches the still-violating items `needsReview: true` and lets the run complete instead of dropping or silently shipping them. |
| `extraction/agent.ts` | Modify | `outputProcessors: [new ExtractionQualityGuard()]`, `maxProcessorRetries: EXTRACTION_QUALITY_GUARD_MAX_RETRIES`. |
| `extraction/index.ts` | Modify | `extractWorkItems()` accepts `parsedDocument` and threads it into `RequestContext` so the guard can read it back; re-exports `extractionQualityJudgeAgent` for registration. |
| `classification/schema.ts` | Modify | Add `needsReview: z.boolean().default(false)` to the shared `itemIdentityFields`, so it flows into `materialLineSchema`/`laborLineSchema`/`pendingLaborLineSchema` automatically. `.default(false)` is required, not optional polish: `envelope.ts`'s `summaryEnvelopeV3Schema` re-parses persisted rows through this exact schema, and every v3 estimate already in the database was written before this field existed — a non-default required field would make every existing row fail to parse the moment this ships (see Existing Pattern Audit). |
| `classification/index.ts` | Modify | `classifyLines()`'s `common` object (spread onto both halves of a material/labor split) carries `needsReview` through from the source work item. |
| `pipeline.ts` | Modify | New `parseDocumentStep` runs `document`'s door function and passes `parsedDocument` through to `extractStep`. |
| `estimate-extraction-pipeline/index.ts` | Modify | Register `extractionQualityJudgeAgent` so it's visible in Studio like every other agent in this pipeline. |
| `src/features/estimate/components/items-section.tsx` | Modify | Render a `destructive`-variant "Needs Review" badge on any line with `needsReview: true`, always visible (not gated behind the existing evidence toggle — this is a correctness flag, not supplementary detail). |
| `package.json` | Modify | Add `pdf-parse` (`^2.4.5`) — the only new runtime dependency this plan introduces. |
| `AGENTS.md` | Modify | The pipeline is now four one-door modules, not three; add the `document/` boundary grep line to the mechanically-checked rule. |

## Existing Pattern Audit

- **What stays exactly as-is.** The extraction agent still reads the raw
  PDF multimodally (`extraction/index.ts`'s existing `file` content part,
  `type: 'application/pdf'`, unchanged) — this plan does **not** switch
  extraction to text-only input. Reasoning: `pdf-parse` gives clean text
  but loses whatever visual/layout signal the model's native PDF reading
  currently uses (tables, embedded photos, handwriting) with no way to
  compare extraction quality without a live A/B test, which is out of
  scope for a guard fix. The parsed text's *only* job in this plan is to
  be a ground truth the guard checks `sourceQuote` against — a strictly
  additive change with no risk to today's extraction quality.
- **Why one guard, not one Processor per rule.** The user directly
  flagged the superseded plan's two-file-per-rule shape as bad design.
  Every one of the four checks here (grounding, unit-plausibility,
  compound-scope, scope-shape) needs the same JSON-parse +
  schema-validate + `abort`-formatting scaffolding; splitting them into
  separate `Processor` classes would duplicate that scaffolding for no
  benefit, since Mastra's own "Speed up guardrails" pattern shows
  deterministic and judged checks composing inside a *single* guardrail
  step already (Research #2). One `Processor`, one judge agent, one
  batched judge call per extraction attempt.
- **Grounding is deterministic, not judged, and that split is
  deliberate.** Whether a string is a literal substring of the source
  text is a fact, not a judgment call — running it through an LLM would
  add cost/latency/false-negative risk for zero benefit over a plain
  substring check. Unit-plausibility/compound-scope/scope-shape genuinely
  require judgment (there's no substring check for "is `sf` the right
  unit for `drywall`"), so those stay judge-based. This mirrors the
  general shape Mastra's own guardrails doc uses when it mixes a `redact`
  (algorithmic) branch with a `block` (LLM-judged) branch in one pipeline.
- **`needsReview` on retry-exhaustion is a message-mutation, not a second
  abort.** Calling `abort()` without `retry: true` (or after retries are
  exhausted) throws a `TripWire` that stops the whole generation — the
  entire run would fail and every item in it would be lost, not just the
  violating ones. That's worse than shipping an unverified item with a
  visible flag. Instead, `processOutputStep` returns a **modified messages
  array** — an explicitly documented alternative to `abort()`
  (`reference/processors/processor-interface.md`, re-fetched this
  session): "editing a message's content.parts in place is visible to
  downstream processors and to persistence," and returning a
  `MastraDBMessage[]` is one of `ProcessorMessageResult`'s three valid
  return shapes. The guard rewrites only the flagged items' JSON (adding
  `needsReview: true`) inside the assistant message's text part and
  returns the mutated `messages` array — no abort, the run completes
  normally, `result.object` reflects the patched JSON.
- **`pageHint` cross-checking is explicitly OUT of scope for this pass.**
  The guard checks that `sourceQuote` exists in the parsed text (high
  confidence: either the string is there or it isn't). It does **not**
  additionally verify that `pageHint` matches the page the quote was
  found on. Page-break attribution between what the model perceives as a
  "page" (from PDF headers it reads visually) and `pdf-parse`'s physical
  page index can legitimately drift (cover pages, unnumbered pages), and
  turning that into a hard retry-triggering violation risks false-positive
  retries on correct extractions. Deferred, not forgotten — worth
  revisiting once there's live data on how often it would actually fire.
- **No custom error class for `parse.ts`, unlike the parked Docling
  plan's `DoclingServeError`.** That class existed to classify HTTP status
  codes from a *remote* service (401 vs 429 vs 5xx). `pdf-parse` is a
  local library call with no HTTP status codes to classify — a custom
  error class would add a layer with nothing to distinguish, so
  `parse.ts` throws plain `Error`, matching `extraction/index.ts`'s own
  existing style (`throw new Error('Extraction returned no structured
  object')`).
- **`document/` as a fourth one-door module, not folded into `shared/`.**
  `shared/` currently holds only stateless utilities with no Zod contract
  of their own (`gateway.ts`, `logger.ts`, `quarter-hour.ts`). A PDF
  parser producing a real data shape other modules consume deserves its
  own door, the same reasoning the parked Docling plan used for its own
  `services/docling/` directory — this plan doesn't adopt that plan's
  file layout (different location, no HTTP client, no async task
  polling), just the "give a distinct capability its own module" instinct
  behind it.
- **Registration-export convention followed exactly**, unchanged from
  every other agent in this pipeline: `extraction/index.ts` re-exports
  `extractionQualityJudgeAgent` "for Mastra-instance registration ONLY,"
  same label already on `billableItemExtractorAgent` and
  `extractionConsistencyScorer`.
- **Model choice unchanged, not asserted cheaper.** Mastra's guardrails
  doc recommends a fast/cheap model for judges, but no cheaper
  Kilo-gateway-routed model string has been verified this session
  (repeating that unverified-model mistake was explicitly ruled out by a
  prior plan in this repo). `quality-guard-agent.ts` uses the same
  verified `openai/gpt-5.4-mini` string every other agent in this
  pipeline uses. A cheaper model is a one-line future change, not decided
  here.
- **Considered and rejected:**
  - *Keyword-list heuristics for grounding* (e.g. fuzzy word-overlap
    scoring) — rejected; a plain normalized substring check is not a
    "heuristic" in the banned sense (it's not guessing at domain
    semantics from a curated word list), it's a factual verbatim-text
    check, which is exactly the kind of check that should be
    deterministic rather than LLM-judged.
  - *Switching extraction to text-only input* — rejected for this pass;
    see "What stays exactly as-is" above.
  - *`@mastra/rag`/`MDocument` for chunking* — rejected; nothing in this
    pipeline does vector search or needs chunk-level granularity, only
    whole-page text for a substring check. Adding it would be an unused
    dependency.
  - *Reusing the parked Docling plan's non-throwing step pattern* —
    rejected; contradicts this pipeline's current, live "steps throw"
    convention (Research #5).
  - *One Processor per rule* — rejected; see "Why one guard" above.

## Execution Plan

Ordered so every file's dependencies (schema fields it reads) already
exist by the time it's written.

1. `package.json` — add `pdf-parse`, run `pnpm install`.
2. `document/schema.ts`, `document/parse.ts`, `document/index.ts` — the new
   module, no dependents yet.
3. `extraction/schema.ts` — add `needsReview` (must exist before
   `quality-guard.ts` references it).
4. `extraction/quality-guard-agent.ts` — the judge agent.
5. `extraction/quality-guard.ts` — the Processor (depends on `document`'s
   door, the judge agent, and `extraction/schema.ts`'s new field).
6. `extraction/agent.ts` — attach the guard.
7. `extraction/index.ts` — thread `parsedDocument` through, re-export the
   judge agent.
8. `classification/schema.ts` — add `needsReview` (must exist before
   `classification/index.ts` references it).
9. `classification/index.ts` — propagate `needsReview` onto both
   split-pair halves.
10. `pipeline.ts` — new `parseDocumentStep`, wire into the chain.
11. `estimate-extraction-pipeline/index.ts` — register the judge agent.
12. `src/features/estimate/components/items-section.tsx` — the "Needs
    Review" badge.
13. `AGENTS.md` — update module count and boundary grep.
14. Validation gates (below), then stop for review.

## File-by-File Changes

### `src/features/estimate-extraction-pipeline/document/schema.ts`

**Action:** Create

#### After (new file, complete)

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

#### Reasoning

- Deliberately minimal — only `pageNumber` and `content`. No metadata, no
  markdown, no tables-as-structure; the only consumer (the grounding
  check in `quality-guard.ts`) needs plain text to substring-match against.

---

### `src/features/estimate-extraction-pipeline/document/parse.ts`

**Action:** Create

#### After (new file, complete)

```ts
import { PDFParse } from 'pdf-parse';
import type { ParsedDocument } from './schema';

/** Budget for fetching the source PDF from blob storage. */
const FETCH_TIMEOUT_MS = 60_000;

/**
 * Fetch a PDF from its URL and extract plain text page by page.
 *
 * Uses `pdf-parse`'s `PDFParse` class — Mastra's own documented pattern
 * for PDF text extraction (there is no PDF primitive in `@mastra/core` or
 * `@mastra/rag` itself; see this plan's Research section). This is the
 * ONLY place in the pipeline that reads PDF bytes directly — extraction's
 * own agent call still hands the model the PDF natively and is unaffected
 * by this function's output quality.
 *
 * Throws on any failure (fetch, parse). Per this pipeline's established
 * failure model (`AGENTS.md`: "steps THROW; retries re-run them"), the
 * calling step's `retries` handles transient failures — this function does
 * not catch-and-wrap into a non-throwing result.
 */
export async function parsePdfFromUrl(fileUrl: string): Promise<ParsedDocument> {
  const response = await fetch(fileUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(
      `Could not fetch source PDF (${response.status} ${response.statusText}): ${fileUrl}`,
    );
  }
  const data = new Uint8Array(await response.arrayBuffer());

  const parser = new PDFParse({ data });
  try {
    const info = await parser.getInfo();
    const pages: ParsedDocument['pages'] = [];
    for (let pageNumber = 1; pageNumber <= info.total; pageNumber++) {
      const result = await parser.getText({ partial: [pageNumber] });
      if (result.text.trim().length > 0) {
        pages.push({ pageNumber, content: result.text });
      }
    }
    return { pages };
  } finally {
    await parser.destroy();
  }
}
```

#### Reasoning

- API shape (`new PDFParse({ data })`, `getInfo().total`,
  `getText({ partial: [n] })`, `destroy()`) verified against the package's
  own GitHub README this session, not guessed — see Research #4.
- Blank pages are skipped (`result.text.trim().length > 0`) since they
  contribute nothing to the grounding check; unlike the parked Docling
  plan's page-break splitting, there's no positional-index invariant to
  preserve here — each page carries its own explicit `pageNumber`.
- `finally { await parser.destroy() }` — always releases the parser,
  matching the README's stated requirement ("Always call to free memory").

---

### `src/features/estimate-extraction-pipeline/document/index.ts`

**Action:** Create

#### After (new file, complete)

```ts
/**
 * THE DOOR — document's complete public contract. Only this file may be
 * imported from outside `document/`, per the one-door convention already
 * established for extraction/classification/pricing (see AGENTS.md).
 */
export { parsedDocumentSchema, type ParsedDocument, type DocumentPage } from './schema';
export { parsePdfFromUrl } from './parse';
```

---

### `src/features/estimate-extraction-pipeline/extraction/schema.ts`

**Action:** Modify (add one field)

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
});
```

#### After

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
```

#### Reasoning

- `.default(false)` means the model's own JSON never needs to mention this
  field — it's guard-only, and every item that never trips the guard's
  exhausted-retry path round-trips exactly as before.

---

### `src/features/estimate-extraction-pipeline/extraction/quality-guard-agent.ts`

**Action:** Create

#### After (new file, complete)

```ts
import { Agent } from '@mastra/core/agent';
import { kiloGateway } from '../shared/gateway';

/**
 * Judge agent for `quality-guard.ts`'s `ExtractionQualityGuard`. Covers the
 * THREE checks that are genuine LLM judgment calls — a Zod schema can
 * guarantee `extent.unit` is a VALID enum value, never that it's the
 * CORRECT one for the material named in `scope`, and there's no
 * deterministic test for "is this scope a real noun phrase" or "does this
 * scope name two components." Grounding (is sourceQuote real?) is NOT
 * judged here — `quality-guard.ts` checks that deterministically against
 * the parsed source document, no LLM call needed for a plain substring
 * fact.
 *
 * Sees ONLY the batch of items one extraction attempt just produced —
 * never the source document, never pricing/classification data. Never
 * called directly by application code — only `quality-guard.ts` calls
 * `.generate()` on this. Re-exported from `extraction/index.ts` for
 * Mastra-instance registration only.
 */
export const extractionQualityJudgeAgent = new Agent({
  id: 'extraction-quality-judge',
  name: 'Extraction Quality Judge',
  instructions: `
You judge a batch of EXTRACTED WORK ITEMS from a home inspection report for
three specific, narrow defects. You do NOT see the source document — only
the items themselves (trade, action, scope, extent). You do not judge
grounding (a separate deterministic check already covers whether
sourceQuote is real), pricing, or anything else.

For EACH item, check:

1. UNIT PLAUSIBILITY. extent.unit must match the unit REAL CONTRACTORS use
   to quote the material named in scope:
   - AREA-measured materials (siding, drywall, roofing/shingles, flooring,
     subfloor, sheathing, insulation, stucco, plaster) must use "sf" —
     never "ea".
   - LENGTH-measured materials (trim, fascia, soffit, gutter, downspout,
     fencing, railing, baseboard, casing, molding, flashing) must use "lf"
     — never "ea".
   - Bulk material volume (concrete, fill dirt) should use "cy" when the
     scope describes a volume.
   - "ea" is correct ONLY for a genuinely discrete, individually-purchased
     item (a receptacle, a breaker, a valve, a damper door, a water
     heater, a single fixture, a whole-structure repair like "leaning
     chimney structure") — never for a material sold by the square or
     linear foot.

2. COMPOUND SCOPE. scope must name exactly ONE physical component. Flag it
   if it names two distinct physical components joined by "or"/"and" (e.g.
   "trim or wood siding" — trim is length-measured, siding is
   area-measured, they can never share one correct unit). Do NOT flag one
   component with two symptoms ("peeling and chipping exterior paint" —
   one material, two symptoms, not two components).

3. SCOPE SHAPE. scope must be a specific noun phrase naming the defective
   thing, not a bare trade-category word ("siding", "foundation",
   "chimney", "receptacles", "plumbing", "roof" alone) and not a sentence
   fragment led by an action verb ("replace the damaged trim", "repair
   loose receptacle" — the verb belongs in the action field, not scope).
   Flag an item whose scope is just a category word or an imperative
   fragment instead of a clean noun phrase like "damaged siding board" or
   "loose wall receptacle".

Return JSON: { "violations": [{ "itemId": string, "kind":
"unit-implausible" | "compound-scope" | "scope-shape", "reason": string }]
}. Only include items that actually violate one of these three rules —
most items should not appear. If every item is fine, return { "violations":
[] }. "reason" must be a one-sentence, specific explanation.

Do not include any commentary, explanation, preamble, or text outside the
JSON.
`,
  model: kiloGateway('openai/gpt-5.4-mini'),
});
```

#### Reasoning

- Same three-rule domain content the extraction prompt already carries
  in prose (unit mapping, compound-scope, scope-shape BAD→GOOD list) —
  here it's a JUDGE's instructions with retry-backed enforcement, not
  prose the model can silently ignore.

---

### `src/features/estimate-extraction-pipeline/extraction/quality-guard.ts`

**Action:** Create

#### After (new file, complete)

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

const judgeViolationSchema = z.object({
  itemId: z.string(),
  kind: z.enum(['unit-implausible', 'compound-scope', 'scope-shape']),
  reason: z.string(),
});
const judgeOutputSchema = z.object({ violations: z.array(judgeViolationSchema) });
type JudgeViolation = z.infer<typeof judgeViolationSchema>;

interface GroundingViolation {
  itemId: string;
  kind: 'ungrounded-quote';
  reason: string;
}

type Violation = JudgeViolation | GroundingViolation;

/**
 * Retry ceiling for this guard. Shared with `agent.ts`'s
 * `maxProcessorRetries` so the two can never drift out of sync — the
 * guard needs to know exactly when it's on the LAST allowed attempt so it
 * can switch from "abort and retry" to "flag and let through" at the
 * right moment.
 */
export const EXTRACTION_QUALITY_GUARD_MAX_RETRIES = 3;

/**
 * Mastra output processor for the `billable-item-extractor` agent. Runs
 * `processOutputStep` — after each extraction attempt, before the result
 * is accepted — exactly where the deleted `ItemContractGuard` ran.
 *
 * Combines TWO kinds of check in one guard (the pattern Mastra's own
 * guardrails doc uses when mixing deterministic and LLM-judged checks —
 * see this plan's Research #2):
 *   1. GROUNDING — deterministic. Is each item's sourceQuote actually
 *      present in the parsed source document text? No LLM call.
 *   2. QUALITY — LLM-judged, via `extractionQualityJudgeAgent`, batched
 *      once per extraction attempt (not per item). Deliberately NOT a
 *      hardcoded material→unit lookup table — see this plan's Request
 *      section for why a closed enum was rejected.
 *
 * While retries remain, `abort(reason, { retry: true })`s on any
 * violation, feeding the specific violations back so the model's next
 * attempt can fix them. Once `EXTRACTION_QUALITY_GUARD_MAX_RETRIES` is
 * exhausted and violations still remain, does NOT abort again (that would
 * fail the whole run and lose every item, not just the bad ones) —
 * instead patches the still-violating items `needsReview: true` and lets
 * the run complete, so a human sees an explicit "unverified" signal
 * instead of either a silently-wrong line or a dropped run.
 */
export class ExtractionQualityGuard implements Processor {
  readonly id = 'extraction-quality-guard';
  readonly name = 'Extraction Quality Guard';
  readonly description =
    "Verifies each extracted item's sourceQuote is grounded in the source " +
    'document, its extent.unit is plausible for its material, its scope ' +
    'names exactly one physical component, and its scope is a real noun ' +
    'phrase; re-prompts the extractor with feedback on any violation, or ' +
    'flags the item needsReview once retries are exhausted.';

  onViolation = (violation: ProcessorViolation): void => {
    console.warn(`[${violation.processorId}] ${violation.message}`);
  };

  async processOutputStep({
    text,
    abort,
    retryCount,
    requestContext,
    messages,
  }: ProcessOutputStepArgs): Promise<ProcessorMessageResult> {
    if (typeof text !== 'string' || text.length === 0) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Provider-enforced response_format makes malformed JSON rare; if it
      // happens anyway, treat it like any other violation — abort and
      // retry, rather than reintroducing a bespoke JSON-repair utility.
      // Gated on the SAME retry ceiling as the violations path below: a
      // completely unparseable response has no items to patch a
      // needsReview flag onto (unlike semantic violations, where the good
      // items alongside a bad one are still usable), so once the budget
      // is exhausted this is a genuine hard stop, not a retry request —
      // matching the Processor interface docs' own worked example
      // (`QualityGuardrail`), which hard-aborts with no `retry` once its
      // own retry count is exhausted.
      if (retryCount < EXTRACTION_QUALITY_GUARD_MAX_RETRIES) {
        abort(
          'Your response was not valid JSON. Return ONLY the JSON object matching the schema.',
          { retry: true, metadata: { reason: 'unparseable-json' } },
        );
      } else {
        abort('Response was not valid JSON after multiple attempts.', {
          metadata: { reason: 'unparseable-json-exhausted' },
        });
      }
    }

    const result = workItemExtractionSchema.safeParse(parsed);
    if (!result.success || result.data.items.length === 0) return [];
    const items = result.data.items;

    const parsedDocument = requestContext?.get('parsedDocument') as ParsedDocument | undefined;
    const groundingViolations = checkGrounding(items, parsedDocument);

    const judgment = await extractionQualityJudgeAgent.generate(
      [{ role: 'user', content: [{ type: 'text', text: JSON.stringify(items) }] }],
      { structuredOutput: { schema: judgeOutputSchema } },
    );
    const semanticViolations: JudgeViolation[] = judgment.object?.violations ?? [];

    const violations: Violation[] = [...groundingViolations, ...semanticViolations];
    if (violations.length === 0) return [];

    if (retryCount < EXTRACTION_QUALITY_GUARD_MAX_RETRIES) {
      abort(formatViolations(violations), {
        retry: true,
        metadata: { violationCount: violations.length, retryCount },
      });
      return [];
    }

    return flagUnresolvedViolations(items, violations, messages);
  }
}

/**
 * Retry budget exhausted with violations still present. Rewrites the
 * flagged items' JSON in place (adding `needsReview: true`) inside ONLY
 * the current step's assistant message and returns the mutated messages
 * array — a documented alternative to `abort()` (see this plan's Existing
 * Pattern Audit). The run completes normally; `result.object` reflects
 * the patch.
 *
 * Targets `messages[messages.length - 1]` specifically, not every
 * assistant-role message in the array. Per the Processor interface docs,
 * `messages` for `processOutputStep` "includes the latest LLM response" —
 * wording that implies prior turns can also be present, and this guard's
 * own retry loop (`maxProcessorRetries`) is exactly the kind of thing that
 * leaves earlier rejected attempts sitting in the array. A blanket rewrite
 * of every assistant message would risk corrupting those prior turns
 * instead of touching only the current step's response.
 */
export function flagUnresolvedViolations(
  items: readonly ExtractedWorkItem[],
  violations: readonly Violation[],
  messages: ProcessOutputStepArgs['messages'],
): ProcessorMessageResult {
  const flaggedIds = new Set(violations.map((v) => v.itemId));
  const patchedItems = items.map((item) =>
    flaggedIds.has(item.id) ? { ...item, needsReview: true } : item,
  );
  const patchedText = JSON.stringify({ items: patchedItems });

  const currentMessage = messages[messages.length - 1];
  if (currentMessage?.role === 'assistant') {
    for (const part of currentMessage.content.parts ?? []) {
      if (part.type === 'text') {
        part.text = patchedText;
        break;
      }
    }
  }
  return messages;
}

/**
 * Deterministic check: does a normalized version of each item's
 * sourceQuote appear as a substring of a normalized version of some page
 * of the parsed source document? Normalization collapses whitespace runs
 * and lowercases, absorbing PDF-text-extraction artifacts (line-wrap
 * spacing, case quirks from styled headers) without weakening the check
 * into a fuzzy/keyword match — it is still a verbatim substring test.
 *
 * Defensive: if no parsedDocument was supplied (e.g. a future direct
 * `.generate()` call outside the pipeline), skip grounding rather than
 * false-flagging every item as ungrounded.
 */
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

function formatViolations(violations: readonly Violation[]): string {
  const summary = violations.map((v) => `${v.itemId} (${v.kind}): ${v.reason}`).join('\n');
  return (
    `${violations.length} item(s) failed extraction-quality review. Fix ` +
    `every one of them and re-emit the full list:\n${summary}`
  );
}
```

#### Reasoning

- `requestContext?.get('parsedDocument') as ParsedDocument | undefined` —
  the optional chain is required, not defensive styling:
  `ProcessorContext.requestContext` is typed `RequestContext | undefined`
  in the installed `@mastra/core` declarations
  (`node_modules/@mastra/core/dist/processors/index.d.ts`, checked this
  session), so `requestContext.get(...)` without `?.` does not compile.
  `RequestContext`'s untyped `.get()` also returns `unknown`-typed by
  generic default (Research #3); the cast is the correct, minimal way to
  consume it here, matching how the rest of this codebase treats
  `RequestContext` as a plain typed-at-the-edges bag rather than building
  a generic-parameter ceremony around one read site.
- `abort()` throws internally, so `return []` after each `abort()` call is
  unreachable but required for TypeScript's control-flow analysis —
  identical shape to the deleted `ItemContractGuard` and the superseded
  plan's guard.
- One judge call per extraction attempt (batched over the whole `items`
  array), matching `extractionConsistencyScorer`'s existing batching
  convention — not one call per item.
- `checkGrounding`, `normalize`, and `flagUnresolvedViolations` are
  exported (unlike `formatViolations`, which stays module-private) so the
  Validation Plan's pure-logic checks (steps 6 and 9) can import and call
  them directly from an external test script — an earlier draft of this
  plan left them unexported while the Validation Plan already claimed to
  test them "directly," which would not have compiled/run as written.
- **`!result.success` (schema-invalid JSON) intentionally returns `[]`,
  not a violation.** This guard's job is the two things a Zod schema
  cannot check (grounding, semantic quality of an otherwise-valid item);
  it deliberately does not duplicate agent-level structured-output
  validation. `billableItemExtractorAgent`'s `structuredOutput` call has
  no explicit `errorStrategy` set, so it uses the documented default,
  `'strict'`, which throws on schema-invalid output on its own
  (`docs/agents/structured-output.md`, "Handle errors": "The default
  `strict` strategy throws an error") — a second rejection path here
  would be redundant with that, not a gap.

---

### `src/features/estimate-extraction-pipeline/extraction/agent.ts`

**Action:** Modify (imports + agent config only; prompt body unchanged)

#### Before

```ts
import { Agent } from '@mastra/core/agent';
import { kiloGateway } from '../shared/gateway';
import { extractionConsistencyScorer } from './scorer';
```

```ts
  model: kiloGateway('openai/gpt-5.4-mini'),
  scorers: {
    consistency: {
      scorer: extractionConsistencyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
});
```

#### After

```ts
import { Agent } from '@mastra/core/agent';
import { kiloGateway } from '../shared/gateway';
import { extractionConsistencyScorer } from './scorer';
import { ExtractionQualityGuard, EXTRACTION_QUALITY_GUARD_MAX_RETRIES } from './quality-guard';
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

#### Reasoning

- `maxProcessorRetries` is set FROM the same constant the guard itself
  reads to decide "is this the last attempt" — matches the deleted
  `ItemContractGuard`'s retry budget (3) but as a single source of truth
  instead of two `3`s that could silently drift apart. The prompt's
  existing unit/scope guidance is left unchanged — the guard is a
  backstop, not a replacement for teaching the model the rule; fewer
  retries fire when the prompt is followed the first time.

---

### `src/features/estimate-extraction-pipeline/extraction/index.ts`

**Action:** Modify

#### Before

```ts
import { RequestContext } from '@mastra/core/request-context';
import { billableItemExtractorAgent } from './agent';
import { extractionConsistencyScorer } from './scorer';
import { workItemExtractionSchema, type ExtractedWorkItem } from './schema';

export { TRADE, ACTION, EXTENT_UNIT, extractedWorkItemSchema, type Action } from './schema';
export type { ExtractedWorkItem };
export { billableItemExtractorAgent, extractionConsistencyScorer };

export interface ExtractWorkItemsInput {
  estimateRequestId: string;
  fileUrl: string;
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
      ]),
    },
  );

  const extraction = result.object;
  if (!extraction) {
    throw new Error('Extraction returned no structured object');
  }
  return { workItems: extraction.items };
}
```

#### After

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
  return { workItems: extraction.items };
}
```

#### Reasoning

- The multimodal message sent to the model is byte-for-byte unchanged —
  only the `RequestContext` gains a second key, `parsedDocument`, which
  the model itself never sees (it's not part of the prompt/messages); it
  exists purely for `ExtractionQualityGuard` to read back out.

---

### `src/features/estimate-extraction-pipeline/classification/schema.ts`

**Action:** Modify (add one field to the shared identity fields)

#### Before

```ts
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
```

#### After

```ts
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
  /**
   * Set by ExtractionQualityGuard on retry-exhaustion; see
   * extraction/schema.ts. `.default(false)` is NOT optional polish:
   * `envelope.ts`'s summaryEnvelopeV3Schema re-parses already-persisted
   * rows through this exact schema, and every v3 estimate written before
   * this field existed has no `needsReview` key at all. Without a
   * default, every existing row would fail to parse the moment this
   * ships (parseSummaryEnvelope falling through to 'unparseable') —
   * the same class of regression this branch started out fixing.
   */
  needsReview: z.boolean().default(false),
} as const;
```

#### Reasoning

- In the shared spread already used for every other identity field —
  flows into `materialLineSchema`, `laborLineSchema`, and
  `pendingLaborLineSchema` (via `.extend()`) automatically. No new
  abstraction, matches the existing pattern exactly.
- `.default(false)` is required for backward compatibility with
  already-persisted rows (see field comment above) — confirmed by tracing
  the full path: `workflow.ts` persists `result.result.lines` directly
  (no manual field-picking, so `needsReview` survives the write) and
  `envelope.ts`'s `summaryEnvelopeV3Schema` imports `billableLineSchema`
  directly rather than duplicating it, so no other file needs a matching
  change — but the default itself is load-bearing.

---

### `src/features/estimate-extraction-pipeline/classification/index.ts`

**Action:** Modify (one field added to the `common` object)

#### Before

```ts
    const common = {
      trade: it.trade,
      action: it.action,
      scope: it.scope,
      location: it.location,
      sourceQuote: it.sourceQuote,
      pageHint: it.pageHint,
    };
```

#### After

```ts
    const common = {
      trade: it.trade,
      action: it.action,
      scope: it.scope,
      location: it.location,
      sourceQuote: it.sourceQuote,
      pageHint: it.pageHint,
      needsReview: it.needsReview,
    };
```

#### Reasoning

- `common` is spread onto both halves of an install/replace material/labor
  split, so a flagged work item's `needsReview` reaches both rows —
  correct: if the source item was unverified, both the material and labor
  lines derived from it should say so.

---

### `src/features/estimate/components/items-section.tsx`

**Action:** Modify (one badge, unconditionally visible)

#### Before

```tsx
      <div>
        <div className="font-medium leading-snug">
          {formatItemTitle(item.scope, item.action, item.costType)}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatLocation(item.location)}
        </div>
        {showSource ? (
```

#### After

```tsx
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="font-medium leading-snug">
            {formatItemTitle(item.scope, item.action, item.costType)}
          </div>
          {'needsReview' in item && item.needsReview ? (
            <Badge variant="destructive">Needs Review</Badge>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatLocation(item.location)}
        </div>
        {showSource ? (
```

#### Reasoning

- **Placement fixed from an earlier draft of this plan**, which put the
  badge in `ItemRow`'s second grid column
  (`grid-cols-[minmax(0,1fr)_90px_110px_130px]`) next to the costType
  pill — a fixed 90px column already tight for one badge. Two badges
  there would overflow or wrap badly. The first column is the flexible
  `1fr` one that already handles multi-line content (title, location,
  optional source quote), so the flag badge sits next to the title
  instead, wrapping onto its own line via `flex-wrap` if the title is
  long rather than fighting for space in a fixed-width column.
- `'needsReview' in item` guards `LegacyBillableItem` (the v1/v2 union
  member, which predates this field and will never have it) — no schema
  change needed on the legacy type, the check is just structurally safe.
- `variant="destructive"` confirmed against this repo's own
  `src/design-systems/shadcn/components/badge.tsx` (`badgeVariants`
  includes `default | secondary | destructive | outline`) — not guessed.
- Deliberately NOT gated behind the existing `showEvidence`/`showSource`
  toggles (which default OFF) — this is a correctness flag on a
  client-facing dollar figure, not supplementary detail, so it must be
  visible by default.

---

### `src/features/estimate-extraction-pipeline/pipeline.ts`

**Action:** Modify

#### Before

```ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractWorkItems, extractedWorkItemSchema } from './extraction';
import { classifyLines, billableLineSchema, pendingLineSchema } from './classification';
import { priceLines, pricedLineItemSchema } from './pricing';

/**
 * The composition root. Every stage below is a one-line adapter calling
 * exactly one module's door function — this file contains NO business
 * logic. To understand what a stage DOES, read that module's index.ts.
 */

const extractStep = createStep({
  id: 'extract',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    workItems: z.array(extractedWorkItemSchema),
  }),
  retries: 2,
  execute: async ({ inputData }) => {
    const { workItems } = await extractWorkItems({
      estimateRequestId: inputData.estimateRequestId,
      fileUrl: inputData.fileUrl,
    });
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      workItems,
    };
  },
});
```

```ts
export const summarizeEstimateWorkflow = createWorkflow({
  id: 'summarize-estimate',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  outputSchema: priceStep.outputSchema,
})
  .then(extractStep)
  .then(classifyStep)
  .then(priceStep)
  .commit();
```

#### After

```ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractWorkItems, extractedWorkItemSchema } from './extraction';
import { classifyLines, billableLineSchema, pendingLineSchema } from './classification';
import { priceLines, pricedLineItemSchema } from './pricing';
import { parsePdfFromUrl, parsedDocumentSchema } from './document';

/**
 * The composition root. Every stage below is a one-line adapter calling
 * exactly one module's door function — this file contains NO business
 * logic. To understand what a stage DOES, read that module's index.ts.
 */

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
    workItems: z.array(extractedWorkItemSchema),
  }),
  retries: 2,
  execute: async ({ inputData }) => {
    const { workItems } = await extractWorkItems({
      estimateRequestId: inputData.estimateRequestId,
      fileUrl: inputData.fileUrl,
      parsedDocument: inputData.parsedDocument,
    });
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      workItems,
    };
  },
});
```

```ts
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

#### Reasoning

- `parseDocumentStep` throws on failure and relies on `retries: 2` —
  matching every other step in this file, not the parked Docling plan's
  non-throwing pattern (Research #5).
- `extractStep.inputSchema` is now literally `parseDocumentStep.outputSchema`
  (same pattern `classifyStep`/`priceStep` already use for chaining) so
  `fileUrl` and `parsedDocument` both flow through without new adapter
  fields.

---

### `src/features/estimate-extraction-pipeline/index.ts`

**Action:** Modify

#### Before

```ts
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { billableItemExtractorAgent, extractionConsistencyScorer } from './extraction';
import { itemPricerAgent } from './pricing';
import { summarizeEstimateWorkflow } from './pipeline';
```

```ts
export const mastra = new Mastra({
  agents: {
    'billable-item-extractor': billableItemExtractorAgent,
    'item-pricer': itemPricerAgent,
  },
  scorers: { 'extraction-consistency': extractionConsistencyScorer },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
  logger: new PinoLogger({ name: 'estimate-extraction-pipeline' }),
});
```

#### After

```ts
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import {
  billableItemExtractorAgent,
  extractionConsistencyScorer,
  extractionQualityJudgeAgent,
} from './extraction';
import { itemPricerAgent } from './pricing';
import { summarizeEstimateWorkflow } from './pipeline';
```

```ts
export const mastra = new Mastra({
  agents: {
    'billable-item-extractor': billableItemExtractorAgent,
    'item-pricer': itemPricerAgent,
    'extraction-quality-judge': extractionQualityJudgeAgent,
  },
  scorers: { 'extraction-consistency': extractionConsistencyScorer },
  workflows: { 'summarize-estimate': summarizeEstimateWorkflow },
  logger: new PinoLogger({ name: 'estimate-extraction-pipeline' }),
});
```

---

### `package.json`

**Action:** Modify

#### Before

```json
    "@mastra/core": "^1.37.1",
    "@mastra/loggers": "^1.2.0",
```

#### After

```json
    "@mastra/core": "^1.37.1",
    "@mastra/loggers": "^1.2.0",
    "pdf-parse": "^2.4.5",
```

#### Reasoning

- Version pinned to the latest confirmed via `WebSearch` this session
  (Research #4), not guessed. Alphabetical placement matches this
  `package.json`'s existing dependency ordering.

---

### `AGENTS.md`

**Action:** Modify

#### Before

```text
- Mastra `@mastra/core` for AI workflows (version: see `package.json` —
  do not hardcode a version number here; it will go stale at the next
  bump). The AI pipeline lives at
  `src/features/estimate-extraction-pipeline/` as three one-door modules
  (`extraction/`, `classification/`, `pricing/`) plus a logic-free
  composition root (`pipeline.ts`). Rules, mechanically checked:
  - Only a module's `index.ts` may be imported from outside its folder:
    ```sh
    PKG=src/features/estimate-extraction-pipeline
    grep -rn "from '.*\/extraction\/\(schema\|agent\|scorer\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/extraction/"
    grep -rn "from '.*\/classification\/\(schema\|rules\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/classification/"
    grep -rn "from '.*\/pricing\/\(schema\|agent\|price-line\|workflow\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/pricing/"
    ```
    All three must return zero results.
```

#### After

```text
- Mastra `@mastra/core` for AI workflows (version: see `package.json` —
  do not hardcode a version number here; it will go stale at the next
  bump). The AI pipeline lives at
  `src/features/estimate-extraction-pipeline/` as four one-door modules
  (`document/`, `extraction/`, `classification/`, `pricing/`) plus a
  logic-free composition root (`pipeline.ts`). Rules, mechanically checked:
  - Only a module's `index.ts` may be imported from outside its folder:
    ```sh
    PKG=src/features/estimate-extraction-pipeline
    grep -rn "from '.*\/document\/\(schema\|parse\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/document/"
    grep -rn "from '.*\/extraction\/\(schema\|agent\|scorer\|quality-guard\|quality-guard-agent\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/extraction/"
    grep -rn "from '.*\/classification\/\(schema\|rules\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/classification/"
    grep -rn "from '.*\/pricing\/\(schema\|agent\|price-line\|workflow\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/pricing/"
    ```
    All four must return zero results.
```

#### Reasoning

- This rule is stated as "mechanically checked" — leaving it saying
  "three" while a fourth module exists would make the repo's own
  documented contract wrong the moment this plan lands.

## Validation Plan

1. `pnpm install` — pulls in `pdf-parse`.
2. `pnpm exec tsc --noEmit` — clean.
3. `pnpm exec eslint` on all created/modified `.ts` files — clean.
4. **One-door boundary gate** (all four grep lines from the updated
   `AGENTS.md`, above) — must return zero results.
5. `pnpm build` — clean.
6. **Pure-logic check (no live model or network needed):** exercise
   `checkGrounding()` and `normalize()` directly (a `tsx` script in the
   session scratchpad) with a fixture `ParsedDocument` and a mix of
   genuinely-grounded and fabricated `sourceQuote`s — confirm the
   fabricated one is flagged and the grounded one (including one with
   deliberately different whitespace/casing) is not.
7. **Pure-logic check:** `parsePdfFromUrl` against one real estimate PDF
   URL already in blob storage (no LLM call, just `pdf-parse` itself) —
   confirm `pages.length` is realistic (not 1, not 0) and spot-check that
   `pages[0].content` contains recognizable report text.
8. **Live QA via `pnpm dev` / `pnpm mastra:dev`** (needs `KILO_API_KEY`):
   - Confirm in Studio (`pnpm mastra:dev`) that `extraction-quality-judge`
     appears as a registered agent and `parse-document` appears as a step
     in the `summarize-estimate` workflow graph.
   - Run a full estimate upload end to end; confirm it still completes
     and produces the same shape of output as before this change.
   - Upload a report containing a material previously mis-classified live
     (e.g. drywall/siding emitted as `ea`). Confirm the judge flags it,
     the extractor retries, and the final persisted line shows the
     correct unit.
   - Confirm via logs that a normal, correct extraction does NOT trigger
     repeated retries or false-positive grounding violations — the guard
     should be invisible on the happy path.
   - Confirm the JSON.parse-fallback path is not hit in practice (log
     line absent).
9. **Forced retry-exhaustion check (no live model needed):** call
   `flagUnresolvedViolations()` directly with a fixture `messages` array
   and a deliberately-violating item — assert the returned messages'
   assistant text part parses back to JSON with `needsReview: true` set
   on exactly the flagged item and unchanged on the rest. This is the one
   code path no other processor in this codebase exercises (see Risk
   Notes), so it gets its own explicit pure-logic test rather than relying
   on a live model to happen to fail 3 times in a row.
10. **End-to-end `needsReview` render check:** with a fixture line item
    carrying `needsReview: true` passed to `ItemsSection`, confirm the
    "Needs Review" badge renders unconditionally (toggles OFF) and that a
    `LegacyBillableItem` (no `needsReview` field at all) renders without
    error.
11. **Backward-compatibility regression check (critical, do not skip):**
    take one real `estimate_requests.summary` JSON string already in the
    dev database from before this change (a genuine v3 row with no
    `needsReview` key anywhere in its `lines`), and run it through the
    UPDATED `parseSummaryEnvelope()`. Must still return `{ kind: 'v3', ... }`
    with every line's `needsReview` defaulting to `false` — not
    `'unparseable'`. This is the direct regression test for the
    `.default(false)` requirement called out in the `classification/schema.ts`
    section; confirm it against real persisted data, not just a
    hand-written fixture, since this is exactly the kind of gap a
    synthetic fixture can accidentally paper over.

## Risk Notes

- **The grounding check can false-positive on PDF-text-extraction
  artifacts** the normalization step doesn't cover — most notably
  hyphenation at line breaks (a word split across two lines by the
  original PDF layout may extract as `"cor- rosion"` or `"corrosion"`
  depending on how `pdf-parse` joins wrapped lines, while the model's own
  native PDF reading may perceive it differently). Deliberately not
  "fixed" with a cleverer de-hyphenation heuristic — that itself risks
  becoming the kind of guessed, uninspected string-matching logic this
  plan is trying to avoid. The mitigation is architectural, not
  algorithmic: a false-positive here only costs a wasted retry (the guard
  aborts with `retry: true`), and after `maxProcessorRetries` is
  exhausted the last attempt still ships — never silent data loss. Live
  QA (step 8) is what confirms whether this fires often enough to need
  revisiting.
- **`JSON.parse(text)` assumption is the same one the superseded plan
  carried, still empirically grounded rather than docs-confirmed** — see
  that plan's own reasoning (now folded into this one): the deleted
  `ItemContractGuard` needed its own JSON extraction from raw `text`,
  which only makes sense if `text` isn't already guaranteed-clean JSON.
- **Retry cost, compounded.** A worst case is now up to 4 extraction
  attempts, each followed by 1 judge call (4 judge calls total) — same
  order of magnitude the deleted `ItemContractGuard` already cost this
  pipeline, unchanged by adding the (free, non-LLM) grounding check.
- **`pdf-parse` is a new, previously-unvetted-in-this-repo third-party
  dependency**, unlike everything else in this pipeline which routes
  through Mastra's own primitives or the existing Kilo gateway. Its API
  shape was cross-checked against its GitHub README this session, but
  has not been exercised against a real multi-page inspection-report PDF
  from this application until Validation step 7 runs.
- **The `needsReview` message-mutation path is the one mechanism in this
  plan not already exercised by the deleted `ItemContractGuard` or by any
  other processor in this codebase** — every other guard/scorer here only
  ever calls `abort()` or returns `[]`. Returning a mutated `messages`
  array from `processOutputStep` is documented (see Existing Pattern
  Audit) but this is its first real use in this project, so Validation
  step 8 explicitly checks that a forced retry-exhaustion case actually
  produces a patched `result.object` with `needsReview: true` set, not
  just that the run completes.
- **The judge call inside `processOutputStep` has no failure handling of
  its own.** `extractionQualityJudgeAgent.generate(...)` runs on every
  single extraction attempt with no `try/catch` around it. If that call
  throws for any reason (transient network error, rate limit, provider
  hiccup), the exception propagates out of `processOutputStep` uncaught —
  which fails the ENTIRE extraction run, not just this one guard check,
  turning a transient judge-side blip into a full pipeline failure on an
  otherwise-good extraction. This plan does not decide how to handle it
  (fail-open: catch and treat as "no semantic violations" vs. fail-closed:
  let it propagate as today) — that's a real design choice, flagged here
  rather than silently picked, since it changes what a judge-service
  outage does to every in-flight estimate.
- **`needsReview` is a signal, not a correction — items that reach it are
  still priced and shipped**, just with a visible flag. If the underlying
  cause is systemic (e.g. the judge and extractor disagree on a material
  category neither was trained to expect), the SAME item can trip this
  path repeatedly across different reports; there's no cross-run learning
  or suppression here, by design — each run is independent, matching how
  every other part of this pipeline works.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
