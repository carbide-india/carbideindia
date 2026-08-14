ALTER TABLE "costings" ADD COLUMN "revised_from_quotation_id" uuid;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "revision_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "supersedes_quotation_id" uuid;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "is_latest_revision" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "revision_reason" text;--> statement-breakpoint
ALTER TABLE "costings" ADD CONSTRAINT "costings_revised_from_quotation_id_quotations_id_fk" FOREIGN KEY ("revised_from_quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_supersedes_quotation_id_quotations_id_fk" FOREIGN KEY ("supersedes_quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;