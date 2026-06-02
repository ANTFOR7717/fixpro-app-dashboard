import { createStep } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import {
  billableExtractionSchema,
  billableItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Pass B — Self-audit for completeness.
 *
 * Calls the same agent a second time with the PDF AND the Pass-A items.
 * The prompt instructs it to return ONLY items missing from Pass A. The
 * merge step is responsible for deduplication.
 *
 * Audit failure is NON-FATAL: if this step errors out it returns Pass A's
 * items unchanged with `auditFailed: true`. A missed audit pass is acceptable;
 * a missed extraction is not. Pass A still drives the result.
 */
export const auditItemsStep = createStep({
  id: 'audit-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    items: z.array(billableItemSchema),
    failed: z.boolean(),
    errorMessage: z.string().nullable(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    items: z.array(billableItemSchema),
    auditItems: z.array(billableItemSchema),
    auditFailed: z.boolean(),
  }),
  retries: 1,
  execute: async ({ inputData, mastra }) => {
    try {
      const agent = mastra.getAgent('billable-item-extractor');

      const passASummary = JSON.stringify(
        inputData.items.map((it) => ({
          trade: it.trade,
          action: it.action,
          scope: it.scope,
          location: it.location,
        })),
        null,
        2,
      );

      const result = await agent.generate(
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'You previously produced the following billable items from this PDF:\n\n' +
                  '```json\n' +
                  passASummary +
                  '\n```\n\n' +
                  'List ONLY billable items that are MISSING from the list above. ' +
                  'Do NOT re-emit items that are already present. If nothing is missing, ' +
                  'return { "items": [] }. The same hard rules apply: grounded only, no ' +
                  'prose, no pricing, when unsure omit.',
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
          // Same RequestContext as Pass A so Pass B is attributed to the
          // same run in any tool / memory / trace downstream.
          requestContext: new RequestContext([
            ['estimateRequestId', inputData.estimateRequestId],
          ]),
        },
      );

      const extraction = result.object;
      if (!extraction) {
        // Resilient: keep Pass A.
        return {
          estimateRequestId: inputData.estimateRequestId,
          fileUrl: inputData.fileUrl,
          items: inputData.items,
          auditItems: [],
          auditFailed: true,
        };
      }

      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        items: inputData.items,
        auditItems: extraction.items,
        auditFailed: false,
      };
    } catch (e) {
      console.error('Workflow step audit-items failed (non-fatal):', e);
      return {
        estimateRequestId: inputData.estimateRequestId,
        fileUrl: inputData.fileUrl,
        items: inputData.items,
        auditItems: [],
        auditFailed: true,
      };
    }
  },
});
