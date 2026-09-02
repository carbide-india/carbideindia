// Demo seed: make the SM9595-Q02 quote chain show REAL cumulative revisions so
// the Revision Log is visible end-to-end. Sets distinct values per revision and
// adds a 3rd revision:
//   Original : Qty 50,  Final Cost 1,80,000, Quote Price 1,00,000
//   -R1      : Qty 75            (Quantity changed)
//   -R2      : Final Cost 2,00,000 (Amount changed)
//   -R3      : Quote Price 1,50,000 (Quote Price changed)  [added, becomes Current]
//
// Idempotent: re-running just re-sets the values and skips inserting -R3 again.
//
//   pnpm tsx --env-file=.env.local scripts/seed-revision-demo.ts
import postgres from "postgres";

const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL / DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const chain = (await sql`
    select * from quotations
    where quote_no in ('SM9595-Q02', 'SM9595-Q02-R1', 'SM9595-Q02-R2')
    order by revision_no asc
  `) as unknown as Record<string, unknown>[];

  const orig = chain.find((q) => q.quote_no === "SM9595-Q02");
  const r1 = chain.find((q) => q.quote_no === "SM9595-Q02-R1");
  const r2 = chain.find((q) => q.quote_no === "SM9595-Q02-R2");
  if (!orig || !r1 || !r2) {
    console.log("Chain SM9595-Q02 / -R1 / -R2 not found — nothing seeded.");
    return;
  }

  console.log("\n=== Seeding cumulative revision demo on SM9595-Q02 ===\n");

  // Baseline + per-revision single changes.
  await sql`update quotations set qty='50', final_cost='180000', negotiation='0', quote_price='100000', updated_at=now() where id=${orig.id as string}`;
  await sql`update quotations set qty='75', final_cost='180000', negotiation='0', quote_price='100000', updated_at=now() where id=${r1.id as string}`;
  await sql`update quotations set qty='75', final_cost='200000', negotiation='0', quote_price='100000', updated_at=now() where id=${r2.id as string}`;
  console.log("  ✓ Original / -R1 / -R2 values set");

  // Add -R3 (Quote Price change) if it doesn't exist.
  const existingR3 = (await sql`
    select id from quotations where quote_no='SM9595-Q02-R3' limit 1
  `) as unknown as { id: string }[];

  if (existingR3.length) {
    await sql`update quotations set qty='75', final_cost='200000', negotiation='0', quote_price='150000', updated_at=now() where id=${existingR3[0]!.id}`;
    console.log("  ✓ -R3 already present — values refreshed");
  } else {
    const fresh = { ...(r2 as Record<string, unknown>) };
    delete fresh.id;
    delete fresh.created_at;
    delete fresh.updated_at;
    fresh.quote_no = "SM9595-Q02-R3";
    fresh.revision_no = Number(r2.revision_no) + 1;
    fresh.supersedes_quotation_id = r2.id as string;
    fresh.is_latest_revision = true;
    fresh.revision_reason = "Revised quote price";
    fresh.quote_sent = false;
    fresh.quote_sent_at = null;
    fresh.quote_sent_by_id = null;
    fresh.quote_sent_to = null;
    fresh.qty = "75";
    fresh.final_cost = "200000";
    fresh.negotiation = "0";
    fresh.quote_price = "150000";

    const [ins] = (await sql`insert into quotations ${sql(fresh)} returning id`) as unknown as {
      id: string;
    }[];
    // R2 is no longer the latest.
    await sql`update quotations set is_latest_revision=false, updated_at=now() where id=${r2.id as string}`;

    // Copy R2's product lines onto R3.
    const lines = (await sql`
      select * from quotation_items where quotation_id=${r2.id as string}
    `) as unknown as Record<string, unknown>[];
    for (const line of lines) {
      const nl = { ...line };
      delete nl.id;
      delete nl.created_at;
      delete nl.updated_at;
      nl.quotation_id = ins!.id;
      await sql`insert into quotation_items ${sql(nl)}`;
    }
    console.log(`  ✓ -R3 inserted (${lines.length} line(s) copied), now Current`);
  }

  console.log("\n  Done. Open Quotation → Revision Log to see the cumulative table.\n");
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
