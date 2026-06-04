import { db } from "@/db";
import { contactsTable } from "@/features/contacts/db/schema";

interface ContactCandidate {
  fullName: string;
  phone: string;
  email: string;
}

interface SaveSelectedContactsParams {
  userId: string;
  listing: ContactCandidate;
  buyer: ContactCandidate;
  saveListing: boolean;
  saveBuyer: boolean;
}

export async function saveSelectedContacts({
  userId,
  listing,
  buyer,
  saveListing,
  saveBuyer,
}: SaveSelectedContactsParams): Promise<void> {
  if (!saveListing && !saveBuyer) return;

  const rows: Array<{ userId: string } & ContactCandidate> = [];
  if (saveListing) rows.push({ userId, ...listing });
  if (saveBuyer) rows.push({ userId, ...buyer });
  if (rows.length === 0) return;

  await db.insert(contactsTable).values(rows).onConflictDoNothing();
}
