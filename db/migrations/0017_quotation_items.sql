CREATE TABLE "quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"inquiry_item_id" uuid,
	"item_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"cust_product_name" text,
	"cust_drawing_no" text,
	"drawing_revision_no" text,
	"qty" numeric,
	"grade_customer" text,
	"grade_name_for_cust" text,
	"tolerance" text,
	"condition" text,
	"part_no" text,
	"final_cost" numeric,
	"negotiation" numeric,
	"quote_price" numeric,
	"development_time" text,
	"delivery_time" text,
	"validity" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_inquiry_item_id_inquiry_items_id_fk" FOREIGN KEY ("inquiry_item_id") REFERENCES "public"."inquiry_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quotation_items_quotation_idx" ON "quotation_items" USING btree ("quotation_id","sort_order");