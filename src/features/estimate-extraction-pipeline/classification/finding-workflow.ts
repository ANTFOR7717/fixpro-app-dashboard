import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractedFindingSchema, type ExtractedFinding } from '../extraction';
import { materialsAgent, laborAgent, tradeAgent } from './agents';
import { TRADE, billableLineSchema } from './schema';

const findingInputSchema = z.object({ finding: extractedFindingSchema });

function describeFinding(finding: ExtractedFinding): string {
  return JSON.stringify({
    action: finding.action,
    scope: finding.scope,
    location: finding.location,
    sourceQuote: finding.sourceQuote,
  });
}

const materialsStepOutputSchema = z.object({ materials: z.array(z.string().min(1)) });
const laborStepOutputSchema = z.object({ laborType: z.string().min(1) });
const tradeStepOutputSchema = z.object({ trade: z.enum(TRADE) });

/**
 * Bare `createStep(agent, { structuredOutput })` composition — Mastra owns
 * the transport entirely and always streams internally
 * (MASTRA-AGENT-WORKFLOW-STANDARD.md Rule 5). Each agent's own
 * `documentLookupTool` reads `parsedDocument` off the `RequestContext`
 * `pipeline.ts`'s `classificationStep` sets once for the whole
 * classification pass.
 */
const materialsAgentStep = createStep(materialsAgent, {
  structuredOutput: { schema: materialsStepOutputSchema },
  retries: 2,
});

const laborAgentStep = createStep(laborAgent, {
  structuredOutput: { schema: laborStepOutputSchema },
  retries: 2,
});

const tradeAgentStep = createStep(tradeAgent, {
  structuredOutput: { schema: tradeStepOutputSchema },
  retries: 2,
});

/**
 * The per-finding nested workflow: materials -> labor -> trade -> emit
 * billable lines directly. Quantity/hours are a later determination, not
 * this workflow's job — it only ever determines WHAT (materials, labor
 * type, trade), never HOW MUCH.
 */
const perFindingClassificationWorkflow = createWorkflow({
  id: 'classify-one-finding',
  inputSchema: findingInputSchema,
  outputSchema: z.array(billableLineSchema),
})
  .map(async ({ inputData }) => ({
    prompt: `Determine this finding's material(s), if any.\n\nFINDING\n${describeFinding(inputData.finding)}`,
  }))
  .then(materialsAgentStep)
  .map(async ({ getInitData }) => {
    const { finding } = getInitData<z.infer<typeof findingInputSchema>>();
    return {
      prompt: `Determine this finding's labor.\n\nFINDING\n${describeFinding(finding)}`,
    };
  })
  .then(laborAgentStep)
  .map(async ({ getInitData, getStepResult }) => {
    const { finding } = getInitData<z.infer<typeof findingInputSchema>>();
    const { materials } = getStepResult(materialsAgentStep);
    const { laborType } = getStepResult(laborAgentStep);
    return {
      prompt:
        `Determine this finding's trade.\n\nFINDING\n${describeFinding(finding)}\n\n` +
        `MATERIALS: ${JSON.stringify(materials)}\n` +
        `LABOR: ${laborType}`,
    };
  })
  .then(tradeAgentStep)
  .map(async ({ getInitData, getStepResult }) => {
    const { finding } = getInitData<z.infer<typeof findingInputSchema>>();
    const { materials } = getStepResult(materialsAgentStep);
    const { laborType } = getStepResult(laborAgentStep);
    const { trade } = getStepResult(tradeAgentStep);
    const identity = {
      trade,
      action: finding.action,
      scope: finding.scope,
      location: finding.location,
      sourceQuote: finding.sourceQuote,
      page: finding.page,
    };
    return [
      ...materials.map((material, i) => ({
        id: `${finding.id}:material:${i}`,
        ...identity,
        costType: 'material' as const,
        material,
      })),
      {
        id: `${finding.id}:labor`,
        ...identity,
        costType: 'labor' as const,
        laborType,
      },
    ];
  })
  .commit();

/**
 * Catches a per-finding failure so one bad finding can't cancel the whole
 * `.foreach()` batch (Mastra docs: "Handle Errors Inside the Step" — wrap
 * step logic in try/catch, always return a typed result instead of
 * throwing). A failed finding contributes zero billable lines.
 */
export const perFindingClassificationStep = createStep({
  id: 'classify-one-finding-safe',
  inputSchema: findingInputSchema,
  outputSchema: z.array(billableLineSchema),
  execute: async ({ inputData, requestContext }) => {
    try {
      const run = await perFindingClassificationWorkflow.createRun();
      const result = await run.start({ inputData, requestContext });
      return result.status === 'success' ? result.result : [];
    } catch {
      return [];
    }
  },
});
