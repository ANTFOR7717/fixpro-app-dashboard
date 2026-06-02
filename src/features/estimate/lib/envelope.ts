import {
  summaryEnvelopeSchema,
  summaryEnvelopeV2Schema,
  type SummaryEnvelope,
  type SummaryEnvelopeV2,
} from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Discriminated result of parsing `estimate_requests.summary`. The page
 * hands this directly to <EstimateReport /> so the report component never
 * touches JSON or Zod.
 *
 * - 'v1': rows produced before the pricing branch landed. The report
 *   renders items but every row shows "Price unavailable".
 * - 'v2': current production shape. Items + prices.
 * - 'unparseable': `summary` is a non-null string we couldn't parse as
 *   JSON, or it parsed but didn't match either Zod schema. The report
 *   renders an explicit "summary unavailable" panel and the raw text as
 *   a debug-only fallback.
 * - 'absent': `summary` is null. The estimate has not produced a summary
 *   yet (or is still processing). The report renders a placeholder.
 */
export type ParsedEnvelope =
  | { kind: 'v1'; envelope: SummaryEnvelope }
  | { kind: 'v2'; envelope: SummaryEnvelopeV2 }
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

  const v2 = summaryEnvelopeV2Schema.safeParse(json);
  if (v2.success) return { kind: 'v2', envelope: v2.data };

  const v1 = summaryEnvelopeSchema.safeParse(json);
  if (v1.success) return { kind: 'v1', envelope: v1.data };

  return { kind: 'unparseable', raw: summary };
}
