import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { PinoLogger } from "@mastra/loggers";
import { z } from "zod";

import { db } from "@/db";
import { mastra } from "@/features/estimate-extraction-pipeline";
import {
  collectTimeframeStep,
  confirmIdentityStep,
  intakeIdentitySchema,
  readSuspendedIdentity,
  readSuspendedTimeframe,
  type IntakeIdentity,
} from "@/features/estimate-extraction-pipeline/intake";
import {
  SUMMARY_ENVELOPE_KIND,
  SUMMARY_ENVELOPE_VERSION_3,
  summaryEnvelopeV3Schema,
  type SummaryEnvelopeV3,
} from "@/features/estimate/lib/envelope";
import { estimateRequestTable } from "../db/schema";
import { classifyError } from "./classify-error";

interface TriggerSummarizeEstimateParams {
  estimateRequestId: string;
  fileUrl: string;
  errorLabel?: string;
}

const logger = new PinoLogger({ name: "estimate-workflow" });

type ConfirmedIdentityResult =
  | { status: "confirmed" }
  | { status: "already_confirmed" };

type ResumeSummarizeEstimateParams =
  | {
      estimateRequestId: string;
      userId: string;
      workflowRunId: string;
      resumeData: { identity: IntakeIdentity };
    }
  | {
      estimateRequestId: string;
      userId: string;
      workflowRunId: string;
      resumeData: { timeframe: string };
    };

type WorkflowResult = {
  status: string;
  result?: { lines?: SummaryEnvelopeV3["lines"] };
  steps?: Record<string, { status?: string; error?: unknown }>;
};

export async function persistConfirmedIdentity({
  estimateRequestId,
  userId,
  identity,
}: {
  estimateRequestId: string;
  userId: string;
  identity: IntakeIdentity;
}): Promise<ConfirmedIdentityResult> {
  const estimateId = z.string().uuid().parse(estimateRequestId);
  const confirmed = intakeIdentitySchema.parse(identity);

  const [updated] = await db
    .update(estimateRequestTable)
    .set({
      propertyAddress: confirmed.propertyAddress,
      zipCode: confirmed.zipCode,
      agentName: confirmed.agentName,
      homeownerName: confirmed.homeownerName,
      inspectorName: confirmed.inspectorName,
      intakeConfirmedAt: new Date(),
    })
    .where(
      and(
        eq(estimateRequestTable.id, estimateId),
        eq(estimateRequestTable.userId, userId),
        eq(estimateRequestTable.status, "awaiting_confirmation"),
        isNull(estimateRequestTable.intakeConfirmedAt),
      ),
    )
    .returning({ id: estimateRequestTable.id });

  if (updated) {
    return { status: "confirmed" };
  }

  const [existing] = await db
    .select({
      propertyAddress: estimateRequestTable.propertyAddress,
      zipCode: estimateRequestTable.zipCode,
      agentName: estimateRequestTable.agentName,
      homeownerName: estimateRequestTable.homeownerName,
      inspectorName: estimateRequestTable.inspectorName,
      intakeConfirmedAt: estimateRequestTable.intakeConfirmedAt,
    })
    .from(estimateRequestTable)
    .where(
      and(
        eq(estimateRequestTable.id, estimateId),
        eq(estimateRequestTable.userId, userId),
      ),
    )
    .limit(1);

  if (
    existing?.intakeConfirmedAt &&
    existing.propertyAddress === confirmed.propertyAddress &&
    existing.zipCode === confirmed.zipCode &&
    existing.agentName === confirmed.agentName &&
    existing.homeownerName === confirmed.homeownerName &&
    existing.inspectorName === confirmed.inspectorName
  ) {
    return { status: "already_confirmed" };
  }

  throw new Error("Estimate identity cannot be confirmed in its current state.");
}

export function resumeSummarizeEstimate({
  estimateRequestId,
  userId,
  workflowRunId,
  resumeData,
}: ResumeSummarizeEstimateParams): void {
  after(async () => {
    const rowFilter = and(
      eq(estimateRequestTable.id, estimateRequestId),
      eq(estimateRequestTable.userId, userId),
      eq(estimateRequestTable.workflowRunId, workflowRunId),
    );

    try {
      const workflow = mastra.getWorkflow("summarize-estimate");
      const run = await workflow.createRun({ runId: workflowRunId });
      const result = ("identity" in resumeData
        ? await run.resume({ resumeData, step: confirmIdentityStep.id })
        : await run.resume({ resumeData, step: collectTimeframeStep.id })) as WorkflowResult;

      if (result.status === "suspended") {
        readSuspendedTimeframe(result);
        await db
          .update(estimateRequestTable)
          .set({ status: "awaiting_confirmation", errorMessage: null })
          .where(rowFilter);
      } else if (result.status === "success") {
        await persistWorkflowSuccess(rowFilter, result);
      } else {
        await persistWorkflowFailure(rowFilter, result);
      }
    } catch (error) {
      logger.error("AI Pipeline Error (resume)", { error });
      await db
        .update(estimateRequestTable)
        .set({ status: "failed", errorMessage: classifyError(error) })
        .where(rowFilter);
    }

    await mastra.observability.flush();
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/estimate/${estimateRequestId}`);
  });
}

async function persistWorkflowSuccess(
  rowFilter: ReturnType<typeof and>,
  result: WorkflowResult,
) {
  const lines = result.result?.lines;
  if (!lines) {
    await markWorkflowFailed(rowFilter, "AI produced an incomplete estimate summary.");
    return;
  }

  const envelope: SummaryEnvelopeV3 = {
    kind: SUMMARY_ENVELOPE_KIND,
    version: SUMMARY_ENVELOPE_VERSION_3,
    lines,
  };

  if (summaryEnvelopeV3Schema.safeParse(envelope).success) {
    await db
      .update(estimateRequestTable)
      .set({
        summary: JSON.stringify(envelope),
        status: "completed",
        errorMessage: null,
      })
      .where(rowFilter);
    return;
  }

  await markWorkflowFailed(rowFilter, "AI produced an incomplete estimate summary.");
}

async function persistWorkflowFailure(
  rowFilter: ReturnType<typeof and>,
  result: WorkflowResult,
) {
  const stepError = result.steps
    ? Object.values(result.steps).find((step) => step.status === "failed")?.error
    : undefined;
  await markWorkflowFailed(rowFilter, classifyError(stepError));
}

async function markWorkflowFailed(
  rowFilter: ReturnType<typeof and>,
  errorMessage: string,
) {
  await db
    .update(estimateRequestTable)
    .set({ status: "failed", errorMessage })
    .where(rowFilter);
}

/**
 * THE SINGLE WRITER of estimate-row state (responsibility #4). The AI
 * pipeline (`mastra.getWorkflow('summarize-estimate')`, i.e. `pipeline.ts`)
 * is pure — it returns `{ lines }` (no parsed document; only extraction
 * ever reads the source document — see `pipeline.ts`) or its run fails —
 * and this function owns the entire persistence lifecycle:
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

      if (result.status === "suspended") {
        const identity = readSuspendedIdentity(result);

        await db
          .update(estimateRequestTable)
          .set({
            workflowRunId: run.runId,
            intakeExtraction: identity,
            status: "awaiting_confirmation",
            errorMessage: null,
          })
          .where(rowFilter);
      } else if (result.status === "success") {
        await persistWorkflowSuccess(rowFilter, result as WorkflowResult);
      } else {
        logger.error(`${errorLabel}: workflow ended non-success`, {
          status: result.status,
        });
        await persistWorkflowFailure(rowFilter, result as WorkflowResult);
      }
    } catch (error) {
      logger.error(errorLabel, { error });
      await db
        .update(estimateRequestTable)
        .set({ status: "failed", errorMessage: classifyError(error) })
        .where(rowFilter);
    }
    await mastra.observability.flush();
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/estimates");
  });
}
