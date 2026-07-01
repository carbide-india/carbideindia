-- ERP redesign — Phase 2 (Foundation B): items.status + write-once origin_* cols.
-- ADDITIVE + BACKFILL ONLY — no existing column renamed or dropped (the real
-- rename/drop of the legacy provenance cols happens in Phase 6). Idempotent
-- (IF NOT EXISTS + DO $$ duplicate_object guards) in the 0028/0029 style.
-- Applied to Neon by the controller.

-- item_status enum (draft | active | archived | superseded reserved for merges).
DO $$ BEGIN
	CREATE TYPE "public"."item_status" AS ENUM('draft', 'active', 'archived', 'superseded');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- Lifecycle status alongside the existing is_active/deleted_at governance.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "status" "item_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint

-- Write-once provenance mirror of the source enquiry. NEVER queried for
-- usage/dedup/search (Canonical Decisions); legacy cols dropped in Phase 6.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "origin_inquiry_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "origin_sm_number" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "origin_enquiry_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "origin_customer_name" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "origin_cust_product_name" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "origin_qty" numeric;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "origin_created_by_id" uuid;--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "items" ADD CONSTRAINT "items_origin_inquiry_id_inquiries_id_fk" FOREIGN KEY ("origin_inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "items" ADD CONSTRAINT "items_origin_created_by_id_employees_id_fk" FOREIGN KEY ("origin_created_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "items_status_idx" ON "items" USING btree ("status");--> statement-breakpoint

-- ── Backfill (idempotent) ──────────────────────────────────────────────────
-- status: active where the row is live, archived where it was retired.
UPDATE "items" SET "status" = CASE WHEN "is_active" THEN 'active'::"item_status" ELSE 'archived'::"item_status" END;--> statement-breakpoint

-- origin_*: copy the existing legacy provenance cols write-once. Guard each with
-- COALESCE so a re-run never clobbers a value written by newer app code.
UPDATE "items" SET
	"origin_inquiry_id"        = COALESCE("origin_inquiry_id", "inquiry_id"),
	"origin_sm_number"         = COALESCE("origin_sm_number", "sm_number"),
	"origin_enquiry_date"      = COALESCE("origin_enquiry_date", "enquiry_date"),
	"origin_customer_name"     = COALESCE("origin_customer_name", "customer_name"),
	"origin_cust_product_name" = COALESCE("origin_cust_product_name", "cust_product_name"),
	"origin_qty"               = COALESCE("origin_qty", "qty"),
	"origin_created_by_id"     = COALESCE("origin_created_by_id", "created_by_id");

-- ── DEFERRED: seq ↔ item_code CHECK/trigger (blueprint §2.5 / §2.8 inv.5) ────
-- item_code = SIZE-<lpad(seq,5)>-SHAPE-GRADE-COND-TOL-DIMS, so the enforceable
-- SQL invariant is split_part(item_code,'-',2) = lpad(seq::text,5,'0'). NOT added
-- here because: (a) it cannot be verified against live Neon data from this phase
-- (controller applies; legacy/imported rows may predate the format), and (b) a
-- VALID table CHECK would scan+reject existing rows while a NOT-VALID CHECK would
-- break drizzle-kit parity (drizzle would keep wanting to add the VALID form).
-- TODO(Phase 6): add the CHECK once existing item_codes are audited/normalized,
-- alongside the origin_* rename/drop that this phase intentionally left additive.

