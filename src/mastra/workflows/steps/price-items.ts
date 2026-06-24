import { createStep } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import {
  billableItemSchema,
  pricedLineItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import { itemPricerResponseSchema } from '@/mastra/agents/item-pricer.schema';

/**
 * For every merged billable item, call the pricer agent with the item's
 * compact description and the row's zip code. Collect the results into a
 * parallel `prices: PricedLineItem[]` array keyed by `itemId`.
 *
 * Resilience:
 *   - `retries: 1` for transient throws (network, gateway 5xx) at the
 *     step level. The pricer is best-effort — we do not want to retry
 *     forever and block the run.
 *   - Per-item `try/catch`: a malformed model response or per-item throw
 *     records `unitPrice: null, source: 'lookup-failed'` so one bad
 *     item never poisons the batch.
 *   - Outer `try/catch`: if the loop itself dies, return `prices: []`
 *     so the report can still render "Price unavailable" for every row.
 */
export const priceItemsStep = createStep({
  id: 'price-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    items: z.array(billableItemSchema),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    items: z.array(billableItemSchema),
    prices: z.array(pricedLineItemSchema),
  }),
  retries: 1,
  execute: async ({ inputData, mastra }) => {
    const log = mastra.getLogger();
    try {
      const agent = mastra.getAgent('item-pricer');
      const prices: z.infer<typeof pricedLineItemSchema>[] = [];
      let pricedCount = 0;
      let unavailableCount = 0;
      let lookupFailedCount = 0;

      for (const item of inputData.items) {
        const userText =
          'Price ONE billable item. Return JSON matching the schema.\n\n' +
          `zipCode: ${inputData.zipCode}\n` +
          `trade: ${item.trade}\n` +
          `action: ${item.action}\n` +
          `scope: ${item.scope}\n` +
          `location: ${item.location}\n` +
          `quantity: ${item.quantity}\n` +
          `unit: ${item.unit}\n` +
          `costType: ${item.costType}\n` +
          `sourceQuote: ${JSON.stringify(item.sourceQuote)}`;

        try {
          const result = await agent.generate(
            [{ role: 'user', content: [{ type: 'text', text: userText }] }],
            {
              structuredOutput: { schema: itemPricerResponseSchema },
              requestContext: new RequestContext([
                ['estimateRequestId', inputData.estimateRequestId],
                ['itemId', item.id],
              ]),
            },
          );
          const r = result.object;
          if (!r) {
            lookupFailedCount++;
            prices.push({
              itemId: item.id,
              unitPrice: null,
              currency: 'USD',
              confidence: 'low',
              source: 'lookup-failed',
              unavailableReason:
                'AI returned malformed price; needs contractor quote.',
            });
            continue;
          }
          if (r.unitPrice === null) unavailableCount++;
          else pricedCount++;
          prices.push({
            itemId: item.id,
            unitPrice: r.unitPrice,
            currency: r.currency,
            confidence: r.confidence,
            source: r.source,
            unavailableReason: r.unavailableReason,
          });
        } catch (e) {
          lookupFailedCount++;
          log.warn('[price-items] per-item failure', {
            estimateRequestId: inputData.estimateRequestId,
            itemId: item.id,
            error: e instanceof Error ? e.message : String(e),
          });
          prices.push({
            itemId: item.id,
            unitPrice: null,
            currency: 'USD',
            confidence: 'low',
            source: 'lookup-failed',
            unavailableReason: 'Pricing lookup failed; needs contractor quote.',
          });
        }
      }

      log.info('[pricing-quality]', {
        estimateRequestId: inputData.estimateRequestId,
        zipCode: inputData.zipCode,
        total: inputData.items.length,
        pricedCount,
        unavailableCount,
        lookupFailedCount,
      });

      return {
        estimateRequestId: inputData.estimateRequestId,
        items: inputData.items,
        prices,
      };
    } catch (e) {
      log.error('[price-items] step failure (non-fatal)', {
        estimateRequestId: inputData.estimateRequestId,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        estimateRequestId: inputData.estimateRequestId,
        items: inputData.items,
        prices: [],
      };
    }
  },
});
