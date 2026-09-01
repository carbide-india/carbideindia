// One-purpose, SAFE applier for the approval-workflow enum values (migrations
// 0082/0083). The repo's `apply-all-migrations.ts` ledger is out of sync with
// the live Neon DB (it lists long-applied migrations as pending), so a blanket
// `--apply` would try to re-run already-applied DDL and fail. This script adds
// ONLY the new enum values, each with IF NOT EXISTS, so it is idempotent and
// touches zero rows — no table rewrite, no data access.
//
//   pnpm tsx --env-file=.env.local scripts/apply-approval-enums.ts
import postgres from "postgres";

const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL / DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

// From db/migrations/0082_fluffy_nebula.sql and 0083_flimsy_salo.sql.
const additions: { type: string; value: string }[] = [
  { type: "costing_done_status", value: "on_hold" },
  { type: "costing_done_status", value: "cancelled" },
  { type: "feasibility_status", value: "on_hold" },
  { type: "feasibility_status", value: "cancelled" },
  { type: "negotiation_status", value: "cancelled" },
  { type: "quotation_status", value: "on_hold" },
  { type: "quotation_status", value: "cancelled" },
  { type: "sales_order_status", value: "not_approved" },
  { type: "sales_order_status", value: "on_hold" },
  { type: "sales_order_status", value: "cancelled" },
  { type: "secondary_feasibility_status", value: "on_hold" },
  { type: "secondary_feasibility_status", value: "cancelled" },
  { type: "enquiry_status", value: "on_hold" },
  { type: "enquiry_status", value: "cancelled" },
];

async function main() {
  console.log(`\n=== Applying ${additions.length} approval enum values (idempotent) ===\n`);
  for (const { type, value } of additions) {
    // ADD VALUE can't run inside a transaction; postgres-js runs each stand-alone.
    await sql.unsafe(`ALTER TYPE "public"."${type}" ADD VALUE IF NOT EXISTS '${value}'`);
    console.log(`  ✓ ${type} += '${value}'`);
  }
  // Record 0082/0083 in the ledger so any future ledger-based run skips them.
  await sql.unsafe(
    `create table if not exists __schema_applied (filename text primary key, applied_at timestamptz not null default now())`,
  );
  await sql.unsafe(
    `insert into __schema_applied (filename) values ('0082_fluffy_nebula.sql'), ('0083_flimsy_salo.sql') on conflict do nothing`,
  );
  console.log(`\n=== Done. Verifying enquiry_status values: ===`);
  const rows = (await sql.unsafe(
    `select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'enquiry_status' order by e.enumsortorder`,
  )) as unknown as { enumlabel: string }[];
  console.log("  enquiry_status:", rows.map((r) => r.enumlabel).join(", "));
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
