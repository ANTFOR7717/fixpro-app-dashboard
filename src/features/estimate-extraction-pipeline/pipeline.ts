import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractWorkItems, extractedWorkItemSchema } from './extraction';
import { classifyLines, billableLineSchema, pendingLineSchema } from './classification';
import { priceLines, pricedLineItemSchema } from './pricing';

/**
 * The composition root. Every stage below is a one-line adapter calling
 * exactly one module's door function — this file contains NO business
 * logic. To understand what a stage DOES, read that module's index.ts.
 */

const extractStep = createStep({
  id: 'extract',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    workItems: z.array(extractedWorkItemSchema),
  }),
  retries: 2,
  execute: async ({ inputData }) => {
    const { workItems } = await extractWorkItems({
      estimateRequestId: inputData.estimateRequestId,
      fileUrl: inputData.fileUrl,
    });
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      workItems,
    };
  },
});

const classifyStep = createStep({
  id: 'classify',
  inputSchema: extractStep.outputSchema,
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    lines: z.array(pendingLineSchema),
  }),
  execute: async ({ inputData }) => {
    const { lines } = classifyLines(inputData.workItems);
    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines,
    };
  },
});

const priceStep = createStep({
  id: 'price',
  inputSchema: classifyStep.outputSchema,
  outputSchema: z.object({
    lines: z.array(billableLineSchema),
    prices: z.array(pricedLineItemSchema),
  }),
  execute: async ({ inputData }) =>
    priceLines({
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      lines: inputData.lines,
    }),
});

export const summarizeEstimateWorkflow = createWorkflow({
  id: 'summarize-estimate',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  outputSchema: priceStep.outputSchema,
})
  .then(extractStep)
  .then(classifyStep)
  .then(priceStep)
  .commit();
