import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { TRADE, materialLineSchema, laborLineSchema } from '../../classification';
import { enrichedLineSchema, type EnrichedLine } from '../schema';
import { resolveTracingOptions } from '../../shared/tracing';
import { enrichOneLine } from './logic';

export const tradeGroupInputSchema = z.object({
  trade: z.enum(TRADE),
  Material: z.array(materialLineSchema),
  Labor: z.array(laborLineSchema),
});

/** A line's finding is parsed from its `id` prefix — there is no
 * explicit `findingId` field. IDs follow `${finding.id}:material:${i}`
 * (materials) or `${finding.id}:labor` (labor). */
export function findingIdOf(line: { id: string }): string {
  return line.id.split(':')[0]!;
}

const materialItemSchema = z.object({ line: materialLineSchema });
const laborItemSchema = z.object({ line: laborLineSchema, materialsContext: z.array(enrichedLineSchema).optional() });

/**
 * Enriches ONE material line. Distinct step identity from
 * `enrichLaborLineStep` (not the same step reused) so `getStepResult()`
 * can reference this `.foreach()`'s aggregated results later in
 * `enrichment/workflow.ts` without ambiguity. Composed via `.foreach()`
 * there, not hand-rolled `Promise.all` — that gives real concurrency
 * limiting (Mastra's own `resolveForeachConcurrency`) and automatic
 * per-item trace spans for free, instead of an unbounded burst of
 * simultaneous LLM calls with no per-item observability.
 */
export const enrichMaterialLineStep = createStep({
  id: 'Enrich Material Line',
  inputSchema: materialItemSchema,
  outputSchema: enrichedLineSchema.nullable(),
  execute: async ({ inputData, requestContext, tracingContext }) => {
    return enrichOneLine(inputData, requestContext, resolveTracingOptions(tracingContext));
  },
});

/** Enriches ONE labor line — see `enrichMaterialLineStep`'s comment for
 * why this is a distinct step composed via `.foreach()`. */
export const enrichLaborLineStep = createStep({
  id: 'Enrich Labor Line',
  inputSchema: laborItemSchema,
  outputSchema: enrichedLineSchema.nullable(),
  execute: async ({ inputData, requestContext, tracingContext }) => {
    return enrichOneLine(inputData, requestContext, resolveTracingOptions(tracingContext));
  },
});

/**
 * Flattens every trade group's lines into one Material array and one
 * Labor array. Trade grouping is only for the final output shape — the
 * materials-before-labor dependency is per-FINDING, not per-trade (a
 * trade group can span multiple unrelated findings), so enrichment
 * itself processes everything flat, re-scoping by finding only where
 * `buildLaborInputsStep` needs it.
 */
export const flattenGroupsStep = createStep({
  id: 'Flatten Trade Groups',
  inputSchema: z.object({ groups: z.array(tradeGroupInputSchema) }),
  outputSchema: z.object({ Material: z.array(materialLineSchema), Labor: z.array(laborLineSchema) }),
  execute: async ({ inputData }) => ({
    Material: inputData.groups.flatMap((g) => g.Material),
    Labor: inputData.groups.flatMap((g) => g.Labor),
  }),
});

/**
 * Groups the just-enriched materials by their own finding, then pairs
 * each labor line with only its own finding's materials — never a
 * different finding's, even if they share a trade.
 */
export const buildLaborInputsStep = createStep({
  id: 'Build Labor Inputs',
  inputSchema: z.array(enrichedLineSchema.nullable()),
  outputSchema: z.object({
    enrichedMaterials: z.array(enrichedLineSchema),
    laborItems: z.array(laborItemSchema),
  }),
  execute: async ({ inputData, getStepResult }) => {
    const enrichedMaterials = inputData.filter((line): line is EnrichedLine => line !== null);
    const materialsByFinding = new Map<string, EnrichedLine[]>();
    for (const material of enrichedMaterials) {
      const findingId = findingIdOf(material);
      const existing = materialsByFinding.get(findingId);
      if (existing) existing.push(material);
      else materialsByFinding.set(findingId, [material]);
    }
    const { Labor } = getStepResult(flattenGroupsStep);
    const laborItems = Labor.map((line) => ({ line, materialsContext: materialsByFinding.get(findingIdOf(line)) }));
    return { enrichedMaterials, laborItems };
  },
});

/**
 * Combines the just-enriched labor lines with `buildLaborInputsStep`'s
 * already-enriched materials into one flat line list — `enrichment`'s
 * own final output, `{ lines: EnrichedLine[] }`. `presentation/` is a
 * separate, later pipeline stage composed by `pipeline.ts`, not inside
 * this workflow.
 */
export const combineEnrichedLinesStep = createStep({
  id: 'Combine Enriched Lines',
  inputSchema: z.array(enrichedLineSchema.nullable()),
  outputSchema: z.object({ lines: z.array(enrichedLineSchema) }),
  execute: async ({ inputData, getStepResult }) => {
    const enrichedLabor = inputData.filter((line): line is EnrichedLine => line !== null);
    const { enrichedMaterials } = getStepResult(buildLaborInputsStep);
    return { lines: [...enrichedMaterials, ...enrichedLabor] };
  },
});
