// Demo seed: add a 10-revision chain to SM9607-Q01 so the Revision Log can be
// tested with a long chain (revision selector, search, cumulative table). Each
// revision changes ONE field so the cumulative highlighting is easy to read.
//
// Idempotent: if SM9607-Q01-R1 already exists, it skips (delete those rows first
// to re-seed).
//
//   pnpm tsx --env-file=.env.local scripts/seed-revision-demo-10.ts
import postgres from "postgres";

const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL / DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

// One field changed per revision (snake_case columns on `quotations`).
const CHANGES: Record<string, string>[] = [
  { qty: "120" },
  { final_cost: "410000" },
  { quote_price: "460000" },
  { negotiation: "5000" },
  { development_time: "5 weeks" },
  { delivery_time: "7 weeks" },
  { validity: "45 days" },
  { qty: "150" },
  { final_cost: "420000" },
  { quote_price: "475000" },
];

async function main() {
  const [base] = (await sql`
    select * from quotations
    where quote_no = 'SM9607-Q01' and supersedes_quotation_id is null
    limit 1
  `) as unknown as Record<string, unknown>[];
  if (!base) {
    console.log("SM9607-Q01 not found — nothing seeded.");
    return;
  }

  const existing = (await sql`
    select id from quotations where quote_no = 'SM9607-Q01-R1' limit 1
  `) as unknown as { id: string }[];
  if (existing.length) {
    console.log("SM9607-Q01-R1 already exists — skipping (delete -R1..-R10 to re-seed).");
    return;
  }

  console.log("\n=== Seeding 10-revision chain on SM9607-Q01 ===\n");

  // Baseline values on the original.
  await sql`update quotations set
      qty='100', final_cost='400000', negotiation='0', quote_price='456468',
      development_time='4 weeks', delivery_time='6 weeks', validity='30 days',
      is_latest_revision=false, updated_at=now()
    where id=${base.id as string}`;

  const tmpl: Record<string, unknown> = { ...base };
  delete tmpl.id;
  delete tmpl.created_at;
  delete tmpl.updated_at;
  Object.assign(tmpl, {
    qty: "100",
    final_cost: "400000",
    negotiation: "0",
    quote_price: "456468",
    development_time: "4 weeks",
    delivery_time: "6 weeks",
    validity: "30 days",
  });

  let prevId = base.id as string;
  let prevRev = Number(base.revision_no);

  for (let i = 0; i < CHANGES.length; i++) {
    const change = CHANGES[i]!;
    Object.assign(tmpl, change);
    const row: Record<string, unknown> = { ...tmpl };
    row.quote_no = `SM9607-Q01-R${i + 1}`;
    row.revision_no = prevRev + 1;
    row.supersedes_quotation_id = prevId;
    row.is_latest_revision = i === CHANGES.length - 1;
    row.revision_reason = `Revised ${Object.keys(change)[0]!.replace(/_/g, " ")}`;
    row.quote_sent = false;
    row.quote_sent_at = null;
    row.quote_sent_by_id = null;
    row.quote_sent_to = null;

    const [ins] = (await sql`insert into quotations ${sql(row)} returning id`) as unknown as {
      id: string;
    }[];

    const lines = (await sql`
      select * from quotation_items where quotation_id=${prevId}
    `) as unknown as Record<string, unknown>[];
    for (const line of lines) {
      const nl = { ...line };
      delete nl.id;
      delete nl.created_at;
      delete nl.updated_at;
      nl.quotation_id = ins!.id;
      await sql`insert into quotation_items ${sql(nl)}`;
    }

    console.log(`  ✓ SM9607-Q01-R${i + 1}  (${row.revision_reason})`);
    prevId = ins!.id;
    prevRev = row.revision_no as number;
  }

  console.log("\n  Done. Open Quotation → Revision Log → SM9607-Q01.\n");
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
