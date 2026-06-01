import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';

/**
 * Flip the estimate row to `processing` and clear any prior error so the UI
 * shows the spinner instead of a stale failed-state.
 *
 * Pure DB write — no AI, no retries.
 */
export const markProcessingStep = createStep({
  id: 'mark-processing',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
  }),
  execute: async ({ inputData }) => {
    await db
      .update(estimateRequestTable)
      .set({ status: 'processing', errorMessage: null })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));

    return {
      estimateRequestId: inputData.estimateRequestId,
      fileUrl: inputData.fileUrl,
    };
  },
});
