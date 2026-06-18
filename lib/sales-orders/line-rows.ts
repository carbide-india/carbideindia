import type { SoLineInput } from "@/lib/validators/sales-order";

/** The subset of CreateSalesOrder input the line rows are built from. */
interface Src {
  lines?: SoLineInput[];
  custProductName?: string;
  qty?: number;
  partNo?: string;
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

export interface BuiltSoLine {
  sortOrder: number;
  custProductName: string | null;
  qty: string | null;
  partNo: string | null;
  quotePrice: string | null;
  developmentTime: string | null;
  deliveryTime: string | null;
  validity: string | null;
  inquiryItemId: string | null;
  quotationItemId: string | null;
  itemId: string | null;
}

/** Build the sales_order_items rows for a sales order. Prefers lines[]; otherwise
 *  synthesises one row from the legacy flat product fields (back-compat with
 *  the bulk importer + any caller that still sends a single product).
 *  NOTE: Sales orders have no finalCost or negotiation fields. */
export function soLineRows(v: Src): BuiltSoLine[] {
  const list =
    v.lines && v.lines.length
      ? v.lines
      : [
          {
            custProductName: v.custProductName,
            qty: v.qty,
            partNo: v.partNo,
            quotePrice: v.quotePrice,
            developmentTime: v.developmentTime,
            deliveryTime: v.deliveryTime,
            validity: v.validity,
          } as SoLineInput,
        ];
  return list.map((p, i) => ({
    sortOrder: i,
    custProductName: txt(p.custProductName),
    qty: numStr(p.qty),
    partNo: txt(p.partNo),
    quotePrice: numStr(p.quotePrice),
    developmentTime: txt(p.developmentTime),
    deliveryTime: txt(p.deliveryTime),
    validity: txt(p.validity),
    inquiryItemId: txt(p.inquiryItemId),
    quotationItemId: txt(p.quotationItemId),
    itemId: txt(p.itemId),
  }));
}
