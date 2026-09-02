// One-time cleanup: collapse accumulated revision suffixes on existing quote
// numbers (SM9595-Q02-R2-R3 → SM9595-Q02-R2) so old rows match the fixed
// single "-R<n>" scheme. The suffix number is revisionNo - 1 (original has no
// suffix; first revision = R1). Processed in ascending revisionNo order so a
// lower target name is freed before a higher revision claims it — no unique
// collisions on quotations_quote_no_unique.
//
//   pnpm tsx --env-file=.env.local scripts/normalize-quote-numbers.ts
import postgres from "postgres";

const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL / DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const rows = (await sql`
    select id, quote_no, revision_no
    from quotations
    where supersedes_quotation_id is not null
    order by revision_no asc
  `) as unknown as { id: string; quote_no: string; revision_no: number }[];

  console.log(`\n=== Normalizing ${rows.length} revised quote number(s) ===\n`);
  let changed = 0;
  for (const r of rows) {
    const base = r.quote_no.replace(/(?:-R\d+)+$/i, "");
    const target = `${base}-R${Math.max(1, r.revision_no - 1)}`;
    if (target !== r.quote_no) {
      await sql`update quotations set quote_no = ${target} where id = ${r.id}`;
      console.log(`  ${r.quote_no}  →  ${target}`);
      changed++;
    }
  }
  console.log(`\n  ✓ ${changed} renamed, ${rows.length - changed} already clean.`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
