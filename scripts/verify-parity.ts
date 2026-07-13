/**
 * Independent row-count parity check: Neon (source) vs Supabase (target).
 * Read-only. Source = DATABASE_URL (.env.local), Target = SB_URL (inline).
 */
import postgres from "postgres";

const SRC = process.env.DATABASE_URL;
const DST = process.env.SB_URL;
if (!SRC || !DST) throw new Error("need DATABASE_URL (Neon) and SB_URL (Supabase)");

const source = postgres(SRC, { prepare: false, max: 2 });
const target = postgres(DST, { prepare: false, ssl: "require", max: 2 });

async function baseTables(sql: postgres.Sql): Promise<Set<string>> {
  const rows = await sql<{ t: string }[]>`
    select table_name as t from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'`;
  return new Set(rows.map((r) => r.t));
}

async function main() {
  const srcT = await baseTables(source);
  const dstT = await baseTables(target);
  const tables = [...dstT].filter((t) => srcT.has(t) && t !== "__schema_applied").sort();

  let mismatches = 0;
  let srcTotal = 0;
  let dstTotal = 0;
  const nonEmpty: string[] = [];
  for (const t of tables) {
    const sc = (await source<{ n: number }[]>`select count(*)::int as n from ${source(t)}`)[0]?.n ?? 0;
    const tc = (await target<{ n: number }[]>`select count(*)::int as n from ${target(t)}`)[0]?.n ?? 0;
    srcTotal += sc;
    dstTotal += tc;
    if (sc !== tc) {
      console.log(`  MISMATCH ${t.padEnd(28)} neon=${sc} supabase=${tc}`);
      mismatches++;
    } else if (tc > 0) {
      nonEmpty.push(`${t}=${tc}`);
    }
  }
  console.log("\nnon-empty tables:", nonEmpty.join("  "));
  console.log(`\ntables compared: ${tables.length}`);
  console.log(`neon total rows: ${srcTotal}   supabase total rows: ${dstTotal}`);
  console.log(mismatches === 0 ? "PARITY OK — ALL COUNTS MATCH ✓" : `${mismatches} MISMATCH(ES) ✗`);
}

main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.end({ timeout: 5 });
    await target.end({ timeout: 5 });
  });
