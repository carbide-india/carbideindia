-- ERP Phase 4 — SSOT invariant I1: inquiry_items.item_id is NOT NULL + ON DELETE RESTRICT.
-- Applied ONLY after the total backfill fills every inquiry_items.item_id (zero nulls verified)
-- and the in-transaction item-sync deploy is live (createInquiry inserts lines WITH item_id).
ALTER TABLE "inquiry_items" DROP CONSTRAINT IF EXISTS "inquiry_items_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "inquiry_items" ALTER COLUMN "item_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
