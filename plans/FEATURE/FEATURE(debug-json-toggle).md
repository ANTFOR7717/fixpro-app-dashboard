# FEATURE(debug-json-toggle)

## Request

Add a "Show Debug JSON" toggle to the estimate report showing exactly
TWO whole-document JSON views, nothing per-item:

1. **The page-level parsed document** — the PDF converted straight to
   JSON (`{ pages: [{ pageNumber, content }] }`), before any chunking.
2. **The sentence-level chunked document** — that same content broken
   into indexed sentences (`{ id, text, pageNumber }[]`), the data the
   extraction agent actually reads to pull out billable items.

Explicitly NOT in scope: any per-line-item JSON (item/price data). That
was in an earlier draft of this plan and was never actually requested —
removed.

## Directory Map

```text
src/features/estimate-extraction-pipeline/
├── document/
│   ├── schema.ts        [MODIFY] add documentChunkRecordSchema (zod, replaces the plain interface)
│   ├── embed.ts          [MODIFY] DocumentChunkRecord now imported from schema.ts, not declared locally
│   └── index.ts          [MODIFY] export documentChunkRecordSchema
├── extraction/
│   └── index.ts           [MODIFY] extractWorkItems() also returns chunks
└── pipeline.ts             [MODIFY] parsedDocument + chunks flow through extract → classify → price steps

src/features/estimate/
├── lib/
│   ├── envelope.ts        [MODIFY] summaryEnvelopeV3Schema + ParsedEnvelope gain parsedDocument + chunks
│   └── workflow.ts        [MODIFY] envelope construction includes parsedDocument + chunks
└── components/
    ├── estimate-report.tsx  [MODIFY] pass parsedDocument + chunks (v3 only) down to ItemsSection
    └── items-section.tsx    [MODIFY] "Show Debug JSON" toggle: two whole-document blocks, no per-row change
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `document/schema.ts` | Modify | `DocumentChunkRecord` needs to be a zod schema, not a plain TS interface, so `pipeline.ts`'s `createStep` schemas can reference it in `z.array(...)`. |
| `document/embed.ts` | Modify | Import the type from `./schema` instead of declaring its own interface — one definition, not two. |
| `document/index.ts` | Modify | Export `documentChunkRecordSchema` alongside the existing type export. |
| `extraction/index.ts` | Modify | `extractWorkItems()` returns `chunks: [...chunkMap.values()]` alongside `workItems` — data already computed in memory, just wasn't returned. |
| `pipeline.ts` | Modify | `parsedDocument` and `chunks` added to `extractStep`, `classifyStep`, `priceStep`'s `outputSchema`s, threaded through as plain REQUIRED fields (no `.default()`, no normalization — see Existing Pattern Audit for why that's correct here, unlike `needsReview`). `parsedDocument` was already available as `extractStep`'s own input; it just wasn't being forwarded. |
| `estimate/lib/envelope.ts` | Modify | `summaryEnvelopeV3Schema` gains both fields WITH `.default()` — this is the one place a default is actually needed (backward compatibility with rows persisted before this ships). |
| `estimate/lib/workflow.ts` | Modify | Envelope construction includes both fields directly, no `??` normalization (see Existing Pattern Audit). |
| `estimate-report.tsx` | Modify | `ItemsBlock` passes both fields (v3 only — legacy v1/v2 reports never had this data) down to `ItemsSection`. |
| `items-section.tsx` | Modify | Add `parsedDocument`/`chunks` props, `showDebug` toggle, two whole-document `<pre>` blocks. `TradeGroup`/`ItemRow` are UNCHANGED — no per-row debug rendering, so no new prop threading into them at all. |

## Existing Pattern Audit

- **Why no `?? []` / `.default()` at the pipeline-step level, unlike
  `needsReview`**: the earlier (now-removed) `needsReview` skew existed
  because `needsReview: z.boolean().default(false)` was declared WITH a
  `.default()` inside `extraction/schema.ts`'s OWN field definition — that
  default is what triggered Mastra's internally-resolved zod to disagree
  with this project's zod about whether the field was required, at every
  downstream step that consumed it. `documentChunkRecordSchema` and
  `parsedDocumentSchema` have NO `.default()` anywhere in their own
  definitions (confirmed by reading both this session) — within a single
  live pipeline run, `extractStep` always produces a real `parsedDocument`
  (it's `parseDocumentStep`'s primary output) and a real `chunks` array
  (computed synchronously in `extractWorkItems()` before the model even
  runs). Making them REQUIRED fields at every pipeline step, with no
  default and no `??` guard, is correct — not defensive, not missing a
  needed safeguard. Adding `.default()`/`??` here would be exactly the
  "validation for a scenario that can't happen" this project avoids.
- **Why `.default()` IS needed at the envelope level (`envelope.ts`
  only)**: `summaryEnvelopeV3Schema` re-parses rows persisted BEFORE this
  field existed — those rows genuinely lack the key. This is a real,
  already-happened scenario (old data), not a hypothetical one, so a
  default there is warranted — same reasoning already used (and now
  removed along with `needsReview`) for exactly this kind of
  backward-compatibility gap.
- **Why `parsedDocument` doesn't need a new return value from
  `extraction/index.ts`**: it's already `extractStep`'s OWN INPUT
  (`inputData.parsedDocument`, part of `parseDocumentStep.outputSchema`)
  — `extractStep` just needs to forward it into its own output, not
  compute or fetch it from anywhere new.
- **No per-item change anywhere**: `TradeGroup` and `ItemRow` are
  untouched. The two debug JSON blocks are whole-document, rendered once
  in `ItemsSection` itself, above the trade groups.

## File-by-File Changes

### `src/features/estimate-extraction-pipeline/document/schema.ts`
**Action:** Modify

#### Before
```ts
export const parsedDocumentSchema = z.object({
  pages: z.array(documentPageSchema),
});

export type DocumentPage = z.infer<typeof documentPageSchema>;
export type ParsedDocument = z.infer<typeof parsedDocumentSchema>;
```

#### After
```ts
export const parsedDocumentSchema = z.object({
  pages: z.array(documentPageSchema),
});

export type DocumentPage = z.infer<typeof documentPageSchema>;
export type ParsedDocument = z.infer<typeof parsedDocumentSchema>;

/**
 * One indexed sentence chunk from a document run — id, verbatim text, and
 * the page it came from. A zod schema (not just a TS interface) so
 * pipeline.ts's createStep schemas can reference it directly.
 */
export const documentChunkRecordSchema = z.object({
  id: z.string(),
  text: z.string(),
  pageNumber: z.number().int().min(1),
});

export type DocumentChunkRecord = z.infer<typeof documentChunkRecordSchema>;
```

---

### `src/features/estimate-extraction-pipeline/document/embed.ts`
**Action:** Modify

#### Before
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
```

#### After
```ts
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';
import { kiloGateway } from '../shared/gateway';
import { documentVectorStore } from './vector-store';
import type { ParsedDocument, DocumentChunkRecord } from './schema';

/** Dimension of openai/text-embedding-3-small, per Mastra's own vector-database docs. */
const EMBEDDING_DIMENSION = 1536;

export type { DocumentChunkRecord };
```
(`indexDocument()` itself unchanged — already builds records of this shape.)

---

### `src/features/estimate-extraction-pipeline/document/index.ts`
**Action:** Modify

#### Before
```ts
export { parsedDocumentSchema, type ParsedDocument, type DocumentPage } from './schema';
export { parsePdfFromUrl } from './parse';
export { indexDocument, type DocumentChunkRecord } from './embed';
```

#### After
```ts
export {
  parsedDocumentSchema,
  type ParsedDocument,
  type DocumentPage,
  documentChunkRecordSchema,
  type DocumentChunkRecord,
} from './schema';
export { parsePdfFromUrl } from './parse';
export { indexDocument } from './embed';
```

---

### `src/features/estimate-extraction-pipeline/extraction/index.ts`
**Action:** Modify

#### Before
```ts
export interface ExtractWorkItemsOutput {
  workItems: ExtractedWorkItem[];
}
...
  const workItems = extraction.items.map((item) => resolveWorkItem(item, chunkMap));
  return { workItems };
}
```

#### After
```ts
export interface ExtractWorkItemsOutput {
  workItems: ExtractedWorkItem[];
  chunks: DocumentChunkRecord[];
}
...
  const workItems = extraction.items.map((item) => resolveWorkItem(item, chunkMap));
  return { workItems, chunks: [...chunkMap.values()] };
}
```

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
import { parsePdfFromUrl, parsedDocumentSchema } from './document';

...

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

const classifyStep = createStep({
  id: 'classify',
  inputSchema: extractStep.outputSchema,
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    lines: z.array(pendingLineSchema),
  }),
  execute: async ({ inputData }) => {
    const { lines } = classifyLines(inputData.workItems);
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines,
    };
  },
});

const priceStep = createStep({
  id: 'price',
  inputSchema: classifyStep.outputSchema,
  outputSchema: z.object({
    lines: z.array(billableLineSchema),
    prices: z.array(pricedLineItemSchema),
  }),
  execute: async ({ inputData }) =>
    priceLines({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines: inputData.lines,
    }),
});
```

#### After
```ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractWorkItems, extractedWorkItemSchema } from './extraction';
import { classifyLines, billableLineSchema, pendingLineSchema } from './classification';
import { priceLines, pricedLineItemSchema } from './pricing';
import { parsePdfFromUrl, parsedDocumentSchema, documentChunkRecordSchema } from './document';

...

const extractStep = createStep({
  id: 'extract',
  inputSchema: parseDocumentStep.outputSchema,
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    workItems: z.array(extractedWorkItemSchema),
    parsedDocument: parsedDocumentSchema,
    chunks: z.array(documentChunkRecordSchema),
  }),
  retries: 2,
  execute: async ({ inputData }) => {
    const { workItems, chunks } = await extractWorkItems({
      estimateRequestId: inputData.estimateRequestId,
      fileUrl: inputData.fileUrl,
      parsedDocument: inputData.parsedDocument,
    });
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      workItems,
      parsedDocument: inputData.parsedDocument,
      chunks,
    };
  },
});

const classifyStep = createStep({
  id: 'classify',
  inputSchema: extractStep.outputSchema,
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    lines: z.array(pendingLineSchema),
    parsedDocument: parsedDocumentSchema,
    chunks: z.array(documentChunkRecordSchema),
  }),
  execute: async ({ inputData }) => {
    const { lines } = classifyLines(inputData.workItems);
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines,
      parsedDocument: inputData.parsedDocument,
      chunks: inputData.chunks,
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
    chunks: z.array(documentChunkRecordSchema),
  }),
  execute: async ({ inputData }) => {
    const priced = await priceLines({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines: inputData.lines,
    });
    return { ...priced, parsedDocument: inputData.parsedDocument, chunks: inputData.chunks };
  },
});
```

---

### `src/features/estimate/lib/envelope.ts`
**Action:** Modify

#### Before
```ts
import { z } from 'zod';
import { billableLineSchema, type BillableLine } from '@/features/estimate-extraction-pipeline/classification';
import { pricedLineItemSchema, type PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';
...
export const summaryEnvelopeV3Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_3),
  lines: z.array(billableLineSchema),
  prices: z.array(pricedLineItemSchema),
});

export type SummaryEnvelopeV3 = z.infer<typeof summaryEnvelopeV3Schema>;
...
export type ParsedEnvelope =
  | { kind: 'v1'; items: LegacyBillableItem[]; prices: [] }
  | { kind: 'v2'; items: LegacyBillableItem[]; prices: PricedLineItem[] }
  | { kind: 'v3'; lines: BillableLine[]; prices: PricedLineItem[] }
  | { kind: 'unparseable'; raw: string }
  | { kind: 'absent' };

export function parseSummaryEnvelope(summary: string | null): ParsedEnvelope {
  ...
  const v3 = summaryEnvelopeV3Schema.safeParse(json);
  if (v3.success) return { kind: 'v3', lines: v3.data.lines, prices: v3.data.prices };
  ...
```

#### After
```ts
import { z } from 'zod';
import { billableLineSchema, type BillableLine } from '@/features/estimate-extraction-pipeline/classification';
import { pricedLineItemSchema, type PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';
import {
  parsedDocumentSchema,
  documentChunkRecordSchema,
  type ParsedDocument,
  type DocumentChunkRecord,
} from '@/features/estimate-extraction-pipeline/document';
...
export const summaryEnvelopeV3Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_3),
  lines: z.array(billableLineSchema),
  prices: z.array(pricedLineItemSchema),
  /**
   * `.default()`, not required — rows persisted before these fields
   * existed have no such keys at all. Without a default, every existing
   * v3 row would fail to parse (falling through to 'unparseable') the
   * moment this ships.
   */
  parsedDocument: parsedDocumentSchema.default({ pages: [] }),
  chunks: z.array(documentChunkRecordSchema).default([]),
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
      chunks: DocumentChunkRecord[];
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
      chunks: v3.data.chunks,
    };
  }
  ...
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
          chunks: result.result.chunks,
        };
```
(No `??` normalization — both fields are required, non-defaulted, at
every pipeline step; see Existing Pattern Audit.)

---

### `src/features/estimate/components/estimate-report.tsx`
**Action:** Modify

#### Before
```tsx
  const items = envelope.kind === 'v3' ? envelope.lines : envelope.items;
  const prices: PricedLineItem[] = envelope.prices;

  return <ItemsSection items={items} prices={prices} />;
```

#### After
```tsx
  const items = envelope.kind === 'v3' ? envelope.lines : envelope.items;
  const prices: PricedLineItem[] = envelope.prices;
  const parsedDocument = envelope.kind === 'v3' ? envelope.parsedDocument : { pages: [] };
  const chunks = envelope.kind === 'v3' ? envelope.chunks : [];

  return (
    <ItemsSection
      items={items}
      prices={prices}
      parsedDocument={parsedDocument}
      chunks={chunks}
    />
  );
```

---

### `src/features/estimate/components/items-section.tsx`
**Action:** Modify

#### Before
```tsx
import type { LegacyBillableItem } from '@/features/estimate/lib/envelope';
import type { BillableLine } from '@/features/estimate-extraction-pipeline/classification';
import type { PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';

/** v3 lines and legacy v1/v2 items render through the same rows. */
type RenderableItem = LegacyBillableItem | BillableLine;

interface ItemsSectionProps {
  items: RenderableItem[];
  prices: PricedLineItem[];
}

/**
 * Renders the "Billable items" block of the report with two viewer-side
 * toggles:
 *
 *   - "Show source quote" — controls the italic verbatim excerpt from the
 *     inspection report (and its page hint).
 *   - "Show pricing evidence" — controls the confidence badge + source
 *     label + unavailable-reason annotation on each line.
 *
 * Toggle state is intentionally per-render and not persisted. Both toggles
 * default to OFF so the report reads as a clean invoice by default; users
 * can opt into auditable evidence (source quote, pricing rationale) when
 * needed.
 *
 * This is a client component because the toggles need local state; the
 * parent `EstimateReport` stays a server component and just passes the
 * already-parsed envelope contents through.
 */
export function ItemsSection({ items, prices }: ItemsSectionProps) {
  const [showSource, setShowSource] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  ...
  const sourceToggleId = useId();
  const evidenceToggleId = useId();

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Billable Items</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Grouped by Trade. Client Total is Quantity × Unit Price. Labor is
            always measured in Hours.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <label htmlFor={sourceToggleId} className="flex cursor-pointer items-center gap-2">
            <Switch id={sourceToggleId} checked={showSource} onCheckedChange={setShowSource} />
            <span>Show Source Quote</span>
          </label>
          <label htmlFor={evidenceToggleId} className="flex cursor-pointer items-center gap-2">
            <Switch id={evidenceToggleId} checked={showEvidence} onCheckedChange={setShowEvidence} />
            <span>Show Pricing Evidence</span>
          </label>
        </div>
      </div>
      {items.length === 0 ? (
        ...
```

#### After
```tsx
import type { LegacyBillableItem } from '@/features/estimate/lib/envelope';
import type { BillableLine } from '@/features/estimate-extraction-pipeline/classification';
import type { PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';
import type {
  ParsedDocument,
  DocumentChunkRecord,
} from '@/features/estimate-extraction-pipeline/document';

/** v3 lines and legacy v1/v2 items render through the same rows. */
type RenderableItem = LegacyBillableItem | BillableLine;

interface ItemsSectionProps {
  items: RenderableItem[];
  prices: PricedLineItem[];
  parsedDocument: ParsedDocument;
  chunks: DocumentChunkRecord[];
}

/**
 * Renders the "Billable items" block of the report with three viewer-side
 * toggles:
 *
 *   - "Show source quote" — controls the italic verbatim excerpt from the
 *     inspection report (and its page hint).
 *   - "Show pricing evidence" — controls the confidence badge + source
 *     label + unavailable-reason annotation on each line.
 *   - "Show debug JSON" — controls two whole-document raw JSON views: the
 *     page-level parsed document, and the sentence-level indexed chunks
 *     the extraction agent actually read from. Nothing per-line-item.
 *
 * Toggle state is intentionally per-render and not persisted. All three
 * toggles default to OFF so the report reads as a clean invoice by
 * default; users can opt into auditable/debug detail when needed.
 *
 * This is a client component because the toggles need local state; the
 * parent `EstimateReport` stays a server component and just passes the
 * already-parsed envelope contents through.
 */
export function ItemsSection({ items, prices, parsedDocument, chunks }: ItemsSectionProps) {
  const [showSource, setShowSource] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  ...
  const sourceToggleId = useId();
  const evidenceToggleId = useId();
  const debugToggleId = useId();

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Billable Items</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Grouped by Trade. Client Total is Quantity × Unit Price. Labor is
            always measured in Hours.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <label htmlFor={sourceToggleId} className="flex cursor-pointer items-center gap-2">
            <Switch id={sourceToggleId} checked={showSource} onCheckedChange={setShowSource} />
            <span>Show Source Quote</span>
          </label>
          <label htmlFor={evidenceToggleId} className="flex cursor-pointer items-center gap-2">
            <Switch id={evidenceToggleId} checked={showEvidence} onCheckedChange={setShowEvidence} />
            <span>Show Pricing Evidence</span>
          </label>
          <label htmlFor={debugToggleId} className="flex cursor-pointer items-center gap-2">
            <Switch id={debugToggleId} checked={showDebug} onCheckedChange={setShowDebug} />
            <span>Show Debug JSON</span>
          </label>
        </div>
      </div>
      {showDebug ? (
        <div className="mb-4 space-y-3">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Parsed Document (page-level)
            </div>
            <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(parsedDocument, null, 2)}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Indexed Sentence Chunks
            </div>
            <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(chunks, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
      {items.length === 0 ? (
        ...
```

Everything below this point (`TradeGroup`, `ItemRow`, `Totals`) is
UNCHANGED — no `showDebug` prop threading into either, since there is no
per-row debug rendering in this version.

#### Reasoning
- Both blocks render ONCE, above the trade groups — matches what these
  two things actually are: whole-document data, not per-item data.
- Reuses the exact `<pre className="max-h-64 overflow-auto rounded
  bg-muted p-3 text-xs">` convention already established in
  `estimate-report.tsx:163`.
- `TradeGroup`/`ItemRow` untouched — smaller diff than the previous
  (rejected) draft, and correctly reflects that this feature has zero
  per-item component.

## Validation Plan

1. `pnpm exec tsc --noEmit` — clean.
2. `pnpm exec eslint` on all 9 modified files — clean.
3. One-door boundary gate (unchanged grep set) — zero results.
4. `pnpm build` — clean.
5. Live test via `pnpm dev`: run a real estimate, confirm the persisted
   `summary` column's JSON includes real `parsedDocument`/`chunks` data
   (check Postgres directly). Load the report, toggle "Show Debug JSON,"
   confirm both blocks render once, confirm toggling off hides them.
   Load an estimate persisted BEFORE this ships (if one exists) and
   confirm it still renders normally with empty debug blocks — backward
   compatibility actually exercised.

## Risk Notes

- **Envelope size grows** — the page-level parsed document (full PDF
  text) plus the sentence chunk list adds real size to
  `estimate_requests.summary`'s JSON — the parsed document duplicates
  content already implicitly present, and is somewhat larger than the
  chunks alone. Trivial at this app's scale; not something you asked to
  be optimized, just noting it exists.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
