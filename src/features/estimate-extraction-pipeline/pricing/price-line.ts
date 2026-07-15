import { createStep } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { billableLineSchema } from '../classification';
import { itemPricerAgent } from './agent';
import {
  laborPriceResponseSchema,
  materialPriceResponseSchema,
  pricedLineItemSchema,
} from './schema';
import { createModuleLogger } from '../shared/logger';

/** Module-scoped: constructed once, not per line priced. */
const log = createModuleLogger('pricing-fanout');

/**
 * Price ONE billable line. Internal step — `pricing/workflow.ts` is the
 * only thing that runs this, via `.foreach`.
 *
 * Resilience: a per-line failure records a 'lookup-failed' price rather
 * than throwing, so one bad line never fails the whole `.foreach` batch.
 * The line itself passes through completely unchanged in both the
 * success and failure paths — classification already gave it a real,
 * resolved quantity/hours; pricing only ever adds a price alongside it.
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
  outputSchema: z.object({
    line: billableLineSchema,
    price: pricedLineItemSchema,
  }),
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
        return {
          line,
          price: {
            itemId: line.id,
            unitPrice: m.unitPrice,
            currency: m.currency,
            confidence: m.confidence,
            source: m.source,
            unavailableReason: m.unavailableReason,
          },
        };
      }

      const result = await itemPricerAgent.generate(
        [{ role: 'user', content: [{ type: 'text', text: userText }] }],
        { structuredOutput: { schema: laborPriceResponseSchema }, requestContext },
      );
      const l = result.object;
      if (!l) throw new Error('pricer returned no structured object');
      return {
        line,
        price: {
          itemId: line.id,
          unitPrice: l.hourlyRate,
          currency: l.currency,
          confidence: l.confidence,
          source: l.source,
          unavailableReason: l.unavailableReason,
        },
      };
    } catch (e) {
      log.warn('[price-line] per-line failure', {
        estimateRequestId,
        itemId: line.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        line,
        price: {
          itemId: line.id,
          unitPrice: null,
          currency: 'USD' as const,
          confidence: 'low' as const,
          source: 'lookup-failed',
          unavailableReason: 'Pricing lookup failed; needs contractor quote.',
        },
      };
    }
  },
});
