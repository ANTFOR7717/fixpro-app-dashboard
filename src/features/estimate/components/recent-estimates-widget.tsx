import { db } from "@/db";
import { estimateRequestTable } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { authServerProvider } from "@/auth/server-provider";
import { headers } from "next/headers";
import { FileText, Loader2, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import { Badge } from "@/design-systems/shadcn/components/badge";
import { Button } from "@/design-systems/shadcn/components/button";
import Link from "next/link";

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
        <Button asChild>
          <Link href="/dashboard/estimate">Upload PDF</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
      <div className="divide-y divide-border">
        {recentUploads.map((upload) => (
          <div 
            key={upload.id} 
            className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
          >
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
            <div className="flex items-center gap-4 shrink-0 pl-4">
              {upload.status === "uploaded" && (
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 border-0 flex items-center gap-1.5 font-medium px-2.5 py-0.5">
                  <FileText className="h-3.5 w-3.5" />
                  Received
                </Badge>
              )}
              {upload.status === "processing" && (
                <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border-0 flex items-center gap-1.5 font-medium px-2.5 py-0.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Processing
                </Badge>
              )}
              {upload.status === "failed" && (
                <Badge variant="secondary" className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-0 flex items-center gap-1.5 font-medium px-2.5 py-0.5">
                  <XCircle className="h-3.5 w-3.5" />
                  Failed
                </Badge>
              )}
              {upload.status === "completed" && (
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-0 flex items-center gap-1.5 font-medium px-2.5 py-0.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ready
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
