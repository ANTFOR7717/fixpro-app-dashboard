import { Workflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { db } from '@/db';
import { estimateRequestTable } from '@/features/estimate/db/schema';
import { eq } from 'drizzle-orm';

function classifyError(e: unknown): string {
  const err = e as { statusCode?: number; code?: string; message?: string } | undefined;
  const status = err?.statusCode;
  if (status === 401 || status === 403) return 'AI service authentication failed. Please retry.';
  if (status === 429) return 'AI service rate-limited. Please retry shortly.';
  if (status && status >= 500) return 'AI service is temporarily unavailable. Please retry.';
  return 'AI processing failed. Please retry.';
}

const startStep = createStep({
  id: 'start-processing',
  inputSchema: z.object({ estimateRequestId: z.string(), fileUrl: z.string().url() }),
  outputSchema: z.object({ estimateRequestId: z.string(), fileUrl: z.string().url() }),
  execute: async ({ inputData }) => {
    await db.update(estimateRequestTable)
      .set({ status: 'processing', errorMessage: null })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));
    return { estimateRequestId: inputData.estimateRequestId, fileUrl: inputData.fileUrl };
  }
});

const summarizeStep = createStep({
  id: 'summarize-document',
  inputSchema: z.object({ estimateRequestId: z.string(), fileUrl: z.string().url() }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    summary: z.string(),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  retries: 2,
  execute: async ({ inputData, mastra }) => {
    try {
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

      return {
        estimateRequestId: inputData.estimateRequestId,
        summary: result.text,
        failed: false,
        errorMessage: null,
      };
    } catch (e) {
      console.error('Workflow step summarize-document failed:', e);
      return {
        estimateRequestId: inputData.estimateRequestId,
        summary: '',
        failed: true,
        errorMessage: classifyError(e),
      };
    }
  }
});

const persistSuccessStep = createStep({
  id: 'persist-success',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    summary: z.string(),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ inputData }) => {
    await db.update(estimateRequestTable)
      .set({ summary: inputData.summary, status: 'completed', errorMessage: null })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));
    return { success: true };
  }
});

const persistFailureStep = createStep({
  id: 'persist-failure',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    summary: z.string(),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ inputData }) => {
    await db.update(estimateRequestTable)
      .set({ status: 'failed', errorMessage: inputData.errorMessage ?? 'AI processing failed. Please retry.' })
      .where(eq(estimateRequestTable.id, inputData.estimateRequestId));
    return { success: false };
  }
});

export const summarizeEstimateWorkflow = new Workflow({
  id: 'summarize-estimate',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
  }),
  outputSchema: z.unknown(),
})
  .then(startStep)
  .then(summarizeStep)
  .branch([
    [async ({ inputData }) => inputData.failed === false, persistSuccessStep],
    [async ({ inputData }) => inputData.failed === true, persistFailureStep],
  ])
  .commit();
