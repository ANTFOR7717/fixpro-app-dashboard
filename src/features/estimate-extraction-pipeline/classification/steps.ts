import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { lineClassifierAgent } from './agent';
import {
  billableLineSchema,
  classificationOutputSchema,
  lineClassificationSchema,
  type BillableLine,
} from './schema';
import { pioneerGateway } from '../shared/gateway';
import { extractedFindingSchema, type ExtractedFinding } from '../extraction';

/**
 * A plain function, NOT a `createStep()` — same reasoning as
 * `extraction/steps.ts`'s `buildExtractionPrompt`: Mastra's own
 * canonical docs example for "build a prompt right before an
 * agent-composed step" is a bare `.map()`, never a named step. Called
 * from a `.map()` directly in `pipeline.ts`. No dedup step precedes this
 * anymore — the prior implementation's dedup logic was removed after
 * review found no observed evidence it was still needed, since
 * `findingExtractorAgent` already enforces "ONE FINDING PER FIX" at the
 * source.
 */
export function buildClassificationPrompt(findings: readonly ExtractedFinding[]): string {
  return (
    'Classify each finding below. Ground every material amount and ' +
    'labor hour count in the document or a web search — never null, ' +
    'never a bare guess. Return JSON matching the provided schema.\n\n' +
    findings
      .map(
        (f) =>
          `[${f.id}] action=${f.action} scope="${f.scope}" ` +
          `location="${f.location}" statedQuantity=${f.statedQuantity ?? 'none'} ` +
          `inspectorHours=${f.inspectorHours ?? 'none'} quote="${f.sourceQuote}"`,
      )
      .join('\n')
  );
}

/**
 * NOT the bare `createStep(agent, { structuredOutput })` composition —
 * confirmed via `tsc`, not guessed: that overload's `structuredOutput`
 * type only accepts `{ schema }`, no `model` field. This agent needs
 * `structuredOutput.model` (the documented Mastra fix for combining
 * `tools` with `structuredOutput` in the same call —
 * docs/agents/structured-output, "Use a separate structuring model"),
 * which the bare composition form has no way to express. This is
 * exactly Rule 1's own documented exception: "if a step needs per-call
 * runtime control over the agent invocation... call the agent inside
 * that step's own `execute()` function instead" — matching
 * `pricing/price-line.ts`'s established, already-compliant shape.
 *
 * `.stream()`, not `.generate()` — this is the same long, tool-calling
 * batch call that live-reproduced a 504 Gateway Timeout under
 * `.generate()` earlier this session. No manual drain loop (Rule 4):
 * nothing documented requires draining `textStream` for `.object` to
 * resolve.
 */
export const lineClassifierAgentStep = createStep({
  id: 'line-classifier-agent',
  inputSchema: z.object({ prompt: z.string() }),
  outputSchema: classificationOutputSchema,
  execute: async ({ inputData }) => {
    const stream = await lineClassifierAgent.stream(
      [{ role: 'user', content: [{ type: 'text', text: inputData.prompt }] }],
      {
        structuredOutput: {
          schema: classificationOutputSchema,
          model: pioneerGateway.chat('claude-fable-5'),
        },
      },
    );
    const result = await stream.object;
    if (!result) {
      throw new Error('Classification returned no structured object');
    }
    return result;
  },
});

/**
 * Turn the agent's per-finding classification into fully-resolved
 * BillableLine(s) — material array -> N material lines, one labor line.
 * This IS a named step, correctly (Rule 2) — conditional per-material
 * splitting and id-suffixing is real logic worth naming and validating.
 * Input combines the classification output with the ORIGINAL findings
 * (needed for action/scope/location/sourceQuote/pageHint, which the
 * classifier's response never re-echoes) — that combination happens in
 * the `.map()` immediately before this step in pipeline.ts, via
 * `getStepResult(findingExtractorAgentStep)`.
 */
export const buildLinesStep = createStep({
  id: 'build-lines',
  inputSchema: z.object({
    findings: z.array(extractedFindingSchema),
    classifications: z.array(lineClassificationSchema),
  }),
  outputSchema: z.object({ lines: z.array(billableLineSchema) }),
  execute: async ({ inputData }) => {
    const byFindingId = new Map(inputData.classifications.map((l) => [l.findingId, l]));
    const lines: BillableLine[] = [];

    for (const f of inputData.findings) {
      const cls = byFindingId.get(f.id);
      if (!cls) {
        // Unresolved — the agent didn't classify a finding it was given.
        // Throw rather than silently drop: an unclassified finding is a
        // real failure, not a case to paper over with a fabricated line.
        throw new Error(`Classification did not return a line for finding ${f.id}`);
      }

      const common = {
        trade: cls.trade,
        action: f.action,
        scope: f.scope,
        location: f.location,
        sourceQuote: f.sourceQuote,
        pageHint: f.pageHint,
      };

      const hasMaterial = cls.materials.length > 0;
      cls.materials.forEach((m, i) => {
        lines.push({
          ...common,
          id: cls.materials.length > 1 ? `${f.id}-material-${i}` : `${f.id}-material`,
          costType: 'material',
          material: m.material,
          quantity: m.quantity,
          unit: m.unit,
          amountSource: m.amountSource,
          pricingBasis: 'material-part-only',
        });
      });

      lines.push({
        ...common,
        id: hasMaterial ? `${f.id}-labor` : f.id,
        costType: 'labor',
        laborType: cls.laborType,
        unit: 'hrs',
        quantity: cls.laborHours,
        hoursSource: cls.laborHoursSource,
        pricingBasis: hasMaterial ? 'labor-install-hourly' : 'labor-all-in-hourly',
      });
    }

    return { lines };
  },
});
