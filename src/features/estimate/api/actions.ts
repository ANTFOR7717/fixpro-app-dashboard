"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";

import { authServerProvider } from "@/auth/server-provider";
import { db } from "@/db";

import { estimateRequestTable } from "../db/schema";
import { saveSelectedContacts } from "../lib/contacts";
import { parseUploadInput } from "../lib/upload-input";
import { triggerSummarizeEstimate } from "../lib/workflow";

type ActionResult = { success: boolean; message?: string; error?: string };

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
    const { data, saveListingAsContact, saveBuyerAsContact } = parsed;
    const { blobUrl, fileName, fileSize, ...metadata } = data;

    await saveSelectedContacts({
      userId: session.user.id,
      listing: {
        fullName: metadata.listingAgentName,
        phone: metadata.listingAgentPhone,
        email: metadata.listingAgentEmail,
      },
      buyer: {
        fullName: metadata.buyerAgentName,
        phone: metadata.buyerAgentPhone,
        email: metadata.buyerAgentEmail,
      },
      saveListing: saveListingAsContact,
      saveBuyer: saveBuyerAsContact,
    });

    const [inserted] = await db
      .insert(estimateRequestTable)
      .values({
        userId: session.user.id,
        fileUrl: blobUrl,
        fileName,
        fileSize,
        status: "uploaded",
        ...metadata,
      })
      .returning({ id: estimateRequestTable.id });

    triggerSummarizeEstimate({
      estimateRequestId: inserted.id,
      fileUrl: blobUrl,
    });

    revalidatePath("/dashboard/estimate");
    return { success: true, message: "Upload complete! Your estimate is processing." };
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
      .set({ status: "uploaded", errorMessage: null })
      .where(eq(estimateRequestTable.id, id));

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
