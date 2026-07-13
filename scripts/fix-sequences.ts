/**
 * Fix Supabase sequence positions from Neon (the copy was interrupted before
 * finishing setval). Reads Neon from .env.local.bak; applies setval on Supabase
 * preserving (last_value, is_called) so the next nextval continues correctly.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

function neonUrl(): string {
  const txt = readFileSync(".env.local.bak", "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
    if (m && !line.trimStart().startsWith("#")) return m[1]!.replace(/^["']|["']$/g, "").trim();
  }
  throw new Error("DATABASE_URL not in .env.local.bak");
}

const source = postgres(neonUrl(), { prepare: false, max: 1 });
const target = postgres(process.env.SB_URL!, { prepare: false, ssl: "require", max: 1 });

async function main() {
  const seqs = (
    await source<{ name: string }[]>`
      select sequence_name as name from information_schema.sequences where sequence_schema='public' order by 1`
  ).map((r) => r.name);

  for (const s of seqs) {
    const src = (await source.unsafe(`select last_value, is_called from "${s}"`)) as unknown as {
      last_value: string;
      is_called: boolean;
    }[];
    const { last_value, is_called } = src[0]!;
    await target.unsafe(`select setval('${s}', ${last_value}, ${is_called})`);
    const chk = (await target.unsafe(`select last_value, is_called from "${s}"`)) as unknown as {
      last_value: string;
      is_called: boolean;
    }[];
    console.log(`  ${s.padEnd(30)} -> ${chk[0]?.last_value} (called=${chk[0]?.is_called})`);
  }
  console.log("\ndone.");
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
