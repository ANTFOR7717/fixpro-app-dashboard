'use client';

import { useId, useMemo, useState } from 'react';
import { Badge } from '@/design-systems/shadcn/components/badge';
import { Separator } from '@/design-systems/shadcn/components/separator';
import { Switch } from '@/design-systems/shadcn/components/switch';
import {
  formatCostType,
  formatCurrency,
  formatLineTotal,
  formatLocation,
  formatItemTitle,
  formatTradeLabel,
  formatUnit,
} from '@/features/estimate/lib/format';
import type { EnrichedLine } from '@/features/estimate-extraction-pipeline/enrichment';
import type { Trade } from '@/features/estimate-extraction-pipeline/classification';

interface ItemsSectionProps {
  lines: EnrichedLine[];
}

/**
 * Renders the "Billable items" block of the report.
 *
 * Two viewer-side toggles:
 *
 *   - "Show source quote" — controls the italic verbatim excerpt from the
 *     inspection report.
 *   - "Show pricing evidence" — controls the confidence badge + source
 *     label on each line.
 *
 * Toggle state is intentionally per-render and not persisted. Both
 * toggles default to OFF so the report reads as a clean invoice by
 * default; users can opt into auditable detail when needed.
 *
 * This is a client component because the toggles need local state; the
 * parent `EstimateReport` stays a server component and just passes the
 * already-parsed envelope contents through.
 */
export function ItemsSection({ lines }: ItemsSectionProps) {
  const [showSource, setShowSource] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  // Group items by `trade`, preserving order of first appearance.
  const groups = useMemo(() => {
    const byTrade = new Map<Trade, EnrichedLine[]>();
    for (const line of lines) {
      const list = byTrade.get(line.trade);
      if (list) list.push(line);
      else byTrade.set(line.trade, [line]);
    }
    return Array.from(byTrade, ([trade, groupLines]) => {
      let groupSubtotal = 0;
      for (const line of groupLines) {
        groupSubtotal += line.quantity * line.rate;
      }
      return { trade, lines: groupLines, groupSubtotal };
    });
  }, [lines]);

  let subtotal = 0;
  for (const line of lines) {
    subtotal += line.quantity * line.rate;
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
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No billable items were extracted from this report.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <TradeGroup
              key={group.trade}
              trade={group.trade}
              groupLines={group.lines}
              groupSubtotal={group.groupSubtotal}
              showSource={showSource}
              showEvidence={showEvidence}
            />
          ))}
        </div>
      )}
      <Separator className="my-6" />
      <Totals subtotal={subtotal} />
    </section>
  );
}

function TradeGroup({
  trade,
  groupLines,
  groupSubtotal,
  showSource,
  showEvidence,
}: {
  trade: Trade;
  groupLines: EnrichedLine[];
  groupSubtotal: number;
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
            {groupLines.length} Items
          </span>
        </div>
        <div className="tabular-nums">
          Group Subtotal: {formatCurrency(groupSubtotal)}
        </div>
      </div>
      <div>
        {groupLines.map((line) => (
          <ItemRow
            key={line.id}
            line={line}
            showSource={showSource}
            showEvidence={showEvidence}
          />
        ))}
      </div>
    </div>
  );
}

function ItemRow({
  line,
  showSource,
  showEvidence,
}: {
  line: EnrichedLine;
  showSource: boolean;
  showEvidence: boolean;
}) {
  const lineTotal = formatLineTotal(line.quantity, line.rate);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_130px] items-center border-t px-4 py-3 text-sm">
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="font-medium leading-snug">
            {formatItemTitle(line.scope)}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {formatLocation(line.location)}
        </div>
        {showSource ? (
          <div className="mt-1 text-sm italic text-muted-foreground">
            “{line.sourceQuote}”
          </div>
        ) : null}
        {showEvidence ? (
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="mr-1">
              {line.confidence}
            </Badge>
            <span>source: {line.source}</span>
          </div>
        ) : null}
      </div>
      <div>
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {formatCostType(line.costType)}
        </span>
      </div>
      <div className="tabular-nums">
        <span className="font-medium">{line.quantity}</span>
        <span className="ml-1 inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          {formatUnit(line.unit)}
        </span>
      </div>
      <div className="tabular-nums text-right font-semibold">
        {lineTotal}
      </div>
    </div>
  );
}

function Totals({ subtotal }: { subtotal: number }) {
  return (
    <div className="flex justify-end">
      <div className="w-full max-w-xs space-y-2 text-sm tabular-nums">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-semibold">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between border-t pt-2 text-base">
          <span className="font-semibold">Estimated Client Total</span>
          <span className="font-semibold">{formatCurrency(subtotal)}</span>
        </div>
      </div>
    </div>
  );
}
