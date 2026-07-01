-- ERP redesign — Phase 2 (Foundation B): costings.item_id (per-item cost history).
-- ADDITIVE + BACKFILL ONLY — nullable now; NOT-NULL cutover happens in a later
-- phase. Idempotent in the 0028/0029 style. Applied to Neon by the controller.

ALTER TABLE "costings" ADD COLUMN IF NOT EXISTS "item_id" uuid;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "costings" ADD CONSTRAINT "costings_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- Backfill (idempotent): derive item_id from the linked inquiry_items.item_id
-- via the existing inquiry_item_id provenance FK. Leaves rows null where the
-- source line is unlinked (Phase 4 total-backfill closes that gap).
UPDATE "costings" c
SET "item_id" = ii."item_id"
FROM "inquiry_items" ii
WHERE c."inquiry_item_id" = ii."id"
  AND c."item_id" IS NULL
  AND ii."item_id" IS NOT NULL;
