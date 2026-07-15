import { createScorer } from '@mastra/core/evals';
import type { PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';
import type { ExpectedPricing } from '../schema';
import type { FindingMatch } from './extraction-recall';

export interface PricingMismatch {
  findingLabel: string;
  reason: string;
}

interface PricingMatchOutput {
  actualPrices: PricedLineItem[];
  matches: FindingMatch[];
}

interface PricingMatchGroundTruth {
  expected: ExpectedPricing[];
}

/**
 * Deterministic (no judge) — using the label -> actual finding id map
 * produced by extraction-recall, finds every priced line whose itemId
 * belongs to that finding (exact id, or `${id}-labor` / `${id}-material...`
 * per classification/steps.ts's buildLinesStep suffixing convention) and
 * checks whether they were all priced or all correctly flagged
 * unavailable, matching the fixture's expected outcome (FR-005b,
 * research.md R6). A gate.
 */
export const pricingMatchScorer = createScorer<unknown, PricingMatchOutput>({
  id: 'eval-pricing-match',
  description: "Every expected pricing outcome must match the finding's actual priced/unavailable lines.",
})
  .analyze(({ run }) => {
    const groundTruth = run.groundTruth as PricingMatchGroundTruth;
    const mismatches: PricingMismatch[] = [];
    const actualIdByLabel = new Map(run.output.matches.map((m) => [m.label, m.actualFindingId]));
    for (const expected of groundTruth.expected) {
      const findingId = actualIdByLabel.get(expected.findingLabel);
      if (!findingId) {
        mismatches.push({ findingLabel: expected.findingLabel, reason: 'No matched actual finding (unverifiable)' });
        continue;
      }
      const ownLines = run.output.actualPrices.filter(
        (p) => p.itemId === findingId || p.itemId.startsWith(`${findingId}-`),
      );
      if (ownLines.length === 0) {
        mismatches.push({
          findingLabel: expected.findingLabel,
          reason: `No priced line found for actual finding id ${findingId}`,
        });
        continue;
      }
      const allPriced = ownLines.every((p) => p.unitPrice !== null);
      const allUnavailable = ownLines.every((p) => p.unitPrice === null);
      if (expected.outcome === 'priced' && !allPriced) {
        mismatches.push({
          findingLabel: expected.findingLabel,
          reason: `Expected all lines priced, but ${
            ownLines.filter((p) => p.unitPrice === null).length
          } of ${ownLines.length} were unavailable`,
        });
      } else if (expected.outcome === 'unavailable' && !allUnavailable) {
        mismatches.push({
          findingLabel: expected.findingLabel,
          reason: `Expected all lines unavailable, but ${
            ownLines.filter((p) => p.unitPrice !== null).length
          } of ${ownLines.length} were priced`,
        });
      }
    }
    return mismatches;
  })
  .generateScore(({ results }) => (results.analyzeStepResult.length === 0 ? 1 : 0))
  .generateReason(({ results }) =>
    results.analyzeStepResult.length === 0
      ? 'Every expected pricing outcome matched.'
      : results.analyzeStepResult.map((m) => `${m.findingLabel}: ${m.reason}`).join('; '),
  );
