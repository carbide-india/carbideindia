import postgres from "postgres";

const url = process.env.SB_URL!;
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

async function main() {
  console.log("host:", new URL(url).host);
  try {
    const reg = await sql`select to_regclass('public.form_drafts') as t`;
    console.log("to_regclass(form_drafts):", reg[0]?.t ?? "NULL (not visible)");
    const rows = await sql`select id, owner_id, form_key, payload, label, created_at, updated_at from form_drafts where form_key = 'enquiry' order by updated_at desc limit 1`;
    console.log("query OK, rows:", rows.length);
  } catch (e) {
    console.error("QUERY FAILED:", (e as Error).message);
  }
}

main().finally(() => sql.end({ timeout: 5 }));
