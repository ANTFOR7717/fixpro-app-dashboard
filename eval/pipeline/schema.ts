import { z } from 'zod';
import { ACTION } from '@/features/estimate-extraction-pipeline/extraction';
import { TRADE, EXTENT_UNIT } from '@/features/estimate-extraction-pipeline/classification';

export const expectedFindingSchema = z.object({
  /** Stable, human-chosen anchor — NOT compared against the pipeline's
   *  own generated finding id, which is regenerated fresh every run. */
  label: z.string().min(1),
  action: z.enum(ACTION),
  scope: z.string().min(1),
  location: z.string().min(1),
  statedQuantity: z.number().int().min(1).nullable(),
  inspectorHours: z.number().positive().nullable(),
});

export type ExpectedFinding = z.infer<typeof expectedFindingSchema>;

export const expectedClassificationSchema = z.object({
  /** Matches an `expectedFindingSchema` entry's `label` above. */
  findingLabel: z.string().min(1),
  trade: z.enum(TRADE),
  /** How many material lines this finding should classify into (0 is valid — labor-only). */
  materialCount: z.number().int().min(0),
  /** Units expected among those material lines — order-insensitive set, not positional. */
  materialUnits: z.array(z.enum(EXTENT_UNIT)),
});

export type ExpectedClassification = z.infer<typeof expectedClassificationSchema>;

export const expectedPricingSchema = z.object({
  /** Matches an `expectedFindingSchema` entry's `label` above. */
  findingLabel: z.string().min(1),
  /** 'priced': every line for this finding must have a non-null unitPrice.
   *  'unavailable': every line for this finding must be correctly flagged unavailable. */
  outcome: z.enum(['priced', 'unavailable']),
});

export type ExpectedPricing = z.infer<typeof expectedPricingSchema>;

export const expectedOutputSchema = z.object({
  /** Real property zip code for this fixture — pricing is location-sensitive. */
  zipCode: z.string().min(1),
  findings: z.array(expectedFindingSchema),
  classifications: z.array(expectedClassificationSchema),
  pricing: z.array(expectedPricingSchema),
});

export type ExpectedOutput = z.infer<typeof expectedOutputSchema>;
