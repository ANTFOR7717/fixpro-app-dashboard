import { db } from "@/db";
import { estimateRequestTable } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { authServerProvider } from "@/auth/server-provider";
import type { PipelineSubStage } from "@/features/estimate-extraction-pipeline/progress";
import { headers } from "next/headers";
import { FileText, ArrowRight } from "lucide-react";
import { Button } from "@/design-systems/shadcn/components/button";
import Link from "next/link";
import { EstimateRetryButton } from "./estimate-retry-button";
import { EstimateStatusBar } from "./estimate-status-bar";

export async function RecentEstimatesWidget() {
  const session = await authServerProvider.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  const recentUploads = await db
    .select()
    .from(estimateRequestTable)
    .where(eq(estimateRequestTable.userId, session.user.id))
    .orderBy(desc(estimateRequestTable.createdAt))
    .limit(5);

  let pipelineSubStages: (PipelineSubStage | null)[] = recentUploads.map(() => null);
  if (recentUploads.some((upload) => upload.status === "processing")) {
    const { getEstimatePipelineSubStage } = await import(
      "@/features/estimate-extraction-pipeline/progress"
    );
    pipelineSubStages = await Promise.all(
      recentUploads.map((upload) =>
        upload.status === "processing"
          ? getEstimatePipelineSubStage(upload.workflowRunId)
          : Promise.resolve(null),
      ),
    );
  }

  if (recentUploads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-border rounded-xl bg-muted/30">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground tracking-tight">No estimates processed</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mb-6">
          Upload your first inspection report to begin generating accurate repair estimates.
        </p>
        <div className="flex items-center gap-2">
          <Button asChild>
          <Link href="/dashboard/estimate/intake">Upload PDF</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/estimates">View all estimates</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
      <div className="divide-y divide-border">
        {recentUploads.map((upload, index) => {
          const content = (
            <>
              <div className="flex items-center gap-4 overflow-hidden">
                <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {upload.fileName}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {new Date(upload.createdAt).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', year: 'numeric'
                    })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 pl-4">
                <EstimateStatusBar
                  status={upload.status}
                  identityConfirmed={Boolean(upload.intakeConfirmedAt)}
                  timeframeSelected={Boolean(upload.timeframe)}
                  errorMessage={upload.errorMessage}
                  pipelineSubStage={pipelineSubStages[index]}
                />
                {upload.status === "failed" && (
                  <EstimateRetryButton id={upload.id} />
                )}
              </div>
            </>
          );

          if (upload.status !== "failed") {
            const href = upload.status === "completed"
              ? `/dashboard/estimate/${upload.id}`
              : `/dashboard/estimate/${upload.id}/intake`;

            return (
              <Link
                key={upload.id}
                href={href}
                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                {content}
              </Link>
            );
          }

          return (
            <div key={upload.id} className="flex items-center justify-between p-4">
              {content}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-end border-t border-border bg-muted/30 px-4 py-2">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <Link href="/dashboard/estimates" className="flex items-center gap-1.5">
            View all estimates
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
