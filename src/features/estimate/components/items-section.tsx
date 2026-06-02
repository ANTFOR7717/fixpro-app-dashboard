'use client';

import { useId, useState } from 'react';
import { Badge } from '@/design-systems/shadcn/components/badge';
import { Separator } from '@/design-systems/shadcn/components/separator';
import { Switch } from '@/design-systems/shadcn/components/switch';
import {
  PRICE_UNAVAILABLE,
  formatCurrency,
  formatItemTitle,
  formatLineTotal,
  formatTradeLabel,
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

  const priceByItemId = new Map(prices.map((p) => [p.itemId, p]));

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Billable items</h2>
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
            <span>Show source quote</span>
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
            <span>Show pricing evidence</span>
          </label>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No billable items were extracted from this report.
        </p>
      ) : (
        <ul className="space-y-5">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              price={priceByItemId.get(item.id) ?? null}
              showSource={showSource}
              showEvidence={showEvidence}
            />
          ))}
        </ul>
      )}
      <Separator className="my-6" />
      <Totals subtotal={subtotal} unpriced={unpriced} />
    </section>
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
  const title = formatItemTitle(item);
  const tradeLabel = formatTradeLabel(item.trade);
  return (
    <li className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {tradeLabel} <span className="font-mono normal-case">· #{item.id}</span>
        </div>
        <div className="mt-0.5 font-medium leading-snug">{title}</div>
        <div className="text-sm text-muted-foreground">
          Location: {item.location}
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
      <div className="text-right text-sm tabular-nums">
        <div className="text-muted-foreground">
          {item.quantity} ×{' '}
          {unitPrice !== null ? formatCurrency(unitPrice) : '—'}
        </div>
        <div className={isUnpriced ? 'text-muted-foreground' : 'font-semibold'}>
          {lineTotal}
        </div>
      </div>
    </li>
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
      <div className="w-full max-w-xs space-y-1 text-sm tabular-nums">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-semibold">{formatCurrency(subtotal)}</span>
        </div>
        {unpriced > 0 ? (
          <div className="flex justify-between text-muted-foreground">
            <span>Unpriced items</span>
            <span>{unpriced}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
