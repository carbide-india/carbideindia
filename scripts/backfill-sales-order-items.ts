/** One sales_order_items row per existing sales_order, from its legacy product columns.
 *  Idempotent: skips sales_orders that already have any sales_order_items row. */
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  const rows = await sql`
    SELECT so.id, so.cust_product_name, so.qty, so.part_no,
           so.quote_price, so.development_time, so.delivery_time, so.validity
    FROM sales_orders so
    WHERE NOT EXISTS (SELECT 1 FROM sales_order_items soi WHERE soi.sales_order_id = so.id)`;
  let count = 0;
  for (const r of rows) {
    await sql`INSERT INTO sales_order_items
      (sales_order_id, sort_order, cust_product_name, qty, part_no,
       quote_price, development_time, delivery_time, validity)
      VALUES (${r.id}, 0, ${r.cust_product_name}, ${r.qty}, ${r.part_no},
       ${r.quote_price}, ${r.development_time}, ${r.delivery_time}, ${r.validity})`;
    count++;
  }
  console.log(`backfilled ${count} sales_order_items`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
