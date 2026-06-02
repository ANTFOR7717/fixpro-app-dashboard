import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  type BillableItem,
  billableItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Merge Pass A + Pass B items. Pure function, no I/O, no retries.
 *
 *   - Concatenates Pass A items + Pass B items.
 *   - Dedups by normalized `(trade, action, scope, location)`. First occurrence
 *     wins, so Pass A items take precedence over duplicate Pass B items.
 *   - ALSO dedups by `sourceQuote` (normalized). This catches the case where
 *     the same anchor quote surfaces twice with slight scope drift — e.g. the
 *     audit pass re-emits a permit-check item as "water heater permits" and
 *     Pass A already has it as "water heater replacement permits". Both
 *     sourceQuote strings are identical, the scope fields differ, the
 *     structural key misses. The sourceQuote precheck collapses them to one
 *     (the earlier occurrence wins).
 *   - Renumbers `id` sequentially to "item-001", "item-002", ...
 */

function normKey(it: BillableItem): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return [it.trade, it.action, norm(it.scope), norm(it.location)].join('|');
}

function normQuote(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

export const mergeItemsStep = createStep({
  id: 'merge-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    items: z.array(billableItemSchema),
    auditItems: z.array(billableItemSchema),
    auditFailed: z.boolean(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    items: z.array(billableItemSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    const seenKeys = new Set<string>();
    const seenQuotes = new Set<string>();
    const merged: BillableItem[] = [];
    // Extraction-quality counters — logged once at the end of the step so we
    // can spot model regressions without changing the workflow shape.
    let droppedBySourceQuote = 0;
    let droppedByStructuralKey = 0;

    for (const it of [...inputData.items, ...inputData.auditItems]) {
      // Drop true duplicates anchored on the same inspector quote. Earlier
      // occurrence wins, so Pass A items take precedence.
      const qKey = normQuote(it.sourceQuote);
      if (qKey && seenQuotes.has(qKey)) {
        droppedBySourceQuote++;
        continue;
      }
      // Drop duplicates with the same (trade, action, scope, location) even
      // when the quote differs (model paraphrasing across passes).
      const kKey = normKey(it);
      if (seenKeys.has(kKey)) {
        droppedByStructuralKey++;
        continue;
      }
      if (qKey) seenQuotes.add(qKey);
      seenKeys.add(kKey);
      merged.push(it);
    }

    const renumbered = merged.map((it, idx) => ({
      ...it,
      id: `item-${pad3(idx + 1)}`,
    }));

    mastra.getLogger().info('[extraction-quality]', {
      estimateRequestId: inputData.estimateRequestId,
      passACount: inputData.items.length,
      auditCount: inputData.auditItems.length,
      droppedBySourceQuote,
      droppedByStructuralKey,
      auditFailed: inputData.auditFailed,
      mergedCount: renumbered.length,
    });

    return {
      estimateRequestId: inputData.estimateRequestId,
      items: renumbered,
    };
  },
});
