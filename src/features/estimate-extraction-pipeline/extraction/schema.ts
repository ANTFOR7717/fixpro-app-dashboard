import { z } from 'zod';

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

export type Trade = (typeof TRADE)[number];
export type Action = (typeof ACTION)[number];

/**
 * Physical units a MATERIAL extent can be measured in. `hrs` is
 * deliberately absent — hours are not a physical extent, and the model is
 * structurally unable to emit them as one. This is the extraction half of
 * the v3 unit-discipline contract; `classification/schema.ts` holds the
 * other half (a labor line's unit is always the literal `'hrs'`).
 */
export const EXTENT_UNIT = ['ea', 'lf', 'sf', 'cy'] as const;
export type ExtentUnit = (typeof EXTENT_UNIT)[number];

/**
 * The model's output contract: a WORK ITEM — what the inspector found and
 * wants done, with its physical extent. Not a billable line: costType,
 * material/labor splitting, and hours-estimation are downstream concerns
 * (classification and pricing) the model never sees.
 */
export const extractedWorkItemSchema = z.object({
  /** Stable per-run id, e.g. "item-001". classification re-derives content-addressed ids. */
  id: z.string(),
  trade: z.enum(TRADE),
  action: z.enum(ACTION),
  /** Short, specific noun phrase naming what is acted on. */
  scope: z.string().min(1),
  /** Verbatim location language from the report. */
  location: z.string().min(1),
  /**
   * Physical extent of the work: how much of the thing there is, in the
   * unit that kind of material is sold/measured in. When the report gives
   * no measurement for a discrete component, `{ quantity: 1, unit: 'ea' }`.
   */
  extent: z.object({
    quantity: z.number().int().min(1),
    unit: z.enum(EXTENT_UNIT),
  }),
  /**
   * Hours ONLY when the inspector explicitly stated them. Null otherwise —
   * pricing estimates missing hours downstream. Never invented.
   */
  inspectorHours: z.number().positive().nullable(),
  /** Verbatim excerpt from the report that anchors this item. */
  sourceQuote: z.string().min(8).max(500),
  /** Page hint, strict "p. 14" format. Null when the source shows none. */
  pageHint: z
    .string()
    .regex(/^p\.\s*\d+$/)
    .nullable(),
});

export type ExtractedWorkItem = z.infer<typeof extractedWorkItemSchema>;

export const workItemExtractionSchema = z.object({
  items: z.array(extractedWorkItemSchema),
});

export type WorkItemExtraction = z.infer<typeof workItemExtractionSchema>;
