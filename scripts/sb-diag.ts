import postgres from "postgres";

const sql = postgres(process.env.SB_URL!, { prepare: false, ssl: "require", max: 1 });

async function main() {
  // Ledger contents
  const ledgerExists = await sql`select to_regclass('public.__schema_applied') as t`;
  console.log("__schema_applied table:", ledgerExists[0]?.t ?? "MISSING");
  if (ledgerExists[0]?.t) {
    const cols = await sql`select column_name from information_schema.columns where table_name='__schema_applied' and table_schema='public'`;
    console.log("ledger columns:", cols.map((c) => c.column_name).join(", "));
    const rows = await sql.unsafe(`select * from __schema_applied order by 1`);
    console.log("ledger row count:", rows.length);
    console.log("ledger entries:", rows.map((r: Record<string, unknown>) => Object.values(r)[0]).join(", "));
  }

  // Sentinel columns to confirm 0033–0039 actually applied to the DB
  const checks: [string, string, string][] = [
    ["inquiry_items", "draft_reason", "0033"],
    ["inquiry_items", "item_id", "0034"],
    ["quotation_items", "unit_price", "0035"],
    ["production_orders", "id", "0037"],
    ["org_settings", "workflow_flags", "0039"],
    ["form_drafts", "id", "0040"],
  ];
  console.log("\nsentinel columns (does the DB actually have them?):");
  for (const [tbl, col, mig] of checks) {
    const r = await sql`select 1 from information_schema.columns where table_schema='public' and table_name=${tbl} and column_name=${col} limit 1`;
    console.log(`  ${mig}  ${tbl}.${col}: ${r.length ? "EXISTS" : "missing"}`);
  }
}

main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
