"use server";

import { z } from "zod";

import { db } from "@/db";
import { authServerProvider } from "@/auth/server-provider";
import { estimateRequestTable } from "../db/schema";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { mastra } from "@/mastra";
import { and, eq, ne } from "drizzle-orm";

export async function uploadEstimatePdfAction(prevState: { success: boolean; message?: string; error?: string } | null, formData: FormData) {
  try {
    const session = await authServerProvider.getSession({
      headers: await headers(),
    });
    if (!session?.user) throw new Error("UNAUTHORIZED_ACCESS_DENIED");

    const file = formData.get("file") as File | null;
    if (!file || file.type !== "application/pdf") {
      throw new Error("Invalid file type. Only PDFs are allowed.");
    }

    const estimateMetadataSchema = z.object({
      submitterRole: z.enum(["agent", "homeowner"]),
      listingAgentName: z.string().min(1),
      listingAgentPhone: z.string().min(1),
      listingAgentEmail: z.string().email(),
      buyerAgentName: z.string().min(1),
      buyerAgentPhone: z.string().min(1),
      buyerAgentEmail: z.string().email(),
      propertyAddress: z.string().min(1),
      zipCode: z.string().length(5),
      timeframe: z.string().min(1),
    });

    const rawData = Object.fromEntries(formData.entries());
    const validation = estimateMetadataSchema.safeParse({
      submitterRole: rawData.submitterRole,
      listingAgentName: rawData.listingAgentName,
      listingAgentPhone: rawData.listingAgentPhone,
      listingAgentEmail: rawData.listingAgentEmail,
      buyerAgentName: rawData.buyerAgentName,
      buyerAgentPhone: rawData.buyerAgentPhone,
      buyerAgentEmail: rawData.buyerAgentEmail,
      propertyAddress: rawData.propertyAddress,
      zipCode: rawData.zipCode,
      timeframe: rawData.timeframe,
    });

    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return { success: false, error: `Validation Error - ${firstError.path.join(".")}: ${firstError.message}` };
    }

    const metadata = validation.data;

    // Optionally persist contacts before processing the file.
    const saveListing = formData.get("saveListingAsContact") === "1";
    const saveBuyer = formData.get("saveBuyerAsContact") === "1";
    if (saveListing || saveBuyer) {
      const { contactsTable } = await import("@/features/contacts/db/schema");
      const rows: Array<{ userId: string; fullName: string; phone: string; email: string }> = [];
      if (saveListing) rows.push({
        userId: session.user.id,
        fullName: metadata.listingAgentName,
        phone: metadata.listingAgentPhone,
        email: metadata.listingAgentEmail,
      });
      if (saveBuyer) rows.push({
        userId: session.user.id,
        fullName: metadata.buyerAgentName,
        phone: metadata.buyerAgentPhone,
        email: metadata.buyerAgentEmail,
      });
      if (rows.length > 0) {
        await db.insert(contactsTable).values(rows).onConflictDoNothing();
      }
    }

    // Directly stream the file to Vercel Blob Storage
    const { put } = await import("@vercel/blob");
    const blob = await put(`estimates/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`, file, { access: 'public' });

    // Store the secure Blob URL via the global Drizzle ORM instance
    const [inserted] = await db.insert(estimateRequestTable).values({
      userId: session.user.id,
      fileUrl: blob.url,
      fileName: file.name,
      fileSize: file.size.toString(),
      status: "uploaded",
      ...metadata
    }).returning({ id: estimateRequestTable.id });

    // Trigger AI pipeline (Next.js 16 after() pattern)
    after(async () => {
      try {
        const workflow = mastra.getWorkflow('summarize-estimate');
        const run = await workflow.createRun();
        const result = await run.start({
          inputData: {
            estimateRequestId: inserted.id,
            fileUrl: blob.url
          }
        });
        if (result.status !== 'success') {
          // The workflow's persistFailureStep already wrote status='failed' + errorMessage.
          // Log here for observability only.
          console.error('AI workflow ended non-success:', result.status);
        }
      } catch (e) {
        console.error("AI Pipeline Error:", e);
        // Backstop: write failed state only if the workflow threw past its own catch.
        // Guarded with status != 'completed' so a late throw cannot clobber a row that
        // persistSuccessStep already wrote successfully.
        await db.update(estimateRequestTable)
          .set({ status: 'failed', errorMessage: 'AI processing failed. Please retry.' })
          .where(and(
            eq(estimateRequestTable.id, inserted.id),
            ne(estimateRequestTable.status, 'completed'),
          ));
      }
      revalidatePath("/dashboard");
    });

    revalidatePath("/dashboard/estimate");
    return { success: true, message: "Upload complete! Your estimate is processing." };
  } catch (error: any) {
    console.error("Server Action Error (uploadEstimatePdfAction):", error);
    return { success: false, error: error.message || "Failed to upload file." };
  }
}

export async function retryEstimateAction(
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
      .where(eq(estimateRequestTable.id, id))
      .limit(1);

    if (!row || row.userId !== session.user.id) {
      return { success: false, error: "Estimate not found." };
    }
    if (row.status !== 'failed') {
      return { success: false, error: "Only failed estimates can be retried." };
    }

    await db.update(estimateRequestTable)
      .set({ status: 'uploaded', errorMessage: null })
      .where(eq(estimateRequestTable.id, id));

    after(async () => {
      try {
        const workflow = mastra.getWorkflow('summarize-estimate');
        const run = await workflow.createRun();
        const result = await run.start({
          inputData: { estimateRequestId: row.id, fileUrl: row.fileUrl },
        });
        if (result.status !== 'success') {
          console.error('AI workflow ended non-success (retry):', result.status);
        }
      } catch (e) {
        console.error("AI Pipeline Error (retry):", e);
        // Same guarded backstop as the upload path: do not clobber a row that
        // persistSuccessStep already wrote.
        await db.update(estimateRequestTable)
          .set({ status: 'failed', errorMessage: 'AI processing failed. Please retry.' })
          .where(and(
            eq(estimateRequestTable.id, row.id),
            ne(estimateRequestTable.status, 'completed'),
          ));
      }
      revalidatePath("/dashboard");
    });

    revalidatePath("/dashboard");
    return { success: true, message: "Retry started." };
  } catch (error: any) {
    console.error("Server Action Error (retryEstimateAction):", error);
    return { success: false, error: error.message || "Failed to retry." };
  }
}
