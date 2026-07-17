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
  formatItemTitle,
  formatTradeLabel,
  formatUnit,
} from '@/features/estimate/lib/format';
import type { PricedLine } from '@/features/estimate-extraction-pipeline/pricing';
import type { Trade } from '@/features/estimate-extraction-pipeline/classification';
import type { ParsedDocument } from '@/features/estimate-extraction-pipeline/document';

interface ItemsSectionProps {
  lines: PricedLine[];
  parsedDocument: ParsedDocument;
}

/**
 * The determined price amount for one line, or `null` when unavailable —
 * the one place this component narrows `PricedLine.price`'s
 * `determinedOr()` union (reading its own `status` tag, the documented,
 * unavoidable way to consume a discriminated union — spec.md's Governing
 * Rule). Kept as a LOCAL, type-only-import-compatible copy rather than
 * importing `pricing/schema.ts`'s exported `priceAmount()` through the
 * `pricing` door: this file is `'use client'`, and every existing import
 * from `pricing` here is deliberately `import type` so it's erased at
 * compile time — importing a real runtime value from that door pulls
 * `pricing/index.ts`'s full module graph (including `workflow.ts`/
 * `agent.ts`'s Mastra/Node-only code, e.g. `stream/web`) into the browser
 * bundle, which `pnpm build` catches as a hard failure. The eval pricing
 * scorer (a Node-only script, no client-bundle constraint) still imports
 * the shared `pricing/schema.ts` version.
 */
function priceAmount(line: PricedLine): number | null {
  if (line.price.status !== 'determined') return null;
  return line.costType === 'material' ? line.price.value.unitPrice : line.price.value.hourlyRate;
}

/**
 * Renders the "Billable items" block of the report. v1/v2 legacy
 * estimates are no longer supported (revised FR-003,
 * specs/007-pipeline-schema-cleanup) — this component only ever
 * receives the current, merged-price v3 shape, so there is no
 * runtime type-discriminant or separate rendering path to maintain.
 *
 * Three viewer-side toggles:
 *
 *   - "Show source quote" — controls the italic verbatim excerpt from the
 *     inspection report.
 *   - "Show pricing evidence" — controls the confidence badge + source
 *     label + unavailable-reason annotation on each line.
 *   - "Show debug JSON" — controls one whole-document raw JSON view: the
 *     page-level parsed document. Nothing per-line-item.
 *
 * Toggle state is intentionally per-render and not persisted. All three
 * toggles default to OFF so the report reads as a clean invoice by
 * default; users can opt into auditable/debug detail when needed.
 *
 * This is a client component because the toggles need local state; the
 * parent `EstimateReport` stays a server component and just passes the
 * already-parsed envelope contents through.
 */
export function ItemsSection({ lines, parsedDocument }: ItemsSectionProps) {
  const [showSource, setShowSource] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Group items by `trade`, preserving order of first appearance.
  const groups = useMemo(() => {
    const byTrade = new Map<Trade, PricedLine[]>();
    for (const line of lines) {
      const list = byTrade.get(line.trade);
      if (list) list.push(line);
      else byTrade.set(line.trade, [line]);
    }
    return Array.from(byTrade, ([trade, groupLines]) => {
      let groupSubtotal = 0;
      for (const line of groupLines) {
        const amount = priceAmount(line);
        if (amount !== null) groupSubtotal += line.quantity * amount;
      }
      return { trade, lines: groupLines, groupSubtotal };
    });
  }, [lines]);

  let subtotal = 0;
  let unpriced = 0;
  for (const line of lines) {
    const amount = priceAmount(line);
    if (amount !== null) subtotal += line.quantity * amount;
    else unpriced++;
  }

  const sourceToggleId = useId();
  const evidenceToggleId = useId();
  const debugToggleId = useId();

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
          <label
            htmlFor={debugToggleId}
            className="flex cursor-pointer items-center gap-2"
          >
            <Switch
              id={debugToggleId}
              checked={showDebug}
              onCheckedChange={setShowDebug}
            />
            <span>Show Debug JSON</span>
          </label>
        </div>
      </div>
      {showDebug ? (
        <div className="mb-4 space-y-3">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Parsed Document (page-level)
            </div>
            <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(parsedDocument, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
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
      <Totals subtotal={subtotal} unpriced={unpriced} />
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
  groupLines: PricedLine[];
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
  line: PricedLine;
  showSource: boolean;
  showEvidence: boolean;
}) {
  const unitPrice = priceAmount(line);
  const lineTotal = formatLineTotal(line.quantity, unitPrice);
  const isUnpriced = lineTotal === PRICE_UNAVAILABLE;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_90px_110px_130px] items-center border-t px-4 py-3 text-sm">
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="font-medium leading-snug">
            {formatItemTitle(line.scope, line.action, line.costType)}
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
            {line.price.status === 'determined' ? (
              <>
                <Badge variant="outline" className="mr-1">
                  {line.price.value.confidence}
                </Badge>
                <span>source: {line.price.value.source}</span>
              </>
            ) : (
              <span>{line.price.reason}</span>
            )}
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
