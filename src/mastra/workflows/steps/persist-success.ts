import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import {
  billableItemSchema,
  pricedLineItemSchema,
  SUMMARY_ENVELOPE_KIND,
  SUMMARY_ENVELOPE_VERSION_2,
  type SummaryEnvelopeV2,
} from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Write the versioned billable-extraction envelope (v2: items + prices) to
 * `estimate_requests.summary` and flip the row to `completed`. Old rows on
 * disk produced before this branch stay v1; the reader discriminates on
 * `envelope.version` and renders both shapes.
 */
export const persistSuccessStep = createStep({
  id: 'persist-success',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    items: z.array(billableItemSchema),
    prices: z.array(pricedLineItemSchema),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ inputData }) => {
    const envelope: SummaryEnvelopeV2 = {
      kind: SUMMARY_ENVELOPE_KIND,
      version: SUMMARY_ENVELOPE_VERSION_2,
      items: inputData.items,
      prices: inputData.prices,
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
