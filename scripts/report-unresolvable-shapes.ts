/**
 * Report: enquiry shape values that will NOT resolve to a shape master.
 *
 * READ-ONLY. Lists every DISTINCT `inquiry_items.shape` value on lines that
 * have no `item_id` yet (item_id IS NULL) and that does NOT map — via
 * `normalizeShapeName` — to an *active* `master_options` shape master. The
 * output table (shape value, count, suggestion) is handed to the client so they
 * can clean the shape masters BEFORE the Phase 4 backfill flips
 * `inquiry_items.item_id` to NOT NULL.
 *
 * Run:  npx tsx --env-file=.env.local scripts/report-unresolvable-shapes.ts
 *       (wired as `pnpm report:shapes`)
 *
 * Does NOT mutate anything.
 */
import { and, eq, isNull, sql as dsql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiryItems, masterOptions } from "@/db/schema";
import { normalizeShapeName } from "@/lib/masters/shape-normalize";

async function main() {
  // 1. Active shape master names (the resolution target set).
  const shapeMasters = await db
    .select({ name: masterOptions.name })
    .from(masterOptions)
    .where(and(eq(masterOptions.kind, "shape"), eq(masterOptions.isActive, true)));
  const activeShapeNames = new Set(shapeMasters.map((r) => r.name));

  // 2. Distinct shape values on unresolved (item_id IS NULL) enquiry lines,
  //    with occurrence counts. NULL/empty shapes are grouped as their own row.
  const rows = await db
    .select({
      shape: inquiryItems.shape,
      count: dsql<number>`count(*)::int`,
    })
    .from(inquiryItems)
    .where(isNull(inquiryItems.itemId))
    .groupBy(inquiryItems.shape)
    .orderBy(dsql`count(*) desc`);

  // 3. Keep only the ones that do NOT resolve to an active shape master.
  interface Unresolvable {
    shape: string;
    count: number;
    suggestion: string;
  }
  const unresolvable: Unresolvable[] = [];
  let resolvableLines = 0;
  let resolvableValues = 0;

  for (const r of rows) {
    const raw = r.shape;
    const label = raw == null || raw.trim() === "" ? "(null/empty)" : raw;
    const candidate = raw == null ? null : normalizeShapeName(raw);

    if (candidate != null && activeShapeNames.has(candidate)) {
      resolvableLines += r.count;
      resolvableValues += 1;
      continue;
    }

    let suggestion: string;
    if (candidate == null) {
      suggestion = "— (unmappable: fix master or free-text)";
    } else {
      // Normalized to a name, but no ACTIVE master with that name exists.
      suggestion = `${candidate} (add/activate this shape master)`;
    }
    unresolvable.push({ shape: label, count: r.count, suggestion });
  }

  // 4. Print a plain table.
  console.log("");
  console.log("Unresolvable enquiry shapes (item_id IS NULL)");
  console.log("=============================================");
  if (unresolvable.length === 0) {
    console.log("None — every unresolved enquiry line's shape maps to an active shape master.");
  } else {
    const shapeW = Math.max(12, ...unresolvable.map((u) => u.shape.length));
    const header = `${"SHAPE VALUE".padEnd(shapeW)}  ${"COUNT".padStart(6)}  SUGGESTION`;
    console.log(header);
    console.log("-".repeat(header.length));
    for (const u of unresolvable) {
      console.log(`${u.shape.padEnd(shapeW)}  ${String(u.count).padStart(6)}  ${u.suggestion}`);
    }
  }

  const unresolvableLines = unresolvable.reduce((s, u) => s + u.count, 0);
  console.log("");
  console.log(
    `Summary: ${rows.length} distinct shape value(s) on unresolved lines — ` +
      `${resolvableValues} resolvable (${resolvableLines} line(s)), ` +
      `${unresolvable.length} unresolvable (${unresolvableLines} line(s)).`,
  );
  console.log("(Read-only report — no data changed.)");

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
