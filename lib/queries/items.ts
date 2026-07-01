import "server-only";
import { aliasedTable, desc, eq, getTableColumns } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, masterOptions } from "@/db/schema";
import type { Item } from "@/db/schema";

/** One row for the /items register table. */
export interface ItemListItem {
  id: string;
  itemCode: string;
  seq: number;
  customerName: string | null;
  custProductName: string | null;
  partNo: string | null;
  costingType: Item["costingType"];
  hsnCode: string | null;
  uom: string | null;
  drawingRevisionNo: string | null;
  isActive: boolean;
  createdAt: Date;
  shapeName: string | null;
  gradeName: string | null;
  conditionName: string | null;
  toleranceName: string | null;
  smNumber: string | null;
  custDrawingNo: string | null;
  qty: string | null;
  sizeCode: string | null;
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
  dimensionNotes: string | null;
  altUom: string | null;
  altUomConversion: string | null;
  gradeCustomer: string | null;
  gradeNameForCust: string | null;
  partDescription1: string | null;
  updatedAt: Date;
}

/**
 * Item register list — joins the four master FK columns to their names so the
 * table can show shape/grade/condition/tolerance without round-trips. Ordered
 * newest-first. No server filter needed; the table does client-side filtering.
 */
export async function listItems(): Promise<ItemListItem[]> {
  const shape = aliasedTable(masterOptions, "mo_shape");
  const grade = aliasedTable(masterOptions, "mo_grade");
  const condition = aliasedTable(masterOptions, "mo_condition");
  const tolerance = aliasedTable(masterOptions, "mo_tolerance");

  return db
    .select({
      id: items.id,
      itemCode: items.itemCode,
      seq: items.seq,
      customerName: items.originCustomerName,
      custProductName: items.custProductName,
      partNo: items.partNo,
      costingType: items.costingType,
      hsnCode: items.hsnCode,
      uom: items.uom,
      drawingRevisionNo: items.drawingRevisionNo,
      isActive: items.isActive,
      createdAt: items.createdAt,
      shapeName: shape.name,
      gradeName: grade.name,
      conditionName: condition.name,
      toleranceName: tolerance.name,
      smNumber: items.originSmNumber,
      custDrawingNo: items.custDrawingNo,
      qty: items.originQty,
      sizeCode: items.sizeCode,
      outerDia: items.outerDia,
      innerDia: items.innerDia,
      length: items.length,
      width: items.width,
      thickness: items.thickness,
      dimensionNotes: items.dimensionNotes,
      altUom: items.altUom,
      altUomConversion: items.altUomConversion,
      gradeCustomer: items.gradeCustomer,
      gradeNameForCust: items.gradeNameForCust,
      partDescription1: items.partDescription1,
      updatedAt: items.updatedAt,
    })
    .from(items)
    .leftJoin(shape, eq(items.shapeId, shape.id))
    .leftJoin(grade, eq(items.internalGradeId, grade.id))
    .leftJoin(condition, eq(items.conditionId, condition.id))
    .leftJoin(tolerance, eq(items.toleranceId, tolerance.id))
    .orderBy(desc(items.createdAt), desc(items.seq));
}

/** Full item row with resolved master names — for the detail page. */
export interface ItemDetail extends Item {
  shapeName: string | null;
  gradeName: string | null;
  conditionName: string | null;
  toleranceName: string | null;
}

export async function getItemById(id: string): Promise<ItemDetail | null> {
  const shape = aliasedTable(masterOptions, "mo_shape");
  const grade = aliasedTable(masterOptions, "mo_grade");
  const condition = aliasedTable(masterOptions, "mo_condition");
  const tolerance = aliasedTable(masterOptions, "mo_tolerance");

  const [row] = await db
    .select({
      // Full canonical item row (incl. Phase-2 status + write-once origin_*
      // provenance). Spread avoids naming individual snapshot/origin columns —
      // origin_* stay display-only and are never used for usage/dedup/search.
      ...getTableColumns(items),
      shapeName: shape.name,
      gradeName: grade.name,
      conditionName: condition.name,
      toleranceName: tolerance.name,
    })
    .from(items)
    .leftJoin(shape, eq(items.shapeId, shape.id))
    .leftJoin(grade, eq(items.internalGradeId, grade.id))
    .leftJoin(condition, eq(items.conditionId, condition.id))
    .leftJoin(tolerance, eq(items.toleranceId, tolerance.id))
    .where(eq(items.id, id))
    .limit(1);

  return row ?? null;
}

/**
 * Item shaped for the edit form's input fields (mirrors `ItemFormValues`).
 * Numeric DB columns come back as strings — that's fine, the form's zod coerces
 * them. Nulls fold to "" / undefined so RHF's controlled inputs stay happy.
 */
export interface ItemEditValues {
  shapeId?: string;
  internalGradeId?: string;
  toleranceId?: string;
  conditionId?: string;
  sizeCode?: string;
  costingType?: NonNullable<Item["costingType"]>;
  gradeCustomer: string;
  gradeNameForCust: string;
  outerDia?: string;
  innerDia?: string;
  length?: string;
  width?: string;
  thickness?: string;
  dimensionNotes: string;
  hsnCode: string;
  uom: string;
  altUom: string;
  altUomConversion?: string;
  partNo: string;
  partDescription1: string;
  partDescription2: string;
  partDescription3: string;
  partDescription4: string;
  partTag: string;
  customerName: string;
  smNumber: string;
  custProductName: string;
  custDrawingNo: string;
  drawingRevisionNo: string;
  qty?: string;
}

export async function getItemForEdit(id: string): Promise<ItemEditValues | null> {
  const item = await getItemById(id);
  if (!item) return null;

  const str = (v: string | null): string | undefined => (v ?? undefined);
  const text = (v: string | null): string => v ?? "";

  return {
    shapeId: item.shapeId ?? undefined,
    internalGradeId: item.internalGradeId ?? undefined,
    toleranceId: item.toleranceId ?? undefined,
    conditionId: item.conditionId ?? undefined,
    sizeCode: str(item.sizeCode),
    costingType: item.costingType ?? undefined,
    gradeCustomer: text(item.gradeCustomer),
    gradeNameForCust: text(item.gradeNameForCust),
    outerDia: str(item.outerDia),
    innerDia: str(item.innerDia),
    length: str(item.length),
    width: str(item.width),
    thickness: str(item.thickness),
    dimensionNotes: text(item.dimensionNotes),
    hsnCode: text(item.hsnCode),
    uom: item.uom ?? "Nos",
    altUom: text(item.altUom),
    altUomConversion: str(item.altUomConversion),
    partNo: text(item.partNo),
    partDescription1: text(item.partDescription1),
    partDescription2: text(item.partDescription2),
    partDescription3: text(item.partDescription3),
    partDescription4: text(item.partDescription4),
    partTag: text(item.partTag),
    customerName: text(item.customerName),
    smNumber: text(item.smNumber),
    custProductName: text(item.custProductName),
    custDrawingNo: text(item.custDrawingNo),
    drawingRevisionNo: text(item.drawingRevisionNo),
    qty: str(item.qty),
  };
}
