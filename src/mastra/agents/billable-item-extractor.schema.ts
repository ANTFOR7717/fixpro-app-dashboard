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
   * Required count, derived from the inspector's wording:
   *   - Specific digit ("3 shingles") or written-out number ("two outlets")
   *     -> that number.
   *   - "both" -> 2.
   *   - "all" / "every" / "each" / "the remaining" -> 1 (the full set; the
   *     contractor prices the whole assembly).
   *   - Inspector says "install a GFCI receptacle" with no count word ->
   *     1. A single defective item is still a billable line item, and the
   *     count is implicitly 1.
   * Better to overbill than underbill: if a count is unclear, prefer the
   * higher defensible reading from the report. NEVER drop an item because
   * the count is fuzzy. NEVER return null. NEVER invent a count that the
   * report does not support.
   */
  quantity: z.number().int().min(1),

  /**
   * Verbatim excerpt from the report that anchors this item. Required for
   * auditability — without this, the item is fabricated.
   *
   * Tightened in the accurate-extraction pass: must be at least 8 chars (a
   * single common word like "replace" cannot anchor an item) and at most 500
   * chars (anything longer is the model dumping whole paragraphs instead of
   * the specific sentence). The model is also told to prefer the shortest
   * verbatim excerpt that still names the defect and the action.
   */
  sourceQuote: z.string().min(8).max(500),

  /**
   * Page hint, e.g. "p. 14". Tightened to a strict format: literal "p.",
   * optional whitespace, then digits. Anything that doesn't match (free
   * prose, "page 14 of 32", "see above", etc.) must be null. The model is
   * told NEVER to guess — if the source text doesn't show a page number,
   * return null rather than inferring from layout.
   */
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
});

export type BillableItem = z.infer<typeof billableItemSchema>;

export const billableExtractionSchema = z.object({
  items: z.array(billableItemSchema),
});

export type BillableExtraction = z.infer<typeof billableExtractionSchema>;

/**
 * Versioned envelope written to `estimate_requests.summary`. The downstream
 * reader detects the version and renders accordingly.
 *
 * - v1: items only. Produced by the workflow before the pricing step landed.
 *   Rows on disk created before this branch stay v1 forever.
 * - v2: items + prices. Produced once the `price-items` step is in the
 *   workflow. The report renders quantity × unitPrice = lineTotal and a
 *   subtotal.
 */
export const SUMMARY_ENVELOPE_KIND = 'billable-extraction' as const;
export const SUMMARY_ENVELOPE_VERSION = 1 as const;
export const SUMMARY_ENVELOPE_VERSION_2 = 2 as const;

export const summaryEnvelopeSchema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION),
  items: z.array(billableItemSchema),
});

export type SummaryEnvelope = z.infer<typeof summaryEnvelopeSchema>;

/**
 * Per-item priced line item, emitted by the pricer agent. `unitPrice: null`
 * is the honest signal that the agent could not defend a number from its
 * sources; the report renders "Price unavailable" in that case.
 */
export const pricedLineItemSchema = z.object({
  /** Matches the `BillableItem.id` this price corresponds to ("item-001"). */
  itemId: z.string().min(1),
  /** Whole USD dollars. `null` means no defensible price. */
  unitPrice: z.number().int().min(0).nullable(),
  currency: z.literal('USD'),
  confidence: z.enum(['high', 'medium', 'low']),
  /** Short human label of where the number came from. NEVER a URL. */
  source: z.string().min(1).max(120),
  /** Populated when `unitPrice` is null. One-sentence reason. */
  unavailableReason: z.string().min(1).max(280).nullable(),
});

export type PricedLineItem = z.infer<typeof pricedLineItemSchema>;

export const summaryEnvelopeV2Schema = z.object({
  kind: z.literal(SUMMARY_ENVELOPE_KIND),
  version: z.literal(SUMMARY_ENVELOPE_VERSION_2),
  items: z.array(billableItemSchema),
  prices: z.array(pricedLineItemSchema),
});

export type SummaryEnvelopeV2 = z.infer<typeof summaryEnvelopeV2Schema>;
