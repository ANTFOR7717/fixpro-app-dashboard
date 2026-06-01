import { pgTable, text, timestamp, uuid, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "@/db/schema";

export const contactsTable = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqUserEmail: uniqueIndex("contacts_user_email_idx").on(t.userId, t.email),
  })
);

export type Contact = typeof contactsTable.$inferSelect;
