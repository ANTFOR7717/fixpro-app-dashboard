import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { mastra } from "@/mastra";
import { estimateRequestTable } from "../db/schema";

interface TriggerSummarizeEstimateParams {
  estimateRequestId: string;
  fileUrl: string;
  errorLabel?: string;
}

export function triggerSummarizeEstimate({
  estimateRequestId,
  fileUrl,
  errorLabel = "AI Pipeline Error",
}: TriggerSummarizeEstimateParams): void {
  after(async () => {
    try {
      const workflow = mastra.getWorkflow("summarize-estimate");
      const run = await workflow.createRun();
      const result = await run.start({
        inputData: { estimateRequestId, fileUrl },
      });
      if (result.status !== "success") {
        // persistFailureStep already wrote status='failed' + errorMessage.
        console.error(`${errorLabel}: workflow ended non-success:`, result.status);
      }
    } catch (error) {
      console.error(`${errorLabel}:`, error);
      // Backstop: write failed state only if the workflow threw past its own catch.
      // Guarded with status != 'completed' so a late throw cannot clobber a row that
      // persistSuccessStep already wrote successfully.
      await db
        .update(estimateRequestTable)
        .set({ status: "failed", errorMessage: "AI processing failed. Please retry." })
        .where(
          and(
            eq(estimateRequestTable.id, estimateRequestId),
            ne(estimateRequestTable.status, "completed"),
          ),
        );
    }
    revalidatePath("/dashboard");
  });
}
