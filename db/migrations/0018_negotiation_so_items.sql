CREATE TABLE "negotiation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negotiation_id" uuid NOT NULL,
	"inquiry_item_id" uuid,
	"quotation_item_id" uuid,
	"item_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"cust_product_name" text,
	"qty" numeric,
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
CREATE TABLE "sales_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"inquiry_item_id" uuid,
	"quotation_item_id" uuid,
	"item_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"cust_product_name" text,
	"qty" numeric,
	"part_no" text,
	"quote_price" numeric,
	"development_time" text,
	"delivery_time" text,
	"validity" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "negotiation_items" ADD CONSTRAINT "negotiation_items_negotiation_id_negotiations_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."negotiations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_items" ADD CONSTRAINT "negotiation_items_inquiry_item_id_inquiry_items_id_fk" FOREIGN KEY ("inquiry_item_id") REFERENCES "public"."inquiry_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_items" ADD CONSTRAINT "negotiation_items_quotation_item_id_quotation_items_id_fk" FOREIGN KEY ("quotation_item_id") REFERENCES "public"."quotation_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_items" ADD CONSTRAINT "negotiation_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_inquiry_item_id_inquiry_items_id_fk" FOREIGN KEY ("inquiry_item_id") REFERENCES "public"."inquiry_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_quotation_item_id_quotation_items_id_fk" FOREIGN KEY ("quotation_item_id") REFERENCES "public"."quotation_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "negotiation_items_negotiation_idx" ON "negotiation_items" USING btree ("negotiation_id","sort_order");--> statement-breakpoint
CREATE INDEX "sales_order_items_so_idx" ON "sales_order_items" USING btree ("sales_order_id","sort_order");