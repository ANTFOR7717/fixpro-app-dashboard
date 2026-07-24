import { z } from 'zod';
import { pricedLineSchema, type PricedLine } from '@/features/estimate-extraction-pipeline/presentation';

export const SUMMARY_ENVELOPE_KIND = 'billable-extraction' as const;

export const SUMMARY_ENVELOPE_VERSION_4 = 4 as const;

/**
 * v4: one `lines` array, each entry a `PricedLine` — a presented,
 * client-facing billable line (`itemName`/`category` from
 * `presentation/`) with markup pricing applied (`builderCost`/
 * `markupAmount`/`clientTotal`). Supersedes v3 (`EnrichedLine` only —
 * no itemName/category/pricing) now that `presentation/` produces this
 * richer shape. An estimate persisted under the OLD v3 shape is
 * explicitly NOT required to keep parsing — it falls through to
 * `'unparseable'` and is recovered via the existing retry flow, same
 * precedent as the earlier v1/v2 → v3 migration.
 */
export const summaryEnvelopeV4Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_4),
  lines: z.array(pricedLineSchema),
});

export type SummaryEnvelopeV4 = z.infer<typeof summaryEnvelopeV4Schema>;

/**
 * Discriminated result of parsing `estimate_requests.summary`. The page
 * hands this directly to <EstimateReport /> so the report component never
 * touches JSON or Zod.
 *
 * - 'v4': current production shape.
 * - 'unparseable': `summary` is a non-null string we couldn't parse as
 *   JSON, or it parsed but didn't match the v4 schema. Also what an
 *   estimate persisted under an OLDER v3 shape falls through to —
 *   recovered via the existing retry flow.
 * - 'absent': `summary` is null. The estimate has not produced a summary
 *   yet (or is still processing).
 */
export type ParsedEnvelope =
  | { kind: 'v4'; lines: PricedLine[] }
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

  const v4 = summaryEnvelopeV4Schema.safeParse(json);
  if (v4.success) {
    return { kind: 'v4', lines: v4.data.lines };
  }

  return { kind: 'unparseable', raw: summary };
}
