import postgres from "postgres";

const url = process.env.SB_URL;
if (!url) {
  console.error("SB_URL not set");
  process.exit(2);
}

const sql = postgres(url, { prepare: false, ssl: "require", connect_timeout: 15 });

async function main() {
  try {
    const v = await sql`select version() as v, current_database() as db`;
    const tables = await sql<{ n: number }[]>`
      select count(*)::int as n from information_schema.tables where table_schema = 'public'`;
    console.log("OK connected");
    console.log("version:", v[0]?.v);
    console.log("database:", v[0]?.db);
    console.log("public tables:", tables[0]?.n);
  } catch (e) {
    console.error("CONNECT FAILED:", (e as Error).message);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
