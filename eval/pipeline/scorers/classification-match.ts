import { createScorer } from '@mastra/core/evals';
import type { LineClassification } from '@/features/estimate-extraction-pipeline/classification';
import type { ExpectedClassification } from '../schema';
import type { FindingMatch } from './extraction-recall';

export interface ClassificationMismatch {
  findingLabel: string;
  reason: string;
}

interface ClassificationMatchOutput {
  actualClassifications: LineClassification[];
  matches: FindingMatch[];
}

interface ClassificationMatchGroundTruth {
  expected: ExpectedClassification[];
}

/**
 * Deterministic (no judge) — using the label -> actual finding id map
 * produced by extraction-recall, compares each expected classification's
 * trade/materialCount/materialUnits against the matched actual
 * LineClassification, keyed by findingId (research.md R5). A gate.
 */
export const classificationMatchScorer = createScorer<unknown, ClassificationMatchOutput>({
  id: 'eval-classification-match',
  description: 'Every expected classification must match its corresponding actual line classification.',
})
  .analyze(({ run }) => {
    const groundTruth = run.groundTruth as ClassificationMatchGroundTruth;
    const mismatches: ClassificationMismatch[] = [];
    const actualIdByLabel = new Map(run.output.matches.map((m) => [m.label, m.actualFindingId]));
    for (const expected of groundTruth.expected) {
      const findingId = actualIdByLabel.get(expected.findingLabel);
      if (!findingId) {
        mismatches.push({ findingLabel: expected.findingLabel, reason: 'No matched actual finding (unverifiable)' });
        continue;
      }
      const actual = run.output.actualClassifications.find((c) => c.findingId === findingId);
      if (!actual) {
        mismatches.push({
          findingLabel: expected.findingLabel,
          reason: `No classification found for actual finding id ${findingId}`,
        });
        continue;
      }
      if (actual.trade !== expected.trade) {
        mismatches.push({
          findingLabel: expected.findingLabel,
          reason: `Expected trade "${expected.trade}", got "${actual.trade}"`,
        });
        continue;
      }
      if (actual.materials.length !== expected.materialCount) {
        mismatches.push({
          findingLabel: expected.findingLabel,
          reason: `Expected ${expected.materialCount} material line(s), got ${actual.materials.length}`,
        });
        continue;
      }
      const actualUnits = actual.materials.map((m) => m.unit).sort();
      const expectedUnits = [...expected.materialUnits].sort();
      if (JSON.stringify(actualUnits) !== JSON.stringify(expectedUnits)) {
        mismatches.push({
          findingLabel: expected.findingLabel,
          reason: `Expected material units [${expectedUnits.join(', ')}], got [${actualUnits.join(', ')}]`,
        });
      }
    }
    return mismatches;
  })
  .generateScore(({ results }) => (results.analyzeStepResult.length === 0 ? 1 : 0))
  .generateReason(({ results }) =>
    results.analyzeStepResult.length === 0
      ? 'Every expected classification matched.'
      : results.analyzeStepResult.map((m) => `${m.findingLabel}: ${m.reason}`).join('; '),
  );
