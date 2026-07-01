/**
 * Junk-enquiry cleanup (ERP redesign — Phase 4, reviewable data op).
 *
 * Deletes the AGREED junk only:
 *   1. Enquiries SM9579 and SM9580 in full (their inquiry_items cascade-delete
 *      via the inquiry_id FK ON DELETE cascade).
 *   2. The single blank/shapeless inquiry_items line on SM9581 — the row with
 *      shape IS NULL AND cust_product_name IS NULL AND item_id IS NULL.
 *
 * HARD-GUARDED: only rows matching those exact SM numbers / the blank-line
 * predicate are ever touched. Prints what it will delete. DEFAULT = dry report;
 * pass --apply to actually delete. Never touches anything else.
 *
 * Dry:   npx tsx --env-file=.env.local scripts/cleanup-junk-enquiries.ts           (default)
 * Apply: npx tsx --env-file=.env.local scripts/cleanup-junk-enquiries.ts --apply
 *
 * NOTE: this is a destructive data op the controller runs after human go — do
 * NOT run it as part of the build gate.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries, inquiryItems } from "@/db/schema";

const APPLY = process.argv.includes("--apply");
const DRY = !APPLY;

/** The exact junk enquiries to delete in full. */
const JUNK_SM_NUMBERS = ["SM9579", "SM9580"] as const;
/** The SM whose single blank/shapeless line is pruned (but the SM is kept). */
const BLANK_LINE_SM = "SM9581";

async function main() {
  // ── 1. Junk enquiries (full delete, cascade to their inquiry_items) ──────
  const junkInquiries = await db
    .select({ id: inquiries.id, smNumber: inquiries.smNumber, companyName: inquiries.companyName })
    .from(inquiries)
    .where(inArray(inquiries.smNumber, [...JUNK_SM_NUMBERS]));

  const junkItemCounts = new Map<string, number>();
  for (const inq of junkInquiries) {
    const lines = await db
      .select({ id: inquiryItems.id })
      .from(inquiryItems)
      .where(eq(inquiryItems.inquiryId, inq.id));
    junkItemCounts.set(inq.id, lines.length);
  }

  console.log("── Junk enquiries to DELETE (full, cascade to inquiry_items) ──");
  if (junkInquiries.length === 0) {
    console.log("  (none found — SM9579/SM9580 not present)");
  }
  for (const inq of junkInquiries) {
    console.log(`  ${inq.smNumber} — "${inq.companyName}" (${junkItemCounts.get(inq.id) ?? 0} product line(s))`);
  }

  // ── 2. The single blank/shapeless line on SM9581 ─────────────────────────
  const [sm81] = await db
    .select({ id: inquiries.id, smNumber: inquiries.smNumber })
    .from(inquiries)
    .where(eq(inquiries.smNumber, BLANK_LINE_SM))
    .limit(1);

  let blankLines: { id: string }[] = [];
  if (sm81) {
    blankLines = await db
      .select({ id: inquiryItems.id })
      .from(inquiryItems)
      .where(
        and(
          eq(inquiryItems.inquiryId, sm81.id),
          isNull(inquiryItems.shape),
          isNull(inquiryItems.custProductName),
          isNull(inquiryItems.itemId),
        ),
      );
  }

  console.log(`\n── Blank/shapeless line(s) to DELETE on ${BLANK_LINE_SM} ──`);
  if (!sm81) {
    console.log(`  (${BLANK_LINE_SM} not found — nothing to prune)`);
  } else if (blankLines.length === 0) {
    console.log(`  (no line on ${BLANK_LINE_SM} matches shape IS NULL AND cust_product_name IS NULL AND item_id IS NULL)`);
  } else {
    for (const l of blankLines) console.log(`  inquiry_items.id = ${l.id}`);
  }

  if (DRY) {
    console.log(
      `\n[dry-run] would delete ${junkInquiries.length} enquiry(ies) + ${blankLines.length} blank line(s). Re-run with --apply to delete.`,
    );
    process.exit(0);
  }

  // ── APPLY ────────────────────────────────────────────────────────────────
  await db.transaction(async (tx) => {
    if (junkInquiries.length) {
      // Belt-and-braces: explicitly delete their inquiry_items first, then the
      // enquiries (the FK cascade would handle lines, but explicit is safer).
      const inqIds = junkInquiries.map((i) => i.id);
      await tx.delete(inquiryItems).where(inArray(inquiryItems.inquiryId, inqIds));
      await tx.delete(inquiries).where(inArray(inquiries.id, inqIds));
    }
    if (blankLines.length) {
      await tx.delete(inquiryItems).where(inArray(inquiryItems.id, blankLines.map((l) => l.id)));
    }
  });

  console.log(
    `\ndone. deleted ${junkInquiries.length} enquiry(ies) [${JUNK_SM_NUMBERS.join(", ")}] + ${blankLines.length} blank line(s) on ${BLANK_LINE_SM}.`,
  );
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
