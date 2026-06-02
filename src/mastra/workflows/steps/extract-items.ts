import { createStep } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import {
  billableExtractionSchema,
  billableItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import { classifyError } from '../lib/classify-error';

/**
 * Pass A — Extract billable items from the inspection PDF.
 *
 * Calls the `billable-item-extractor` agent once with structured output. The
 * resilient-step pattern lets a malformed model response (Zod schema mismatch
 * after Mastra's internal retries) flow as a non-throwing failure that
 * `.branch()` can route to the failure-persistence step. Genuine HTTP / network
 * errors still throw so Mastra's `retries` kicks in.
 */
export const extractItemsStep = createStep({
  id: 'extract-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(billableItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  retries: 2,
  execute: async ({ inputData, mastra }) => {
    try {
      const agent = mastra.getAgent('billable-item-extractor');

      const result = await agent.generate(
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Extract every billable line item from this inspection report. ' +
                  'Follow the rules in your instructions exactly. When in doubt, omit. ' +
                  'Return JSON matching the provided schema.',
              },
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: new URL(inputData.fileUrl),
              },
            ],
          },
        ],
        {
          structuredOutput: { schema: billableExtractionSchema },
          // Thread the run's identity into the agent so any tools / memory /
          // tracing downstream can attribute work to the right estimate
          // request. userId is not in this step's input schema today — when
          // the caller surfaces it, add it here as a second tuple entry.
          requestContext: new RequestContext([
            ['estimateRequestId', inputData.estimateRequestId],
          ]),
        },
      );

      // structuredOutput populates `result.object` with the validated payload.
      const extraction = result.object;
      if (!extraction) {
        return {
          estimateRequestId: inputData.estimateRequestId,
          fileUrl: inputData.fileUrl,
          zipCode: inputData.zipCode,
          items: [],
          failed: true,
          errorMessage: 'AI returned malformed extraction. Please retry.',
        };
      }

      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        items: extraction.items,
        failed: false,
        errorMessage: null,
      };
    } catch (e) {
      console.error('Workflow step extract-items failed:', e);
      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        zipCode: inputData.zipCode,
        items: [],
        failed: true,
        errorMessage: classifyError(e),
      };
    }
  },
});
