// Surgical, SAFE applier for migration 0085 (clients.recycled_at → Client
// Recycle Bin). The repo's ledger is out of sync with the live DB, so a blanket
// --apply is unsafe; this adds only the one nullable column, idempotently
// (IF NOT EXISTS). Nullable ADD COLUMN is an instant metadata change — no table
// rewrite, no data.
//
//   pnpm tsx --env-file=.env.local scripts/apply-client-recycle.ts
import postgres from "postgres";

const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL / DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  console.log("\n=== Adding clients.recycled_at (idempotent) ===\n");
  await sql.unsafe(
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "recycled_at" timestamp with time zone`,
  );
  console.log("  ✓ clients.recycled_at");
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now())`,
  );
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0085_spicy_psynapse.sql') on conflict do nothing`,
  );
  const rows = (await sql.unsafe(
    `select column_name from information_schema.columns where table_name='clients' and column_name='recycled_at'`,
  )) as unknown as { column_name: string }[];
  console.log("  verified:", rows.length === 1 ? "present ✓" : "MISSING ✗");
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
