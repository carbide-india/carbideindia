-- ERP redesign — Phase 4 (Guaranteed Item-Sync Contract): items draft fields.
-- ADDITIVE ONLY — two nullable columns supporting draft Items (§3.2). No column
-- renamed or dropped; no data change. The item_status enum + items.status +
-- items_status_idx + the where-used item_id indexes already exist (0030/0032) —
-- this migration only adds `draft_reason` + `completed_at`. Idempotent
-- (IF NOT EXISTS) in the 0030/0031/0032 style. Applied to Neon by the controller.
--
-- NOTE: the inquiry_items.item_id NOT NULL + ON DELETE RESTRICT constraint is a
-- SEPARATE later migration, applied only AFTER the total backfill fills every
-- inquiry_items.item_id (§3.8). It is deliberately NOT part of this phase.

ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "draft_reason" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
