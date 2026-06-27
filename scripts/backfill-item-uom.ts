// Backfill the default unit-of-measure on existing items (ERP Phase 3 — Item
// Master completion). The new `uom` column has a DB default of 'Nos' for fresh
// inserts, but rows that predate migration 0023 carry NULL. This sets them to
// 'Nos'. Idempotent: a second run touches 0 rows (WHERE uom IS NULL).
//
//   npx tsx --env-file=.env.local scripts/backfill-item-uom.ts
//
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const updated = await sql`
    UPDATE items SET uom = 'Nos' WHERE uom IS NULL
  `;
  console.log(`backfill complete: set uom='Nos' on ${updated.count} item row(s).`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
