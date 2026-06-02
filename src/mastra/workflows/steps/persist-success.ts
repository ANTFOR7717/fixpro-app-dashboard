import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import {
  billableItemSchema,
  SUMMARY_ENVELOPE_KIND,
  SUMMARY_ENVELOPE_VERSION,
  type SummaryEnvelope,
} from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Write the versioned billable-extraction envelope to `estimate_requests.summary`
 * and flip the row to `completed`.
 *
 * The column type is `text`; we serialize the envelope as JSON. The downstream
 * pricer parses this column.
 */
export const persistSuccessStep = createStep({
  id: 'persist-success',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    items: z.array(billableItemSchema),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ inputData }) => {
    const envelope: SummaryEnvelope = {
      kind: SUMMARY_ENVELOPE_KIND,
      version: SUMMARY_ENVELOPE_VERSION,
      items: inputData.items,
    };

    await db
      .update(estimateRequestTable)
      .set({
        summary: JSON.stringify(envelope),
        status: 'completed',
        errorMessage: null,
      })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));

    return { success: true };
  },
});
