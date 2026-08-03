/**
 * Backfill inquiry_items.feasibility_confirmed for lines whose parent enquiry is
 * already at feasibilityStatus='proceed_to_costing' but whose per-item confirmed
 * flag was never set (the flag was previously written only by a UI path that was
 * never wired up). Idempotent: only flips rows still at feasibility_confirmed=false.
 *
 *   pnpm backfill:feas-confirmed
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const updated = await sql`
    UPDATE inquiry_items it
    SET feasibility_confirmed = true,
        feasibility_confirmed_at = now(),
        updated_at = now()
    FROM inquiries i
    WHERE it.inquiry_id = i.id
      AND i.feasibility_status = 'proceed_to_costing'
      AND it.feasibility_confirmed = false
    RETURNING it.id`;
  console.log(`backfilled feasibility_confirmed on ${updated.length} inquiry_items`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
