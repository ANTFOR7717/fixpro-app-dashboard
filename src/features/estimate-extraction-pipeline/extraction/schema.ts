import { z } from 'zod';

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
  /**
   * A single, specific verb naming what the contractor would DO —
   * derived by the agent from the report's own action language, not
   * constrained to a fixed list. See `extraction/agent.ts`'s
   * instructions for grounding rules.
   */
  action: z.string().min(1),
  /** Short, specific noun phrase naming what is acted on. */
  scope: z.string().min(1),
  /** Verbatim location language from the report. */
  location: z.string().min(1),
  sourceQuote: z.string().min(1),
  /**
   * The report page this finding was found on. Extraction runs one agent
   * call per page (extraction/steps.ts's `extractionFanoutWorkflow`), so
   * this is the exact page number that call's own prompt already stated
   * — the agent copies it, not infers it.
   */
  page: z.number().int().min(1),
});

export type ExtractedFinding = z.infer<typeof extractedFindingSchema>;

export const extractionOutputSchema = z.object({
  findings: z.array(extractedFindingSchema),
});

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
