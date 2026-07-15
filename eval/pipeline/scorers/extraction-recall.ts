import { z } from 'zod';
import { createScorer } from '@mastra/core/evals';
import type { ExtractedFinding } from '@/features/estimate-extraction-pipeline/extraction';
import type { ExpectedFinding } from '../schema';
import { evalJudgeGateway } from '../gateway';

export interface FindingMatch {
  label: string;
  actualFindingId: string | null;
}

interface ExtractionRecallOutput {
  actual: ExtractedFinding[];
}

interface ExtractionRecallGroundTruth {
  expected: ExpectedFinding[];
}

const matchAnalysisSchema = z.object({
  matches: z.array(
    z.object({
      label: z.string(),
      actualFindingId: z.string().nullable(),
    }),
  ),
});

/**
 * LLM-judge — matches every fixture's expected finding (by human-chosen
 * label) against the extraction step's actual findings semantically,
 * tolerating paraphrase (FR-005a). Its analyzeStepResult carries the
 * label -> actual-id correspondence the classification/pricing scorers
 * consume next (data-model.md "Cross-stage id resolution"); a `null`
 * actualFindingId means that expected finding was not matched to
 * anything real. A gate — scores 1.0 only if every expected finding
 * matched.
 */
export const extractionRecallScorer = createScorer<unknown, ExtractionRecallOutput>({
  id: 'eval-extraction-recall',
  description: 'Every expected finding must be matched to a real, semantically-equivalent actual finding.',
  judge: {
    model: evalJudgeGateway.chat('claude-fable-5'),
    instructions:
      'You compare a list of EXPECTED billable findings (hand-authored from reading a real inspection ' +
      'report) against a list of ACTUAL findings a different AI extracted from the same report. For each ' +
      'expected finding, decide whether one of the actual findings describes the SAME real-world defect and ' +
      'action — tolerate different wording, but the action and the physical thing/location must genuinely ' +
      'match. Return the actual finding\'s id if matched, or null if none of the actual findings correspond ' +
      'to that expected one.',
  },
})
  .analyze({
    description: 'Match each expected finding to an actual finding id, or null.',
    outputSchema: matchAnalysisSchema,
    createPrompt: ({ run }) => {
      const groundTruth = run.groundTruth as ExtractionRecallGroundTruth;
      return (
        'EXPECTED FINDINGS:\n' +
        JSON.stringify(groundTruth.expected, null, 2) +
        '\n\nACTUAL FINDINGS:\n' +
        JSON.stringify(run.output.actual, null, 2) +
        '\n\nFor each expected finding (by its "label"), return the id of the actual finding that describes ' +
        'the same real-world defect and action, or null if none does. Return JSON: { "matches": ' +
        '[{ "label": string, "actualFindingId": string | null }] }, one entry per expected finding.'
      );
    },
  })
  .generateScore(({ run, results }) => {
    const groundTruth = run.groundTruth as ExtractionRecallGroundTruth;
    const total = groundTruth.expected.length;
    if (total === 0) return 1;
    const matched = results.analyzeStepResult.matches.filter((m) => m.actualFindingId !== null).length;
    return matched / total;
  })
  .generateReason(({ results, score }) => {
    const unmatched = results.analyzeStepResult.matches
      .filter((m) => m.actualFindingId === null)
      .map((m) => m.label);
    return unmatched.length === 0
      ? `score=${score.toFixed(2)}; every expected finding matched.`
      : `score=${score.toFixed(2)}; unmatched labels: [${unmatched.join(', ')}]`;
  });
