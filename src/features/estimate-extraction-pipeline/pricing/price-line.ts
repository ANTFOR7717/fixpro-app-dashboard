import { createStep } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { billableLineSchema } from '../classification';
import { itemPricerAgent } from './agent';
import {
  laborPriceResponseSchema,
  materialPriceResponseSchema,
  pricedLineSchema,
} from './schema';
import { createModuleLogger } from '../shared/logger';

/** Module-scoped: constructed once, not per line priced. */
const log = createModuleLogger('pricing-fanout');

/**
 * Price ONE billable line. Internal step — `pricing/workflow.ts` is the
 * only thing that runs this, via `.foreach`.
 *
 * Resilience: a per-line failure records an 'unavailable' price rather
 * than throwing, so one bad line never fails the whole `.foreach` batch.
 * This mechanism is UNCHANGED by specs/007-pipeline-schema-cleanup
 * (FR-016; verified against Mastra's own docs, research.md R8, as a
 * legitimate idiom, not a defect) — only the DATA SHAPE this step
 * constructs changes, because `pricedLineSchema` itself changed
 * (FR-011/FR-017): the success path now passes the agent's own
 * `result.object.price` straight through (both sides are the exact same
 * `determinedOr()` union), rather than reconstructing a flat object
 * field-by-field, and the catch-block fallback now returns
 * `{ status: 'unavailable', reason }` instead of the old flat
 * `{ unitPrice: null, ... }` shape.
 *
 * This step runs inside `pricingFanoutWorkflow`, which is deliberately
 * NEVER registered on the top-level `Mastra` instance (pricing's fan-out
 * is its own private implementation detail — see workflow.ts). Confirmed
 * live: the `mastra` context Mastra injects into a step's `execute` is
 * `undefined` for steps of an unregistered/standalone workflow run via
 * `.createRun()` directly. This step therefore never reads `mastra` from
 * its execute context — the module-scoped `log` above (an SDK
 * `createLogger` instance, not the execute-context one) covers the one
 * thing that would otherwise have needed it.
 */
export const priceLineStep = createStep({
  id: 'price-line',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    line: billableLineSchema,
  }),
  outputSchema: pricedLineSchema,
  execute: async ({ inputData }) => {
    const { line, zipCode, estimateRequestId } = inputData;

    const userText =
      'Price ONE billable line. Return JSON matching the schema.\n\n' +
      `zipCode: ${zipCode}\n` +
      `trade: ${line.trade}\n` +
      `action: ${line.action}\n` +
      `scope: ${line.scope}\n` +
      `location: ${line.location}\n` +
      `costType: ${line.costType}\n` +
      `pricingBasis: ${line.pricingBasis}\n` +
      (line.costType === 'material'
        ? `extent: ${line.quantity} ${line.unit}\n`
        : `hours: ${line.quantity}\n`) +
      `sourceQuote: ${JSON.stringify(line.sourceQuote)}`;

    try {
      const requestContext = new RequestContext([
        ['estimateRequestId', estimateRequestId],
        ['itemId', line.id],
      ]);

      if (line.costType === 'material') {
        const result = await itemPricerAgent.generate(
          [{ role: 'user', content: [{ type: 'text', text: userText }] }],
          { structuredOutput: { schema: materialPriceResponseSchema }, requestContext },
        );
        const m = result.object;
        if (!m) throw new Error('pricer returned no structured object');
        return { ...line, price: m.price };
      }

      const result = await itemPricerAgent.generate(
        [{ role: 'user', content: [{ type: 'text', text: userText }] }],
        { structuredOutput: { schema: laborPriceResponseSchema }, requestContext },
      );
      const l = result.object;
      if (!l) throw new Error('pricer returned no structured object');
      return { ...line, price: l.price };
    } catch (e) {
      log.warn('[price-line] per-line failure', {
        estimateRequestId,
        itemId: line.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        ...line,
        price: {
          status: 'unavailable' as const,
          reason: 'Pricing lookup failed; needs contractor quote.',
        },
      };
    }
  },
});
