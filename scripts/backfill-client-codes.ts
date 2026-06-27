import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const rows = await sql`SELECT id FROM clients WHERE client_code IS NULL ORDER BY created_at ASC, name ASC`;
  let n = 0;
  // continue numbering after any already-assigned codes
  const maxRow = (await sql`SELECT COALESCE(MAX((substring(client_code from 4))::int), 0) AS maxn FROM clients WHERE client_code ~ '^CL-[0-9]+$'`)[0];
  if (!maxRow) throw new Error("unexpected empty result from maxn query");
  const { maxn } = maxRow;
  let next = Number(maxn);
  for (const r of rows) {
    next += 1;
    const code = "CL-" + String(next).padStart(4, "0");
    await sql`UPDATE clients SET client_code = ${code} WHERE id = ${r.id}`;
    n++;
  }
  const totalRow = (await sql`SELECT COALESCE(MAX((substring(client_code from 4))::int), 0) AS total FROM clients WHERE client_code ~ '^CL-[0-9]+$'`)[0];
  if (!totalRow) throw new Error("unexpected empty result from total query");
  const { total } = totalRow;
  await sql`SELECT setval('clients_client_code_seq', ${Number(total)}, true)`;
  console.log(`backfilled ${n} client codes; sequence set to ${total}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
