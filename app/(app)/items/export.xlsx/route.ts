import * as XLSX from "xlsx";
import { aliasedTable, asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { items, masterOptions } from "@/db/schema";
import { COSTING_TYPE_LABELS } from "@/db/enums";

/**
 * GET /items/export.xlsx
 *
 * Role-open (requireUser) XLSX export of the full Item Master. Columns are
 * humanized (COSTING_TYPE_LABELS, YYYY-MM-DD dates, null -> "").
 * Sheet name: "Items". Filename: item-master.xlsx.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  // ── 1. Fetch all items with resolved master names via aliased left-joins ──
  const shape = aliasedTable(masterOptions, "mo_shape");
  const grade = aliasedTable(masterOptions, "mo_grade");
  const condition = aliasedTable(masterOptions, "mo_condition");
  const tolerance = aliasedTable(masterOptions, "mo_tolerance");

  const rows = await db
    .select({
      itemCode: items.itemCode,
      seq: items.seq,
      sizeCode: items.sizeCode,
      shapeName: shape.name,
      gradeName: grade.name,
      toleranceName: tolerance.name,
      conditionName: condition.name,
      gradeCustomer: items.gradeCustomer,
      gradeNameForCust: items.gradeNameForCust,
      outerDia: items.outerDia,
      innerDia: items.innerDia,
      length: items.length,
      width: items.width,
      thickness: items.thickness,
      dimensionNotes: items.dimensionNotes,
      partNo: items.partNo,
      partDescription1: items.partDescription1,
      partDescription2: items.partDescription2,
      partDescription3: items.partDescription3,
      partDescription4: items.partDescription4,
      partTag: items.partTag,
      costingType: items.costingType,
      hsnCode: items.hsnCode,
      uom: items.uom,
      altUom: items.altUom,
      customerName: items.customerName,
      smNumber: items.smNumber,
      custProductName: items.custProductName,
      custDrawingNo: items.custDrawingNo,
      drawingRevisionNo: items.drawingRevisionNo,
      qty: items.qty,
      createdAt: items.createdAt,
    })
    .from(items)
    .leftJoin(shape, eq(items.shapeId, shape.id))
    .leftJoin(grade, eq(items.internalGradeId, grade.id))
    .leftJoin(condition, eq(items.conditionId, condition.id))
    .leftJoin(tolerance, eq(items.toleranceId, tolerance.id))
    .orderBy(asc(items.seq));

  // ── 2. Build AOA ──
  const HEADERS = [
    "Item Code",
    "Seq",
    "Size Code",
    "Shape",
    "Internal Grade",
    "Tolerance",
    "Condition",
    "Customer Grade",
    "Grade For Customer",
    "Outer Dia",
    "Inner Dia",
    "Length",
    "Width",
    "Thickness",
    "Dimension Notes",
    "Part No",
    "Part Desc 1",
    "Part Desc 2",
    "Part Desc 3",
    "Part Desc 4",
    "Part Tag",
    "Costing Type",
    "HSN",
    "UoM",
    "Alt UoM",
    "Customer",
    "SM Number",
    "Cust Product Name",
    "Drawing No",
    "Drawing Rev",
    "Qty",
    "Created At",
  ];

  const dataRows = rows.map((r) => {
    const createdAt = r.createdAt
      ? r.createdAt.toISOString().slice(0, 10)
      : "";
    const costingTypeLabel = r.costingType
      ? COSTING_TYPE_LABELS[r.costingType]
      : "";

    return [
      r.itemCode,
      r.seq,
      r.sizeCode ?? "",
      r.shapeName ?? "",
      r.gradeName ?? "",
      r.toleranceName ?? "",
      r.conditionName ?? "",
      r.gradeCustomer ?? "",
      r.gradeNameForCust ?? "",
      r.outerDia ?? "",
      r.innerDia ?? "",
      r.length ?? "",
      r.width ?? "",
      r.thickness ?? "",
      r.dimensionNotes ?? "",
      r.partNo ?? "",
      r.partDescription1 ?? "",
      r.partDescription2 ?? "",
      r.partDescription3 ?? "",
      r.partDescription4 ?? "",
      r.partTag ?? "",
      costingTypeLabel,
      r.hsnCode ?? "",
      r.uom ?? "",
      r.altUom ?? "",
      r.customerName ?? "",
      r.smNumber ?? "",
      r.custProductName ?? "",
      r.custDrawingNo ?? "",
      r.drawingRevisionNo ?? "",
      r.qty ?? "",
      createdAt,
    ];
  });

  const aoa: (string | number)[][] = [HEADERS, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 16 }, // Item Code
    { wch: 6  }, // Seq
    { wch: 10 }, // Size Code
    { wch: 16 }, // Shape
    { wch: 18 }, // Internal Grade
    { wch: 12 }, // Tolerance
    { wch: 12 }, // Condition
    { wch: 18 }, // Customer Grade
    { wch: 22 }, // Grade For Customer
    { wch: 10 }, // Outer Dia
    { wch: 10 }, // Inner Dia
    { wch: 10 }, // Length
    { wch: 10 }, // Width
    { wch: 10 }, // Thickness
    { wch: 24 }, // Dimension Notes
    { wch: 16 }, // Part No
    { wch: 28 }, // Part Desc 1
    { wch: 28 }, // Part Desc 2
    { wch: 28 }, // Part Desc 3
    { wch: 28 }, // Part Desc 4
    { wch: 16 }, // Part Tag
    { wch: 14 }, // Costing Type
    { wch: 10 }, // HSN
    { wch: 8  }, // UoM
    { wch: 10 }, // Alt UoM
    { wch: 28 }, // Customer
    { wch: 14 }, // SM Number
    { wch: 32 }, // Cust Product Name
    { wch: 18 }, // Drawing No
    { wch: 12 }, // Drawing Rev
    { wch: 10 }, // Qty
    { wch: 12 }, // Created At
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Items");

  const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="item-master.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
