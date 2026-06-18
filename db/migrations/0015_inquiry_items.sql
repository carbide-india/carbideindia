CREATE TABLE "inquiry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"cust_product_name" text,
	"cust_drawing_no" text,
	"drawing_revision_no" text,
	"shape" text,
	"outer_dia" numeric,
	"inner_dia" numeric,
	"length" numeric,
	"width" numeric,
	"thickness" numeric,
	"dimension_notes" text,
	"grade_id" uuid,
	"grade_customer" text,
	"tolerance_id" uuid,
	"condition_id" uuid,
	"quantity_nos" numeric,
	"quantity_uom" text DEFAULT 'Nos' NOT NULL,
	"item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_grade_id_master_options_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_tolerance_id_master_options_id_fk" FOREIGN KEY ("tolerance_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_condition_id_master_options_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."master_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiry_items_inquiry_idx" ON "inquiry_items" USING btree ("inquiry_id","sort_order");