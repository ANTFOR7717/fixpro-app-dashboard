'use client';

import { useId, useMemo, useState } from 'react';
import { Badge } from '@/design-systems/shadcn/components/badge';
import { Separator } from '@/design-systems/shadcn/components/separator';
import { Switch } from '@/design-systems/shadcn/components/switch';
import {
  PRICE_UNAVAILABLE,
  formatCostType,
  formatCurrency,
  formatLineTotal,
  formatLocation,
  formatScope,
  formatTradeLabel,
  formatUnit,
} from '@/features/estimate/lib/format';
import type {
  BillableItem,
  PricedLineItem,
} from '@/mastra/agents/billable-item-extractor.schema';

interface ItemsSectionProps {
  items: BillableItem[];
  prices: PricedLineItem[];
}

/**
 * Renders the "Billable items" block of the report with two viewer-side
 * toggles:
 *
 *   - "Show source quote" — controls the italic verbatim excerpt from the
 *     inspection report (and its page hint).
 *   - "Show pricing evidence" — controls the confidence badge + source
 *     label + unavailable-reason annotation on each line.
 *
 * Toggle state is intentionally per-render and not persisted. Both toggles
 * default to OFF so the report reads as a clean invoice by default; users
 * can opt into auditable evidence (source quote, pricing rationale) when
 * needed.
 *
 * This is a client component because the toggles need local state; the
 * parent `EstimateReport` stays a server component and just passes the
 * already-parsed envelope contents through.
 */
export function ItemsSection({ items, prices }: ItemsSectionProps) {
  const [showSource, setShowSource] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  const priceByItemId = useMemo(
    () => new Map(prices.map((p) => [p.itemId, p])),
    [prices],
  );

  // Group items by `trade`, preserving order of first appearance.
  const groups = useMemo(() => {
    const byTrade = new Map<string, BillableItem[]>();
    for (const item of items) {
      const list = byTrade.get(item.trade);
      if (list) list.push(item);
      else byTrade.set(item.trade, [item]);
    }
    return Array.from(byTrade, ([trade, groupItems]) => {
      let groupSubtotal = 0;
      for (const item of groupItems) {
        const price = priceByItemId.get(item.id);
        if (price && price.unitPrice !== null) {
          groupSubtotal += item.quantity * price.unitPrice;
        }
      }
      return { trade, items: groupItems, groupSubtotal };
    });
  }, [items, priceByItemId]);

  let subtotal = 0;
  let unpriced = 0;
  for (const item of items) {
    const price = priceByItemId.get(item.id);
    if (price && price.unitPrice !== null) {
      subtotal += item.quantity * price.unitPrice;
    } else {
      unpriced++;
    }
  }

  const sourceToggleId = useId();
  const evidenceToggleId = useId();

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Billable Items</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Grouped by Trade. Client Total is Quantity × Unit Price. Labor is
            always measured in Hours.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <label
            htmlFor={sourceToggleId}
            className="flex cursor-pointer items-center gap-2"
          >
            <Switch
              id={sourceToggleId}
              checked={showSource}
              onCheckedChange={setShowSource}
            />
            <span>Show Source Quote</span>
          </label>
          <label
            htmlFor={evidenceToggleId}
            className="flex cursor-pointer items-center gap-2"
          >
            <Switch
              id={evidenceToggleId}
              checked={showEvidence}
              onCheckedChange={setShowEvidence}
            />
            <span>Show Pricing Evidence</span>
          </label>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No billable items were extracted from this report.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <TradeGroup
              key={group.trade}
              trade={group.trade}
              groupItems={group.items}
              groupSubtotal={group.groupSubtotal}
              priceByItemId={priceByItemId}
              showSource={showSource}
              showEvidence={showEvidence}
            />
          ))}
        </div>
      )}
      <Separator className="my-6" />
      <Totals subtotal={subtotal} unpriced={unpriced} />
    </section>
  );
}

function TradeGroup({
  trade,
  groupItems,
  groupSubtotal,
  priceByItemId,
  showSource,
  showEvidence,
}: {
  trade: string;
  groupItems: BillableItem[];
  groupSubtotal: number;
  priceByItemId: Map<string, PricedLineItem>;
  showSource: boolean;
  showEvidence: boolean;
}) {
  const tradeLabel = formatTradeLabel(trade);
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between bg-muted px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{tradeLabel}</span>
          <span className="inline-flex items-center rounded-full border bg-card px-1.5 py-0 text-[10px] normal-case tracking-normal">
            {groupItems.length} Items
          </span>
        </div>
        <div className="tabular-nums">
          Group Subtotal: {formatCurrency(groupSubtotal)}
        </div>
      </div>
      <div>
        {groupItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            price={priceByItemId.get(item.id) ?? null}
            showSource={showSource}
            showEvidence={showEvidence}
          />
        ))}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  price,
  showSource,
  showEvidence,
}: {
  item: BillableItem;
  price: PricedLineItem | null;
  showSource: boolean;
  showEvidence: boolean;
}) {
  const unitPrice = price?.unitPrice ?? null;
  const lineTotal = formatLineTotal(item.quantity, unitPrice);
  const isUnpriced = lineTotal === PRICE_UNAVAILABLE;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_130px] items-center border-t px-4 py-3 text-sm">
      <div>
        <div className="font-medium leading-snug">{formatScope(item.scope)}</div>
        <div className="text-xs text-muted-foreground">
          {formatLocation(item.location)}
        </div>
        {showSource ? (
          <div className="mt-1 text-sm italic text-muted-foreground">
            “{item.sourceQuote}”
            {item.pageHint ? (
              <span className="not-italic"> ({item.pageHint})</span>
            ) : null}
          </div>
        ) : null}
        {showEvidence && price ? (
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="mr-1">
              {price.confidence}
            </Badge>
            <span>source: {price.source}</span>
            {price.unitPrice === null && price.unavailableReason ? (
              <span> — {price.unavailableReason}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div>
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {formatCostType(item.costType)}
        </span>
      </div>
      <div className="tabular-nums">
        <span className="font-medium">{item.quantity}</span>
        <span className="ml-1 inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          {formatUnit(item.unit, item.costType)}
        </span>
      </div>
      <div
        className={
          isUnpriced
            ? 'tabular-nums text-right text-muted-foreground'
            : 'tabular-nums text-right font-semibold'
        }
      >
        {lineTotal}
      </div>
    </div>
  );
}

function Totals({
  subtotal,
  unpriced,
}: {
  subtotal: number;
  unpriced: number;
}) {
  return (
    <div className="flex justify-end">
      <div className="w-full max-w-xs space-y-2 text-sm tabular-nums">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal (Priced Lines)</span>
          <span className="font-semibold">{formatCurrency(subtotal)}</span>
        </div>
        {unpriced > 0 ? (
          <div className="flex justify-between text-muted-foreground">
            <span>Unpriced Items</span>
            <span>{unpriced}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t pt-2 text-base">
          <span className="font-semibold">Estimated Client Total</span>
          <span className="font-semibold">{formatCurrency(subtotal)}</span>
        </div>
        {unpriced > 0 ? (
          <p className="pt-1 text-xs text-muted-foreground">
            {unpriced} Line Item{unpriced === 1 ? '' : 's'} Need
            {unpriced === 1 ? 's' : ''} a Contractor Quote before the Final
            Total can be Confirmed.
          </p>
        ) : null}
      </div>
    </div>
  );
}
