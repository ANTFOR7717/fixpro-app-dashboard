"use server";

import { z } from "zod";

import { db } from "@/db";
import { authServerProvider } from "@/auth/server-provider";
import { estimateRequestTable } from "../db/schema";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { mastra } from "@/mastra";
import { eq } from "drizzle-orm";

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
        await run.start({
          inputData: {
            estimateRequestId: inserted.id,
            fileUrl: blob.url
          }
        });
      } catch (e) {
        console.error("AI Pipeline Error:", e);
        // Update status to failed on pipeline error
        await db.update(estimateRequestTable)
          .set({ status: 'failed' })
          .where(eq(estimateRequestTable.id, inserted.id));
      }
    });

    revalidatePath("/dashboard/estimate");
    return { success: true, message: "Upload complete! Your estimate is processing." };
  } catch (error: any) {
    console.error("Server Action Error (uploadEstimatePdfAction):", error);
    return { success: false, error: error.message || "Failed to upload file." };
  }
}
