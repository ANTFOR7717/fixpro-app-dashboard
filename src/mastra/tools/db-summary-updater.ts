import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import { eq } from 'drizzle-orm';

export const dbSummaryUpdaterTool = createTool({
  id: 'db-summary-updater',
  description: 'Persists AI summary and updates status to completed.',
  inputSchema: z.object({
    estimateRequestId: z.string().uuid(),
    summary: z.string(),
  }),
  execute: async (inputData) => {
    await db.update(estimateRequestTable)
      .set({ 
        summary: inputData.summary, 
        status: 'completed' 
      })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));
    return { success: true };
  },
});
