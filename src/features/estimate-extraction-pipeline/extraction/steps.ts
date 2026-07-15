import { createStep } from '@mastra/core/workflows';
import { findingExtractorAgent } from './agent';
import {
  extractionOutputSchema,
  resolvedExtractionSchema,
  type RawFinding,
  type ExtractedFinding,
  type MeaningfulSentence,
} from './schema';
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
    'Read this inspection report page by page. First identify every ' +
    'sentence meaningful enough that a billable finding can be ' +
    'inferred from it and emit it into "sentences". Then extract ' +
    'every billable finding, citing one of your own sentence ids ' +
    'for each. Follow the rules in your instructions exactly. When ' +
    'in doubt, omit. Return JSON matching the provided schema.\n\n' +
    `INSPECTION REPORT (by page):\n\n${lines.join('\n\n')}`
  );
}

/**
 * The agent itself, composed AS a step — no `.stream()`, no `.object`,
 * no drain loop anywhere in this codebase. Mastra owns the transport
 * entirely. Per the Standard's Rule 1 / `docs/workflows/agents-and-tools`.
 */
export const findingExtractorAgentStep = createStep(findingExtractorAgent, {
  structuredOutput: { schema: extractionOutputSchema },
});

/**
 * Resolve each raw finding's `sourceSentenceId` into the public shape's
 * verbatim `sourceQuote`/`pageHint`. This IS a named step, correctly —
 * unlike `buildExtractionPrompt` above, this has real logic worth
 * validating on its own boundary (a Map lookup + a degrade-on-miss
 * decision), matching Rule 2's actual bar. It still degrades an
 * unresolved citation to `'(unresolved citation)'` rather than throwing
 * and losing the batch.
 */
export const resolveFindingsStep = createStep({
  id: 'resolve-findings',
  inputSchema: extractionOutputSchema,
  outputSchema: resolvedExtractionSchema,
  execute: async ({ inputData }) => {
    const sentenceMap = new Map(inputData.sentences.map((s) => [s.id, s]));
    const findings = inputData.findings.map((f) => resolveFinding(f, sentenceMap));
    return { sentences: inputData.sentences, findings };
  },
});

function resolveFinding(
  f: RawFinding,
  sentenceMap: Map<string, MeaningfulSentence>,
): ExtractedFinding {
  const sentence = sentenceMap.get(f.sourceSentenceId);
  return {
    id: f.id,
    action: f.action,
    scope: f.scope,
    location: f.location,
    statedQuantity: f.statedQuantity,
    inspectorHours: f.inspectorHours,
    sourceQuote: sentence?.text ?? '(unresolved citation)',
    pageHint: sentence ? `p. ${sentence.pageNumber}` : null,
  };
}
