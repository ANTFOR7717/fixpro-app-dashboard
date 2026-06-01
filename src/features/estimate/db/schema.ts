import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "@/db/schema";

export const estimateRequestTable = pgTable("estimate_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: text("file_size").notNull(),
  status: varchar("status", { length: 50 }).default("uploaded").notNull(),
  summary: text("summary"),
  errorMessage: text("error_message"),
  // Metadata
  submitterRole: varchar("submitter_role", { length: 50 }).notNull(), // 'agent' | 'homeowner'
  listingAgentName: varchar("listing_agent_name", { length: 255 }).notNull(),
  listingAgentPhone: varchar("listing_agent_phone", { length: 50 }).notNull(),
  listingAgentEmail: varchar("listing_agent_email", { length: 255 }).notNull(),
  buyerAgentName: varchar("buyer_agent_name", { length: 255 }).notNull(),
  buyerAgentPhone: varchar("buyer_agent_phone", { length: 50 }).notNull(),
  buyerAgentEmail: varchar("buyer_agent_email", { length: 255 }).notNull(),
  propertyAddress: text("property_address").notNull(),
  zipCode: varchar("zip_code", { length: 20 }).notNull(),
  timeframe: text("timeframe").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
