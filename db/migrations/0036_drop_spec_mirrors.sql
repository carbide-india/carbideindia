-- ERP redesign — Phase 6 (Snapshot law), part 2: DROP the always-copied SPEC/
-- customer-ask MIRROR columns from the commercial line tables (§2.5 REMOVE).
-- DESTRUCTIVE. The controller applies this ONLY after `pnpm precheck:drift`
-- passes with ZERO drift (every live-row mirror already equals the read-through
-- value from items/inquiry_item) — reconciliation is a prerequisite, not a flag.
--
-- 12 columns dropped (the ~14 always-copied mirrors of §2.5 for these three
-- tables): spec fields resolve read-through from `items` via item_id; the
-- customer-ask fields (cust_product_name / cust_drawing_no / drawing_revision_no)
-- resolve from the provenance inquiry_item (lib/flow/spec-resolve.ts, live since
-- Phase 5). NOT dropped: item_id / inquiry_item_id / quotation_item_id provenance
-- spine; transactional facts (qty, final_cost, negotiation, quote_price,
-- development/delivery time, validity); the legal snapshot columns added in 0035.
--
-- REVERSIBILITY: each table's dropped columns are first copied into a
-- <table>_snapshot_archive backup table (id + the mirror columns). Idempotent:
-- CREATE TABLE IF NOT EXISTS + DROP COLUMN IF EXISTS. Re-running is a no-op.

-- ── Reversible backups (copy the mirror columns BEFORE dropping) ──────────────
CREATE TABLE IF NOT EXISTS "quotation_items_snapshot_archive" AS
  SELECT "id", "cust_product_name", "cust_drawing_no", "drawing_revision_no",
         "grade_customer", "grade_name_for_cust", "tolerance", "condition", "part_no"
  FROM "quotation_items";--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "negotiation_items_snapshot_archive" AS
  SELECT "id", "cust_product_name", "part_no"
  FROM "negotiation_items";--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales_order_items_snapshot_archive" AS
  SELECT "id", "cust_product_name", "part_no"
  FROM "sales_order_items";--> statement-breakpoint

-- ── quotation_items — drop 8 spec/customer-ask mirrors ────────────────────────
ALTER TABLE "quotation_items" DROP COLUMN IF EXISTS "cust_product_name";--> statement-breakpoint
ALTER TABLE "quotation_items" DROP COLUMN IF EXISTS "cust_drawing_no";--> statement-breakpoint
ALTER TABLE "quotation_items" DROP COLUMN IF EXISTS "drawing_revision_no";--> statement-breakpoint
ALTER TABLE "quotation_items" DROP COLUMN IF EXISTS "grade_customer";--> statement-breakpoint
ALTER TABLE "quotation_items" DROP COLUMN IF EXISTS "grade_name_for_cust";--> statement-breakpoint
ALTER TABLE "quotation_items" DROP COLUMN IF EXISTS "tolerance";--> statement-breakpoint
ALTER TABLE "quotation_items" DROP COLUMN IF EXISTS "condition";--> statement-breakpoint
ALTER TABLE "quotation_items" DROP COLUMN IF EXISTS "part_no";--> statement-breakpoint

-- ── negotiation_items — drop 2 spec/customer-ask mirrors ──────────────────────
ALTER TABLE "negotiation_items" DROP COLUMN IF EXISTS "cust_product_name";--> statement-breakpoint
ALTER TABLE "negotiation_items" DROP COLUMN IF EXISTS "part_no";--> statement-breakpoint

-- ── sales_order_items — drop 2 spec/customer-ask mirrors ──────────────────────
ALTER TABLE "sales_order_items" DROP COLUMN IF EXISTS "cust_product_name";--> statement-breakpoint
ALTER TABLE "sales_order_items" DROP COLUMN IF EXISTS "part_no";
