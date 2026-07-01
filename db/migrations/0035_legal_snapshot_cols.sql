-- ERP redesign — Phase 6 (Snapshot law), part 1: LEGAL commercial snapshot columns.
-- ADDITIVE ONLY. Adds the frozen-at-transition snapshot columns to the three
-- commercial line tables (§2.4 "The snapshot rule"): unit_price + spec_snapshot
-- (jsonb, for legal PDF reproduction) + frozen_at/frozen_by, plus qty_ordered on
-- sales_order_items (the order freezes qty at confirmation). All NULLABLE — the
-- freeze WRITE logic lands in Phase 8 transition handlers; drafts stay NULL and
-- read through live. Idempotent (IF NOT EXISTS) in the 0033/0034 style.
--
-- This migration ALSO migrates the CURRENT price/qty of any already-SENT/CONFIRMED
-- line into the new legal columns, so no committed commercial value is lost when
-- migration 0036 drops the always-copied SPEC mirrors. It does NOT snapshot spec
-- (spec_snapshot stays NULL here — Phase 8 owns the jsonb freeze); the dropped
-- mirrors are pure spec/customer-ask copies that remain reproducible read-through
-- from items/inquiry_items for these historical rows.

-- ── quotation_items ──────────────────────────────────────────────────────────
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "unit_price" numeric;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "spec_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN IF NOT EXISTS "frozen_by" uuid;--> statement-breakpoint

-- ── negotiation_items ────────────────────────────────────────────────────────
ALTER TABLE "negotiation_items" ADD COLUMN IF NOT EXISTS "unit_price" numeric;--> statement-breakpoint
ALTER TABLE "negotiation_items" ADD COLUMN IF NOT EXISTS "spec_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "negotiation_items" ADD COLUMN IF NOT EXISTS "frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "negotiation_items" ADD COLUMN IF NOT EXISTS "frozen_by" uuid;--> statement-breakpoint

-- ── sales_order_items ────────────────────────────────────────────────────────
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "unit_price" numeric;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "spec_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "qty_ordered" numeric;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "frozen_by" uuid;--> statement-breakpoint

-- ── Preserve committed commercial value for already-sent/confirmed rows ───────
-- Freeze the CURRENT line price/qty of historical SENT/CONFIRMED documents into
-- the legal columns (idempotent: only where unit_price is still NULL). Draft/
-- open documents are intentionally left NULL — they read through live and are
-- frozen later by the Phase-8 transition handlers.

-- Sent quotations → freeze the line's current quote_price.
UPDATE "quotation_items" qi
SET "unit_price" = qi."quote_price",
    "frozen_at" = COALESCE(qi."updated_at", now())
FROM "quotations" q
WHERE qi."quotation_id" = q."id"
  AND q."quote_sent" = true
  AND qi."unit_price" IS NULL
  AND qi."quote_price" IS NOT NULL;--> statement-breakpoint

-- Agreed negotiations (verbal_yes / order_won) → freeze the negotiated number,
-- falling back to the line's quote_price when no explicit negotiated figure.
UPDATE "negotiation_items" ni
SET "unit_price" = COALESCE(ni."negotiation", ni."quote_price"),
    "frozen_at" = COALESCE(ni."updated_at", now())
FROM "negotiations" n
WHERE ni."negotiation_id" = n."id"
  AND n."negotiation_status" IN ('verbal_yes', 'order_won')
  AND ni."unit_price" IS NULL
  AND COALESCE(ni."negotiation", ni."quote_price") IS NOT NULL;--> statement-breakpoint

-- Confirmed sales orders (customer SO sent) → freeze the line price AND qty.
UPDATE "sales_order_items" si
SET "unit_price" = si."quote_price",
    "qty_ordered" = si."qty",
    "frozen_at" = COALESCE(si."updated_at", now())
FROM "sales_orders" so
WHERE si."sales_order_id" = so."id"
  AND so."customer_so_sent" = true
  AND si."unit_price" IS NULL;
