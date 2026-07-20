import Image from 'next/image';
import { Card } from '@/design-systems/shadcn/components/card';
import { Separator } from '@/design-systems/shadcn/components/separator';
import { Badge } from '@/design-systems/shadcn/components/badge';
import type { estimateRequestTable } from '@/features/estimate/db/schema';
import type { ParsedEnvelope } from '@/features/estimate/lib/envelope';
import { formatPartyRole } from '@/features/estimate/lib/format';
import { ItemsSection } from '@/features/estimate/components/items-section';

type EstimateRow = typeof estimateRequestTable.$inferSelect;

interface EstimateReportProps {
  row: EstimateRow;
  envelope: ParsedEnvelope;
}

/**
 * Branded FixPro estimate report. Layout mirrors a printed invoice:
 *
 *   [logo]  FixPro Estimate                Estimate #abc12345
 *           <fileName>                     Created June 2, 2026
 *   ────────────────────────────────────────────────────────
 *   Property                               Parties  [Submitted by …]
 *   ────────────────────────────────────────────────────────
 *   Billable Items                          [toggles]
 *     INTERIOR · 2 Items          Group Subtotal: $X,XXX.00
 *     Damaged Drywall Section          MATERIAL   32 SF   $480.00
 *       north wall, primary bedroom
 *       "<sourceQuote>"                          (toggleable)
 *       [confidence] source: <source>            (toggleable)
 *     Drywall Repaint                     LABOR   3.5 HRS  $265.00
 *   ────────────────────────────────────────────────────────
 *                                  Subtotal (Priced Lines): $X,XXX.00
 *                                          Unpriced Items: N
 *                                  Estimated Client Total: $X,XXX.00
 *   ────────────────────────────────────────────────────────
 *   Footer (AI-assisted disclaimer)
 */
export function EstimateReport({ row, envelope }: EstimateReportProps) {
  return (
    <Card className="mx-auto max-w-4xl px-8 py-10">
      <ReportHeader row={row} />
      <Separator className="my-8" />
      <PropertyAndParties row={row} />
      <Separator className="my-8" />
      <ItemsBlock envelope={envelope} />
      <Separator className="my-8" />
      <ReportFooter />
    </Card>
  );
}

function ReportHeader({ row }: { row: EstimateRow }) {
  const shortId = row.id.slice(0, 8);
  const created = new Date(row.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <Image
          src="/fixpro-logo.webp"
          alt="FixPro"
          width={48}
          height={48}
          priority
          className="rounded"
        />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            FixPro Estimate
          </h1>
          <p className="text-sm text-muted-foreground">{row.fileName}</p>
        </div>
      </div>
      <div className="text-right text-sm">
        <div className="font-mono">Estimate #{shortId}</div>
        <div className="text-muted-foreground">Created {created}</div>
      </div>
    </div>
  );
}

function PropertyAndParties({ row }: { row: EstimateRow }) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section>
        <h2 className="mb-2 text-lg font-semibold">Property</h2>
        <div className="text-sm leading-relaxed">
          <div>{row.propertyAddress}</div>
          <div className="text-muted-foreground">Zip {row.zipCode}</div>
          <div className="mt-2">
            <span className="text-muted-foreground">Timeframe: </span>
            {row.timeframe}
          </div>
        </div>
      </section>
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Parties</h2>
          <Badge variant="secondary">
            Submitted by {formatPartyRole(row.submitterRole)}
          </Badge>
        </div>
        <div className="grid gap-4 text-sm">
          <PartyBlock
            label="Listing agent"
            name={row.listingAgentName}
            phone={row.listingAgentPhone}
            email={row.listingAgentEmail}
          />
          <PartyBlock
            label="Buyer agent"
            name={row.buyerAgentName}
            phone={row.buyerAgentPhone}
            email={row.buyerAgentEmail}
          />
        </div>
      </section>
    </div>
  );
}

function PartyBlock({
  label,
  name,
  phone,
  email,
}: {
  label: string;
  name: string;
  phone: string;
  email: string;
}) {
  return (
    <div>
      <div className="font-medium">{label}</div>
      <div>{name}</div>
      <div className="text-muted-foreground">{phone}</div>
      <div className="text-muted-foreground">{email}</div>
    </div>
  );
}

/**
 * v1/v2 legacy estimates are no longer supported (revised FR-003,
 * specs/007-pipeline-schema-cleanup) — only `'v3'`, `'unparseable'`, and
 * `'absent'` remain on `ParsedEnvelope`, so this no longer branches on
 * `envelope.kind` to assemble items/prices from two different shapes;
 * it renders `ItemsSection` directly with the one shape that exists.
 */
function ItemsBlock({ envelope }: { envelope: ParsedEnvelope }) {
  if (envelope.kind === 'absent') {
    return (
      <EmptyState
        title="Estimate is still being prepared."
        body="This estimate has no summary yet. Check back once processing completes."
      />
    );
  }
  if (envelope.kind === 'unparseable') {
    return (
      <EmptyState
        title="Summary unavailable"
        body="We couldn't parse the saved summary. The raw output is shown below for debugging."
      >
        <pre className="mt-4 max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
          {envelope.raw}
        </pre>
      </EmptyState>
    );
  }

  return (
    <ItemsSection lines={envelope.lines} />
  );
}

function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded border border-dashed p-6 text-sm">
      <div className="font-semibold">{title}</div>
      <p className="mt-1 text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}

function ReportFooter() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Generated by FixPro. Pricing is AI-assisted and may require contractor
      confirmation.
    </p>
  );
}
