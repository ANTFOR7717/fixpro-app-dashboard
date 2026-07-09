import { z } from 'zod';
import { billableLineSchema, type BillableLine } from '@/features/estimate-extraction-pipeline/classification';
import { pricedLineItemSchema, type PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';

/**
 * LEGACY (v1/v2) flat item shape, kept ONLY so rows persisted before this
 * refactor keep parsing and rendering. The v3 pipeline never produces this
 * shape — `BillableLine` (imported above) is what it produces.
 */
const LEGACY_UNIT = ['ea', 'lf', 'sf', 'sqft', 'cy', 'hrs'] as const;
const LEGACY_COST_TYPE = ['labor', 'material'] as const;

export const legacyBillableItemSchema = z.object({
  id: z.string(),
  trade: z.string(),
  action: z.string(),
  scope: z.string().min(1),
  location: z.string().min(1),
  quantity: z.number().int().min(1),
  unit: z.enum(LEGACY_UNIT),
  costType: z.enum(LEGACY_COST_TYPE),
  sourceQuote: z.string().min(8).max(500),
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
});

export type LegacyBillableItem = z.infer<typeof legacyBillableItemSchema>;

export const SUMMARY_ENVELOPE_KIND = 'billable-extraction' as const;

const summaryEnvelopeV1Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(1),
  items: z.array(legacyBillableItemSchema),
});

const summaryEnvelopeV2Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(2),
  items: z.array(legacyBillableItemSchema),
  prices: z.array(pricedLineItemSchema),
});

export const SUMMARY_ENVELOPE_VERSION_3 = 3 as const;

/**
 * v3: discriminated lines + prices. For a labor line, `unitPrice` on the
 * matching price is the HOURLY RATE; the report's quantity × unitPrice
 * arithmetic is hours × rate, per the v3 prototype.
 */
export const summaryEnvelopeV3Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_3),
  lines: z.array(billableLineSchema),
  prices: z.array(pricedLineItemSchema),
});

export type SummaryEnvelopeV3 = z.infer<typeof summaryEnvelopeV3Schema>;

/**
 * Discriminated result of parsing `estimate_requests.summary`. The page
 * hands this directly to <EstimateReport /> so the report component never
 * touches JSON or Zod.
 *
 * - 'v1': rows produced before the pricing branch landed. Items only.
 * - 'v2': legacy production shape. Items + prices, flat costType/unit.
 * - 'v3': current production shape. Discriminated material/labor lines +
 *   prices, per the v3 prototype's unit discipline.
 * - 'unparseable': `summary` is a non-null string we couldn't parse as
 *   JSON, or it parsed but didn't match any known schema.
 * - 'absent': `summary` is null. The estimate has not produced a summary
 *   yet (or is still processing).
 */
export type ParsedEnvelope =
  | { kind: 'v1'; items: LegacyBillableItem[]; prices: [] }
  | { kind: 'v2'; items: LegacyBillableItem[]; prices: PricedLineItem[] }
  | { kind: 'v3'; lines: BillableLine[]; prices: PricedLineItem[] }
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
  if (v3.success) return { kind: 'v3', lines: v3.data.lines, prices: v3.data.prices };

  const v2 = summaryEnvelopeV2Schema.safeParse(json);
  if (v2.success) return { kind: 'v2', items: v2.data.items, prices: v2.data.prices };

  const v1 = summaryEnvelopeV1Schema.safeParse(json);
  if (v1.success) return { kind: 'v1', items: v1.data.items, prices: [] };

  return { kind: 'unparseable', raw: summary };
}
