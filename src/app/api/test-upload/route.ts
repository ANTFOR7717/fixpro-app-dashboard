import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { estimateRequestTable } from "@/features/estimate/db/schema";
import { user } from "@/db/schema";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    
    if (!file || file.type !== "application/pdf") {
      return NextResponse.json({ error: "Invalid file type." }, { status: 400 });
    }

    // Get a valid user or create a dummy one to satisfy foreign key constraints for the test
    const users = await db.select().from(user).limit(1);
    let testUser = users[0];
    if (!testUser) {
       const [newUser] = await db.insert(user).values({
         id: "test-user-" + Date.now(),
         name: "Test User",
         email: "test" + Date.now() + "@example.com",
       }).returning();
       testUser = newUser;
    }

    // Use Vercel Blob to upload the file
    const { put } = await import("@vercel/blob");
    const blob = await put(`estimates/test-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`, file, { access: 'public' });

    // Store in the database
    const [inserted] = await db.insert(estimateRequestTable).values({
      userId: testUser.id,
      fileUrl: blob.url,
      fileName: file.name,
      fileSize: file.size.toString(),
      status: "processing",
    }).returning();

    return NextResponse.json({ success: true, data: inserted });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
