import { Workflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import { eq } from 'drizzle-orm';

const startStep = createStep({
  id: 'start-processing',
  inputSchema: z.object({ estimateRequestId: z.string(), fileUrl: z.string().url() }),
  outputSchema: z.object({ estimateRequestId: z.string(), fileUrl: z.string().url() }),
  execute: async ({ inputData }) => {
    await db.update(estimateRequestTable)
      .set({ status: 'processing' })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));
    return { estimateRequestId: inputData.estimateRequestId, fileUrl: inputData.fileUrl };
  }
});

const summarizeStep = createStep({
  id: 'summarize-document',
  inputSchema: z.object({ estimateRequestId: z.string(), fileUrl: z.string().url() }),
  outputSchema: z.object({ estimateRequestId: z.string(), summary: z.string() }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent('estimate-summarizer');

    const result = await agent.generate([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Provide a structured technical summary of repairs and costs from this report.' },
          { type: 'file', mediaType: 'application/pdf', data: new URL(inputData.fileUrl) },
        ],
      }
    ]);

    return { estimateRequestId: inputData.estimateRequestId, summary: result.text };
  }
});

const persistStep = createStep({
  id: 'persist-result',
  inputSchema: z.object({ estimateRequestId: z.string(), summary: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ inputData }) => {
    await db.update(estimateRequestTable)
      .set({ summary: inputData.summary, status: 'completed' })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));
    return { success: true };
  }
});

export const summarizeEstimateWorkflow = new Workflow({
  id: 'summarize-estimate',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
})
  .then(startStep)
  .then(summarizeStep)
  .then(persistStep)
  .commit();