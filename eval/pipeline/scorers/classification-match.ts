import { createScorer } from '@mastra/core/evals';
import type { BillableLine } from '@/features/estimate-extraction-pipeline/classification';
import type { ExpectedClassification } from '../schema';
import type { FindingMatch } from './extraction-recall';

export interface ClassificationMismatch {
  findingLabel: string;
  reason: string;
}

interface ClassificationMatchOutput {
  actualLines: BillableLine[];
  matches: FindingMatch[];
}

interface ClassificationMatchGroundTruth {
  expected: ExpectedClassification[];
}

/**
 * Classification's rebuilt pipeline output is a FLAT `BillableLine[]` —
 * one entry per material plus one for labor, not one entry per finding
 * (`buildLineId()`, classification/flatten.ts). Each line's own `id` is
 * `${findingId}:material:${index}` or `${findingId}:labor`, so the
 * originating finding id is recovered by splitting on the first `:` —
 * a small, local parsing detail of this harness, not a public contract
 * this scorer depends on classification/index.ts to export.
 */
function findingIdOf(line: BillableLine): string {
  return line.id.split(':')[0];
}

/**
 * Deterministic (no judge) — using the label -> actual finding id map
 * produced by extraction-recall, groups the actual `BillableLine[]` by
 * their originating finding id and compares each expected
 * classification's trade/materialCount/materialUnits against that
 * finding's own group of lines (research.md R5). A gate.
 */
export const classificationMatchScorer = createScorer<unknown, ClassificationMatchOutput>({
  id: 'eval-classification-match',
  description: 'Every expected classification must match its corresponding actual billable lines.',
})
  .analyze(({ run }) => {
    const groundTruth = run.groundTruth as ClassificationMatchGroundTruth;
    const mismatches: ClassificationMismatch[] = [];
    const actualIdByLabel = new Map(run.output.matches.map((m) => [m.label, m.actualFindingId]));

    const linesByFindingId = new Map<string, BillableLine[]>();
    for (const line of run.output.actualLines) {
      const id = findingIdOf(line);
      const group = linesByFindingId.get(id);
      if (group) group.push(line);
      else linesByFindingId.set(id, [line]);
    }

    for (const expected of groundTruth.expected) {
      const findingId = actualIdByLabel.get(expected.findingLabel);
      if (!findingId) {
        mismatches.push({ findingLabel: expected.findingLabel, reason: 'No matched actual finding (unverifiable)' });
        continue;
      }
      const lines = linesByFindingId.get(findingId);
      if (!lines || lines.length === 0) {
        mismatches.push({
          findingLabel: expected.findingLabel,
          reason: `No billable line found for actual finding id ${findingId} (possibly flagged for web search instead)`,
        });
        continue;
      }
      const actualTrade = lines[0].trade;
      if (actualTrade !== expected.trade) {
        mismatches.push({
          findingLabel: expected.findingLabel,
          reason: `Expected trade "${expected.trade}", got "${actualTrade}"`,
        });
        continue;
      }
      const materialLines = lines.filter((l) => l.costType === 'material');
      if (materialLines.length !== expected.materialCount) {
        mismatches.push({
          findingLabel: expected.findingLabel,
          reason: `Expected ${expected.materialCount} material line(s), got ${materialLines.length}`,
        });
        continue;
      }
      const actualUnits = materialLines.map((l) => l.unit).sort();
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
