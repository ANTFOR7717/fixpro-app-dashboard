import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { resolveTracingOptions } from '../../shared/tracing';
import { pioneerGateway } from '../../shared/gateway';
import { enrichedLineSchema, type EnrichedLine } from '../../enrichment';
import { presentationAgent } from '../agent';
import { presentedLineSchema, type PresentedLine, pricedLineSchema, type PricedLine, MARKUP_PERCENT } from '../schema';

export const presentationInputSchema = z.object({ lines: z.array(enrichedLineSchema) });

const presentationEntrySchema = z.object({
  id: z.string(),
  itemName: z.string().min(1),
  category: z.string().min(1),
});

const presentationResponseSchema = z.object({ items: z.array(presentationEntrySchema) });

/**
 * Same id-match discipline as classification's `buildBatchResponseSchema`
 * — requires the model's returned ids to be an exact, duplicate-free
 * match of the input lines, not just the right count. Mastra's own
 * `errorStrategy: 'strict'` (default) throws on failure, which
 * `retries: 2` below then retries.
 */
function buildPresentationResponseSchema(ids: string[]) {
  return presentationResponseSchema.refine(
    (data) => {
      const returned = data.items.map((item) => item.id);
      return (
        returned.length === ids.length &&
        new Set(returned).size === ids.length &&
        returned.every((id) => ids.includes(id))
      );
    },
    { message: 'presentation ids must be an exact, duplicate-free match of the input line ids' },
  );
}

function buildPresentationPrompt(lines: EnrichedLine[]): string {
  const describe = lines.map((line) => ({
    id: line.id,
    scope: line.scope,
    location: line.location,
    descriptionQuote: line.descriptionQuote,
    costType: line.costType,
    name: line.costType === 'material' ? line.material : line.laborType,
  }));
  return `LINES\n${JSON.stringify(describe)}`;
}

/**
 * One agent call for every enriched line at once — same validated
 * batching approach as classification (fewer round trips than one call
 * per line), appropriate here since this stage only reasons over
 * already-known line data, no per-item grounding/search needed.
 */
export const presentationAgentStep = createStep({
  id: 'Presentation Determination',
  inputSchema: presentationInputSchema,
  outputSchema: presentationResponseSchema,
  retries: 2,
  execute: async ({ inputData, tracingContext }) => {
    const stream = await presentationAgent.stream(buildPresentationPrompt(inputData.lines), {
      structuredOutput: {
        schema: buildPresentationResponseSchema(inputData.lines.map((line) => line.id)),
        model: pioneerGateway().chat('gpt-5.5'),
      },
      tracingOptions: resolveTracingOptions(tracingContext),
    });
    return await stream.object;
  },
});

/**
 * Deterministic — no agent call. Merges the presentation agent's
 * itemName/category back onto each enriched line. No markup or pricing
 * math here: that's a fixed rate applied against pricing elsewhere, not
 * this stage's responsibility.
 */
export const mergePresentationStep = createStep({
  id: 'Merge Presentation',
  inputSchema: presentationResponseSchema,
  outputSchema: z.object({ lines: z.array(presentedLineSchema) }),
  execute: async ({ inputData, getInitData }) => {
    const { lines } = getInitData<z.infer<typeof presentationInputSchema>>();
    const byId = new Map(inputData.items.map((item) => [item.id, item] as const));

    const presented: PresentedLine[] = lines.map((line) => {
      const meta = byId.get(line.id);
      return presentedLineSchema.parse({
        ...line,
        itemName: meta?.itemName ?? line.scope,
        category: meta?.category ?? 'Uncategorized',
      });
    });

    return { lines: presented };
  },
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic — no agent call. Applies the fixed 35% markup to each
 * presented line: builderCost (quantity × rate), markupAmount, and the
 * resulting clientTotal. A real named step (not a `.map()`) so it shows
 * up as its own node in Studio's trace/graph.
 */
export const pricingStep = createStep({
  id: 'Apply Markup Pricing',
  inputSchema: z.object({ lines: z.array(presentedLineSchema) }),
  outputSchema: z.object({ lines: z.array(pricedLineSchema) }),
  execute: async ({ inputData }) => {
    const priced: PricedLine[] = inputData.lines.map((line) => {
      const builderCost = round2(line.quantity * line.rate);
      const markupAmount = round2(builderCost * MARKUP_PERCENT);
      const clientTotal = round2(builderCost + markupAmount);
      return pricedLineSchema.parse({ ...line, builderCost, markupPercent: MARKUP_PERCENT, markupAmount, clientTotal });
    });
    return { lines: priced };
  },
});
