/**
 * One-time data migration: copy ALL data from Neon (source) to Supabase (target).
 *
 * Uses Postgres COPY streaming (text format) for perfect type fidelity — every
 * column type, array, jsonb, timestamp round-trips exactly. FK order is made
 * irrelevant by setting `session_replication_role = replica` on the target
 * (disables FK triggers during load). Re-runnable: truncates target data first.
 *
 * Source  = process.env.DATABASE_URL   (Neon — loaded from .env.local)
 * Target  = process.env.SB_URL         (Supabase — passed inline)
 *
 * Run:
 *   SB_URL="postgres://...supabase...:5432/postgres?sslmode=require" \
 *     npx tsx --env-file=.env.local scripts/copy-neon-to-supabase.ts
 */
import postgres from "postgres";
import { pipeline } from "node:stream/promises";

const SRC = process.env.DATABASE_URL;
const DST = process.env.SB_URL;
if (!SRC) throw new Error("DATABASE_URL (Neon source) not set");
if (!DST) throw new Error("SB_URL (Supabase target) not set");

const source = postgres(SRC, { prepare: false, max: 3 });
const target = postgres(DST, { prepare: false, ssl: "require", max: 3 });

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

const SEQUENCES = [
  "tasks_task_no_seq",
  "clients_client_code_seq",
  "inquiries_sm_number_seq",
  "client_meeting_no_seq",
  "item_seq_seq",
  "production_order_no_seq",
];

async function tableNames(sql: postgres.Sql): Promise<Set<string>> {
  const rows = await sql<{ t: string }[]>`
    select table_name as t from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'`;
  return new Set(rows.map((r) => r.t));
}

async function main() {
  console.log("source host:", new URL(SRC!).host);
  console.log("target host:", new URL(DST!).host);
  if (!/supabase/.test(new URL(DST!).host)) throw new Error("target is not supabase — aborting");

  const srcT = await tableNames(source);
  const dstT = await tableNames(target);
  const tables = [...dstT].filter((t) => srcT.has(t) && t !== "__schema_applied").sort();
  console.log(`copying ${tables.length} tables\n`);

  const rt = await target.reserve();
  try {
    await rt`set session_replication_role = replica`;
    await rt.unsafe(`truncate ${tables.map(q).join(", ")} cascade`);

    for (const t of tables) {
      const cols = (
        await target<{ c: string }[]>`
          select column_name as c from information_schema.columns
          where table_schema='public' and table_name=${t} order by ordinal_position`
      ).map((r) => r.c);
      const collist = cols.map(q).join(", ");
      try {
        const readable = await source.unsafe(`copy ${q(t)} (${collist}) to stdout`).readable();
        const writable = await rt.unsafe(`copy ${q(t)} (${collist}) from stdin`).writable();
        await pipeline(readable, writable);
        const n = (await target<{ n: number }[]>`select count(*)::int as n from ${target(t)}`)[0]?.n ?? 0;
        console.log(`  ✓ ${t}: ${n}`);
      } catch (e) {
        console.error(`  ✗ ${t}: ${(e as Error).message}`);
      }
    }

    await rt`set session_replication_role = origin`;
  } finally {
    rt.release();
  }

  console.log("\n=== sequences ===");
  for (const s of SEQUENCES) {
    try {
      const lv = (await source.unsafe(`select last_value, is_called from ${q(s)}`)) as unknown as {
        last_value: string;
        is_called: boolean;
      }[];
      const { last_value, is_called } = lv[0]!;
      await target.unsafe(`select setval('${s}', ${last_value}, ${is_called})`);
      console.log(`  ${s} -> ${last_value} (called=${is_called})`);
    } catch (e) {
      console.log(`  ${s} skip: ${(e as Error).message}`);
    }
  }

  console.log("\n=== verify row counts (source vs target) ===");
  let mismatches = 0;
  let total = 0;
  for (const t of tables) {
    const sc = (await source<{ n: number }[]>`select count(*)::int as n from ${source(t)}`)[0]?.n ?? 0;
    const tc = (await target<{ n: number }[]>`select count(*)::int as n from ${target(t)}`)[0]?.n ?? 0;
    total += tc;
    if (sc !== tc) {
      console.log(`  MISMATCH ${t}: src=${sc} dst=${tc}`);
      mismatches++;
    }
  }
  console.log(mismatches === 0 ? `\nALL COUNTS MATCH ✓  (${total} rows total)` : `\n${mismatches} MISMATCH(ES)`);
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
