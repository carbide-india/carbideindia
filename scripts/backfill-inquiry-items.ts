/** One inquiry_items row per existing inquiry, from its legacy product columns.
 *  Idempotent: skips inquiries that already have any inquiry_items row. */
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const rows = await sql`
    SELECT i.id, i.product_description, i.shape, i.outer_dia, i.inner_dia, i.length, i.width,
           i.thickness, i.dimension_notes, i.grade_id, i.tolerance_id, i.condition_id,
           i.quantity_nos, i.quantity_uom
    FROM inquiries i
    WHERE NOT EXISTS (SELECT 1 FROM inquiry_items it WHERE it.inquiry_id = i.id)`;
  let n = 0;
  for (const r of rows) {
    await sql`INSERT INTO inquiry_items
      (inquiry_id, sort_order, cust_product_name, shape, outer_dia, inner_dia, length, width,
       thickness, dimension_notes, grade_id, tolerance_id, condition_id, quantity_nos, quantity_uom)
      VALUES (${r.id}, 0, ${r.product_description}, ${r.shape}, ${r.outer_dia}, ${r.inner_dia},
       ${r.length}, ${r.width}, ${r.thickness}, ${r.dimension_notes}, ${r.grade_id},
       ${r.tolerance_id}, ${r.condition_id}, ${r.quantity_nos}, ${r.quantity_uom ?? "Nos"})`;
    n++;
  }
  console.log(`backfilled ${n} inquiry_items`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
