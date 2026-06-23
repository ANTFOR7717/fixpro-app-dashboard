import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';

/**
 * Flip the estimate row to `processing`, clear any prior error, AND read the
 * row's `zipCode` so the rest of the workflow can carry it without
 * re-querying. The pricer step needs `zipCode`; sourcing it here means the
 * row is read exactly once per workflow run.
 *
 * Still a pure DB step — no AI, no retries.
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
    zipCode: z.string(),
  }),
  execute: async ({ inputData }) => {
    const [row] = await db
      .select({ zipCode: estimateRequestTable.zipCode })
      .from(estimateRequestTable)
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));

    await db
      .update(estimateRequestTable)
      .set({ status: 'processing', errorMessage: null })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));

    return {
      estimateRequestId: inputData.estimateRequestId,
      fileUrl: inputData.fileUrl,
      zipCode: row?.zipCode ?? '',
    };
  },
});
