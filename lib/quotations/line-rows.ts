import type { QuoteLineInput } from "@/lib/validators/quotation";

/** The subset of CreateQuotation input the line rows are built from. */
interface Src {
  lines?: QuoteLineInput[];
  custProductName?: string;
  custDrawingNo?: string;
  drawingRevisionNo?: string;
  qty?: number;
  gradeCustomer?: string;
  gradeNameForCust?: string;
  tolerance?: string;
  condition?: string;
  partNo?: string;
  finalCost?: number;
  negotiation?: number;
  quotePrice?: number;
  developmentTime?: string;
  deliveryTime?: string;
  validity?: string;
}

const numStr = (v: unknown): string | null =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : null;
const txt = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

export interface BuiltQuoteLine {
  sortOrder: number;
  custProductName: string | null;
  custDrawingNo: string | null;
  drawingRevisionNo: string | null;
  qty: string | null;
  gradeCustomer: string | null;
  gradeNameForCust: string | null;
  tolerance: string | null;
  condition: string | null;
  partNo: string | null;
  finalCost: string | null;
  negotiation: string | null;
  quotePrice: string | null;
  developmentTime: string | null;
  deliveryTime: string | null;
  validity: string | null;
  inquiryItemId: string | null;
  itemId: string | null;
}

/**
 * The subset of a built line that is actually INSERTED onto `quotation_items`
 * (ERP Phase 6 — migration 0036). The spec/customer-ask MIRROR columns
 * (custProductName, custDrawingNo, drawingRevisionNo, gradeCustomer,
 * gradeNameForCust, tolerance, condition, partNo) are DROPPED — spec resolves
 * read-through from `items` via item_id, customer-ask via the provenance
 * inquiry_item (lib/flow/spec-resolve.ts). Only transactional facts + the FK
 * spine remain on the line. The header's line-#1 mirror is fed from the full
 * BuiltQuoteLine separately and is out of scope for this drop.
 */
export interface QuoteLineInsert {
  sortOrder: number;
  qty: string | null;
  finalCost: string | null;
  negotiation: string | null;
  quotePrice: string | null;
  developmentTime: string | null;
  deliveryTime: string | null;
  validity: string | null;
  inquiryItemId: string | null;
  itemId: string | null;
}

/** Project a built line to the kept `quotation_items` insert columns (no spec
 *  mirrors — those read through items/inquiry_item post-migration-0036). */
export function quoteLineInsert(l: BuiltQuoteLine): QuoteLineInsert {
  return {
    sortOrder: l.sortOrder,
    qty: l.qty,
    finalCost: l.finalCost,
    negotiation: l.negotiation,
    quotePrice: l.quotePrice,
    developmentTime: l.developmentTime,
    deliveryTime: l.deliveryTime,
    validity: l.validity,
    inquiryItemId: l.inquiryItemId,
    itemId: l.itemId,
  };
}

/** Build the quotation_items rows for a quotation. Prefers lines[]; otherwise
 *  synthesises one row from the legacy flat product fields (back-compat with
 *  the bulk importer + any caller that still sends a single product). */
export function quoteLineRows(v: Src): BuiltQuoteLine[] {
  const list =
    v.lines && v.lines.length
      ? v.lines
      : [
          {
            custProductName: v.custProductName,
            custDrawingNo: v.custDrawingNo,
            drawingRevisionNo: v.drawingRevisionNo,
            qty: v.qty,
            gradeCustomer: v.gradeCustomer,
            gradeNameForCust: v.gradeNameForCust,
            tolerance: v.tolerance,
            condition: v.condition,
            partNo: v.partNo,
            finalCost: v.finalCost,
            negotiation: v.negotiation,
            quotePrice: v.quotePrice,
            developmentTime: v.developmentTime,
            deliveryTime: v.deliveryTime,
            validity: v.validity,
          } as QuoteLineInput,
        ];
  return list.map((p, i) => ({
    sortOrder: i,
    custProductName: txt(p.custProductName),
    custDrawingNo: txt(p.custDrawingNo),
    drawingRevisionNo: txt(p.drawingRevisionNo),
    qty: numStr(p.qty),
    gradeCustomer: txt(p.gradeCustomer),
    gradeNameForCust: txt(p.gradeNameForCust),
    tolerance: txt(p.tolerance),
    condition: txt(p.condition),
    partNo: txt(p.partNo),
    finalCost: numStr(p.finalCost),
    negotiation: numStr(p.negotiation),
    quotePrice: numStr(p.quotePrice),
    developmentTime: txt(p.developmentTime),
    deliveryTime: txt(p.deliveryTime),
    validity: txt(p.validity),
    inquiryItemId: txt(p.inquiryItemId),
    itemId: txt(p.itemId),
  }));
}
