import { join } from 'node:path';
import { mastra } from '@/features/estimate-extraction-pipeline';
import type { ExtractedFinding } from '@/features/estimate-extraction-pipeline/extraction';
import type { BillableLine } from '@/features/estimate-extraction-pipeline/classification';
import type { PricedLineItem } from '@/features/estimate-extraction-pipeline/pricing';
import { discoverFixtures } from './fixtures';
import { startFixtureServer } from './fixture-server';
import { groundingScorer, type GroundingViolation } from './scorers/grounding';
import { extractionRecallScorer, type FindingMatch } from './scorers/extraction-recall';
import { classificationMatchScorer, type ClassificationMismatch } from './scorers/classification-match';
import { pricingMatchScorer, type PricingMismatch } from './scorers/pricing-match';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

type FixtureOutcome =
  | { kind: 'invalid'; slug: string; reason: string }
  | { kind: 'run-failed'; slug: string; error: string }
  | {
      kind: 'scored';
      slug: string;
      stagePass: { extraction: boolean; classification: boolean; pricing: boolean };
      groundingViolations: GroundingViolation[];
      unverifiable: string[];
      classificationMismatches: ClassificationMismatch[];
      pricingMismatches: PricingMismatch[];
    };

interface WorkflowStep {
  status: string;
  output?: unknown;
}

/**
 * Runs and scores exactly one fixture. Deliberately never throws — any
 * failure (a pipeline run failure OR a scorer-level error, e.g. a
 * transient LLM-judge call failure or a bug in this harness's own
 * comparison code) is caught and reported as this fixture's own
 * 'run-failed' outcome, never allowed to abort the sweep over the other
 * fixtures. The real production pipeline being tested here matters far
 * more than this eval tooling's own scoring correctness — a bug or
 * transient failure in a scorer must degrade to "this one fixture
 * couldn't be scored," not crash the whole run and produce zero signal
 * for every other fixture.
 */
async function runFixture(
  fixture: Awaited<ReturnType<typeof discoverFixtures>>['valid'][number],
  serverPort: number,
): Promise<FixtureOutcome> {
  try {
    const workflow = mastra.getWorkflow('summarize-estimate');
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        estimateRequestId: fixture.slug,
        fileUrl: `http://localhost:${serverPort}/${fixture.slug}.pdf`,
        zipCode: fixture.expected.zipCode,
      },
    });

    const steps = result.steps as unknown as Record<string, WorkflowStep>;
    const extractionStep = steps['finding-extractor'];
    if (!extractionStep || extractionStep.status !== 'success') {
      return {
        kind: 'run-failed',
        slug: fixture.slug,
        error: `finding-extractor step did not succeed (status: ${extractionStep?.status ?? 'missing'})`,
      };
    }

    const parseDocumentStep = steps['parse-document'];
    const extractionOutput = extractionStep.output as { findings: ExtractedFinding[] };
    const parsedDocumentOutput = parseDocumentStep?.output as { parsedDocument: { pages: { pageNumber: number; content: string }[] } };

    const groundingResult = await groundingScorer.run({
      input: undefined,
      output: { findings: extractionOutput.findings, parsedDocument: parsedDocumentOutput.parsedDocument },
      groundTruth: undefined,
    });
    const recallResult = await extractionRecallScorer.run({
      input: undefined,
      output: { actual: extractionOutput.findings },
      groundTruth: { expected: fixture.expected.findings },
    });

    if (!recallResult.analyzeStepResult) {
      throw new Error('extractionRecallScorer.run() returned no analyzeStepResult');
    }
    const matches: FindingMatch[] = recallResult.analyzeStepResult.matches;
    const unverifiable = matches.filter((m) => m.actualFindingId === null).map((m) => m.label);

    const classificationStep = steps['classification-fanout'];
    let classificationPass = false;
    let classificationMismatches: ClassificationMismatch[] = [];
    if (classificationStep && classificationStep.status === 'success') {
      const classificationOutput = classificationStep.output as { lines: BillableLine[] };
      const classificationResult = await classificationMatchScorer.run({
        input: undefined,
        output: { actualLines: classificationOutput.lines, matches },
        groundTruth: { expected: fixture.expected.classifications },
      });
      if (!classificationResult.analyzeStepResult) {
        throw new Error('classificationMatchScorer.run() returned no analyzeStepResult');
      }
      classificationMismatches = classificationResult.analyzeStepResult;
      classificationPass = classificationResult.score === 1;
    }

    const priceStep = steps['price'];
    let pricingPass = false;
    let pricingMismatches: PricingMismatch[] = [];
    if (priceStep && priceStep.status === 'success') {
      const priceOutput = priceStep.output as { prices: PricedLineItem[] };
      const pricingResult = await pricingMatchScorer.run({
        input: undefined,
        output: { actualPrices: priceOutput.prices, matches },
        groundTruth: { expected: fixture.expected.pricing },
      });
      if (!pricingResult.analyzeStepResult) {
        throw new Error('pricingMatchScorer.run() returned no analyzeStepResult');
      }
      pricingMismatches = pricingResult.analyzeStepResult;
      pricingPass = pricingResult.score === 1;
    }

    if (!groundingResult.analyzeStepResult) {
      throw new Error('groundingScorer.run() returned no analyzeStepResult');
    }

    return {
      kind: 'scored',
      slug: fixture.slug,
      stagePass: {
        extraction: recallResult.score === 1 && groundingResult.score === 1,
        classification: classificationPass,
        pricing: pricingPass,
      },
      groundingViolations: groundingResult.analyzeStepResult,
      unverifiable,
      classificationMismatches,
      pricingMismatches,
    };
  } catch (error) {
    // Deliberately broad: a pipeline run failure and a scorer-level bug
    // both land here, both reported the same way. The distinction isn't
    // worth the complexity it would add — either way, this fixture
    // produced no usable eval result, and every other fixture must still
    // get its own chance to run.
    return {
      kind: 'run-failed',
      slug: fixture.slug,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const slugFilter = process.argv[2];
  const { valid, invalid } = await discoverFixtures(FIXTURES_DIR);
  const fixturesToRun = slugFilter ? valid.filter((f) => f.slug === slugFilter) : valid;

  const outcomes: FixtureOutcome[] = invalid.map((i) => ({ kind: 'invalid', slug: i.slug, reason: i.reason }));

  const server = await startFixtureServer(FIXTURES_DIR);
  try {
    for (const fixture of fixturesToRun) {
      outcomes.push(await runFixture(fixture, server.port));
    }
  } finally {
    await server.stop();
  }

  for (const outcome of outcomes) {
    console.log(`\n=== ${outcome.slug} ===`);
    if (outcome.kind === 'invalid') {
      console.log(`INVALID: ${outcome.reason}`);
    } else if (outcome.kind === 'run-failed') {
      console.log(`RUN FAILED: ${outcome.error}`);
    } else {
      console.log(`extraction:      ${outcome.stagePass.extraction ? 'PASS' : 'FAIL'}`);
      console.log(`classification:  ${outcome.stagePass.classification ? 'PASS' : 'FAIL'}`);
      console.log(`pricing:         ${outcome.stagePass.pricing ? 'PASS' : 'FAIL'}`);
      if (outcome.groundingViolations.length > 0) {
        console.log(`  grounding violations: ${JSON.stringify(outcome.groundingViolations)}`);
      }
      if (outcome.unverifiable.length > 0) {
        console.log(`  unverifiable (unmatched expected findings): ${outcome.unverifiable.join(', ')}`);
      }
      if (outcome.classificationMismatches.length > 0) {
        console.log(`  classification mismatches: ${JSON.stringify(outcome.classificationMismatches)}`);
      }
      if (outcome.pricingMismatches.length > 0) {
        console.log(`  pricing mismatches: ${JSON.stringify(outcome.pricingMismatches)}`);
      }
    }
  }

  const hasFailure = outcomes.some(
    (o) =>
      o.kind === 'invalid' ||
      o.kind === 'run-failed' ||
      (o.kind === 'scored' && (!o.stagePass.extraction || !o.stagePass.classification || !o.stagePass.pricing)),
  );
  process.exit(hasFailure ? 1 : 0);
}

main();
