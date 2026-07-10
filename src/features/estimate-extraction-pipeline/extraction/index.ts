import { RequestContext } from '@mastra/core/request-context';
import { billableItemExtractorAgent } from './agent';
import { extractionConsistencyScorer } from './scorer';
import { workItemExtractionSchema, type ExtractedWorkItem } from './schema';

/**
 * THE DOOR — extraction's complete public contract. Everything a consumer
 * may depend on (the entry-point function, the output type, the enum
 * value lists and schema downstream modules build their own contracts
 * from) is exported here. No file outside this folder imports a deeper
 * path — the boundary grep in AGENTS.md enforces this with zero
 * exceptions.
 */
export { TRADE, ACTION, EXTENT_UNIT, extractedWorkItemSchema, type Action } from './schema';
export type { ExtractedWorkItem };
/**
 * Re-exported for Mastra-instance registration ONLY — no module calls
 * these directly.
 */
export { billableItemExtractorAgent, extractionConsistencyScorer };

export interface ExtractWorkItemsInput {
  estimateRequestId: string;
  fileUrl: string;
}

export interface ExtractWorkItemsOutput {
  workItems: ExtractedWorkItem[];
}

/**
 * THE EXTRACTION API. Reads one inspection PDF, returns every grounded
 * billable work item the inspector identifies.
 *
 * ONE ATTEMPT. Throws on any failure — malformed structured output, empty
 * response, transport error. Retrying is an orchestration decision
 * (`pipeline.ts`'s `retries: 2` on the step that wraps this call), not
 * something this function decides for itself.
 */
export async function extractWorkItems(
  input: ExtractWorkItemsInput,
): Promise<ExtractWorkItemsOutput> {
  const result = await billableItemExtractorAgent.generate(
    [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Extract every billable work item from this inspection report. ' +
              'Follow the rules in your instructions exactly. When in doubt, omit. ' +
              'Return JSON matching the provided schema.',
          },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: new URL(input.fileUrl),
          },
        ],
      },
    ],
    {
      structuredOutput: { schema: workItemExtractionSchema },
      requestContext: new RequestContext([
        ['estimateRequestId', input.estimateRequestId],
      ]),
    },
  );

  const extraction = result.object;
  if (!extraction) {
    throw new Error('Extraction returned no structured object');
  }
  return { workItems: extraction.items };
}
