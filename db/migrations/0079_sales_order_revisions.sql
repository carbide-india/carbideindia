CREATE TABLE "customer_po_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"customer_po_no" text,
	"customer_po_date" timestamp with time zone,
	"customer_po_link" text,
	"reason" text,
	"superseded_by_id" uuid,
	"superseded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "revision_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "supersedes_sales_order_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "is_latest_revision" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "revision_reason" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "customer_so_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "customer_so_sent_by_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "production_so_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "production_so_sent_by_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "customer_po_revision_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_po_revisions" ADD CONSTRAINT "customer_po_revisions_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_po_revisions" ADD CONSTRAINT "customer_po_revisions_superseded_by_id_employees_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_po_revisions_so_idx" ON "customer_po_revisions" USING btree ("sales_order_id","revision_no");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_supersedes_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("supersedes_sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_so_sent_by_id_employees_id_fk" FOREIGN KEY ("customer_so_sent_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_production_so_sent_by_id_employees_id_fk" FOREIGN KEY ("production_so_sent_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_orders_revision_idx" ON "sales_orders" USING btree ("inquiry_id","revision_no");--> statement-breakpoint
-- Superseded customer POs are append-only, for the same reason negotiation
-- remarks are (migration 0078): the PO we accepted an order on settles disputes
-- about quantity and price, and a record that can be edited settles nothing.
--
-- The DELETE arm makes the same single exception — the cascade from deleting the
-- sales order itself. Postgres removes the parent before applying the
-- referential action, so a vanished parent identifies a cascade rather than
-- someone reaching in to erase one revision.
CREATE OR REPLACE FUNCTION customer_po_revisions_block_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM sales_orders WHERE id = OLD.sales_order_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'customer_po_revisions is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER customer_po_revisions_no_update BEFORE UPDATE ON customer_po_revisions
  FOR EACH ROW EXECUTE FUNCTION customer_po_revisions_block_mutation();
--> statement-breakpoint
CREATE TRIGGER customer_po_revisions_no_delete BEFORE DELETE ON customer_po_revisions
  FOR EACH ROW EXECUTE FUNCTION customer_po_revisions_block_mutation();
