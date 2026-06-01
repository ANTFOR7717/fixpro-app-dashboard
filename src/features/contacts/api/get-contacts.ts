import { db } from "@/db";
import { contactsTable, type Contact } from "../db/schema";
import { eq, desc } from "drizzle-orm";

export async function listContactsForUser(userId: string): Promise<Contact[]> {
  return db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.userId, userId))
    .orderBy(desc(contactsTable.updatedAt));
}
