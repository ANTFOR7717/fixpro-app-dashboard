import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractedFindingSchema } from '../extraction';
import { perFindingClassificationStep } from './finding-workflow';
import { billableLineSchema } from './schema';

/**
 * How many findings' per-finding nested classification workflows run
 * concurrently. An internal throughput knob, mirroring
 * `enrichment/workflow.ts`'s own `ENRICHMENT_CONCURRENCY`.
 */
const CLASSIFICATION_CONCURRENCY = 3;

const classificationFanoutInputSchema = z.object({
  findings: z.array(extractedFindingSchema),
});

/**
 * Internal fan-out workflow: classifies every finding concurrently via
 * `finding-workflow.ts`'s `perFindingClassificationWorkflow` — composed
 * directly into `.foreach()` (a committed `Workflow` satisfies `Step`,
 * same as `extractionFanoutWorkflow` composes directly into `pipeline.ts`
 * via `.then()`), no wrapper step. Each finding's own nested workflow
 * already emits that finding's `BillableLine[]` directly, so combining
 * across findings is one `.flat()` call, not a separate named step. NOT
 * exported outside this folder — `classification/index.ts` is the only
 * caller.
 */
export const classificationFanoutWorkflow = createWorkflow({
  id: 'classification-fanout',
  inputSchema: classificationFanoutInputSchema,
  outputSchema: z.object({ lines: z.array(billableLineSchema) }),
})
  .map(async ({ inputData }) => inputData.findings.map((finding) => ({ finding })))
  .foreach(perFindingClassificationStep, { concurrency: CLASSIFICATION_CONCURRENCY })
  .map(async ({ inputData }) => ({ lines: inputData.flat() }))
  .commit();
