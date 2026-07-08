import { createStep } from '@mastra/core/workflows';
import { createHash } from 'crypto';
import { z } from 'zod';
import {
  type BillableItem,
  type ExtractedItem,
  billableItemSchema,
  extractedItemSchema,
} from '@/mastra/agents/billable-item-extractor.schema';
import { ACTION_COST_PROFILE } from '@/mastra/config/agent-rules';
import { checkScopeShape } from '@/mastra/agents/processors/item-contract-guard/item-validator';

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

function normKey(it: ExtractedItem): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return [it.trade, it.action, norm(it.scope), norm(it.location)].join('|');
}

function normQuote(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Content-addressable id: sha256 of the item's identifying tuple,
 * truncated to 12 hex chars. Stable across passes (extract + audit)
 * and across re-runs of the same estimate, so the audit pass can
 * reference Pass A ids directly without remapping.
 */
function generateItemId(it: ExtractedItem): string {
  const seed = `${it.trade}-${it.action}-${it.scope}-${it.location}`.toLowerCase();
  return 'item-' + createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

/**
 * Deterministically assign `costType` and split mixed-cost items.
 *
 * `repair` / `service` / `evaluate` / `remove` never involve buying a
 * new part — they become a single `labor` line, unchanged otherwise.
 *
 * `install` / `replace` always involve BOTH a material purchase and the
 * labor to put it in — these are split into two billable lines that
 * share the same trade/action/scope/location/quantity/sourceQuote, so
 * the report shows two rows badged "Material" and "Labor" for the same
 * scope/location, each individually priceable, instead of one ambiguous
 * line that can only be billed as one or the other.
 *
 * Split ids are derived from the base id with a stable suffix so they
 * stay deterministic across re-runs, same as `generateItemId` itself.
 */
function classifyAndSplit(
  items: readonly (ExtractedItem & { id: string })[],
): { result: BillableItem[]; splitCount: number } {
  const result: BillableItem[] = [];
  let splitCount = 0;

  for (const it of items) {
    const profile = ACTION_COST_PROFILE[it.action];
    if (profile === 'labor-only') {
      result.push({ ...it, costType: 'labor' });
      continue;
    }
    // 'material-and-labor'
    splitCount++;
    // Deterministic twin of the guard's checkUnitActionCoupling rule: if
    // the model still emitted 'hrs' for an install/replace after the
    // guard's retry budget, hours cannot count a part — the material
    // line falls back to 'ea'. The labor line may legitimately keep the
    // inspector's hours.
    const materialUnit = it.unit === 'hrs' ? 'ea' : it.unit;
    result.push({ ...it, id: `${it.id}-material`, unit: materialUnit, costType: 'material' });
    result.push({ ...it, id: `${it.id}-labor`, costType: 'labor' });
  }

  return { result, splitCount };
}

export const mergeItemsStep = createStep({
  id: 'merge-items',
  inputSchema: z.object({
    estimateRequestId: z.string(),
    fileUrl: z.string().url(),
    zipCode: z.string(),
    items: z.array(extractedItemSchema),
    auditItems: z.array(extractedItemSchema),
    auditFailed: z.boolean(),
  }),
  outputSchema: z.object({
    estimateRequestId: z.string(),
    zipCode: z.string(),
    items: z.array(billableItemSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    const seenKeys = new Set<string>();
    const seenQuotes = new Set<string>();
    const merged: ExtractedItem[] = [];
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

    // Scope-quality safety net: the guard already retries the model on a
    // vague scope (e.g. a bare "Siding"/"Foundation"/"Receptacles"), but
    // gives up after `maxProcessorRetries` and lets the last attempt
    // through anyway. Re-running the IDENTICAL rule here means a vague
    // scope that survived the guard's retry budget still never reaches
    // the persisted report — it's dropped instead of shown as a garbage
    // line item on the client-facing invoice.
    const scopeValid = merged.filter((it) => checkScopeShape(it.scope).length === 0);
    const droppedByScopeViolation = merged.length - scopeValid.length;

    const renumbered = scopeValid.map((it) => ({
      ...it,
      // 'sqft' is a schema-tolerated legacy alias for 'sf' (see UNIT in
      // billable-item-extractor.schema.ts). Normalize here so persisted
      // v2 envelopes and pricer inputs only ever carry 'sf'.
      unit: it.unit === 'sqft' ? ('sf' as const) : it.unit,
      id: generateItemId(it),
    }));

    const { result: classified, splitCount } = classifyAndSplit(renumbered);

    mastra.getLogger().info('[extraction-quality]', {
      estimateRequestId: inputData.estimateRequestId,
      passACount: inputData.items.length,
      auditCount: inputData.auditItems.length,
      droppedBySourceQuote,
      droppedByStructuralKey,
      droppedByScopeViolation,
      auditFailed: inputData.auditFailed,
      mergedCount: renumbered.length,
      splitCount,
      finalLineCount: classified.length,
    });

    return {
      estimateRequestId: inputData.estimateRequestId,
      zipCode: inputData.zipCode,
      items: classified,
    };
  },
});
