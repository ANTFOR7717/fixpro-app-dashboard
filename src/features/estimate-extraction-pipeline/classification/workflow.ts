import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractedFindingSchema } from '../extraction';
import { classifyFindingsBatchStep, BATCH_SIZE } from './finding-workflow';
import { chunk } from '../shared/chunk';
import { TRADE, billableLineSchema, materialLineSchema, laborLineSchema, type Trade } from './schema';

/**
 * How many finding-batches' nested classification workflows run
 * concurrently. An internal throughput knob, mirroring
 * `enrichment/workflow.ts`'s own `ENRICHMENT_CONCURRENCY`.
 */
const CLASSIFICATION_CONCURRENCY = 5;

const classificationFanoutInputSchema = z.object({
  findings: z.array(extractedFindingSchema),
});

/**
 * Grouped by trade, then by costType — not a flat `BillableLine[]`. An
 * array (not a `trade`-keyed record) because a keyed record over the
 * closed `TRADE` enum forces every trade to be present in the inferred
 * type (verified live this session via `tsc`), which is false for any
 * real estimate that doesn't touch every one of the 12 trades.
 */
const classificationFanoutOutputSchema = z.object({
  groups: z.array(
    z.object({
      trade: z.enum(TRADE),
      Material: z.array(materialLineSchema),
      Labor: z.array(laborLineSchema),
    }),
  ),
});

/**
 * Named aggregation step, mirroring extraction's own
 * `aggregateExtractionResultsStep` (extraction/steps.ts) — gives this
 * combination logic its own traced step instead of an anonymous `.map()`,
 * for the same step-level observability extraction already has.
 * `Object.groupBy` (Node 21+/ES2024 — this project's `tsconfig.json` lib
 * includes `esnext`, verified) groups by trade in one call; the
 * Material/Labor split per trade is a plain filter.
 */
const aggregateClassificationResultsStep = createStep({
  id: 'Group Lines By Trade',
  inputSchema: z.array(z.array(billableLineSchema)),
  outputSchema: classificationFanoutOutputSchema,
  execute: async ({ inputData }) => {
    const byTrade = Object.groupBy(inputData.flat(), (line) => line.trade);
    return {
      groups: Object.entries(byTrade).map(([trade, lines]) => ({
        trade: trade as Trade,
        Material: lines!.filter((line) => line.costType === 'material'),
        Labor: lines!.filter((line) => line.costType === 'labor'),
      })),
    };
  },
});

/**
 * Internal fan-out workflow: chunks findings into batches of `BATCH_SIZE`
 * and classifies each batch with one agent call via
 * `finding-workflow.ts`'s `classifyFindingsBatchStep` — replaces the
 * prior one-call-per-finding fan-out, cutting total LLM round trips from
 * O(findings) to O(findings / BATCH_SIZE). NOT exported outside this
 * folder — `classification/index.ts` is the only caller.
 */
export const classificationFanoutWorkflow = createWorkflow({
  id: 'Classify Findings',
  inputSchema: classificationFanoutInputSchema,
  outputSchema: classificationFanoutOutputSchema,
})
  .map(async ({ inputData }) => chunk(inputData.findings, BATCH_SIZE).map((findings) => ({ findings })))
  .foreach(classifyFindingsBatchStep, { concurrency: CLASSIFICATION_CONCURRENCY })
  .then(aggregateClassificationResultsStep)
  .commit();
