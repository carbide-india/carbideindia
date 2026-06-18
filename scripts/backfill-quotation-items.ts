/** One quotation_items row per existing quotation, from its legacy product columns.
 *  Idempotent: skips quotations that already have any quotation_items row. */
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const rows = await sql`
    SELECT q.id, q.cust_product_name, q.cust_drawing_no, q.drawing_revision_no, q.qty,
           q.grade_customer, q.grade_name_for_cust, q.tolerance, q.condition, q.part_no,
           q.final_cost, q.negotiation, q.quote_price, q.development_time, q.delivery_time,
           q.validity
    FROM quotations q
    WHERE NOT EXISTS (SELECT 1 FROM quotation_items qi WHERE qi.quotation_id = q.id)`;
  let n = 0;
  for (const r of rows) {
    await sql`INSERT INTO quotation_items
      (quotation_id, sort_order, cust_product_name, cust_drawing_no, drawing_revision_no, qty,
       grade_customer, grade_name_for_cust, tolerance, condition, part_no,
       final_cost, negotiation, quote_price, development_time, delivery_time, validity)
      VALUES (${r.id}, 0, ${r.cust_product_name}, ${r.cust_drawing_no}, ${r.drawing_revision_no},
       ${r.qty}, ${r.grade_customer}, ${r.grade_name_for_cust}, ${r.tolerance}, ${r.condition},
       ${r.part_no}, ${r.final_cost}, ${r.negotiation}, ${r.quote_price},
       ${r.development_time}, ${r.delivery_time}, ${r.validity})`;
    n++;
  }
  console.log(`backfilled ${n} quotation_items`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
