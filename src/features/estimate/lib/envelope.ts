import { z } from 'zod';
import {
  webSearchFlagSchema,
  type WebSearchFlag,
} from '@/features/estimate-extraction-pipeline/classification';
import { pricedLineSchema, type PricedLine } from '@/features/estimate-extraction-pipeline/pricing';
import {
  parsedDocumentSchema,
  type ParsedDocument,
} from '@/features/estimate-extraction-pipeline/document';

export const SUMMARY_ENVELOPE_KIND = 'billable-extraction' as const;

export const SUMMARY_ENVELOPE_VERSION_3 = 3 as const;

/**
 * v3: one `lines` array, each entry a `PricedLine` (a `BillableLine`
 * merged with its own price — FR-011). No separate `prices` array —
 * the natural paired shape already existed at `pricing/price-line.ts`'s
 * own step output; this schema stops splitting it apart. Modified in
 * place (still version 3, no new version literal): an estimate persisted
 * under the OLD split `lines`/`prices` v3 shape is explicitly NOT
 * required to keep parsing — it falls through to `'unparseable'` and is
 * recovered via the existing retry flow (resolved Clarification,
 * specs/007-pipeline-schema-cleanup).
 *
 * v1/v2 legacy support (the flat pre-pricing and flat-with-prices
 * shapes, and their own schemas) is deleted entirely — explicit user
 * direction: legacy compatibility is itself unrequested complexity, not
 * something to preserve or build rendering paths around (revised FR-003).
 * An estimate persisted under the old v1/v2 shape now falls through to
 * `'unparseable'`, the same recovery path already accepted for
 * old-shape v3 rows.
 */
export const summaryEnvelopeV3Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_3),
  lines: z.array(pricedLineSchema),
  /**
   * `.default()`, not required — rows persisted before these fields
   * existed have no such keys at all. Without a default, every existing
   * v3 row would fail to parse (falling through to 'unparseable') the
   * moment this ships.
   */
  parsedDocument: parsedDocumentSchema.default({ pages: [] }),
  /**
   * Findings whose material quantity, labor hours, or trade could not
   * be grounded this pass (classification's `flagged_for_web_search`
   * contract — see classification/schema.ts). `.default([])` for the
   * same reason as `parsedDocument` above: no existing v3 row has this
   * key. Not yet rendered anywhere in the UI (out of scope for the
   * classification rebuild that introduced this field) — persisted here
   * only so it is never silently dropped at the persistence boundary.
   */
  flaggedForWebSearch: z.array(webSearchFlagSchema).default([]),
});

export type SummaryEnvelopeV3 = z.infer<typeof summaryEnvelopeV3Schema>;

/**
 * Discriminated result of parsing `estimate_requests.summary`. The page
 * hands this directly to <EstimateReport /> so the report component never
 * touches JSON or Zod.
 *
 * - 'v3': current production shape. One `lines` array of merged priced
 *   lines, per specs/007-pipeline-schema-cleanup.
 * - 'unparseable': `summary` is a non-null string we couldn't parse as
 *   JSON, or it parsed but didn't match the v3 schema. Also what an
 *   estimate persisted under the OLD (pre-cleanup) split-array v3 shape,
 *   or under the now-deleted v1/v2 legacy shapes, falls through to —
 *   recovered via the existing retry flow, not by preserving those old
 *   shapes' parseability.
 * - 'absent': `summary` is null. The estimate has not produced a summary
 *   yet (or is still processing).
 */
export type ParsedEnvelope =
  | {
      kind: 'v3';
      lines: PricedLine[];
      parsedDocument: ParsedDocument;
      flaggedForWebSearch: WebSearchFlag[];
    }
  | { kind: 'unparseable'; raw: string }
  | { kind: 'absent' };

export function parseSummaryEnvelope(summary: string | null): ParsedEnvelope {
  if (summary === null) return { kind: 'absent' };

  let json: unknown;
  try {
    json = JSON.parse(summary);
  } catch {
    return { kind: 'unparseable', raw: summary };
  }

  const v3 = summaryEnvelopeV3Schema.safeParse(json);
  if (v3.success) {
    return {
      kind: 'v3',
      lines: v3.data.lines,
      parsedDocument: v3.data.parsedDocument,
      flaggedForWebSearch: v3.data.flaggedForWebSearch,
    };
  }

  return { kind: 'unparseable', raw: summary };
}
