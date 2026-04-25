"use server";

import { db } from "@/db";
import { authServerProvider } from "@/auth/server-provider";
import { estimateRequestTable } from "../db/schema";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export async function uploadEstimatePdfAction(formData: FormData) {
  const session = await authServerProvider.getSession({
    headers: await headers(),
  });
  if (!session?.user) throw new Error("UNAUTHORIZED_ACCESS_DENIED");

  const file = formData.get("file") as File | null;
  if (!file || file.type !== "application/pdf") {
    throw new Error("Invalid file type. Only PDFs are allowed.");
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
  });

  revalidatePath("/dashboard/estimate");
}
