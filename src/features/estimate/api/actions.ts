"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { authServerProvider } from "@/auth/server-provider";
import { db } from "@/db";

import { estimateRequestTable } from "../db/schema";
import { parseUploadInput } from "../lib/upload-input";
import {
  intakeIdentitySchema,
  intakeTimeframeSchema,
  type IntakeIdentity,
} from "@/features/estimate-extraction-pipeline/intake/schema";

type ActionResult = {
  success: boolean;
  message?: string;
  error?: string;
  estimateRequestId?: string;
};

export async function uploadEstimatePdfAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await authServerProvider.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "UNAUTHORIZED_ACCESS_DENIED" };
    }

    const parsed = parseUploadInput(formData);
    if (!parsed.ok) {
      return { success: false, error: parsed.error };
    }
    const { blobUrl, fileName, fileSize } = parsed.data;

    const [inserted] = await db
      .insert(estimateRequestTable)
      .values({
        userId: session.user.id,
        fileUrl: blobUrl,
        fileName,
        fileSize,
        status: "uploaded",
      })
      .returning({ id: estimateRequestTable.id });

    const { triggerSummarizeEstimate } = await import("../lib/workflow");
    triggerSummarizeEstimate({
      estimateRequestId: inserted.id,
      fileUrl: blobUrl,
    });

    revalidatePath("/dashboard/estimate");
    return {
      success: true,
      estimateRequestId: inserted.id,
      message: "Upload complete! Your estimate is processing.",
    };
  } catch (error) {
    console.error("Server Action Error (uploadEstimatePdfAction):", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload file.",
    };
  }
}

export async function retryEstimateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await authServerProvider.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "UNAUTHORIZED_ACCESS_DENIED" };
    }

    const id = String(formData.get("id") ?? "");
    if (!id) return { success: false, error: "Missing id." };

    const [row] = await db
      .select({
        id: estimateRequestTable.id,
        userId: estimateRequestTable.userId,
        fileUrl: estimateRequestTable.fileUrl,
        status: estimateRequestTable.status,
      })
      .from(estimateRequestTable)
      .where(eq(estimateRequestTable.id, id))
      .limit(1);

    if (!row || row.userId !== session.user.id) {
      return { success: false, error: "Estimate not found." };
    }
    if (row.status !== "failed") {
      return { success: false, error: "Only failed estimates can be retried." };
    }

    await db
      .update(estimateRequestTable)
      .set({
        status: "uploaded",
        errorMessage: null,
        summary: null,
        workflowRunId: null,
        intakeExtraction: null,
        intakeConfirmedAt: null,
        timeframe: null,
      })
      .where(eq(estimateRequestTable.id, id));

    const { triggerSummarizeEstimate } = await import("../lib/workflow");
    triggerSummarizeEstimate({
      estimateRequestId: row.id,
      fileUrl: row.fileUrl,
      errorLabel: "AI Pipeline Error (retry)",
    });

    revalidatePath("/dashboard");
    return { success: true, message: "Retry started." };
  } catch (error) {
    console.error("Server Action Error (retryEstimateAction):", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to retry.",
    };
  }
}

export async function confirmEstimateIdentityAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await authServerProvider.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "UNAUTHORIZED_ACCESS_DENIED" };
    }

    const estimateRequestId = String(formData.get("estimateRequestId") ?? "");
    const identity: IntakeIdentity = intakeIdentitySchema.parse({
      propertyAddress: formData.get("propertyAddress"),
      zipCode: formData.get("zipCode"),
      agentName: formData.get("agentName"),
      homeownerName: formData.get("homeownerName"),
      inspectorName: formData.get("inspectorName"),
    });

    const [row] = await db
      .select({
        id: estimateRequestTable.id,
        workflowRunId: estimateRequestTable.workflowRunId,
      })
      .from(estimateRequestTable)
      .where(
        and(
          eq(estimateRequestTable.id, estimateRequestId),
          eq(estimateRequestTable.userId, session.user.id),
          eq(estimateRequestTable.status, "awaiting_confirmation"),
          isNull(estimateRequestTable.intakeConfirmedAt),
        ),
      )
      .limit(1);

    if (!row?.workflowRunId) {
      return { success: false, error: "Estimate is not awaiting identity confirmation." };
    }

    const { persistConfirmedIdentity, resumeSummarizeEstimate } = await import("../lib/workflow");
    await persistConfirmedIdentity({
      estimateRequestId,
      userId: session.user.id,
      identity,
    });

    const [processing] = await db
      .update(estimateRequestTable)
      .set({ status: "processing", errorMessage: null })
      .where(
        and(
          eq(estimateRequestTable.id, estimateRequestId),
          eq(estimateRequestTable.userId, session.user.id),
          eq(estimateRequestTable.status, "awaiting_confirmation"),
          isNotNull(estimateRequestTable.intakeConfirmedAt),
        ),
      )
      .returning({ id: estimateRequestTable.id });

    if (!processing) {
      return { success: false, error: "Identity confirmation is already processing." };
    }

    resumeSummarizeEstimate({
      estimateRequestId,
      userId: session.user.id,
      workflowRunId: row.workflowRunId,
      resumeData: { identity },
    });

    revalidateEstimatePaths(estimateRequestId);
    return { success: true, message: "Identity confirmed." };
  } catch (error) {
    console.error("Server Action Error (confirmEstimateIdentityAction):", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to confirm identity.",
    };
  }
}

export async function selectEstimateTimeframeAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await authServerProvider.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: "UNAUTHORIZED_ACCESS_DENIED" };
    }

    const estimateRequestId = String(formData.get("estimateRequestId") ?? "");
    const timeframe = intakeTimeframeSchema.parse({
      timeframe: formData.get("timeframe"),
    });

    const [row] = await db
      .select({
        id: estimateRequestTable.id,
        workflowRunId: estimateRequestTable.workflowRunId,
      })
      .from(estimateRequestTable)
      .where(
        and(
          eq(estimateRequestTable.id, estimateRequestId),
          eq(estimateRequestTable.userId, session.user.id),
          eq(estimateRequestTable.status, "awaiting_confirmation"),
          isNotNull(estimateRequestTable.intakeConfirmedAt),
          isNull(estimateRequestTable.timeframe),
        ),
      )
      .limit(1);

    if (!row?.workflowRunId) {
      return { success: false, error: "Estimate is not awaiting timeframe selection." };
    }

    const [updated] = await db
      .update(estimateRequestTable)
      .set({ timeframe: timeframe.timeframe, status: "processing", errorMessage: null })
      .where(
        and(
          eq(estimateRequestTable.id, estimateRequestId),
          eq(estimateRequestTable.userId, session.user.id),
          eq(estimateRequestTable.status, "awaiting_confirmation"),
          isNotNull(estimateRequestTable.intakeConfirmedAt),
          isNull(estimateRequestTable.timeframe),
        ),
      )
      .returning({ id: estimateRequestTable.id });

    if (!updated) {
      return { success: false, error: "Timeframe selection is already processing." };
    }

    const { resumeSummarizeEstimate } = await import("../lib/workflow");
    resumeSummarizeEstimate({
      estimateRequestId,
      userId: session.user.id,
      workflowRunId: row.workflowRunId,
      resumeData: timeframe,
    });

    revalidateEstimatePaths(estimateRequestId);
    return { success: true, message: "Estimate processing has resumed." };
  } catch (error) {
    console.error("Server Action Error (selectEstimateTimeframeAction):", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save timeframe.",
    };
  }
}

function revalidateEstimatePaths(estimateRequestId: string) {
  revalidatePath(`/dashboard/estimate/${estimateRequestId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/estimates");
}

export async function deleteEstimateAction(
  _prev: { success: boolean; message?: string; error?: string } | null,
  formData: FormData,
) {
  try {
    const session = await authServerProvider.getSession({ headers: await headers() });
    if (!session?.user) throw new Error("UNAUTHORIZED_ACCESS_DENIED");

    const id = String(formData.get("id") ?? "");
    if (!id) return { success: false, error: "Missing id." };

    const [row] = await db
      .select({
        id: estimateRequestTable.id,
        userId: estimateRequestTable.userId,
        fileUrl: estimateRequestTable.fileUrl,
        status: estimateRequestTable.status,
      })
      .from(estimateRequestTable)
      .where(and(eq(estimateRequestTable.id, id), eq(estimateRequestTable.userId, session.user.id)))
      .limit(1);

    if (!row) {
      return { success: false, error: "Estimate not found." };
    }

    // Deletion is allowed in any status. If the AI workflow happens to be
    // mid-execution, its eventual UPDATE against this id is a benign no-op
    // because Drizzle's update().where(...) on a missing row affects 0 rows.
    // Delete the Blob first; if this fails we leave the DB row intact so the
    // user can retry. If the Blob is already missing, swallow and continue.
    const { del, BlobNotFoundError } = await import("@vercel/blob");
    try {
      await del(row.fileUrl);
    } catch (e) {
      if (e instanceof BlobNotFoundError) {
        console.warn("Blob already missing during delete, continuing:", row.fileUrl);
      } else {
        throw e;
      }
    }

    await db
      .delete(estimateRequestTable)
      .where(and(eq(estimateRequestTable.id, id), eq(estimateRequestTable.userId, session.user.id)));

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/estimates");
    return { success: true, message: "Estimate deleted." };
  } catch (error: any) {
    console.error("Server Action Error (deleteEstimateAction):", error);
    return { success: false, error: error.message || "Failed to delete estimate." };
  }
}
