import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import { extractedItemSchema } from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Write `status='failed'` + a human-readable `errorMessage` so the UI can
 * surface a retry. Reached only via the workflow's `.branch()` when the
 * extract step returned `failed: true`.
 */
export const persistFailureStep = createStep({
  id: 'persist-failure',
  // Mirrors extract-items' output shape — only `estimateRequestId` and
  // `errorMessage` are actually used here, but matching the shape keeps the
  // branch wiring straightforward. `zipCode` is in the shape because the
  // upstream step carries it for the success path; the failure path simply
  // ignores it.
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(extractedItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ inputData }) => {
    await db
      .update(estimateRequestTable)
      .set({
        status: 'failed',
        errorMessage:
          inputData.errorMessage ?? 'AI processing failed. Please retry.',
      })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));

    return { success: false };
  },
});
