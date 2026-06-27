ALTER TABLE "documents" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "hsn_code" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "uom" text DEFAULT 'Nos';--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "alt_uom" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "alt_uom_conversion" numeric;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_item_idx" ON "documents" USING btree ("item_id");