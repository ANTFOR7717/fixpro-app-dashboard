import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "@/db/schema";

/**
 * Status values for the `estimate_requests.status` column.
 *
 *   - uploaded    : PDF received and stored, workflow not yet started
 *   - processing  : AI pipeline is running
 *   - completed   : pipeline finished successfully; the billable-extraction
 *                   envelope has been written to `summary`
 *   - failed      : pipeline did not finish; `errorMessage` carries the reason
 */
export const ESTIMATE_STATUSES = [
  'uploaded',
  'processing',
  'completed',
  'failed',
] as const;

export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const estimateRequestTable = pgTable("estimate_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: text("file_size").notNull(),
  status: varchar("status", { length: 50 }).$type<EstimateStatus>().default("uploaded").notNull(),
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
