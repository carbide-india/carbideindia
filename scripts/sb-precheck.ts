import postgres from "postgres";

const url = process.env.SB_URL;
if (!url) throw new Error("SB_URL not set");
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

async function main() {
  const tables = await sql<{ n: number }[]>`
    select count(*)::int as n from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'`;
  console.log("public tables:", tables[0]?.n);

  const seqs = await sql<{ name: string }[]>`
    select sequence_name as name from information_schema.sequences where sequence_schema='public'`;
  console.log("sequences:", seqs.length ? seqs.map((s) => s.name).join(", ") : "(none)");

  // Can we disable FK triggers during bulk load? (superuser-ish privilege)
  let canReplica = false;
  try {
    await sql.begin(async (tx) => {
      await tx`set session_replication_role = replica`;
      await tx`set session_replication_role = origin`;
    });
    canReplica = true;
  } catch (e) {
    canReplica = false;
    console.log("session_replication_role NOT allowed:", (e as Error).message);
  }
  console.log("can disable FK triggers (session_replication_role):", canReplica);
}

main()
  .catch((e) => {
    console.error("ERR", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
