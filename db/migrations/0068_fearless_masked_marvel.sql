CREATE TYPE "public"."negotiation_stage" AS ENUM('quote_send', 'pi_issued', 'negotiation_awarded', 'customer_po_received');--> statement-breakpoint
CREATE TABLE "proforma_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proforma_invoice_id" uuid NOT NULL,
	"negotiation_item_id" uuid,
	"quotation_item_id" uuid,
	"inquiry_item_id" uuid,
	"item_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"cust_product_name" text,
	"qty" numeric,
	"part_no" text,
	"revised_unit_price" numeric,
	"revised_line_total" numeric,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "proforma_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negotiation_id" uuid NOT NULL,
	"quotation_id" uuid,
	"inquiry_id" uuid NOT NULL,
	"pi_no" text,
	"iteration" integer NOT NULL,
	"issued_at" timestamp with time zone,
	"issued_by_id" uuid,
	"development_time" text,
	"delivery_time" text,
	"validity" text,
	"revised_total" numeric,
	"notes" text,
	"pdf_link" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proforma_invoices_pi_no_unique" UNIQUE("pi_no")
);
--> statement-breakpoint
ALTER TABLE "negotiations" ADD COLUMN "negotiation_stage" "negotiation_stage" DEFAULT 'quote_send' NOT NULL;--> statement-breakpoint
ALTER TABLE "negotiations" ADD COLUMN "pi_iteration_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "negotiations" ADD COLUMN "customer_po_no" text;--> statement-breakpoint
ALTER TABLE "negotiations" ADD COLUMN "customer_po_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "negotiations" ADD COLUMN "customer_po_link" text;--> statement-breakpoint
ALTER TABLE "negotiations" ADD COLUMN "customer_po_remarks" text;--> statement-breakpoint
ALTER TABLE "negotiations" ADD COLUMN "po_match_status" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "system_remark" text;--> statement-breakpoint
ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_proforma_invoice_id_proforma_invoices_id_fk" FOREIGN KEY ("proforma_invoice_id") REFERENCES "public"."proforma_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_negotiation_item_id_negotiation_items_id_fk" FOREIGN KEY ("negotiation_item_id") REFERENCES "public"."negotiation_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_quotation_item_id_quotation_items_id_fk" FOREIGN KEY ("quotation_item_id") REFERENCES "public"."quotation_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_negotiation_id_negotiations_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."negotiations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_issued_by_id_employees_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proforma_invoice_items_pi_idx" ON "proforma_invoice_items" USING btree ("proforma_invoice_id","sort_order");--> statement-breakpoint
CREATE INDEX "proforma_invoices_negotiation_idx" ON "proforma_invoices" USING btree ("negotiation_id");--> statement-breakpoint
CREATE INDEX "proforma_invoices_inquiry_idx" ON "proforma_invoices" USING btree ("inquiry_id");