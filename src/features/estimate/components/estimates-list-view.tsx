import { db } from "@/db";
import { estimateRequestTable } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { authServerProvider } from "@/auth/server-provider";
import { headers } from "next/headers";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/design-systems/shadcn/components/button";
import { Card, CardContent } from "@/design-systems/shadcn/components/card";
import { EstimateDeleteButton } from "./estimate-delete-button";
import { EstimateRetryButton } from "./estimate-retry-button";
import { EstimateStatusBar } from "./estimate-status-bar";
import { RefreshButton } from "./refresh-button";

export async function EstimatesListView() {
  const session = await authServerProvider.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const estimates = await db
    .select()
    .from(estimateRequestTable)
    .where(eq(estimateRequestTable.userId, session.user.id))
    .orderBy(desc(estimateRequestTable.createdAt));

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Your Estimates</h1>
          <p className="text-muted-foreground">
            Every inspection report you&apos;ve uploaded. Delete an estimate to remove its row and the uploaded PDF.
          </p>
        </div>
        <RefreshButton />
      </div>

      {estimates.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-border rounded-xl bg-muted/30">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground tracking-tight">You haven&apos;t uploaded any estimates yet.</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mb-6">
            Upload your first inspection report to begin generating accurate repair estimates.
          </p>
          <Button asChild>
            <Link href="/dashboard/estimate">Upload PDF</Link>
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {estimates.map((upload) => {
                const leftBlock = (
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
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                );

                return (
                  <div key={upload.id} className="flex items-center justify-between p-4">
                    {upload.status === "completed" ? (
                      <Link
                        href={`/dashboard/estimate/${upload.id}`}
                        className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
                      >
                        {leftBlock}
                      </Link>
                    ) : (
                      <div className="flex-1 min-w-0">{leftBlock}</div>
                    )}

                    <div className="flex items-center gap-3 shrink-0 pl-4">
                      <EstimateStatusBar
                        status={upload.status}
                        errorMessage={upload.errorMessage}
                      />
                      {upload.status === "failed" && (
                        <EstimateRetryButton id={upload.id} />
                      )}
                      <EstimateDeleteButton id={upload.id} fileName={upload.fileName} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
