import { z } from 'zod';

/**
 * The shape of a billable item AS THE GUARD SEES IT.
 *
 * This is intentionally looser than the real `billableItemSchema`:
 * the real schema rejects unknown enum values with generic messages,
 * which makes the abort feedback useless to the LLM. The guard runs
 * its own Zod parse first to give the LLM specific field-level
 * reasons, then runs the semantic rules (see `item-validator.ts`)
 * to catch the rules Zod can't express.
 *
 * The `extraction` wrapper mirrors the real `billableExtractionSchema`
 * so the guard's parse is the structural gate, and the real schema's
 * parse (run later by Mastra) is the formal contract.
 */

export const itemShapeSchema = z.object({
  id: z.string(),
  trade: z.string(),
  action: z.string(),
  scope: z.string(),
  location: z.string(),
  quantity: z.number(),
  unit: z.string(),
  costType: z.string(),
  sourceQuote: z.string().optional(),
  pageHint: z.string().nullable().optional(),
});

export const extractionShapeSchema = z.object({
  items: z.array(itemShapeSchema),
});

export type ItemShape = z.infer<typeof itemShapeSchema>;
export type ExtractionShape = z.infer<typeof extractionShapeSchema>;
