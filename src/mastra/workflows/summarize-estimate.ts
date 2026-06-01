import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

import { markProcessingStep } from './steps/mark-processing';
import { extractItemsStep } from './steps/extract-items';
import { auditItemsStep } from './steps/audit-items';
import { mergeItemsStep } from './steps/merge-items';
import { persistSuccessStep } from './steps/persist-success';
import { persistFailureStep } from './steps/persist-failure';

/**
 * Top-level workflow wiring.
 *
 * Stages:
 *   1. mark-processing      → flips status to 'processing'
 *   2. extract-items        → Pass A, structured-output extraction (retries 2)
 *   3. branch on failed
 *      ├── true:  persist-failure   (terminal)
 *      └── false: success sub-workflow:
 *                    audit-items   → Pass B, non-fatal (retries 1)
 *                    merge-items   → pure dedup + renumber
 *                    persist-success → writes versioned JSON envelope
 *
 * Each step is a named export and the workflow body is a wiring diagram.
 * Adding a stage = one `.then(...)` line; removing a stage = delete one line.
 */

const successPathWorkflow = createWorkflow({
  id: 'summarize-estimate-success-path',
  inputSchema: extractItemsStep.outputSchema,
  outputSchema: persistSuccessStep.outputSchema,
})
  .then(auditItemsStep)
  .then(mergeItemsStep)
  .then(persistSuccessStep)
  .commit();

export const summarizeEstimateWorkflow = createWorkflow({
  id: 'summarize-estimate',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
  }),
  outputSchema: z.unknown(),
})
  .then(markProcessingStep)
  .then(extractItemsStep)
  .branch([
    [async ({ inputData }) => inputData.failed === true, persistFailureStep],
    [async ({ inputData }) => inputData.failed === false, successPathWorkflow],
  ])
  .commit();
