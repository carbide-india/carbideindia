-- ERP redesign — Phase 7, part 2: backfill sales_orders.negotiation_id.
-- DATA-ONLY (no DDL) — NOT tracked by drizzle-kit (it owns only the journal'd
-- 0037 DDL); applied by scripts/apply-all-migrations.ts via its by-filename
-- ledger. Idempotent: only fills rows that are still NULL, and ONLY where the
-- link is UNAMBIGUOUS (exactly one negotiation shares the SO's inquiry). SOs
-- whose inquiry maps to zero or multiple negotiations are left NULL (the
-- Phase-8 order_won handler is the authoritative writer going forward).

UPDATE "sales_orders" so
SET "negotiation_id" = n."id"
FROM (
  -- One negotiation per inquiry, and only inquiries with EXACTLY one.
  SELECT "inquiry_id", MIN("id"::text)::uuid AS "id"
  FROM "negotiations"
  GROUP BY "inquiry_id"
  HAVING COUNT(*) = 1
) n
WHERE so."inquiry_id" = n."inquiry_id"
  AND so."negotiation_id" IS NULL;
