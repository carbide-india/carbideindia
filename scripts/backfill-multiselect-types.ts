// Backfill the new multi-select array columns (migration 0026) from the legacy
// singular columns. Idempotent: only fills rows whose array is still NULL and
// whose singular id is set, so re-running is a no-op.
//
//   pnpm tsx --env-file=.env.local scripts/backfill-multiselect-types.ts
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const customer = await sql`
    UPDATE clients
       SET customer_type_ids = ARRAY[customer_type_id]
     WHERE customer_type_id IS NOT NULL
       AND customer_type_ids IS NULL
  `;
  const industry = await sql`
    UPDATE clients
       SET industry_type_ids = ARRAY[industry_type_id]
     WHERE industry_type_id IS NOT NULL
       AND industry_type_ids IS NULL
  `;
  console.log(
    `backfilled customer_type_ids: ${customer.count}, industry_type_ids: ${industry.count}`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
