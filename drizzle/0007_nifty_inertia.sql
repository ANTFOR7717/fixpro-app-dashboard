ALTER TABLE "estimate_requests" ALTER COLUMN "submitter_role" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ALTER COLUMN "listing_agent_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ALTER COLUMN "listing_agent_phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ALTER COLUMN "listing_agent_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ALTER COLUMN "buyer_agent_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ALTER COLUMN "buyer_agent_phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ALTER COLUMN "buyer_agent_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ALTER COLUMN "property_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ALTER COLUMN "zip_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ALTER COLUMN "timeframe" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "workflow_run_id" text;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "intake_extraction" jsonb;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "intake_confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "agent_name" varchar(255);--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "agent_phone" varchar(50);--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "agent_email" varchar(255);--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "homeowner_name" varchar(255);--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "homeowner_phone" varchar(50);--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "homeowner_email" varchar(255);--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "inspector_name" varchar(255);--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "inspector_company" varchar(255);