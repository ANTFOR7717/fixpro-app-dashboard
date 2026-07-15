import { createScorer } from '@mastra/core/evals';
import type { ExtractedFinding } from '@/features/estimate-extraction-pipeline/extraction';
import type { ParsedDocument } from '@/features/estimate-extraction-pipeline/document';

export interface GroundingViolation {
  findingId: string;
  quotedText: string;
}

interface GroundingScorerOutput {
  findings: ExtractedFinding[];
  parsedDocument: ParsedDocument;
}

/**
 * Deterministic (function-mode, no judge) — verifies every actual
 * finding's `sourceQuote` is an actual verbatim substring of the
 * fixture's own parsed document text, independent of any expected
 * output (FR-006). A gate: any violation fails this fixture's run.
 *
 * CONFIRMED ISSUE (observed in the first live run against the real
 * 4014-sparrow-house-ln-inspection-report fixture, 2026-07-15) — all 34
 * findings were flagged as grounding violations, a 100% false-positive
 * rate. Deliberately NOT fixed yet — scorer accuracy is explicitly low
 * priority relative to the harness actually running and testing the
 * real pipeline; this is left as a known, confirmed gap to deal with
 * later, not guessed at or patched under pressure. Two contributing
 * causes observed directly in that run's own output:
 *   1. `document/parse.ts` strips NUL bytes with no space inserted, so
 *      a ligature-affected word (e.g. "efflorescence") is squished to
 *      "eorescence" in the real `parsedDocument.pages[].content` this
 *      scorer checks against — the agent's own emitted quotes already
 *      show this squished form (confirmed directly in the live run's
 *      output), so this alone should not cause a mismatch.
 *   2. The more likely dominant cause: `pdf-parse` preserves the
 *      source PDF's own visual line wrapping as literal newline
 *      characters in `page.content`, but the extraction agent
 *      naturally reproduces a multi-line source passage as continuous
 *      prose (a space where the source has a newline) when it
 *      "quotes verbatim" — an exact `.includes()` check has no
 *      tolerance for that, and inspection-report defect descriptions
 *      routinely wrap across multiple source lines. This needs a live
 *      re-run with instrumentation (e.g. logging one non-matching
 *      quote next to its expected page content side by side) to
 *      confirm before changing this scorer's matching strategy.
 */
export const groundingScorer = createScorer<unknown, GroundingScorerOutput>({
  id: 'eval-grounding',
  description: "Every finding's sourceQuote must appear verbatim in the fixture's parsed document text.",
})
  .analyze(({ run }) => {
    const violations: GroundingViolation[] = [];
    for (const finding of run.output.findings) {
      const found = run.output.parsedDocument.pages.some((page) => page.content.includes(finding.sourceQuote));
      if (!found) {
        violations.push({ findingId: finding.id, quotedText: finding.sourceQuote });
      }
    }
    return violations;
  })
  .generateScore(({ results }) => (results.analyzeStepResult.length === 0 ? 1 : 0))
  .generateReason(({ results }) =>
    results.analyzeStepResult.length === 0
      ? 'Every finding is grounded verbatim in the source document.'
      : `${results.analyzeStepResult.length} finding(s) not grounded: ${results.analyzeStepResult
          .map((v) => v.findingId)
          .join(', ')}`,
  );
