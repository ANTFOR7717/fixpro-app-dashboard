import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { pricedLineSchema } from './schema';
import { presentationInputSchema, presentationAgentStep, mergePresentationStep, pricingStep } from './domain/logic';

/**
 * Composed directly as a step in `pipeline.ts` (workflow-as-step, its
 * own nested Studio graph — same reasoning as every other stage).
 */
export const presentationWorkflow = createWorkflow({
  id: 'Presentation',
  inputSchema: presentationInputSchema,
  outputSchema: z.object({ lines: z.array(pricedLineSchema) }),
})
  .then(presentationAgentStep)
  .then(mergePresentationStep)
  .then(pricingStep)
  .commit();
