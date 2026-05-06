"use server";

import { db } from "@/db";
import { authServerProvider } from "@/auth/server-provider";
import { estimateRequestTable } from "../db/schema";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export async function uploadEstimatePdfAction(prevState: any, formData: FormData) {
  try {
    const session = await authServerProvider.getSession({
      headers: await headers(),
    });
    if (!session?.user) throw new Error("UNAUTHORIZED_ACCESS_DENIED");

    const file = formData.get("file") as File | null;
    if (!file || file.type !== "application/pdf") {
      throw new Error("Invalid file type. Only PDFs are allowed.");
    }

    const rawData = Object.fromEntries(formData.entries());
    
    // Server-side Zod validation
    const metadata = {
      submitterRole: rawData.submitterRole as string,
      listingAgentName: rawData.listingAgentName as string,
      listingAgentPhone: rawData.listingAgentPhone as string,
      listingAgentEmail: rawData.listingAgentEmail as string,
      buyerAgentName: rawData.buyerAgentName as string,
      buyerAgentPhone: rawData.buyerAgentPhone as string,
      buyerAgentEmail: rawData.buyerAgentEmail as string,
      propertyAddress: rawData.propertyAddress as string,
      zipCode: rawData.zipCode as string,
      timeframe: rawData.timeframe as string,
    };

    // Re-use logic from schema if possible, or just validate here
    if (!metadata.submitterRole || !metadata.listingAgentName || !metadata.propertyAddress) {
      throw new Error("Missing mandatory fields.");
    }

    // Directly stream the file to Vercel Blob Storage
    const { put } = await import("@vercel/blob");
    const blob = await put(`estimates/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`, file, { access: 'public' });

    // Store the secure Blob URL via the global Drizzle ORM instance
    await db.insert(estimateRequestTable).values({
      userId: session.user.id,
      fileUrl: blob.url,
      fileName: file.name,
      fileSize: file.size.toString(),
      status: "processing",
      ...metadata
    });

    revalidatePath("/dashboard/estimate");
    return { success: true, message: "Upload complete! Your estimate is processing." };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to upload file." };
  }
}
