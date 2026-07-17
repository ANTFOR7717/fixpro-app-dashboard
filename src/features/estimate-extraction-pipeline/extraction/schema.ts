import { z } from 'zod';

export const ACTION = [
  'repair',
  'replace',
  'install',
  'remove',
  'service',
  'evaluate',
] as const;

export type Action = (typeof ACTION)[number];

/**
 * PUBLIC shape — what extraction hands to classification, and also the
 * agent's own structured-output schema directly (see
 * `extractionOutputSchema` below). Facts actually stated in the text
 * ONLY: no trade, no unit, no material/labor judgment — those require
 * domain-taxonomy knowledge, not text extraction, and are classification's
 * job. `sourceQuote` is populated by the agent directly, in the same
 * response as every other field.
 */
export const extractedFindingSchema = z.object({
  /** Stable per-run id, e.g. "finding-001". */
  id: z.string(),
  action: z.enum(ACTION),
  /** Short, specific noun phrase naming what is acted on. */
  scope: z.string().min(1),
  /** Verbatim location language from the report. */
  location: z.string().min(1),
  /**
   * Literal count ONLY when the text states one (a digit, a written-out
   * number, or "both" -> 2). Null in every other case — including
   * open-ended language like "all"/"every"/"remaining", since deciding
   * how that bills (e.g. "1 = the whole job") is a classification
   * convention, not a fact extraction observed. Never a default.
   */
  statedQuantity: z.number().int().min(1).nullable(),
  /**
   * Hours ONLY when the inspector explicitly stated them. Null otherwise —
   * classification/pricing estimate missing hours downstream. Never invented.
   */
  inspectorHours: z.number().positive().nullable(),
  sourceQuote: z.string().min(1),
});

export type ExtractedFinding = z.infer<typeof extractedFindingSchema>;

export const extractionOutputSchema = z.object({
  findings: z.array(extractedFindingSchema),
});

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
