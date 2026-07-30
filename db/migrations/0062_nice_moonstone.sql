ALTER TYPE "public"."master_kind" ADD VALUE 'external_grade';--> statement-breakpoint
ALTER TYPE "public"."master_kind" ADD VALUE 'internal_production_code';--> statement-breakpoint
ALTER TYPE "public"."master_kind" ADD VALUE 'part_no';--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "block_wt_per_piece" numeric;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "block_wt_order_kg" numeric;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "direct_wt_per_piece" numeric;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "direct_wt_order_kg" numeric;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "total_wt_order_kg" numeric;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "vendor_code_snapshot" text;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "vendor_quote_link" text;--> statement-breakpoint
ALTER TABLE "costings" ADD COLUMN "payment_terms" text;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "is_dimensions_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "locked_by_id" uuid;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "feasibility_baseline" jsonb;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "grade_customer_facing_id" uuid;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "grade_internal_production_id" uuid;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "internal_production_code_id" uuid;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD COLUMN "part_no_id" uuid;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "is_gst_applicable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "costings" ADD CONSTRAINT "costings_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_locked_by_id_employees_id_fk" FOREIGN KEY ("locked_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_grade_customer_facing_id_master_options_id_fk" FOREIGN KEY ("grade_customer_facing_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_grade_internal_production_id_master_options_id_fk" FOREIGN KEY ("grade_internal_production_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_internal_production_code_id_master_options_id_fk" FOREIGN KEY ("internal_production_code_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_part_no_id_master_options_id_fk" FOREIGN KEY ("part_no_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;