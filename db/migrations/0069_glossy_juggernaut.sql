ALTER TABLE "costing_vendor_quotes" ADD COLUMN "payment_terms_id" uuid;--> statement-breakpoint
ALTER TABLE "costing_vendor_quotes" ADD COLUMN "quantity_tolerance_id" uuid;--> statement-breakpoint
ALTER TABLE "costing_vendor_quotes" ADD COLUMN "delivery_time" numeric;--> statement-breakpoint
ALTER TABLE "costing_vendor_quotes" ADD COLUMN "delivery_time_unit" text;--> statement-breakpoint
ALTER TABLE "costing_vendor_quotes" ADD COLUMN "validity" numeric;--> statement-breakpoint
ALTER TABLE "costing_vendor_quotes" ADD COLUMN "validity_unit" text;--> statement-breakpoint
ALTER TABLE "costing_vendor_quotes" ADD CONSTRAINT "costing_vendor_quotes_payment_terms_id_master_options_id_fk" FOREIGN KEY ("payment_terms_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costing_vendor_quotes" ADD CONSTRAINT "costing_vendor_quotes_quantity_tolerance_id_master_options_id_fk" FOREIGN KEY ("quantity_tolerance_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;