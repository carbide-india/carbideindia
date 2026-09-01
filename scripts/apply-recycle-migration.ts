// Surgical, SAFE applier for migration 0084 (inquiries.deleted_at → Recycle Bin).
// The repo's ledger is out of sync with the live DB, so a blanket --apply is
// unsafe; this adds only the one nullable column, idempotently (IF NOT EXISTS).
// Nullable ADD COLUMN is an instant metadata change — no table rewrite, no data.
//
//   pnpm tsx --env-file=.env.local scripts/apply-recycle-migration.ts
import postgres from "postgres";

const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL / DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  console.log("\n=== Adding inquiries.deleted_at (idempotent) ===\n");
  await sql.unsafe(
    `ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone`,
  );
  console.log("  ✓ inquiries.deleted_at");
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now())`,
  );
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0084_ambitious_scalphunter.sql') on conflict do nothing`,
  );
  const rows = (await sql.unsafe(
    `select column_name from information_schema.columns where table_name='inquiries' and column_name='deleted_at'`,
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
