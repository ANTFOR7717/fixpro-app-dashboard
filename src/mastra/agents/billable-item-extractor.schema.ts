import { z } from 'zod';

/**
 * Schema for billable items extracted from an inspection report.
 *
 * Every field is either (a) something the downstream pricer needs to price the
 * item or (b) something that lets us verify the item is grounded in the report.
 * Nothing else lives here.
 *
 * Deliberately absent:
 *   - any pricing / cost / market-rate field
 *   - severity / priority / confidence / advisory fields
 *   - report meta (inspector, date, property) — the home description is out of scope
 *   - prose / narrative fields
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

export const ACTION = [
  'repair',
  'replace',
  'install',
  'remove',
  'service',
  'evaluate',
] as const;

export const billableItemSchema = z.object({
  /** Stable per-run id, e.g. "item-001". The merge step renumbers these. */
  id: z.string(),

  /** Which trade quotes the work. */
  trade: z.enum(TRADE),

  /** What kind of action a contractor performs. */
  action: z.enum(ACTION),

  /**
   * Short, specific noun phrase identifying what is being acted on.
   * Examples: "kitchen GFCI receptacle", "angle stop under kitchen sink",
   *           "double-tapped breaker #14 in main panel".
   */
  scope: z.string().min(1),

  /** Verbatim location language from the report. */
  location: z.string().min(1),

  /**
   * Quantity only when the inspector states one (e.g. "3 shingles"). Null
   * otherwise — do not invent a quantity.
   */
  quantity: z.number().nullable(),

  /**
   * Verbatim excerpt from the report that anchors this item. Required for
   * auditability — without this, the item is fabricated.
   */
  sourceQuote: z.string().min(1),

  /** e.g. "p. 14" when the page is present in the source text. */
  pageHint: z.string().nullable(),
});

export type BillableItem = z.infer<typeof billableItemSchema>;

export const billableExtractionSchema = z.object({
  items: z.array(billableItemSchema),
});

export type BillableExtraction = z.infer<typeof billableExtractionSchema>;

/**
 * Versioned envelope written to `estimate_requests.summary`. The downstream
 * pricer reads this column, detects the version, and prices each item.
 */
export const SUMMARY_ENVELOPE_KIND = 'billable-extraction' as const;
export const SUMMARY_ENVELOPE_VERSION = 1 as const;

export const summaryEnvelopeSchema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION),
  items: z.array(billableItemSchema),
});

export type SummaryEnvelope = z.infer<typeof summaryEnvelopeSchema>;
