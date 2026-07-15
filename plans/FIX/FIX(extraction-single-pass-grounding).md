# FIX(extraction-single-pass-grounding)

## Request

Live QA on a real inspection PDF failed: `extractWorkItems` threw
`Extraction returned no structured object`, preceded by dozens of
`updateToolInvocation: no matching tool call found` and `No user or
assistant messages in the request` warnings from `@mastra/core`.

Root cause, confirmed against the installed `@mastra/core` source and
Mastra's own docs (`docs/agents/structured-output.md`, "Combine tools and
structured output"): `billableItemExtractorAgent` is configured with BOTH
`tools: { searchInspectionReport: documentQueryTool }` AND
`structuredOutput: { schema: workItemExtractionSchema }` on the same
`.generate()` call, with none of Mastra's three documented workarounds
applied. The agent's own prompt additionally requires ONE tool call per
candidate item ("For every candidate item: ... 2. Call the tool..."),
sequentially — a real report with dozens of findings means dozens of
tool-call round trips inside a single `.generate()`, while
`maxSteps` defaults to 5. Both problems stem from the same design choice:
extraction was built as a multi-turn agentic retrieval loop (Mastra's
standard RAG-tool pattern) when the actual corpus (a single inspection
report's sentence list — a few dozen to ~150 short chunks) is small enough
to hand the model directly. Retrieval was never necessary here.

**User's correction, to be kept as the design mantra for this fix:**
1. Convert the entire document into a permanent JSON embedding store.
2. In a single pass, semantically reason over the indexed sentences and
   emit line items citing their chunk id directly — no tool-calling loop.
3. A final pass — the judge — verifies by following those same
   references.

Step 1 is already correct and unchanged (`document/embed.ts`'s
`indexDocument`, backed by `PgVector`, permanent — see
`FIX(document-vector-store-postgres-migration).md`). This plan implements
step 2 correctly (removing the tool-call loop, single-pass inline
citation) and confirms step 3 needs no change.

## Directory Map

```text
src/features/estimate-extraction-pipeline/
├── document/
│   ├── index.ts              [MODIFY] drop documentQueryTool export
│   └── query-tool.ts         [DELETE] no longer used by anything
└── extraction/
    ├── agent.ts               [MODIFY] remove tools, rewrite grounding prompt
    ├── index.ts                [MODIFY] inline the chunk list into the prompt, drop indexName from requestContext
    └── schema.ts               [MODIFY] update two docstrings that reference documentQueryTool
AGENTS.md                       [MODIFY] drop query-tool from document/'s boundary grep
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `document/query-tool.ts` | Delete | Dead code once extraction stops using a retrieval tool; nothing else references it. |
| `document/index.ts` | Modify | Remove the now-dangling `documentQueryTool` re-export (the door must not export something that no longer exists). |
| `extraction/agent.ts` | Modify | Remove `tools` entirely — this is what eliminates the tools+structuredOutput incompatibility and the `maxSteps` problem in one move, since there's no more agentic loop. Rewrite the grounding section of the prompt to match: cite from the provided list, don't call a tool. |
| `extraction/index.ts` | Modify | Format `chunkMap` (already returned by `indexDocument`, no new fetch needed) into an inline, IDed sentence list and add it to the single user message's content. Drop `indexName` from `RequestContext` (only the deleted tool consumed it) — keep `chunkMap` (the guard still needs it) and `estimateRequestId`. |
| `extraction/schema.ts` | Modify | Two doc comments say "found via `documentQueryTool`" — update to describe the new mechanism so the schema file doesn't lie about how `sourceChunkId` gets populated. |
| `AGENTS.md` | Modify | The one-door boundary grep for `document/` still lists `query-tool` as an internal file name to watch for external imports of; remove it now that the file is gone. |

## Existing Pattern Audit

- **No new Mastra primitives needed.** `Agent.generate()` with only
  `structuredOutput` (no `tools`) is Mastra's plain, single-pass structured
  generation path — exactly what every non-tool example in
  `docs/agents/structured-output.md` shows. Removing `tools` is suffient;
  no `jsonPromptInjection`, no separate `structuredOutput.model`, no
  `prepareStep` — those are workarounds for when tools AND structured
  output are both needed together, which is no longer this agent's shape.
- **`RequestContext`** stays exactly as already used elsewhere in this
  pipeline (`extraction/index.ts` already constructs one for
  `estimateRequestId`/`chunkMap`) — only the `indexName` entry is dropped,
  since it existed solely for `documentQueryTool`'s runtime override
  (confirmed via `document/query-tool.ts`'s own docstring, now deleted).
- **`ExtractionQualityGuard.processOutputStep`** (`extraction/quality-guard.ts:78,109`)
  already reads `chunkMap` off `requestContext` and does a plain
  `Map.has()` lookup (`checkChunkReferences`) — this is mechanism-agnostic
  about HOW the model produced `sourceChunkId`; it needs zero changes.
  Confirmed by reading the file in full this session.
- **`extractionQualityJudgeAgent`** (`extraction/quality-guard-agent.ts`)
  and **`extractionConsistencyScorer`** (`extraction/scorer.ts`) both judge
  only the emitted items' own fields (unit plausibility, compound scope,
  internal quote-consistency) — neither depends on tools or the retrieval
  mechanism. Confirmed by reading both files in full this session. No
  changes.
- **`document/embed.ts`, `document/vector-store.ts`, `document/parse.ts`,
  `document/schema.ts`** are untouched — the permanent PgVector store
  (step 1 of the mantra) is correct as-is and out of scope for this fix.

## Design Decision: drop the native PDF attachment

The current `.generate()` call hands the model the PDF natively (`type:
'file'`) alongside instruction text. This plan replaces that with the
enumerated chunk list ONLY — no PDF attachment. Reasoning:

- The user's own wording is "semantically reason [over] what sentences
  should be captured" — the sentences are the already-indexed chunk list,
  not a second read of the raw PDF.
- Grounding is enforced against `chunkMap` alone (`checkChunkReferences`).
  If the model reasoned from the raw PDF and found something pdf-parse's
  extraction garbled or missed, it would formulate a candidate it can
  never validly cite — the prompt's own existing hard rule already handles
  this safely ("if no matching sentence, omit"), but it's a wasted,
  confusing path. Reasoning from the same text that was embedded and will
  be cited removes that whole class of dead-end reasoning.
- Every chunk is short (`maxSize: 120`), sentence-level plain text — for a
  real inspection report (dozens to ~150 chunks) the full enumerated list
  is a few thousand tokens at most, comfortably within context, no
  retrieval needed.

If you want the PDF kept as additional (non-authoritative) context
alongside the chunk list, say so before approval — flagging this
explicitly since it's the one judgment call in this plan.

## Execution Plan

### Step 1 — Delete the retrieval tool
Delete `document/query-tool.ts`. Remove its re-export from `document/index.ts`.

### Step 2 — Strip `tools` from the agent, rewrite the grounding prompt
Edit `extraction/agent.ts`.

### Step 3 — Inline the chunk list in `extraction/index.ts`
Build the sentence list from the already-available `chunkMap`, add it to
the message content, drop `indexName` from `RequestContext`.

### Step 4 — Update `extraction/schema.ts` doc comments

### Step 5 — Update `AGENTS.md`'s boundary grep

### Step 6 — Validate (tsc, eslint, one-door grep, build — see Validation Plan)

## File-by-File Changes

### `src/features/estimate-extraction-pipeline/document/query-tool.ts`
**Action:** Delete
**Why:** No longer used — extraction no longer performs mid-generation retrieval.

### `src/features/estimate-extraction-pipeline/document/index.ts`
**Action:** Modify
**Impact:** Removes a dangling re-export.

#### Before
```ts
export { parsedDocumentSchema, type ParsedDocument, type DocumentPage } from './schema';
export { parsePdfFromUrl } from './parse';
export { indexDocument, type DocumentChunkRecord } from './embed';
export { documentQueryTool } from './query-tool';
```

#### After
```ts
export { parsedDocumentSchema, type ParsedDocument, type DocumentPage } from './schema';
export { parsePdfFromUrl } from './parse';
export { indexDocument, type DocumentChunkRecord } from './embed';
```

---

### `src/features/estimate-extraction-pipeline/extraction/agent.ts`
**Action:** Modify
**Why:** Remove the tool (eliminates the tools+structuredOutput conflict and the maxSteps problem — no more agentic loop). Rewrite the grounding section of the prompt to match: the model is handed the full sentence list and cites from it directly, in one pass.
**Impact:** The agent's `.generate()` call becomes a single LLM turn producing structured output — no tool round trips.

#### Before (imports + tools + relevant prompt section)
```ts
import { Agent } from '@mastra/core/agent';
import { kiloGateway } from '../shared/gateway';
import { extractionConsistencyScorer } from './scorer';
import { ExtractionQualityGuard, EXTRACTION_QUALITY_GUARD_MAX_RETRIES } from './quality-guard';
import { documentQueryTool } from '../document';

export const billableItemExtractorAgent = new Agent({
  id: 'billable-item-extractor',
  name: 'Billable Item Extractor',
  instructions: `
...
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
...
- sourceChunkId: the chunk id (from the search-inspection-report tool)
  for the specific sentence that names both the defect and the action for
  this item. Always call the tool before emitting an item; never guess an
  id.
...
`,
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

#### After
```ts
import { Agent } from '@mastra/core/agent';
import { kiloGateway } from '../shared/gateway';
import { extractionConsistencyScorer } from './scorer';
import { ExtractionQualityGuard, EXTRACTION_QUALITY_GUARD_MAX_RETRIES } from './quality-guard';

export const billableItemExtractorAgent = new Agent({
  id: 'billable-item-extractor',
  name: 'Billable Item Extractor',
  instructions: `
...
GROUNDING VIA THE PROVIDED SENTENCE LIST (apply to every candidate item
before you emit it)
Your message includes an INDEXED SENTENCE LIST — every sentence from the
report, each labeled with a chunk id and page number. This list is the
ONLY valid source for "sourceChunkId". For every candidate item:
1. Find the specific entry in the indexed sentence list that names both
   the defect and the required action.
2. If you find one, cite its chunk id as "sourceChunkId".
3. If no entry in the list actually supports the candidate, do NOT emit
   the item — you were wrong that it was grounded.
Never invent a chunk id. Never cite an id whose listed text you have not
actually read and confirmed supports the item. A citation you have not
verified is worse than no item at all.

HARD RULES
1. GROUNDED ONLY. Every emitted item's "sourceChunkId" must be an id that
   appears in the indexed sentence list, and that entry's text must
   actually name the defect and action you claim. No paraphrase, no
   merging of separate entries, no inference. If no entry supports it, do
   not emit the item.
...
- sourceChunkId: the chunk id, copied exactly from the indexed sentence
  list, for the entry that names both the defect and the action for this
  item. Never guess or invent an id not present in the list.
...
`,
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
(Every other HARD RULES / FIELDS bullet unchanged — ellipses mark only
genuinely untouched prose, e.g. rules 2-7 and the trade/action/scope/
extent/inspectorHours field specs.)

#### Reasoning
- Removing `tools` is the fix for both observed failures at once: no tool
  means no tools+structuredOutput incompatibility, and no agentic loop
  means `maxSteps` (default 5) is irrelevant — the whole extraction
  happens in one LLM turn.
- The prompt rewrite keeps every hard rule's INTENT identical (grounded
  citation, omit if unsupported) and only changes the MECHANISM
  description (list lookup instead of tool call), so extraction quality
  shouldn't regress — the model still can't cite something it hasn't
  actually matched to real text.

---

### `src/features/estimate-extraction-pipeline/extraction/index.ts`
**Action:** Modify
**Why:** Build the indexed sentence list from `chunkMap` (already returned
by `indexDocument`, no new call needed) and add it as message content
instead of attaching the raw PDF. Drop `indexName` from `RequestContext`
(nothing reads it anymore) — keep `estimateRequestId` and `chunkMap` (the
guard still reads `chunkMap`).

#### Before
```ts
import { RequestContext } from '@mastra/core/request-context';
import { billableItemExtractorAgent } from './agent';
import { extractionConsistencyScorer } from './scorer';
import { extractionQualityJudgeAgent } from './quality-guard-agent';
import { workItemExtractionSchema, type ExtractedWorkItem, type RawWorkItem } from './schema';
import {
  indexDocument,
  type ParsedDocument,
  type DocumentChunkRecord,
} from '../document';

...

export async function extractWorkItems(
  input: ExtractWorkItemsInput,
): Promise<ExtractWorkItemsOutput> {
  const indexName = `doc_${input.estimateRequestId.replace(/-/g, '_')}`;
  const chunkMap = await indexDocument(indexName, input.parsedDocument);

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
}
```

#### After
```ts
import { RequestContext } from '@mastra/core/request-context';
import { billableItemExtractorAgent } from './agent';
import { extractionConsistencyScorer } from './scorer';
import { extractionQualityJudgeAgent } from './quality-guard-agent';
import { workItemExtractionSchema, type ExtractedWorkItem, type RawWorkItem } from './schema';
import {
  indexDocument,
  type ParsedDocument,
  type DocumentChunkRecord,
} from '../document';

...

export async function extractWorkItems(
  input: ExtractWorkItemsInput,
): Promise<ExtractWorkItemsOutput> {
  const indexName = `doc_${input.estimateRequestId.replace(/-/g, '_')}`;
  const chunkMap = await indexDocument(indexName, input.parsedDocument);

  const result = await billableItemExtractorAgent.generate(
    [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Extract every billable work item from this inspection report. ' +
              'Cite the specific chunk id from the indexed sentence list below ' +
              'for each item. Follow the rules in your instructions exactly. ' +
              'When in doubt, omit. Return JSON matching the provided schema.',
          },
          {
            type: 'text',
            text: formatIndexedSentenceList(chunkMap),
          },
        ],
      },
    ],
    {
      structuredOutput: { schema: workItemExtractionSchema },
      requestContext: new RequestContext([
        ['estimateRequestId', input.estimateRequestId],
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
}

/**
 * Renders the run's chunk map as the model's ONLY source of citable
 * sentences — plain data formatting, not a heuristic: every chunk that
 * was actually indexed appears once, in document order, labeled with the
 * exact id the model must copy into sourceChunkId.
 */
function formatIndexedSentenceList(chunkMap: Map<string, DocumentChunkRecord>): string {
  const lines = [...chunkMap.values()].map(
    (chunk) => `[${chunk.id}] (p. ${chunk.pageNumber}) ${chunk.text}`,
  );
  return `INDEXED SENTENCE LIST:\n${lines.join('\n')}`;
}
```

#### Reasoning
- `indexName` (the Postgres table name, `doc_{estimateRequestId}`) is
  UNCHANGED — it's still declared and still passed to `indexDocument()`
  for permanent storage (step 1 of the mantra). Only its entry inside the
  `RequestContext` array is removed, since that existed solely to let the
  now-deleted tool override its own `indexName` placeholder at runtime.
- `chunkMap` was already being computed before this change — this reuses
  it instead of fetching anything new.
- `formatIndexedSentenceList` is plain, deterministic serialization of
  data this module already owns (id, page, text) — not a heuristic or
  hand-rolled classification rule, so it doesn't conflict with the
  no-hand-rolled-slop constraint.
- Dropping `indexName` from `RequestContext` is safe: grep-confirmed (see
  Existing Pattern Audit) that only the now-deleted `documentQueryTool`
  ever read it.

---

### `src/features/estimate-extraction-pipeline/extraction/schema.ts`
**Action:** Modify (doc comments only, no schema/type changes)

#### Before
```ts
/**
 * MODEL-FACING shape — what the extraction agent's structuredOutput
 * actually returns. Differs from the public shape in exactly one way:
 * `sourceChunkId` replaces `sourceQuote`/`pageHint`. The model cites the
 * specific chunk (found via `documentQueryTool`) that supports a finding;
 * `extraction/index.ts` resolves the citation into the public shape's
 * verbatim quote and page number deterministically. This removes "the
 * model retyped a quote that doesn't match its own citation" as a
 * possible failure mode — there is no second, independently-typed copy of
 * the evidence to drift from the citation.
 */
export const rawWorkItemSchema = z.object({
  ...
  /** Chunk id returned by documentQueryTool for the sentence that anchors this item. */
  sourceChunkId: z.string().min(1),
```

#### After
```ts
/**
 * MODEL-FACING shape — what the extraction agent's structuredOutput
 * actually returns. Differs from the public shape in exactly one way:
 * `sourceChunkId` replaces `sourceQuote`/`pageHint`. The model cites the
 * chunk id (copied from the indexed sentence list it was given inline —
 * see `extraction/index.ts`'s `formatIndexedSentenceList`) that supports
 * a finding; `extraction/index.ts` resolves the citation into the public
 * shape's verbatim quote and page number deterministically. This removes
 * "the model retyped a quote that doesn't match its own citation" as a
 * possible failure mode — there is no second, independently-typed copy of
 * the evidence to drift from the citation.
 */
export const rawWorkItemSchema = z.object({
  ...
  /** Chunk id copied from the indexed sentence list for the entry that anchors this item. */
  sourceChunkId: z.string().min(1),
```

---

### `AGENTS.md`
**Action:** Modify (boundary grep pattern only)

#### Before
```
    grep -rn "from '.*\/document\/\(schema\|parse\|vector-store\|embed\|query-tool\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/document/"
```

#### After
```
    grep -rn "from '.*\/document\/\(schema\|parse\|vector-store\|embed\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/document/"
```

## Validation Plan

1. `pnpm exec tsc --noEmit` — clean.
2. `pnpm exec eslint` on all 5 modified/deleted-referencing files — clean.
3. One-door boundary gate, all four grep patterns from the updated
   `AGENTS.md` — zero results, specifically confirming nothing outside
   `document/` ever imported `query-tool` directly (already confirmed
   during research: only `document/index.ts` referenced it).
4. `pnpm build` — clean.
5. **Live test against a real inspection PDF** (the same one that
   triggered this bug) via `pnpm dev` — confirm no `updateToolInvocation`
   / `no user or assistant messages` warnings, confirm `result.object` is
   populated, confirm the emitted items' `sourceChunkId`s all resolve
   (i.e. `needsReview` is false on items that should cleanly ground). This
   is the step that actually proves the fix — the earlier NUL-byte fix
   also passed tsc/eslint/build and still failed live, so static checks
   alone are not being treated as sufficient here.

## Risk Notes

- **Extraction quality could shift** now that the model sees the full
  sentence list up front instead of searching for exactly what it asked
  for. In practice this should be neutral-to-better (less error-prone
  than a multi-step tool loop, and the model can cross-reference nearby
  sentences within the same pass) — but this is a real behavior change
  worth watching in the first few live runs.
- **Very large reports** (hypothetically hundreds of pages) could produce
  a chunk list large enough to matter for token cost/context — not a
  concern at this app's actual document sizes (home inspection reports),
  not addressed here.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
