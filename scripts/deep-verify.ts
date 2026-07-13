/**
 * DEEP migration verification: Neon (source) vs Supabase (target).
 * Beyond row counts — compares a content fingerprint per table (order-independent
 * md5 of each row's md5) plus sequence values. Read-only on both sides.
 *
 * Neon URL is parsed from .env.local.bak (the pre-cutover backup) so no secret
 * is printed or referenced on the command line. Supabase URL from SB_URL.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

function neonUrlFromBak(): string {
  const txt = readFileSync(".env.local.bak", "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
    if (m && !line.trimStart().startsWith("#")) {
      return m[1]!.replace(/^["']|["']$/g, "").trim();
    }
  }
  throw new Error("DATABASE_URL not found in .env.local.bak");
}

const SRC = neonUrlFromBak();
const DST = process.env.SB_URL;
if (!DST) throw new Error("SB_URL (Supabase) not set");
if (!/neon/.test(new URL(SRC).host)) throw new Error("source is not Neon — abort");

const source = postgres(SRC, { prepare: false, max: 2 });
const target = postgres(DST, { prepare: false, ssl: "require", max: 2 });

async function baseTables(sql: postgres.Sql): Promise<string[]> {
  const rows = await sql<{ t: string }[]>`
    select table_name as t from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' order by table_name`;
  return rows.map((r) => r.t);
}

/** Order-independent content fingerprint: md5 over each row's md5, sorted. */
async function fingerprint(sql: postgres.Sql, table: string): Promise<{ n: number; hash: string }> {
  const r = await sql.unsafe<{ n: number; hash: string | null }[]>(
    `select count(*)::int as n,
            md5(coalesce(string_agg(rh, '' order by rh), '')) as hash
     from (select md5(t.*::text) as rh from "${table}" t) s`,
  );
  return { n: r[0]!.n, hash: r[0]!.hash ?? "(empty)" };
}

async function main() {
  console.log("source (Neon)    :", new URL(SRC).host);
  console.log("target (Supabase):", new URL(DST!).host, "\n");

  const srcTables = await baseTables(source);
  const dstTables = await baseTables(target);
  const srcSet = new Set(srcTables);
  const dstSet = new Set(dstTables);

  const onlyNeon = srcTables.filter((t) => !dstSet.has(t) && t !== "__schema_applied");
  const onlySupa = dstTables.filter((t) => !srcSet.has(t) && t !== "__schema_applied");
  if (onlyNeon.length) console.log("⚠ tables ONLY on Neon (NOT migrated):", onlyNeon.join(", "));
  if (onlySupa.length) console.log("  tables only on Supabase:", onlySupa.join(", "));

  const shared = srcTables.filter((t) => dstSet.has(t) && t !== "__schema_applied");
  let countMismatch = 0;
  let hashMismatch = 0;
  let totalRows = 0;
  for (const t of shared) {
    const [a, b] = await Promise.all([fingerprint(source, t), fingerprint(target, t)]);
    totalRows += b.n;
    const countOk = a.n === b.n;
    const hashOk = a.hash === b.hash;
    if (!countOk) countMismatch++;
    if (!hashOk) hashMismatch++;
    if (!countOk || !hashOk) {
      console.log(`  MISMATCH ${t.padEnd(28)} count ${a.n}/${b.n} ${countOk ? "" : "✗count"} ${hashOk ? "" : "✗content"}`);
    }
  }

  // sequences
  console.log("\n=== sequences (last_value) ===");
  const seqRows = await source<{ name: string }[]>`
    select sequence_name as name from information_schema.sequences where sequence_schema='public' order by 1`;
  for (const { name } of seqRows) {
    try {
      const s = (await source.unsafe(`select last_value from "${name}"`)) as unknown as { last_value: string }[];
      const d = (await target.unsafe(`select last_value from "${name}"`)) as unknown as { last_value: string }[];
      const ok = String(s[0]?.last_value) === String(d[0]?.last_value);
      console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(30)} neon=${s[0]?.last_value} supabase=${d[0]?.last_value}`);
    } catch (e) {
      console.log(`  ? ${name}: ${(e as Error).message.slice(0, 40)}`);
    }
  }

  console.log("\n=== summary ===");
  console.log(`tables compared      : ${shared.length}`);
  console.log(`tables only on Neon  : ${onlyNeon.length}`);
  console.log(`row-count mismatches : ${countMismatch}`);
  console.log(`content mismatches   : ${hashMismatch}`);
  console.log(`supabase total rows  : ${totalRows}`);
  const clean = onlyNeon.length === 0 && countMismatch === 0 && hashMismatch === 0;
  console.log(clean ? "\n✅ FULLY MIGRATED — every table, row count, and content hash matches." : "\n❌ DIFFERENCES FOUND — do NOT drop Neon.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.end({ timeout: 5 });
    await target.end({ timeout: 5 });
  });
