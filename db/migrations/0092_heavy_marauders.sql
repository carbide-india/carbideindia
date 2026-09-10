CREATE TABLE "sales_order_po_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"attachment_path" text,
	"attachment_name" text,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "customer_po_confirmation" text DEFAULT 'not_read' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order_po_confirmations" ADD CONSTRAINT "sales_order_po_confirmations_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_po_confirmations" ADD CONSTRAINT "sales_order_po_confirmations_author_id_employees_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "so_po_confirmations_so_idx" ON "sales_order_po_confirmations" USING btree ("sales_order_id","created_at");