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
 * One sentence the extraction agent judged MEANINGFUL while reading the
 * report — one a billable finding can be inferred from. NOT a mechanical,
 * exhaustive inventory of every sentence in the document — only what the
 * model itself selected as it reasoned over the source. Every
 * `RawFinding.sourceSentenceId` must reference one of these by id.
 */
export const meaningfulSentenceSchema = z.object({
  /** Stable per-run id, e.g. "p14-1" (page 14, first meaningful sentence found on it). */
  id: z.string().min(1),
  pageNumber: z.number().int().min(1),
  /** Verbatim sentence text, copied exactly from the source page. */
  text: z.string().min(1),
  /** One-line explanation of why this sentence is meaningful. */
  reasoning: z.string().min(1),
});

export type MeaningfulSentence = z.infer<typeof meaningfulSentenceSchema>;

/**
 * PUBLIC shape — what extraction hands to classification. Facts actually
 * stated in the text ONLY: no trade, no unit, no material/labor judgment
 * — those require domain-taxonomy knowledge, not text extraction, and are
 * classification's job. `sourceQuote`/`pageHint` are computed from the
 * sentence the model cited (see `rawFindingSchema` below), not model-typed
 * independently.
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
  sourceQuote: z.string().min(8).max(500),
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
});

export type ExtractedFinding = z.infer<typeof extractedFindingSchema>;

/**
 * MODEL-FACING shape. `sourceSentenceId` replaces `sourceQuote`/`pageHint`
 * — the model cites the id of one of ITS OWN entries in this same
 * response's `sentences` array; `extraction/index.ts` resolves the
 * citation into the public shape's verbatim quote and page number
 * deterministically. Removes "the model retyped a quote that doesn't
 * match its own citation" as a possible failure mode.
 */
export const rawFindingSchema = z.object({
  id: z.string(),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  statedQuantity: z.number().int().min(1).nullable(),
  inspectorHours: z.number().positive().nullable(),
  /** Id of the entry in this same response's "sentences" array that anchors this finding. */
  sourceSentenceId: z.string().min(1),
});

export type RawFinding = z.infer<typeof rawFindingSchema>;

export const extractionOutputSchema = z.object({
  /** Every sentence the model judged meaningful while reading the report. */
  sentences: z.array(meaningfulSentenceSchema),
  findings: z.array(rawFindingSchema),
});

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

/**
 * Extraction's fully-resolved output — same shape as `extractionOutputSchema`
 * except `findings` is the PUBLIC (citation-resolved) shape, not the raw
 * model-facing one. This is `resolveFindingsStep`'s output shape (see
 * extraction/steps.ts), named here because it's read back via
 * `getStepResult()` at three separate points in `pipeline.ts` — an
 * earlier draft of this plan declared this exact shape as an anonymous
 * inline `z.object()` at the one place it's PRODUCED, with the three
 * places that CONSUME it relying on it staying in sync by hand rather
 * than by referencing a shared type.
 */
export const resolvedExtractionSchema = z.object({
  sentences: z.array(meaningfulSentenceSchema),
  findings: z.array(extractedFindingSchema),
});

export type ResolvedExtraction = z.infer<typeof resolvedExtractionSchema>;
