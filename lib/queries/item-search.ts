import "server-only";
import { aliasedTable, and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, masterOptions } from "@/db/schema";

/**
 * SAP-style Material Search (ERP redesign - Phase 9a, §7 "Product Picker").
 *
 * Autocomplete over `items` for the Product Picker. Matches item code (highest
 * signal), internal part name / no, dimensions, grade / shape / tolerance /
 * condition NAMES (joined live - a master rename is reflected immediately, no
 * stale index), and the full where-used customer set + customer drawing (via a
 * live `inquiry_items → inquiries → clients` join - NO materialized view; a
 * reused item is findable by a new customer immediately).
 *
 * Ranking is a lightweight ILIKE hybrid (no tsvector generated column - this
 * phase is query-only, additive, no migration): exact/prefix item-code matches
 * rank first, then the rest, newest-first. `reusedCount` (indexed count over the
 * where-used tables) is the trust signal "pick this, it's canonical". Shape /
 * grade scoping + an empty-query browse are supported.
 */

export interface MaterialHit {
  id: string;
  itemCode: string;
  status: "draft" | "active" | "archived" | "superseded";
  isActive: boolean;
  shapeName: string | null;
  gradeName: string | null;
  toleranceName: string | null;
  conditionName: string | null;
  sizeCode: string | null;
  /** Dimension summary line (OD/ID/L/W/T, mm), pre-composed. */
  dimensions: string | null;
  partNo: string | null;
  hsnCode: string | null;
  uom: string | null;
  /** Distinct customers that have used this spec (top few names). */
  customers: string[];
  /** Total references across the where-used tables (the "reused N×" chip). */
  reusedCount: number;
}

export interface SearchMaterialsOptions {
  q: string;
  shapeId?: string;
  gradeId?: string;
  limit?: number;
  includeInactive?: boolean;
}

function composeDims(r: {
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
}): string | null {
  const parts: string[] = [];
  if (r.outerDia) parts.push(`OD ${r.outerDia}`);
  if (r.innerDia) parts.push(`ID ${r.innerDia}`);
  if (r.length) parts.push(`L ${r.length}`);
  if (r.width) parts.push(`W ${r.width}`);
  if (r.thickness) parts.push(`T ${r.thickness}`);
  return parts.length > 0 ? parts.join(" × ") : null;
}

/**
 * Search materials for the Product Picker. Empty `q` browses newest items
 * (optionally shape/grade-scoped); a non-empty `q` runs the ILIKE hybrid over
 * item-owned columns + live master names + the customer where-used join.
 */
export async function searchMaterials(
  opts: SearchMaterialsOptions,
): Promise<MaterialHit[]> {
  const q = opts.q.trim();
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 25);

  const shape = aliasedTable(masterOptions, "ms_shape");
  const grade = aliasedTable(masterOptions, "ms_grade");
  const tolerance = aliasedTable(masterOptions, "ms_tolerance");
  const condition = aliasedTable(masterOptions, "ms_condition");

  // Distinct customer names using each item, resolved live (no MV). LIMIT 4 in
  // the subquery keeps the array small; the where-used indexes back the join.
  const customersExpr = sql<string[]>`(
    SELECT coalesce(array_agg(c.name), '{}')
    FROM (
      SELECT DISTINCT coalesce(cl.name, i.company_name) AS name
      FROM inquiry_items ii
      JOIN inquiries i ON i.id = ii.inquiry_id
      LEFT JOIN clients cl ON cl.id = i.client_id
      WHERE ii.item_id = ${items.id}
      LIMIT 4
    ) c
  )`;

  // Total references across the where-used tables (the "reused N×" trust chip).
  const reusedExpr = sql<number>`(
    (SELECT count(*) FROM inquiry_items      WHERE item_id = ${items.id}) +
    (SELECT count(*) FROM quotation_items    WHERE item_id = ${items.id}) +
    (SELECT count(*) FROM negotiation_items  WHERE item_id = ${items.id}) +
    (SELECT count(*) FROM sales_order_items  WHERE item_id = ${items.id}) +
    (SELECT count(*) FROM job_cards          WHERE item_id = ${items.id})
  )::int`;

  const conds = [];
  if (!opts.includeInactive) conds.push(eq(items.isActive, true));
  if (opts.shapeId) conds.push(eq(items.shapeId, opts.shapeId));
  if (opts.gradeId) conds.push(eq(items.internalGradeId, opts.gradeId));

  if (q.length >= 2) {
    const like = `%${q}%`;
    // Customer drawing / product-name / customer-name match via the where-used
    // join (per-line facts live on inquiry_items, not on items).
    const usedByMatch = sql`EXISTS (
      SELECT 1 FROM inquiry_items ii
      JOIN inquiries i ON i.id = ii.inquiry_id
      LEFT JOIN clients cl ON cl.id = i.client_id
      WHERE ii.item_id = ${items.id}
        AND (
          ii.cust_drawing_no ILIKE ${like} OR
          ii.cust_product_name ILIKE ${like} OR
          coalesce(cl.name, i.company_name) ILIKE ${like}
        )
    )`;
    conds.push(
      or(
        ilike(items.itemCode, like),
        ilike(sql`coalesce(${items.partNo}, '')`, like),
        ilike(sql`coalesce(${items.partDescription1}, '')`, like),
        ilike(sql`coalesce(${items.sizeCode}, '')`, like),
        ilike(sql`coalesce(${items.dimensionNotes}, '')`, like),
        ilike(sql`coalesce(${grade.name}, '')`, like),
        ilike(sql`coalesce(${shape.name}, '')`, like),
        ilike(sql`coalesce(${tolerance.name}, '')`, like),
        ilike(sql`coalesce(${condition.name}, '')`, like),
        usedByMatch,
      ),
    );
  }

  // Prefix/exact item-code matches rank first; then newest.
  //
  // Only applies when there IS a query. It must be left out entirely when
  // browsing: a bare integer in ORDER BY is an ORDINAL COLUMN REFERENCE to
  // Postgres, so the old `sql\`0\`` fallback produced `ORDER BY 0`, which fails
  // with "ORDER BY position 0 is not in select list" — the browse case (empty
  // box) threw while search worked, so the picker looked empty on open.
  const codeRank =
    q.length >= 2
      ? sql`CASE
          WHEN lower(${items.itemCode}) = ${q.toLowerCase()} THEN 0
          WHEN ${items.itemCode} ILIKE ${`${q}%`} THEN 1
          WHEN ${items.itemCode} ILIKE ${`%${q}%`} THEN 2
          ELSE 3 END`
      : null;
  const orderBy = codeRank ? [codeRank, desc(items.createdAt)] : [desc(items.createdAt)];

  const rows = await db
    .select({
      id: items.id,
      itemCode: items.itemCode,
      status: items.status,
      isActive: items.isActive,
      shapeName: shape.name,
      gradeName: grade.name,
      toleranceName: tolerance.name,
      conditionName: condition.name,
      sizeCode: items.sizeCode,
      outerDia: items.outerDia,
      innerDia: items.innerDia,
      length: items.length,
      width: items.width,
      thickness: items.thickness,
      partNo: items.partNo,
      hsnCode: items.hsnCode,
      uom: items.uom,
      customers: customersExpr,
      reusedCount: reusedExpr,
    })
    .from(items)
    .leftJoin(shape, eq(items.shapeId, shape.id))
    .leftJoin(grade, eq(items.internalGradeId, grade.id))
    .leftJoin(tolerance, eq(items.toleranceId, tolerance.id))
    .leftJoin(condition, eq(items.conditionId, condition.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...orderBy)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    itemCode: r.itemCode,
    status: r.status,
    isActive: r.isActive,
    shapeName: r.shapeName,
    gradeName: r.gradeName,
    toleranceName: r.toleranceName,
    conditionName: r.conditionName,
    sizeCode: r.sizeCode,
    dimensions: composeDims(r),
    partNo: r.partNo,
    hsnCode: r.hsnCode,
    uom: r.uom,
    customers: Array.isArray(r.customers) ? r.customers.filter(Boolean) : [],
    reusedCount: Number(r.reusedCount) || 0,
  }));
}
