import "server-only";
import { aliasedTable, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, inquiryItems, masterOptions } from "@/db/schema";

/**
 * Read-through spec resolver (ERP redesign — Phase 5, §2.4 "READ-THROUGH BY
 * DEFAULT").
 *
 * The SINGLE place the app resolves a product's canonical SPEC — shape / grade /
 * tolerance / condition (as master NAMES), dimensions, size + item codes,
 * HSN/UoM and item status — from the `items` row a line points at via `item_id`,
 * instead of the denormalized mirror columns copied onto `inquiry_items`,
 * `quotation_items`, `negotiation_items`, `sales_order_items`, `job_cards`.
 *
 * The mirror columns STAY in the DB for rollback safety (dropped in Phase 6);
 * only the READS move here. This module never touches the LEGAL snapshot fields
 * (sent-quote / confirmed-SO price, jsonb spec_snapshot) — those govern
 * sent/confirmed stages and are read from the line as-is (Canonical Decisions).
 *
 * Two shapes:
 *   - `itemSpecColumns(alias, ...)` — the SELECT fragment + JOIN helpers so a
 *     query can resolve spec in ONE join (no per-row N+1) alongside its own row.
 *   - `resolveSpecsByItemId(ids)` — a batched map for callers that already hold
 *     `item_id`s and want the resolved spec without re-shaping their query.
 */

/** The canonical spec of a product, resolved from `items` (+ master names). */
export interface ResolvedSpec {
  /** The Item row id the line points at (null only for legacy unsynced lines). */
  itemId: string | null;
  /** Internal item code (S-10001-), or DRAFT-<seq> for a draft item. */
  itemCode: string | null;
  /** Item lifecycle status (draft | active | archived). */
  itemStatus: string | null;
  /** Master NAMES (resolved from the item's classification FKs). */
  shapeName: string | null;
  gradeName: string | null;
  toleranceName: string | null;
  conditionName: string | null;
  /** Size class + dimensions (mm), as stored on the item. */
  sizeCode: string | null;
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
  dimensionNotes: string | null;
  /** Part identity + catalog. */
  partNo: string | null;
  hsnCode: string | null;
  uom: string | null;
  /** Customer-facing grade text carried on the item spec. */
  gradeCustomer: string | null;
  gradeNameForCust: string | null;
}

/** Zero-value spec for a line whose `item_id` did not resolve (legacy safety). */
export const EMPTY_SPEC: ResolvedSpec = {
  itemId: null,
  itemCode: null,
  itemStatus: null,
  shapeName: null,
  gradeName: null,
  toleranceName: null,
  conditionName: null,
  sizeCode: null,
  outerDia: null,
  innerDia: null,
  length: null,
  width: null,
  thickness: null,
  dimensionNotes: null,
  partNo: null,
  hsnCode: null,
  uom: null,
  gradeCustomer: null,
  gradeNameForCust: null,
};

/**
 * Four aliased `master_options` tables (shape/grade/condition/tolerance) — the
 * same-row-type aliasing the item queries already use. Fresh instances per call
 * so a caller can hold several joins without alias collisions. Callers that
 * build a spec join inline (rather than using `resolveSpecsByItemId`) use these
 * to select `.name` off each and join on the item alias's classification FKs.
 */
export function specMasterAliases() {
  return {
    shape: aliasedTable(masterOptions, "spec_mo_shape"),
    grade: aliasedTable(masterOptions, "spec_mo_grade"),
    condition: aliasedTable(masterOptions, "spec_mo_condition"),
    tolerance: aliasedTable(masterOptions, "spec_mo_tolerance"),
  };
}

/**
 * Batched resolver — resolve N lines' specs from their `item_id`s without a
 * per-row N+1. One query joins `items` to its four classification masters and
 * returns a `Map<itemId, ResolvedSpec>`. Callers that already hold the ids
 * (e.g. after loading raw lines) look up each line's spec by its `item_id`.
 */
export async function resolveSpecsByItemId(
  itemIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, ResolvedSpec>> {
  const ids = Array.from(
    new Set(itemIds.filter((v): v is string => typeof v === "string" && v.length > 0)),
  );
  const out = new Map<string, ResolvedSpec>();
  if (ids.length === 0) return out;

  const shape = aliasedTable(masterOptions, "spec_mo_shape");
  const grade = aliasedTable(masterOptions, "spec_mo_grade");
  const condition = aliasedTable(masterOptions, "spec_mo_condition");
  const tolerance = aliasedTable(masterOptions, "spec_mo_tolerance");

  const rows = await db
    .select({
      itemId: items.id,
      itemCode: items.itemCode,
      itemStatus: items.status,
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
      dimensionNotes: items.dimensionNotes,
      partNo: items.partNo,
      hsnCode: items.hsnCode,
      uom: items.uom,
      gradeCustomer: items.gradeCustomer,
      gradeNameForCust: items.gradeNameForCust,
    })
    .from(items)
    .leftJoin(shape, eq(items.shapeId, shape.id))
    .leftJoin(grade, eq(items.internalGradeId, grade.id))
    .leftJoin(condition, eq(items.conditionId, condition.id))
    .leftJoin(tolerance, eq(items.toleranceId, tolerance.id))
    .where(inArray(items.id, ids));

  for (const r of rows) out.set(r.itemId, r);
  return out;
}

/**
 * The customer-scoped ASK fields that legitimately live on `inquiry_items`
 * (§2.5 KEEP) — the one place they are single-sourced. Downstream commercial
 * lines (quote/neg/SO) must resolve these read-through via their provenance
 * `inquiry_item_id`, never from their own copied mirror columns.
 */
export interface ResolvedCustomerAsk {
  custProductName: string | null;
  custDrawingNo: string | null;
  drawingRevisionNo: string | null;
}

export const EMPTY_CUSTOMER_ASK: ResolvedCustomerAsk = {
  custProductName: null,
  custDrawingNo: null,
  drawingRevisionNo: null,
};

/**
 * Batched resolver for the customer-ask fields — resolve N commercial lines'
 * product name / drawing from their provenance `inquiry_item_id`s in one query
 * (no per-row N+1). Returns a `Map<inquiryItemId, ResolvedCustomerAsk>`.
 */
export async function resolveCustomerAskByInquiryItemId(
  inquiryItemIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, ResolvedCustomerAsk>> {
  const ids = Array.from(
    new Set(inquiryItemIds.filter((v): v is string => typeof v === "string" && v.length > 0)),
  );
  const out = new Map<string, ResolvedCustomerAsk>();
  if (ids.length === 0) return out;

  const rows = await db
    .select({
      id: inquiryItems.id,
      custProductName: inquiryItems.custProductName,
      custDrawingNo: inquiryItems.custDrawingNo,
      drawingRevisionNo: inquiryItems.drawingRevisionNo,
    })
    .from(inquiryItems)
    .where(inArray(inquiryItems.id, ids));

  for (const r of rows) {
    out.set(r.id, {
      custProductName: r.custProductName,
      custDrawingNo: r.custDrawingNo,
      drawingRevisionNo: r.drawingRevisionNo,
    });
  }
  return out;
}
