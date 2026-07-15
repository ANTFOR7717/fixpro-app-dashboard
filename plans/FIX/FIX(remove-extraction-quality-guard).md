# FIX(remove-extraction-quality-guard)

## Request

Remove `ExtractionQualityGuard` entirely. It is not useful and must not
affect any item passing through extraction — no retry loop, no blocking,
no flagging. This also removes `needsReview` end-to-end (schema field,
data flow, and the UI badge), since `needsReview` has no purpose once
nothing ever sets it. The UI badge was implemented without being called
out to the user as its own explicit decision — a real process failure —
and is being removed along with the guard that produced it.

**Scope, explicitly:** delete the guard and the judge agent that backs
it; strip `needsReview` from every schema/data-flow point it touches;
remove the UI badge. Do NOT touch `extractionConsistencyScorer`
(`extraction/scorer.ts`) — it is a separate Mastra primitive
(`createScorer`, a background eval) that never blocks, retries, or
mutates an item; it only produces an observability score after the fact.
It was never part of "the guard" and the user's instruction ("don't even
consider affecting an item going through it") does not apply to something
that already never affects items.

## Directory Map

```text
src/features/estimate-extraction-pipeline/
├── index.ts                        [MODIFY] drop extractionQualityJudgeAgent registration
├── pipeline.ts                     [MODIFY] drop needsReview normalization (2 spots)
├── extraction/
│   ├── agent.ts                    [MODIFY] drop outputProcessors/maxProcessorRetries
│   ├── index.ts                    [MODIFY] drop judge re-export, resolveWorkItem's needsReview
│   ├── schema.ts                   [MODIFY] drop needsReview from both schemas
│   ├── quality-guard.ts            [DELETE]
│   └── quality-guard-agent.ts      [DELETE]
├── classification/
│   ├── schema.ts                   [MODIFY] drop needsReview from itemIdentityFields
│   └── index.ts                    [MODIFY] drop needsReview from the common object
└── pricing/
    └── index.ts                    [MODIFY] drop needsReview normalization

src/features/estimate/
├── lib/workflow.ts                 [MODIFY] drop needsReview normalization
└── components/items-section.tsx    [MODIFY] remove the "Needs Review" badge block

AGENTS.md                           [MODIFY] drop quality-guard/quality-guard-agent from extraction/'s boundary grep
```

## Modification Table

| File | Action | Why |
|---|---|---|
| `extraction/quality-guard.ts` | Delete | The guard itself. |
| `extraction/quality-guard-agent.ts` | Delete | Its only consumer (`quality-guard.ts`) is being deleted; nothing else uses it. |
| `extraction/agent.ts` | Modify | Remove `outputProcessors: [new ExtractionQualityGuard()]` and `maxProcessorRetries` — the agent's `.generate()` call becomes plain single-pass structured output with no post-processing gate. |
| `extraction/index.ts` | Modify | Remove the `extractionQualityJudgeAgent` import/re-export (dead once the file is deleted); `resolveWorkItem` stops setting `needsReview`. |
| `extraction/schema.ts` | Modify | Remove `needsReview` from `extractedWorkItemSchema` and `rawWorkItemSchema`, and the `flagUnresolvedViolations`-referencing doc comments. |
| `classification/schema.ts` | Modify | Remove `needsReview` from `itemIdentityFields` (shared by `materialLineSchema`/`laborLineSchema`) and its doc comment. |
| `classification/index.ts` | Modify | Remove `needsReview: it.needsReview` from the `common` object `classifyLines` builds per line. |
| `pricing/index.ts` | Modify | Remove the needsReview-normalization `.map()` — `priceLines` returns `result.result.map((r) => r.line)` directly. |
| `pipeline.ts` | Modify | Remove needsReview normalization in `classifyStep` and `priceStep` — both become direct passthroughs of `inputData`. |
| `estimate/lib/workflow.ts` | Modify | Remove the needsReview-normalization `.map()` when building the v3 envelope — `lines: result.result.lines` directly. |
| `estimate/components/items-section.tsx` | Modify | Remove the `needsReview` badge block from `ItemRow`. |
| `estimate-extraction-pipeline/index.ts` | Modify | Remove `extractionQualityJudgeAgent` from the Mastra instance's `agents` registration and its import. |
| `AGENTS.md` | Modify | Boundary grep for `extraction/` lists `quality-guard` and `quality-guard-agent` as internal filenames — both are gone. |

## Existing Pattern Audit

- **Why `needsReview` must go everywhere, not just the UI**: it was
  introduced solely to carry `ExtractionQualityGuard`'s
  retry-exhaustion flag from extraction through classification and
  pricing to the report. With the guard deleted, nothing ever sets it to
  `true` again — leaving the field in place would mean every schema
  keeps a dead, permanently-`false` field, which is exactly the kind of
  leftover scaffolding that shouldn't survive the thing it existed for.
  Confirmed via `grep`: it touches exactly 9 files, all listed above,
  nothing missed.
- **`extractedWorkItemSchema.needsReview` currently has `.default(false)`**
  specifically because `classification/schema.ts`'s comment explains old
  persisted v3 envelope rows might lack the key — but since we're
  REMOVING the field (not adding a new required one), this concern
  doesn't apply in reverse: Zod's default object schemas silently ignore
  unknown keys unless `.strict()` is used. Confirmed via `grep` that
  neither `billableLineSchema`/`materialLineSchema`/`laborLineSchema` nor
  `envelope.ts` use `.strict()` — old persisted rows that happen to have a
  `needsReview` key will simply have it ignored on re-parse. Non-breaking.
- **`extractionConsistencyScorer` is explicitly out of scope** (see
  Request) — confirmed by reading `extraction/scorer.ts` in full this
  session: it's a `createScorer`-based background eval with no
  `outputProcessors`/`abort`/retry mechanism, never in the request path
  that produces the final item list. It was never "the guard."
- **`resolveWorkItem`'s `chunk?.text ?? '(unresolved citation)'` fallback
  stays** — that's unrelated to the guard; it's defensive handling for a
  citation that fails to resolve to a real chunk, independent of any
  quality-judgment mechanism. Only the `needsReview` key it used to also
  set is removed.

## File-by-File Changes

### `src/features/estimate-extraction-pipeline/extraction/quality-guard.ts`
**Action:** Delete

### `src/features/estimate-extraction-pipeline/extraction/quality-guard-agent.ts`
**Action:** Delete

---

### `src/features/estimate-extraction-pipeline/extraction/agent.ts`
**Action:** Modify

#### Before
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

#### After
```ts
import { Agent } from '@mastra/core/agent';
import { kiloGateway } from '../shared/gateway';
import { extractionConsistencyScorer } from './scorer';

export const billableItemExtractorAgent = new Agent({
  id: 'billable-item-extractor',
  name: 'Billable Item Extractor',
  instructions: `
...
`,
  model: kiloGateway('openai/gpt-5.4-mini'),
  scorers: {
    consistency: {
      scorer: extractionConsistencyScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
});
```
(Instructions text unchanged — it never referenced `needsReview` or the
guard.)

---

### `src/features/estimate-extraction-pipeline/extraction/index.ts`
**Action:** Modify

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
export { billableItemExtractorAgent, extractionConsistencyScorer, extractionQualityJudgeAgent };
...

function resolveWorkItem(
  item: RawWorkItem,
  chunkMap: Map<string, DocumentChunkRecord>,
): ExtractedWorkItem {
  const chunk = chunkMap.get(item.sourceChunkId);
  return {
    id: item.id,
    trade: item.trade,
    action: item.action,
    scope: item.scope,
    location: item.location,
    extent: item.extent,
    inspectorHours: item.inspectorHours,
    sourceQuote: chunk?.text ?? '(unresolved citation)',
    pageHint: chunk ? `p. ${chunk.pageNumber}` : null,
    needsReview: item.needsReview ?? !chunk,
  };
}
```

#### After
```ts
import { RequestContext } from '@mastra/core/request-context';
import { billableItemExtractorAgent } from './agent';
import { extractionConsistencyScorer } from './scorer';
import { workItemExtractionSchema, type ExtractedWorkItem, type RawWorkItem } from './schema';
import {
  indexDocument,
  type ParsedDocument,
  type DocumentChunkRecord,
} from '../document';

...
export { billableItemExtractorAgent, extractionConsistencyScorer };
...

function resolveWorkItem(
  item: RawWorkItem,
  chunkMap: Map<string, DocumentChunkRecord>,
): ExtractedWorkItem {
  const chunk = chunkMap.get(item.sourceChunkId);
  return {
    id: item.id,
    trade: item.trade,
    action: item.action,
    scope: item.scope,
    location: item.location,
    extent: item.extent,
    inspectorHours: item.inspectorHours,
    sourceQuote: chunk?.text ?? '(unresolved citation)',
    pageHint: chunk ? `p. ${chunk.pageNumber}` : null,
  };
}
```
Also update the docstring on `formatIndexedSentenceList`'s neighboring
`resolveWorkItem` (currently says "should already have been caught by the
guard's checkChunkReferences and either retried or flagged needsReview")
to remove the now-false claim:
```ts
/**
 * Resolve a raw model item's sourceChunkId into the public shape's
 * verbatim sourceQuote/pageHint. This fallback exists so a citation that
 * fails to resolve degrades to an honest "(unresolved citation)" state
 * instead of throwing and losing every other item in the batch.
 */
```

---

### `src/features/estimate-extraction-pipeline/extraction/schema.ts`
**Action:** Modify

#### Before
```ts
export const extractedWorkItemSchema = z.object({
  ...
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
```ts
export const rawWorkItemSchema = z.object({
  ...
  sourceChunkId: z.string().min(1),
  /**
   * NEVER set by the model — not part of its instructions. Present only
   * so `ExtractionQualityGuard.flagUnresolvedViolations` can inject
   * `true` onto specific items on retry-exhaustion and have it survive
   * Mastra's own re-parse of the patched JSON (an undeclared field would
   * otherwise be silently stripped by Zod's default unknown-key
   * handling). Deliberately `.optional()`, not `.default(false)`: the
   * resolution step in `extraction/index.ts` uses `??` to fall back to a
   * chunk-validity check when this is genuinely absent, which only works
   * if "absent" stays `undefined` rather than being defaulted to `false`.
   */
  needsReview: z.boolean().optional(),
});
```

#### After
```ts
export const extractedWorkItemSchema = z.object({
  ...
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
});
```
```ts
export const rawWorkItemSchema = z.object({
  ...
  sourceChunkId: z.string().min(1),
});
```

---

### `src/features/estimate-extraction-pipeline/classification/schema.ts`
**Action:** Modify

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
  /**
   * Set by ExtractionQualityGuard on retry-exhaustion; see
   * extraction/schema.ts. `.default(false)` is NOT optional polish:
   * `envelope.ts`'s summaryEnvelopeV3Schema re-parses already-persisted
   * rows through this exact schema, and every v3 estimate written before
   * this field existed has no `needsReview` key at all. Without a
   * default, every existing row would fail to parse the moment this
   * ships (parseSummaryEnvelope falling through to 'unparseable').
   */
  needsReview: z.boolean().default(false),
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
} as const;
```

---

### `src/features/estimate-extraction-pipeline/classification/index.ts`
**Action:** Modify

#### Before
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

#### After
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

---

### `src/features/estimate-extraction-pipeline/pricing/index.ts`
**Action:** Modify

#### Before
```ts
  return {
    // needsReview normalization: `result.result`'s type is recomputed by
    // Mastra's own (internally-resolved, currently version-skewed) zod
    // from the internal fan-out step's outputSchema, which treats the
    // `.default(false)` field as optional rather than guaranteed — see
    // the matching note in extraction/index.ts.
    lines: result.result.map((r) => ({ ...r.line, needsReview: r.line.needsReview ?? false })),
    prices: result.result.map((r) => r.price),
  };
```

#### After
```ts
  return {
    lines: result.result.map((r) => r.line),
    prices: result.result.map((r) => r.price),
  };
```

---

### `src/features/estimate-extraction-pipeline/pipeline.ts`
**Action:** Modify (two spots)

#### Before
```ts
  execute: async ({ inputData }) => {
    // needsReview normalization: `inputData`'s type is recomputed by
    // Mastra's own (internally-resolved, currently version-skewed) zod
    // from `extractStep.outputSchema`, which treats the `.default(false)`
    // field as optional rather than guaranteed — see the matching note in
    // extraction/index.ts.
    const workItems = inputData.workItems.map((item) => ({
      ...item,
      needsReview: item.needsReview ?? false,
    }));
    const { lines } = classifyLines(workItems);
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines,
    };
  },
```
```ts
  execute: async ({ inputData }) =>
    priceLines({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      // needsReview normalization — see the matching note above in
      // classifyStep and in extraction/index.ts.
      lines: inputData.lines.map((line) => ({
        ...line,
        needsReview: line.needsReview ?? false,
      })),
    }),
```

#### After
```ts
  execute: async ({ inputData }) => {
    const { lines } = classifyLines(inputData.workItems);
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines,
    };
  },
```
```ts
  execute: async ({ inputData }) =>
    priceLines({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines: inputData.lines,
    }),
```

---

### `src/features/estimate/lib/workflow.ts`
**Action:** Modify

#### Before
```ts
        const envelope: SummaryEnvelopeV3 = {
          kind: SUMMARY_ENVELOPE_KIND,
          version: SUMMARY_ENVELOPE_VERSION_3,
          // needsReview normalization: `result.result`'s type is
          // recomputed by Mastra's own (internally-resolved, currently
          // version-skewed) zod from the workflow's outputSchema, which
          // treats the `.default(false)` field as optional rather than
          // guaranteed — see the matching note in extraction/index.ts.
          lines: result.result.lines.map((line) => ({
            ...line,
            needsReview: line.needsReview ?? false,
          })),
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
        };
```

---

### `src/features/estimate/components/items-section.tsx`
**Action:** Modify

#### Before
```tsx
          <div className="font-medium leading-snug">
            {formatItemTitle(item.scope, item.action, item.costType)}
          </div>
          {'needsReview' in item && item.needsReview ? (
            <Badge variant="destructive">Needs Review</Badge>
          ) : null}
        </div>
```

#### After
```tsx
          <div className="font-medium leading-snug">
            {formatItemTitle(item.scope, item.action, item.costType)}
          </div>
        </div>
```
(The `Badge` import stays — still used for the pricing-confidence badge
lower in the same file.)

---

### `src/features/estimate-extraction-pipeline/index.ts`
**Action:** Modify

#### Before
```ts
import {
  billableItemExtractorAgent,
  extractionConsistencyScorer,
  extractionQualityJudgeAgent,
} from './extraction';
...
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

#### After
```ts
import {
  billableItemExtractorAgent,
  extractionConsistencyScorer,
} from './extraction';
...
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

---

### `AGENTS.md`
**Action:** Modify

#### Before
```
    grep -rn "from '.*\/extraction\/\(schema\|agent\|scorer\|quality-guard\|quality-guard-agent\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/extraction/"
```

#### After
```
    grep -rn "from '.*\/extraction\/\(schema\|agent\|scorer\)'" src --include="*.ts" --include="*.tsx" | grep -v "^$PKG/extraction/"
```

## Validation Plan

1. `pnpm exec tsc --noEmit` — clean. This is the step that will catch any
   missed `needsReview` reference across the 9 files, since removing a
   required schema field will surface as a type error anywhere still
   trying to read/write it.
2. `pnpm exec eslint` on all 11 modified files — clean.
3. One-door boundary gate, all four grep patterns from the updated
   `AGENTS.md` — zero results.
4. `pnpm build` — clean.
5. `grep -rn "needsReview\|ExtractionQualityGuard\|quality-guard" src/`
   — zero results anywhere, confirming complete removal, not a partial
   one.
6. Live test against a real inspection PDF via `pnpm dev` — confirm no
   `extraction-quality-guard` processor step appears in logs at all
   (not just that it doesn't reject anything), confirm the report
   renders with no "Needs Review" badge anywhere, confirm item count in
   the final report matches what the extractor actually emitted (nothing
   silently dropped by a guard that no longer exists).

## Risk Notes

- **No replacement quality check remains** after this — grounding is
  enforced only by the model's own prompt discipline (cite from the
  provided list or omit) with zero verification, and scope-wording/unit
  plausibility have no check at all anymore. This is a deliberate
  simplification per your explicit instruction, not an oversight — noting
  it here so it's an informed tradeoff, not a silent one. If a
  replacement judge pass is wanted later, it should be scoped fresh
  against your 3-step mantra (single pass, not a retry gate) rather than
  resurrecting this guard.

## Approval

`Status: Awaiting explicit user approval. Do not implement yet.`
