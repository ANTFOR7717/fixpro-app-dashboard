import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { mastra } from "@/features/estimate-extraction-pipeline";
import {
  SUMMARY_ENVELOPE_KIND,
  SUMMARY_ENVELOPE_VERSION_3,
  type SummaryEnvelopeV3,
} from "@/features/estimate/lib/envelope";
import { estimateRequestTable } from "../db/schema";
import { classifyError } from "./classify-error";

interface TriggerSummarizeEstimateParams {
  estimateRequestId: string;
  fileUrl: string;
  errorLabel?: string;
}

/**
 * THE SINGLE WRITER of estimate-row state (responsibility #4). The AI
 * pipeline (`mastra.getWorkflow('summarize-estimate')`, i.e. `pipeline.ts`)
 * is pure — it returns `{ lines, parsedDocument, flaggedForWebSearch }`
 * (one merged `lines` array, not a separate `prices` array — see
 * `pipeline.ts`'s own `priceStep`) or its run fails — and this function
 * owns the entire persistence lifecycle:
 *
 *   processing → run the pipeline once → completed (v3 envelope)
 *                                      | failed   (classified message)
 *
 * Nothing else writes this row during a run.
 */
export function triggerSummarizeEstimate({
  estimateRequestId,
  fileUrl,
  errorLabel = "AI Pipeline Error",
}: TriggerSummarizeEstimateParams): void {
  after(async () => {
    const rowFilter = eq(estimateRequestTable.id, estimateRequestId);
    try {
      const [row] = await db
        .select({ zipCode: estimateRequestTable.zipCode })
        .from(estimateRequestTable)
        .where(rowFilter);

      await db
        .update(estimateRequestTable)
        .set({ status: "processing", errorMessage: null })
        .where(rowFilter);

      const workflow = mastra.getWorkflow("summarize-estimate");
      const run = await workflow.createRun();
      const result = await run.start({
        inputData: { estimateRequestId, fileUrl, zipCode: row?.zipCode ?? "" },
      });

      if (result.status === "success") {
        const envelope: SummaryEnvelopeV3 = {
          kind: SUMMARY_ENVELOPE_KIND,
          version: SUMMARY_ENVELOPE_VERSION_3,
          lines: result.result.lines,
          parsedDocument: result.result.parsedDocument,
          flaggedForWebSearch: result.result.flaggedForWebSearch,
        };
        await db
          .update(estimateRequestTable)
          .set({
            summary: JSON.stringify(envelope),
            status: "completed",
            errorMessage: null,
          })
          .where(rowFilter);
      } else {
        console.error(`${errorLabel}: workflow ended non-success:`, result.status);
        const stepError =
          result.status === "failed"
            ? Object.values(result.steps).find((s) => s.status === "failed")?.error
            : undefined;
        await db
          .update(estimateRequestTable)
          .set({ status: "failed", errorMessage: classifyError(stepError) })
          .where(rowFilter);
      }
    } catch (error) {
      console.error(`${errorLabel}:`, error);
      await db
        .update(estimateRequestTable)
        .set({ status: "failed", errorMessage: classifyError(error) })
        .where(rowFilter);
    }
    revalidatePath("/dashboard");
  });
}
