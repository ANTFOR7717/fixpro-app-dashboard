import { createScorer } from '@mastra/core/evals';
import { z } from 'zod';
import { pioneerGateway } from '../shared/gateway';

/**
 * Background LLM-judge scorer for the billable-item extractor.
 *
 * Judges what is judgeable WITHOUT the source document (the judge sees
 * only the extractor's emitted items, never the PDF):
 *
 *   1. Internal consistency — does each item's verbatim sourceQuote name
 *      the defect and action the item claims in scope/action/trade?
 *   2. Compound scopes — one item naming two distinct physical components
 *      ("trim or wood siding"), a ONE-ITEM-PER-FIX violation.
 *
 * Completeness ("did the extractor MISS defects?") is NOT judged here — it
 * requires the source document, which this scorer does not receive. That
 * capability belongs in this same slot once a text-extraction layer exists
 * to hand the judge that text (see the parked Docling transport plan).
 */
const analyzeOutputSchema = z.object({
  itemCount: z.number().int().min(0),
  inconsistentItemIds: z.array(z.string()),
  compoundScopeItemIds: z.array(z.string()),
});

export const extractionConsistencyScorer = createScorer({
  id: 'extraction-consistency',
  name: 'Extraction Consistency',
  description:
    'Judges whether each extracted work item is internally consistent ' +
    '(sourceQuote supports scope/action/trade) and names exactly one ' +
    'physical component.',
  judge: {
    model: pioneerGateway.chat('pioneer/auto'),
    instructions:
      'You audit billable work items extracted from a home inspection ' +
      'report. You see ONLY the emitted items, never the source document. ' +
      'You judge two things per item: (1) whether its verbatim sourceQuote ' +
      'names the defect and action the item claims in scope/action/trade, ' +
      'and (2) whether its scope names exactly one physical component. ' +
      'You never judge pricing and never invent defects.',
  },
  type: 'agent',
})
  .analyze({
    description: 'Flag internally inconsistent items and compound scopes',
    outputSchema: analyzeOutputSchema,
    createPrompt: ({ run }) =>
      'ITEMS THE EXTRACTOR EMITTED:\n' +
      JSON.stringify(run.output) +
      '\n\nReturn JSON: { "itemCount": number, "inconsistentItemIds": ' +
      'string[], "compoundScopeItemIds": string[] }. Count every emitted ' +
      'item in itemCount. Flag an id in inconsistentItemIds ONLY when its ' +
      'sourceQuote clearly fails to name the defect or action the item ' +
      'claims. Flag an id in compoundScopeItemIds ONLY when the scope ' +
      'names two or more distinct physical components (e.g. "trim or wood ' +
      'siding") — one component with two symptoms ("peeling and chipping ' +
      'paint") is fine.',
  })
  .generateScore(({ results }) => {
    const { itemCount, inconsistentItemIds, compoundScopeItemIds } =
      results.analyzeStepResult;
    if (itemCount === 0) return 1;
    const flagged = new Set([...inconsistentItemIds, ...compoundScopeItemIds]).size;
    return Math.max(0, 1 - flagged / itemCount);
  })
  .generateReason(({ results, score }) => {
    const { inconsistentItemIds, compoundScopeItemIds } = results.analyzeStepResult;
    return (
      `score=${score.toFixed(2)}; ` +
      `inconsistent=[${inconsistentItemIds.join(', ')}]; ` +
      `compound=[${compoundScopeItemIds.join(', ')}]`
    );
  });
