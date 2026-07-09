import { createHash } from 'crypto';
import type { ExtractedWorkItem } from '../extraction';
import {
  billableLineSchema,
  pendingLineSchema,
  type BillableLine,
  type PendingLine,
} from './schema';
import { ACTION_COST_PROFILE, pricingBasisFor, type PricingBasis } from './rules';
import { roundToQuarter } from '../shared/quarter-hour';

export type { BillableLine, PendingLine, PricingBasis };
export { pricingBasisFor };
export { billableLineSchema, pendingLineSchema };

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function structuralKey(it: ExtractedWorkItem): string {
  return [it.trade, it.action, norm(it.scope), norm(it.location)].join('|');
}

/** Content-addressable id — stable across re-runs of the same input. */
function generateItemId(it: ExtractedWorkItem): string {
  const seed = `${it.trade}-${it.action}-${it.scope}-${it.location}`.toLowerCase();
  return 'item-' + createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

/**
 * Scope safety net: a bare category word ("Siding") or a full sentence is
 * not a billable scope. Violations are dropped, never rendered.
 */
function scopeIsRenderable(scope: string): boolean {
  const tokens = scope.trim().split(/\s+/);
  if (tokens.length < 2) return false;
  return !/[.!?]/.test(scope);
}

export interface ClassifyLinesOutput {
  lines: PendingLine[];
}

/**
 * THE CLASSIFICATION API. Deterministic: dedup work items, drop unrenderable
 * scopes, assign stable ids, split install/replace into material+labor per
 * ACTION_COST_PROFILE. Pure — no I/O, no AI, never throws on valid input.
 */
export function classifyLines(workItems: readonly ExtractedWorkItem[]): ClassifyLinesOutput {
  const seenQuotes = new Set<string>();
  const seenKeys = new Set<string>();
  const deduped: ExtractedWorkItem[] = [];

  for (const it of workItems) {
    const qKey = norm(it.sourceQuote);
    const kKey = structuralKey(it);
    if (seenQuotes.has(qKey) || seenKeys.has(kKey)) continue;
    seenQuotes.add(qKey);
    seenKeys.add(kKey);
    deduped.push(it);
  }

  const renderable = deduped.filter((it) => scopeIsRenderable(it.scope));
  const lines: PendingLine[] = [];

  for (const it of renderable) {
    const id = generateItemId(it);
    const common = {
      trade: it.trade,
      action: it.action,
      scope: it.scope,
      location: it.location,
      sourceQuote: it.sourceQuote,
      pageHint: it.pageHint,
    };
    const inspectorHours = it.inspectorHours === null ? null : roundToQuarter(it.inspectorHours);
    const isSplit = ACTION_COST_PROFILE[it.action] === 'material-and-labor';

    if (isSplit) {
      lines.push({
        ...common,
        id: `${id}-material`,
        costType: 'material',
        quantity: it.extent.quantity,
        unit: it.extent.unit,
      });
    }
    lines.push({
      ...common,
      id: isSplit ? `${id}-labor` : id,
      costType: 'labor',
      unit: 'hrs',
      quantity: inspectorHours,
      hoursSource: inspectorHours === null ? null : 'inspector',
    });
  }

  return { lines };
}
