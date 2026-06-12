CREATE TYPE "public"."costing_done_status" AS ENUM('not_done', 'in_process', 'done');--> statement-breakpoint
CREATE TYPE "public"."negotiation_status" AS ENUM('to_start', 'follow_up', 'revision', 'verbal_yes', 'order_won', 'order_lost', 'order_abandoned', 'need_help', 'on_hold');--> statement-breakpoint
CREATE TABLE "negotiations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"quotation_id" uuid,
	"negotiation_no" text NOT NULL,
	"company_name" text,
	"enquiry_date" timestamp with time zone,
	"sales_person_id" uuid,
	"cust_product_name" text,
	"qty" numeric,
	"part_no" text,
	"final_cost" numeric,
	"negotiation" numeric,
	"quote_price" numeric,
	"development_time" text,
	"delivery_time" text,
	"validity" text,
	"quotation_link" text,
	"negotiation_status" "negotiation_status" DEFAULT 'to_start' NOT NULL,
	"negotiation_notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "negotiations_negotiation_no_unique" UNIQUE("negotiation_no")
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"quote_no" text NOT NULL,
	"company_name" text,
	"enquiry_date" timestamp with time zone,
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
	"costing_done_status" "costing_done_status" DEFAULT 'not_done' NOT NULL,
	"quotation_link" text,
	"quote_sent" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_quote_no_unique" UNIQUE("quote_no")
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"quotation_id" uuid,
	"so_no" text NOT NULL,
	"company_name" text,
	"enquiry_date" timestamp with time zone,
	"sales_person_id" uuid,
	"cust_product_name" text,
	"qty" numeric,
	"part_no" text,
	"quote_price" numeric,
	"development_time" text,
	"delivery_time" text,
	"validity" text,
	"quotation_link" text,
	"customer_po_link" text,
	"customer_po_date" timestamp with time zone,
	"customer_po_no" text,
	"customer_so_link" text,
	"customer_so_sent" boolean DEFAULT false NOT NULL,
	"production_so_link" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_orders_so_no_unique" UNIQUE("so_no")
);
--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_sales_person_id_employees_id_fk" FOREIGN KEY ("sales_person_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_sales_person_id_employees_id_fk" FOREIGN KEY ("sales_person_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "negotiations_inquiry_idx" ON "negotiations" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "negotiations_status_idx" ON "negotiations" USING btree ("negotiation_status");--> statement-breakpoint
CREATE INDEX "quotations_inquiry_idx" ON "quotations" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "sales_orders_inquiry_idx" ON "sales_orders" USING btree ("inquiry_id");