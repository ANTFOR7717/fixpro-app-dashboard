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

const fetchStep = createStep({
  id: 'fetch-file',
  inputSchema: z.object({ estimateRequestId: z.string(), fileUrl: z.string().url() }),
  outputSchema: z.object({ estimateRequestId: z.string(), buffer: z.instanceof(Buffer) }),
  execute: async ({ inputData }) => {
    const res = await fetch(inputData.fileUrl);
    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { estimateRequestId: inputData.estimateRequestId, buffer };
  }
});

const extractStep = createStep({
  id: 'extract-text',
  inputSchema: z.object({ estimateRequestId: z.string(), buffer: z.instanceof(Buffer) }),
  outputSchema: z.object({ estimateRequestId: z.string(), text: z.string() }),
  execute: async ({ inputData, mastra }) => {
    const tool = mastra.getTool('pdf-text-extractor');
    const result = await tool!.execute({ buffer: inputData.buffer });
    return { estimateRequestId: inputData.estimateRequestId, text: result.text };
  }
});

const summarizeStep = createStep({
  id: 'summarize-text',
  inputSchema: z.object({ estimateRequestId: z.string(), text: z.string() }),
  outputSchema: z.object({ estimateRequestId: z.string(), summary: z.string() }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent('estimate-summarizer');

    const result = await agent!.generate([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Provide a structured technical summary of repairs and costs from this report.' },
          { type: 'text', text: inputData.text }
        ]
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
  .then(fetchStep)
  .then(extractStep)
  .then(summarizeStep)
  .then(persistStep);
