ALTER TABLE "estimate_requests" ALTER COLUMN "status" SET DEFAULT 'uploaded';--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "submitter_role" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "listing_agent_name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "listing_agent_phone" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "listing_agent_email" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "buyer_agent_name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "buyer_agent_phone" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "buyer_agent_email" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "property_address" text NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "zip_code" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_requests" ADD COLUMN "timeframe" text NOT NULL;