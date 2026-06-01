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
 *   - Renumbers `id` sequentially to "item-001", "item-002", ...
 */

function normKey(it: BillableItem): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return [it.trade, it.action, norm(it.scope), norm(it.location)].join('|');
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
  execute: async ({ inputData }) => {
    const seen = new Set<string>();
    const merged: BillableItem[] = [];

    for (const it of [...inputData.items, ...inputData.auditItems]) {
      const key = normKey(it);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(it);
    }

    const renumbered = merged.map((it, idx) => ({
      ...it,
      id: `item-${pad3(idx + 1)}`,
    }));

    return {
      estimateRequestId: inputData.estimateRequestId,
      items: renumbered,
    };
  },
});
