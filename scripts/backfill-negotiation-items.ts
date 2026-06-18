/** One negotiation_items row per existing negotiation, from its legacy product columns.
 *  Idempotent: skips negotiations that already have any negotiation_items row. */
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const rows = await sql`
    SELECT n.id, n.cust_product_name, n.qty, n.part_no,
           n.final_cost, n.negotiation, n.quote_price,
           n.development_time, n.delivery_time, n.validity
    FROM negotiations n
    WHERE NOT EXISTS (SELECT 1 FROM negotiation_items ni WHERE ni.negotiation_id = n.id)`;
  let count = 0;
  for (const r of rows) {
    await sql`INSERT INTO negotiation_items
      (negotiation_id, sort_order, cust_product_name, qty, part_no,
       final_cost, negotiation, quote_price, development_time, delivery_time, validity)
      VALUES (${r.id}, 0, ${r.cust_product_name}, ${r.qty}, ${r.part_no},
       ${r.final_cost}, ${r.negotiation}, ${r.quote_price},
       ${r.development_time}, ${r.delivery_time}, ${r.validity})`;
    count++;
  }
  console.log(`backfilled ${count} negotiation_items`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
