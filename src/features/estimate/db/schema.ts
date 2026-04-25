import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "@/db/schema";

export const estimateRequestTable = pgTable("estimate_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: text("file_size").notNull(),
  status: varchar("status", { length: 50 }).default("processing").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
