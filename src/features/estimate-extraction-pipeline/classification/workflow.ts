import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractedFindingSchema } from '../extraction';
import { parsedDocumentSchema } from '../document';
import { findingClassificationStep } from './finding-workflow';
import { flattenClassificationResultsStep } from './flatten';
import { billableLineSchema, webSearchFlagSchema } from './schema';

/**
 * How many findings' per-finding nested classification workflows run
 * concurrently. An internal throughput knob, mirroring
 * `pricing/workflow.ts`'s own `PRICING_CONCURRENCY`.
 */
const CLASSIFICATION_CONCURRENCY = 3;

const classificationFanoutInputSchema = z.object({
  findings: z.array(extractedFindingSchema),
  parsedDocument: parsedDocumentSchema,
});

/**
 * Internal fan-out workflow: classifies every finding concurrently via
 * a per-finding nested workflow (`finding-workflow.ts`'s
 * `findingClassificationStep`, itself wrapping
 * `perFindingClassificationWorkflow` — research.md R1), then flattens
 * every finding's result into pricing's handoff shape in one aggregate
 * step (the documented `.foreach().then(aggregateStep)` map-reduce
 * pattern). NOT exported outside this folder — `classification/index.ts`
 * is the only caller. Mirrors `pricing/workflow.ts`'s own shape exactly
 * (research.md R3).
 *
 * The first `.map()` attaches the shared `parsedDocument` to each
 * individual finding, directly off the workflow's own init data — a
 * bare `.map()`, not a named step, confirmed safe by actually compiling
 * a throwaway probe against the installed `@mastra/core` package
 * (`.map()` immediately followed by `.foreach()`, mirroring this exact
 * shape): `pnpm exec tsc --noEmit` on the probe passed with zero errors.
 * So every nested per-finding workflow instance receives its own
 * document context via `getInitData()` (research.md R2) — `.foreach()`
 * fans out over the array this `.map()` returns.
 */
export const classificationFanoutWorkflow = createWorkflow({
  id: 'classification-fanout',
  inputSchema: classificationFanoutInputSchema,
  outputSchema: z.object({
    lines: z.array(billableLineSchema),
    flaggedForWebSearch: z.array(webSearchFlagSchema),
  }),
})
  .map(async ({ inputData }) =>
    inputData.findings.map((finding) => ({ finding, parsedDocument: inputData.parsedDocument })),
  )
  .foreach(findingClassificationStep, { concurrency: CLASSIFICATION_CONCURRENCY })
  .then(flattenClassificationResultsStep)
  .commit();
