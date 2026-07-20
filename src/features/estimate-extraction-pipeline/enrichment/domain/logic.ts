import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { billableLineSchema, type BillableLine } from '../../classification';
import { enrichmentAgent } from '../agent';
import { enrichedLineSchema, type EnrichedLine } from '../schema';

const lineInputSchema = z.object({ line: billableLineSchema });

function describeLine(line: BillableLine): string {
  return JSON.stringify({
    costType: line.costType,
    subject: line.costType === 'material' ? line.material : line.laborType,
    action: line.action,
    scope: line.scope,
    location: line.location,
    sourceQuote: line.sourceQuote,
  });
}

const enrichmentResponseSchema = z.object({
  amount: z.object({
    quantity: z.number().positive(),
    unit: z.enum(['ea', 'lf', 'sf', 'cy', 'hrs']),
  }),
  price: z.object({
    rate: z.number().int().min(0),
    currency: z.literal('USD'),
    confidence: z.enum(['high', 'medium', 'low']),
    source: z.string().min(1),
  }),
});

const enrichmentAgentStep = createStep(enrichmentAgent, {
  structuredOutput: { schema: enrichmentResponseSchema },
  retries: 2,
});

/**
 * Determines the amount and price for ONE billable line. Composed
 * directly into `wrapper.ts`'s own `createRun()`/try-catch, which is
 * what gives it per-item resilience in the outer `.foreach()`.
 */
export const enrichLineWorkflow = createWorkflow({
  id: 'enrich-one-line',
  inputSchema: lineInputSchema,
  outputSchema: enrichedLineSchema,
})
  .map(async ({ inputData }) => ({
    prompt: `Determine the amount and price for this billable line.\n\nLINE\n${describeLine(inputData.line)}`,
  }))
  .then(enrichmentAgentStep)
  .map(async ({ getInitData, getStepResult }) => {
    const { line } = getInitData<z.infer<typeof lineInputSchema>>();
    const { amount, price } = getStepResult(enrichmentAgentStep);
    return { ...line, ...amount, ...price } as EnrichedLine;
  })
  .commit();
