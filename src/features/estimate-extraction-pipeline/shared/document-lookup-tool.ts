import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { ParsedDocument } from '../document';

/**
 * On-demand document search, shared across every agent in the pipeline
 * that needs it — not classification-specific. `parsedDocument` is read
 * from `requestContext`, set exactly ONCE per whole pipeline run (never
 * per-item — that duplication was a real, previously-removed defect).
 * Reuses `ParsedDocument.pages` as-is for chunking; no new indexing/
 * embedding layer. Only the specific matching page(s) ever reach a
 * model's context — never the full document, never a joined single
 * string.
 */
export const documentLookupTool = createTool({
  id: 'document-lookup',
  description: 'Search the source report for a keyword or phrase; returns matching page(s) verbatim.',
  inputSchema: z.object({ query: z.string().min(1) }),
  outputSchema: z.object({ matches: z.array(z.object({ pageNumber: z.number(), content: z.string() })) }),
  execute: async (inputData, context) => {
    if (!context.requestContext) {
      throw new Error('document-lookup called without a RequestContext — parsedDocument was never set for this run.');
    }
    const parsedDocument = context.requestContext.get('parsedDocument') as ParsedDocument;
    const query = inputData.query.toLowerCase();
    return {
      matches: parsedDocument.pages.filter((p) => p.content.toLowerCase().includes(query)),
    };
  },
});
