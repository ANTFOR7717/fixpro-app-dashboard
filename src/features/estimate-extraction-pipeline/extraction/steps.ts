import { createStep } from '@mastra/core/workflows';
import { findingExtractorAgent } from './agent';
import { extractionOutputSchema } from './schema';
import type { ParsedDocument } from '../document';

/**
 * A plain function, NOT a `createStep()` — deliberately. Mastra's own
 * canonical docs example for "build a prompt right before an
 * agent-composed step" (docs/workflows/agents-and-tools, both examples
 * fetched this session) uses a bare `.map()`, never a named step:
 *
 *   .map(async ({ inputData }) => ({ prompt: `Generate an article about: ${inputData.topic}` }))
 *   .then(agentStep)
 *
 * This function is called from a `.map()` directly in `pipeline.ts`,
 * matching Mastra's own documented shape exactly. `pipeline.ts` stays
 * "logic-free" per AGENTS.md because it only CALLS this function — the
 * actual formatting logic still lives here, in the module that owns it.
 */
export function buildExtractionPrompt(parsedDocument: ParsedDocument): string {
  const lines = parsedDocument.pages.map((page) => `[p. ${page.pageNumber}]\n${page.content}`);
  return (
    'Read this inspection report page by page. Extract every billable ' +
    'finding, citing the exact verbatim source sentence and page for ' +
    'each. Follow the rules in your instructions exactly. When in doubt, ' +
    'omit. Return JSON matching the provided schema.\n\n' +
    `INSPECTION REPORT (by page):\n\n${lines.join('\n\n')}`
  );
}

/**
 * The agent itself, composed AS a step — no `.stream()`, no `.object`,
 * no drain loop anywhere in this codebase. Mastra owns the transport
 * entirely. Per the Standard's Rule 1 / `docs/workflows/agents-and-tools`.
 * `retries: 2` matches `parseDocumentStep`'s existing precedent for the
 * workflow's other network-facing step (research.md R3).
 */
export const findingExtractorAgentStep = createStep(findingExtractorAgent, {
  structuredOutput: { schema: extractionOutputSchema },
  retries: 2,
});
