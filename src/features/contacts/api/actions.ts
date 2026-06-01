"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { db } from "@/db";
import { authServerProvider } from "@/auth/server-provider";
import { contactsTable } from "../db/schema";

const contactInputSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Invalid email"),
});

type ActionState = { success: boolean; message?: string; error?: string } | null;

async function requireUserId() {
  const session = await authServerProvider.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED_ACCESS_DENIED");
  return session.user.id;
}

export async function createContactAction(_prev: ActionState, formData: FormData) {
  try {
    const userId = await requireUserId();
    const parsed = contactInputSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { success: false, error: `Validation Error - ${first.path.join(".")}: ${first.message}` };
    }
    try {
      await db.insert(contactsTable).values({ userId, ...parsed.data });
    } catch (e: any) {
      // unique_violation on (userId, email)
      if (e?.code === "23505") {
        return { success: false, error: "A contact with that email already exists." };
      }
      throw e;
    }
    revalidatePath("/dashboard/contacts");
    return { success: true, message: "Contact saved." };
  } catch (error: any) {
    console.error("Server Action Error (createContactAction):", error);
    return { success: false, error: error.message || "Failed to save contact." };
  }
}

export async function updateContactAction(_prev: ActionState, formData: FormData) {
  try {
    const userId = await requireUserId();
    const id = String(formData.get("id") ?? "");
    if (!id) return { success: false, error: "Missing id." };
    const parsed = contactInputSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { success: false, error: `Validation Error - ${first.path.join(".")}: ${first.message}` };
    }
    const updated = await db
      .update(contactsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(contactsTable.id, id), eq(contactsTable.userId, userId)))
      .returning({ id: contactsTable.id });
    if (updated.length === 0) {
      return { success: false, error: "Contact not found." };
    }
    revalidatePath("/dashboard/contacts");
    return { success: true, message: "Contact updated." };
  } catch (error: any) {
    if (error?.code === "23505") {
      return { success: false, error: "A contact with that email already exists." };
    }
    console.error("Server Action Error (updateContactAction):", error);
    return { success: false, error: error.message || "Failed to update contact." };
  }
}

export async function deleteContactAction(_prev: ActionState, formData: FormData) {
  try {
    const userId = await requireUserId();
    const id = String(formData.get("id") ?? "");
    if (!id) return { success: false, error: "Missing id." };
    await db
      .delete(contactsTable)
      .where(and(eq(contactsTable.id, id), eq(contactsTable.userId, userId)));
    revalidatePath("/dashboard/contacts");
    return { success: true, message: "Contact deleted." };
  } catch (error: any) {
    console.error("Server Action Error (deleteContactAction):", error);
    return { success: false, error: error.message || "Failed to delete contact." };
  }
}
