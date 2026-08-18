/**
 * Clear `inquiry_items.feasibility_confirmed` on lines that were confirmed
 * WITHOUT a Secondary / Technical Feasibility review.
 *
 * Why this exists
 * ---------------
 * `feasibility_confirmed` is the costing gate: a line only appears in Costing
 * once it is true (lib/queries/costings.ts). It is meant to be set by "Mark
 * Secondary Feasibility Done".
 *
 * An earlier backfill (scripts/backfill-feasibility-confirmed.ts, now removed)
 * set the flag for every line whose PARENT ENQUIRY had cleared Primary
 * Feasibility. That unblocked costing at a time when nothing was setting the
 * flag at all, but it over-reached: it confirmed lines Secondary had never
 * looked at, so they became costable without a technical review.
 *
 * This reverses exactly that over-reach and nothing else.
 *
 * Safety
 * ------
 *  - Only rows with `feasibility_confirmed = true` AND
 *    `secondary_feasibility_done = false` are touched — a line that really was
 *    reviewed keeps its confirmation.
 *  - Lines that already carry a cost sheet are LEFT ALONE: pulling the gate out
 *    from under work already done would strand it.
 *  - Dimension locks are not touched. These rows were never locked (locking
 *    happens as part of a real Secondary sign-off), and un-confirming should not
 *    silently discard a frozen baseline if one somehow exists.
 *  - Dry run by default; pass --apply to write. Idempotent.
 *
 *   pnpm unconfirm:unreviewed          # dry run
 *   pnpm unconfirm:unreviewed --apply
 */
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const targets = await sql`
    SELECT it.id, i.sm_number, i.company_name
    FROM inquiry_items it
    JOIN inquiries i ON i.id = it.inquiry_id
    WHERE it.feasibility_confirmed = true
      AND it.secondary_feasibility_done = false
      AND NOT EXISTS (SELECT 1 FROM costings c WHERE c.inquiry_item_id = it.id)
    ORDER BY i.sm_number`;

  console.log(
    `\n=== un-confirm unreviewed lines · ${APPLY ? "APPLY" : "DRY RUN"} ===\n`,
  );
  if (targets.length === 0) {
    console.log("Nothing to do — no confirmed-but-unreviewed lines.");
    return;
  }
  for (const t of targets) {
    console.log(`  ${t.sm_number}  ${t.company_name}`);
  }
  console.log(`\n${targets.length} line(s) would be un-confirmed.`);

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to execute.");
    return;
  }

  const ids = targets.map((t) => t.id as string);
  const updated = await sql`
    UPDATE inquiry_items
    SET feasibility_confirmed = false,
        feasibility_confirmed_by_id = null,
        feasibility_confirmed_at = null,
        updated_at = now()
    WHERE id = ANY(${ids})
    RETURNING id`;
  console.log(`\n✓ un-confirmed ${updated.length} line(s).`);
}

main()
  .then(() => sql.end())
  .catch((e) => {
    console.error(e);
    return sql.end().then(() => process.exit(1));
  });
