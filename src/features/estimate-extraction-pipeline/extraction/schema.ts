import { z } from 'zod';

/**
 * What kind of work this finding represents. "repair" (something is
 * broken), "maintenance" (preventive upkeep, e.g. "should have consistent
 * stain protectant"), "inspect" (a referral for further professional
 * evaluation, not itself billable work), "construction" (new-build/major
 * work). Determined by the agent from the report's own language.
 */
export const FINDING_STATUS = ['repair', 'maintenance', 'inspect', 'construction'] as const;
export type FindingStatus = (typeof FINDING_STATUS)[number];

/**
 * PUBLIC shape — what extraction hands to classification, and also the
 * agent's own structured-output schema directly (see
 * `extractionOutputSchema` below). `scope` now names the literal
 * material/labor directly — no trade or unit determination still belongs
 * to classification, but the material/labor identity itself is
 * extraction's job now, not a later determination.
 */
export const extractedFindingSchema = z.object({
  id: z
    .string()
    .describe(
      "Locally-unique identifier for this finding within this page's call (e.g. 'finding-1') — reassigned globally after all pages are combined.",
    ),
  scope: z
    .string()
    .min(1)
    .describe('The literal material and/or labor this finding concerns — name the actual material or labor type directly, not a generic noun phrase.'),
  location: z
    .string()
    .min(1)
    .describe(
      'The actual location on the home this finding concerns. Use the report\'s verbatim location language when stated; semantically understood/normalized when the report implies a location without stating it plainly.',
    ),
  descriptionQuote: z
    .string()
    .min(1)
    .describe(
      "The finding's description. Use the report's own verbatim sentence when one exists on this page. A finding's title and its descriptive sentence can appear on different pages (verified this session) — when no real description is available on this page, it may be semantically derived from what IS available rather than left blank.",
    ),
  recommendation: z
    .string()
    .min(1)
    .describe(
      "The recommended action. Use the report's own stated recommendation, verbatim, when it states one (e.g. 'Recommend: siding is refastened and/or repaired'). When the report doesn't state one, derive a reasonable recommendation semantically from context — always return a value.",
    ),
  status: z
    .enum(FINDING_STATUS)
    .describe(
      "'repair' (something is broken), 'maintenance' (preventive upkeep), 'inspect' (referral to a specialist for further evaluation, not itself billable), 'construction' (new-build/major work). Use the report's own explicit language when present; otherwise derive semantically from context — always exactly one of the four.",
    ),
  page: z
    .number()
    .int()
    .min(1)
    .describe(
      "The exact page number at the top of this call's own prompt — must be returned exactly as given, never guessed or inferred.",
    ),
});

export type ExtractedFinding = z.infer<typeof extractedFindingSchema>;

export const extractionOutputSchema = z.object({
  findings: z.array(extractedFindingSchema),
});

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
