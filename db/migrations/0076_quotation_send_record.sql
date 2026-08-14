ALTER TABLE "quotations" ADD COLUMN "quote_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "quote_sent_by_id" uuid;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "quote_sent_to" jsonb;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_quote_sent_by_id_employees_id_fk" FOREIGN KEY ("quote_sent_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;