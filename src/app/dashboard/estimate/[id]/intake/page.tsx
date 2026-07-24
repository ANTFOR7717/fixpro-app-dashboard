import { db } from "@/db";
import { estimateRequestTable } from "@/features/estimate/db/schema";
import { EstimateIntakeView } from "@/features/estimate/components/estimate-intake-view";
import { authServerProvider } from "@/auth/server-provider";
import { intakeIdentitySchema } from "@/features/estimate-extraction-pipeline/intake";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export default async function EstimateIntakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await authServerProvider.getSession({ headers: await headers() });
  if (!session?.user) return notFound();

  const [row] = await db
    .select()
    .from(estimateRequestTable)
    .where(eq(estimateRequestTable.id, id));

  if (!row || row.userId !== session.user.id) return notFound();

  const identity = intakeIdentitySchema.safeParse(row.intakeExtraction);

  let pipelineSubStage = null;
  if (row.status === "processing") {
    const { getEstimatePipelineSubStage } = await import(
      "@/features/estimate-extraction-pipeline/progress"
    );
    pipelineSubStage = await getEstimatePipelineSubStage(row.workflowRunId);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <EstimateIntakeView
        estimateRequestId={row.id}
        status={row.status}
        identity={identity.success ? identity.data : null}
        phase={row.intakeConfirmedAt && !row.timeframe ? "timeframe" : "identity"}
        errorMessage={row.errorMessage}
        pipelineSubStage={pipelineSubStage}
      />
    </main>
  );
}
