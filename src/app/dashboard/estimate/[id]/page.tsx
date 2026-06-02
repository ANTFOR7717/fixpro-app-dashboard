import { db } from "@/db";
import { estimateRequestTable } from "@/features/estimate/db/schema";
import { eq } from "drizzle-orm";
import { authServerProvider } from "@/auth/server-provider";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/design-systems/shadcn/components/button";
import { EstimateReport } from "@/features/estimate/components/estimate-report";
import { parseSummaryEnvelope } from "@/features/estimate/lib/envelope";

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await authServerProvider.getSession({ headers: await headers() });
  if (!session?.user) return notFound();

  const [row] = await db.select().from(estimateRequestTable).where(eq(estimateRequestTable.id, id));
  if (!row || row.userId !== session.user.id) return notFound();

  const envelope = parseSummaryEnvelope(row.summary);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Back to dashboard</Link>
        </Button>
      </div>
      <EstimateReport row={row} envelope={envelope} />
    </main>
  );
}
