import type { BillableItem } from '@/mastra/agents/billable-item-extractor.schema';

/**
 * Group the material/labor halves of a split install/replace item into
 * one renderable unit.
 *
 * `merge-items.ts` splits install/replace items into two adjacent lines
 * with ids `<base>-material` / `<base>-labor` that share
 * trade/scope/location/sourceQuote. The report renders such a pair as
 * ONE item with two cost lines instead of two visually unrelated rows
 * repeating the same scope and quote.
 *
 * Grouping is purely mechanical: strip the split suffix and join
 * CONSECUTIVE lines with the same base id. Lines without a split suffix
 * (labor-only actions, and rows persisted before the split-id scheme)
 * always form a group of one. Consecutive-only matching means a
 * pathological envelope with interleaved or orphaned split ids degrades
 * to single rows — never to a wrong pairing.
 */
const SPLIT_SUFFIX_RE = /-(material|labor)$/;

export interface ItemGroup {
  /** 1 line (unsplit item) or 2 lines (material + labor pair). */
  lines: BillableItem[];
}

export function groupSplitPairs(items: readonly BillableItem[]): ItemGroup[] {
  const groups: Array<ItemGroup & { baseId: string; split: boolean }> = [];
  for (const item of items) {
    const split = SPLIT_SUFFIX_RE.test(item.id);
    const baseId = split ? item.id.replace(SPLIT_SUFFIX_RE, '') : item.id;
    const prev = groups[groups.length - 1];
    if (split && prev?.split && prev.baseId === baseId) {
      prev.lines.push(item);
    } else {
      groups.push({ baseId, split, lines: [item] });
    }
  }
  return groups;
}
