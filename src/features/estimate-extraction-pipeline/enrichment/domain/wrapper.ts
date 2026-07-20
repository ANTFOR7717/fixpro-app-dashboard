import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { billableLineSchema } from '../../classification';
import { enrichedLineSchema } from '../schema';
import { enrichLineWorkflow } from './logic';

const lineInputSchema = z.object({ line: billableLineSchema });

/**
 * Catches a per-line failure so one bad line can't cancel the whole
 * `.foreach()` batch (Mastra docs: "Handle Errors Inside the Step" —
 * wrap step logic in try/catch, always return a typed result instead of
 * throwing). A failed line is dropped from the output entirely — same
 * resolution classification already uses for a failed finding.
 */
export const enrichLineStep = createStep({
  id: 'enrich-one-line-safe',
  inputSchema: lineInputSchema,
  outputSchema: enrichedLineSchema.nullable(),
  execute: async ({ inputData, requestContext }) => {
    try {
      const run = await enrichLineWorkflow.createRun();
      const result = await run.start({ inputData, requestContext });
      return result.status === 'success' ? result.result : null;
    } catch {
      return null;
    }
  },
});
