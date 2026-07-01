/** One quotation_items row per existing quotation, from its legacy product columns.
 *  Idempotent: skips quotations that already have any quotation_items row.
 *
 *  HISTORICAL (Phase 4-era). As of ERP Phase 6 (migration 0036) the spec /
 *  customer-ask MIRROR columns (cust_product_name, cust_drawing_no,
 *  drawing_revision_no, grade_customer, grade_name_for_cust, tolerance,
 *  condition, part_no) are DROPPED from quotation_items — spec now reads through
 *  `items` via item_id and customer-ask via the provenance inquiry_item. This
 *  legacy backfill therefore only seeds the KEPT transactional columns; it does
 *  NOT set item_id (that is the job of scripts/backfill-item-master.ts). Kept
 *  runnable only so an old DB missing quotation_items rows can still be seeded. */
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const rows = await sql`
    SELECT q.id, q.qty,
           q.final_cost, q.negotiation, q.quote_price, q.development_time, q.delivery_time,
           q.validity
    FROM quotations q
    WHERE NOT EXISTS (SELECT 1 FROM quotation_items qi WHERE qi.quotation_id = q.id)`;
  let n = 0;
  for (const r of rows) {
    await sql`INSERT INTO quotation_items
      (quotation_id, sort_order, qty,
       final_cost, negotiation, quote_price, development_time, delivery_time, validity)
      VALUES (${r.id}, 0, ${r.qty},
       ${r.final_cost}, ${r.negotiation}, ${r.quote_price},
       ${r.development_time}, ${r.delivery_time}, ${r.validity})`;
    n++;
  }
  console.log(`backfilled ${n} quotation_items`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
