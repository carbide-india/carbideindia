/**
 * Snapshot-drift precheck (ERP redesign — Phase 6, §2.7 / §14 Phase 6).
 *
 * The BLOCK-ON-DRIFT guard that gates migration 0036 (drop the always-copied
 * spec / customer-ask MIRROR columns from the commercial line tables). For every
 * line row + mirror column being dropped, it compares the line's CURRENT mirror
 * value against the value RESOLVED read-through from the row's canonical source:
 *
 *   - spec mirrors  (grade_customer, grade_name_for_cust, part_no)  ← items (item_id)
 *   - spec masters  (tolerance, condition)                          ← items.*_id → master_options.name
 *   - customer-ask  (cust_product_name, cust_drawing_no, drawing_revision_no)
 *                                                                   ← inquiry_items (inquiry_item_id)
 *
 * DRIFT = the stored mirror is non-empty AND differs (trim + null/'' normalized)
 * from the read-through value. A NULL/empty mirror is never drift (nothing to
 * reconcile — read-through already governs display). This mirrors the read law
 * that has been live since Phase 5: the app already displays the read-through
 * value, so any drift is a hidden stale copy that the drop would silently erase.
 *
 * READ-ONLY. Exits NON-ZERO if ANY drift exists (reconciliation is a prerequisite
 * to the drop, not a flag). Prints each drift: table, line id, column, mirror
 * value, resolved value. The controller runs this BEFORE applying 0036.
 *
 * Run:  pnpm precheck:drift
 *       (= tsx --env-file=.env.local scripts/precheck-snapshot-drift.ts)
 *
 * NOTE: it reads the mirror columns via RAW SQL by name, so it works while the
 * columns still exist (pre-0036). After 0036 has dropped them the queries no
 * longer resolve those columns — that is expected; the precheck is a one-shot
 * pre-drop gate.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("precheck:drift — DATABASE_URL is not set (use --env-file=.env.local).");
  process.exit(2);
}
const sql = postgres(url, { prepare: false });

interface Drift {
  table: string;
  lineId: string;
  column: string;
  mirror: string | null;
  resolved: string | null;
}

/** Normalize for comparison: null/undefined/'' → null, else trimmed string. */
function norm(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * One drift check: a table + the mirror column + the read-through SQL expression
 * that resolves the canonical value for that row. The SELECT returns rows where
 * the mirror is non-empty and differs from the resolved value.
 *
 * We compare in SQL with `IS DISTINCT FROM` over trimmed/NULLIF-normalized
 * values so '' and NULL collapse and whitespace never triggers a false drift.
 */
interface Check {
  table: string;
  column: string;
  /** SQL fragment resolving the canonical value, aliased as `resolved`. Uses
   *  the table alias `l` for the line and whatever joins the `from` adds. */
  resolvedExpr: string;
  /** Extra JOINs (beyond the line table `l`) needed by resolvedExpr. */
  joins: string;
}

const N = (expr: string) => `NULLIF(TRIM(${expr}::text), '')`;

const CHECKS: Check[] = [
  // ── quotation_items (8 mirrors) ──
  {
    table: "quotation_items",
    column: "cust_product_name",
    resolvedExpr: "ii.cust_product_name",
    joins: "LEFT JOIN inquiry_items ii ON ii.id = l.inquiry_item_id",
  },
  {
    table: "quotation_items",
    column: "cust_drawing_no",
    resolvedExpr: "ii.cust_drawing_no",
    joins: "LEFT JOIN inquiry_items ii ON ii.id = l.inquiry_item_id",
  },
  {
    table: "quotation_items",
    column: "drawing_revision_no",
    resolvedExpr: "ii.drawing_revision_no",
    joins: "LEFT JOIN inquiry_items ii ON ii.id = l.inquiry_item_id",
  },
  {
    table: "quotation_items",
    column: "grade_customer",
    resolvedExpr: "it.grade_customer",
    joins: "LEFT JOIN items it ON it.id = l.item_id",
  },
  {
    table: "quotation_items",
    column: "grade_name_for_cust",
    resolvedExpr: "it.grade_name_for_cust",
    joins: "LEFT JOIN items it ON it.id = l.item_id",
  },
  {
    table: "quotation_items",
    column: "tolerance",
    resolvedExpr: "mo_tol.name",
    joins:
      "LEFT JOIN items it ON it.id = l.item_id LEFT JOIN master_options mo_tol ON mo_tol.id = it.tolerance_id",
  },
  {
    table: "quotation_items",
    column: "condition",
    resolvedExpr: "mo_cond.name",
    joins:
      "LEFT JOIN items it ON it.id = l.item_id LEFT JOIN master_options mo_cond ON mo_cond.id = it.condition_id",
  },
  {
    table: "quotation_items",
    column: "part_no",
    resolvedExpr: "it.part_no",
    joins: "LEFT JOIN items it ON it.id = l.item_id",
  },
  // ── negotiation_items (2 mirrors) ──
  {
    table: "negotiation_items",
    column: "cust_product_name",
    resolvedExpr: "ii.cust_product_name",
    joins: "LEFT JOIN inquiry_items ii ON ii.id = l.inquiry_item_id",
  },
  {
    table: "negotiation_items",
    column: "part_no",
    resolvedExpr: "it.part_no",
    joins: "LEFT JOIN items it ON it.id = l.item_id",
  },
  // ── sales_order_items (2 mirrors) ──
  {
    table: "sales_order_items",
    column: "cust_product_name",
    resolvedExpr: "ii.cust_product_name",
    joins: "LEFT JOIN inquiry_items ii ON ii.id = l.inquiry_item_id",
  },
  {
    table: "sales_order_items",
    column: "part_no",
    resolvedExpr: "it.part_no",
    joins: "LEFT JOIN items it ON it.id = l.item_id",
  },
];

/** Does the column still exist? (Post-0036 it won't — treat as nothing to check.) */
async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}`;
  return (rows[0]?.n ?? 0) > 0;
}

async function runCheck(c: Check): Promise<Drift[]> {
  if (!(await columnExists(c.table, c.column))) {
    console.log(`  · ${c.table}.${c.column} — already dropped, skipping.`);
    return [];
  }
  // Build the query with the column/table/joins interpolated as raw SQL
  // (identifiers, not user input). `IS DISTINCT FROM` over normalized values.
  const query = `
    SELECT l.id AS line_id,
           ${N(`l.${c.column}`)} AS mirror,
           ${N(c.resolvedExpr)} AS resolved
    FROM ${c.table} l
    ${c.joins}
    WHERE ${N(`l.${c.column}`)} IS NOT NULL
      AND ${N(`l.${c.column}`)} IS DISTINCT FROM ${N(c.resolvedExpr)}`;
  const rows = (await sql.unsafe(query)) as unknown as {
    line_id: string;
    mirror: string | null;
    resolved: string | null;
  }[];
  return rows.map((r) => ({
    table: c.table,
    lineId: r.line_id,
    column: c.column,
    mirror: norm(r.mirror),
    resolved: norm(r.resolved),
  }));
}

async function main(): Promise<void> {
  console.log("precheck:drift — comparing spec-mirror columns vs read-through resolution…\n");
  const drifts: Drift[] = [];
  for (const c of CHECKS) {
    const d = await runCheck(c);
    drifts.push(...d);
  }

  if (drifts.length === 0) {
    console.log("\nprecheck:drift: OK — zero drift. Safe to apply migration 0036.");
    await sql.end();
    process.exit(0);
  }

  console.error(`\nprecheck:drift: FAILED — ${drifts.length} drifted mirror value(s):\n`);
  for (const d of drifts) {
    console.error(`  ${d.table}[${d.lineId}].${d.column}`);
    console.error(`    mirror   = ${JSON.stringify(d.mirror)}`);
    console.error(`    resolved = ${JSON.stringify(d.resolved)}\n`);
  }
  console.error(
    "Reconcile these rows (align the mirror to the read-through source, or fix the\n" +
      "linked item/inquiry_item) BEFORE applying 0036 — the drop would erase the stale copy.",
  );
  await sql.end();
  process.exit(1);
}

main().catch(async (e) => {
  console.error("precheck:drift — unexpected error:", e);
  try {
    await sql.end();
  } catch {
    /* ignore */
  }
  process.exit(2);
});
