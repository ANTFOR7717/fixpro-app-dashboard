import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { resolveTracingOptions } from '../../shared/tracing';
import { pioneerGateway } from '../../shared/gateway';
import { presentationAgent } from '../presentation-agent';
import {
  enrichedLineSchema,
  type EnrichedLine,
  PRESENTATION_TAG,
  MARKUP_PERCENT,
  presentedGroupSchema,
  type PresentedGroup,
  presentedLineSchema,
  presentationSummarySchema,
  type PresentationSummary,
  lineTotal,
} from '../schema';

const presentationInputSchema = z.object({ lines: z.array(enrichedLineSchema) });

const presentationEntrySchema = z.object({
  id: z.string(),
  itemName: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.enum(PRESENTATION_TAG)),
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
const presentationAgentStep = createStep({
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic — no agent call. Merges the presentation agent's output
 * (category/name/tags) back onto each enriched line, computes the
 * markup math (`MARKUP_PERCENT` is a fixed business policy, not
 * something left to model judgment — same principle as the labor-hours
 * floor in `domain/logic.ts`), groups by category, and computes the
 * grand summary. Verified formula matches `eval/target-output-format.md`
 * exactly: `clientTotal = builderCost * (1 + MARKUP_PERCENT)`,
 * `profitMarginPercent = totalMarkup / estimateTotal * 100`.
 */
const assemblePresentationStep = createStep({
  id: 'Assemble Presentation',
  inputSchema: presentationResponseSchema,
  outputSchema: z.object({ groups: z.array(presentedGroupSchema), summary: presentationSummarySchema }),
  execute: async ({ inputData, getInitData }) => {
    const { lines } = getInitData<z.infer<typeof presentationInputSchema>>();
    const byId = new Map(inputData.items.map((item) => [item.id, item] as const));

    const presented = lines.map((line) => {
      const meta = byId.get(line.id);
      const builderCost = round2(lineTotal(line));
      const markupAmount = round2(builderCost * MARKUP_PERCENT);
      const clientTotal = round2(builderCost + markupAmount);
      return presentedLineSchema.parse({
        id: line.id,
        itemName: meta?.itemName ?? line.scope,
        category: meta?.category ?? 'Uncategorized',
        tags: meta?.tags ?? [],
        costType: line.costType,
        quantity: line.quantity,
        unit: line.unit,
        builderCost,
        markupPercent: MARKUP_PERCENT,
        markupAmount,
        clientTotal,
      });
    });

    const byCategory = new Map<string, typeof presented>();
    for (const item of presented) {
      const existing = byCategory.get(item.category);
      if (existing) existing.push(item);
      else byCategory.set(item.category, [item]);
    }

    const groups: PresentedGroup[] = Array.from(byCategory, ([category, items]) => ({
      category,
      itemCount: items.length,
      builderCostSubtotal: round2(items.reduce((sum, item) => sum + item.builderCost, 0)),
      clientTotalSubtotal: round2(items.reduce((sum, item) => sum + item.clientTotal, 0)),
      items,
    }));

    const totalCost = round2(presented.reduce((sum, item) => sum + item.builderCost, 0));
    const totalMarkup = round2(presented.reduce((sum, item) => sum + item.markupAmount, 0));
    const estimateTotal = round2(totalCost + totalMarkup);
    const profitMarginPercent = estimateTotal > 0 ? round2((totalMarkup / estimateTotal) * 100) : 0;

    const summary: PresentationSummary = { totalCost, totalMarkup, estimateTotal, profitMarginPercent };
    return { groups, summary };
  },
});

/**
 * Composed directly as a step in `enrichment/workflow.ts` (workflow-as-
 * step — visible as its own nested graph in Studio, same reasoning as
 * every other fanout workflow in this pipeline).
 */
export const presentationWorkflow = createWorkflow({
  id: 'Presentation',
  inputSchema: presentationInputSchema,
  outputSchema: z.object({ groups: z.array(presentedGroupSchema), summary: presentationSummarySchema }),
})
  .then(presentationAgentStep)
  .then(assemblePresentationStep)
  .commit();
