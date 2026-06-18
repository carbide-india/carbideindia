DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'costing_type') THEN
    CREATE TYPE "public"."costing_type" AS ENUM('inhouse', 'bought_out', 'both');
  END IF;
END $$;--> statement-breakpoint
ALTER TYPE "public"."master_kind" ADD VALUE IF NOT EXISTS 'size';--> statement-breakpoint
ALTER TYPE "public"."master_kind" ADD VALUE IF NOT EXISTS 'shape';--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."item_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10001 CACHE 1;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" integer DEFAULT nextval('item_seq_seq') NOT NULL,
	"item_code" text NOT NULL,
	"dedup_key" text NOT NULL,
	"inquiry_id" uuid,
	"sm_number" text,
	"enquiry_date" timestamp with time zone,
	"customer_name" text,
	"cust_product_name" text,
	"cust_drawing_no" text,
	"drawing_revision_no" text,
	"qty" numeric,
	"size_code" text,
	"shape_id" uuid,
	"internal_grade_id" uuid,
	"tolerance_id" uuid,
	"condition_id" uuid,
	"grade_customer" text,
	"grade_name_for_cust" text,
	"outer_dia" numeric,
	"inner_dia" numeric,
	"length" numeric,
	"width" numeric,
	"thickness" numeric,
	"dimension_notes" text,
	"part_no" text,
	"part_description_1" text,
	"part_description_2" text,
	"part_description_3" text,
	"part_description_4" text,
	"part_tag" text,
	"costing_type" "costing_type",
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_item_code_unique" UNIQUE("item_code")
);
--> statement-breakpoint
ALTER TABLE "master_options" ADD COLUMN IF NOT EXISTS "code" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_shape_id_master_options_id_fk" FOREIGN KEY ("shape_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_internal_grade_id_master_options_id_fk" FOREIGN KEY ("internal_grade_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_tolerance_id_master_options_id_fk" FOREIGN KEY ("tolerance_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_condition_id_master_options_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "items_dedup_key_uidx" ON "items" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_inquiry_idx" ON "items" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_shape_idx" ON "items" USING btree ("shape_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
