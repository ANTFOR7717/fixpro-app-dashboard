import { jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
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
  'awaiting_confirmation',
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
  workflowRunId: text("workflow_run_id"),
  intakeExtraction: jsonb("intake_extraction"),
  intakeConfirmedAt: timestamp("intake_confirmed_at"),

  // Confirmed identity fields for the upload-first flow. The legacy
  // listing/buyer fields below remain for existing records and consumers.
  agentName: varchar("agent_name", { length: 255 }),
  agentPhone: varchar("agent_phone", { length: 50 }),
  agentEmail: varchar("agent_email", { length: 255 }),
  homeownerName: varchar("homeowner_name", { length: 255 }),
  homeownerPhone: varchar("homeowner_phone", { length: 50 }),
  homeownerEmail: varchar("homeowner_email", { length: 255 }),
  inspectorName: varchar("inspector_name", { length: 255 }),
  inspectorCompany: varchar("inspector_company", { length: 255 }),

  // Metadata
  submitterRole: varchar("submitter_role", { length: 50 }), // 'agent' | 'homeowner'
  listingAgentName: varchar("listing_agent_name", { length: 255 }),
  listingAgentPhone: varchar("listing_agent_phone", { length: 50 }),
  listingAgentEmail: varchar("listing_agent_email", { length: 255 }),
  buyerAgentName: varchar("buyer_agent_name", { length: 255 }),
  buyerAgentPhone: varchar("buyer_agent_phone", { length: 50 }),
  buyerAgentEmail: varchar("buyer_agent_email", { length: 255 }),
  propertyAddress: text("property_address"),
  zipCode: varchar("zip_code", { length: 20 }),
  timeframe: text("timeframe"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
