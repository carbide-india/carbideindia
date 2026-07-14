ALTER TABLE "org_settings" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "pan_no" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "cin" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "reg_address" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "reg_city" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "reg_state" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "reg_pincode" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "bank_account_no" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "bank_ifsc" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "bank_branch" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "doc_numbering" jsonb DEFAULT '{}'::jsonb NOT NULL;