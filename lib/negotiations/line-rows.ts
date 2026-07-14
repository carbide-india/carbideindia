import type { NegotiationLineInput } from "@/lib/validators/negotiation";

/** The subset of CreateNegotiation input the line rows are built from. */
interface Src {
  lines?: NegotiationLineInput[];
  custProductName?: string;
  qty?: number;
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

export interface BuiltNegotiationLine {
  sortOrder: number;
  custProductName: string | null;
  qty: string | null;
  partNo: string | null;
  finalCost: string | null;
  negotiation: string | null;
  quotePrice: string | null;
  developmentTime: string | null;
  deliveryTime: string | null;
  validity: string | null;
  inquiryItemId: string | null;
  quotationItemId: string | null;
  itemId: string | null;
}

/**
 * The subset INSERTED onto `negotiation_items` (ERP Phase 6 - migration 0036).
 * The spec/customer-ask MIRROR columns (custProductName, partNo) are DROPPED -
 * resolved read-through from items (spec-resolve) + the provenance inquiry_item.
 * Only transactional facts + the FK spine remain on the line.
 */
export interface NegotiationLineInsert {
  sortOrder: number;
  qty: string | null;
  finalCost: string | null;
  negotiation: string | null;
  quotePrice: string | null;
  developmentTime: string | null;
  deliveryTime: string | null;
  validity: string | null;
  inquiryItemId: string | null;
  quotationItemId: string | null;
  itemId: string | null;
}

/** Project a built line to the kept `negotiation_items` insert columns. */
export function negotiationLineInsert(l: BuiltNegotiationLine): NegotiationLineInsert {
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
    quotationItemId: l.quotationItemId,
    itemId: l.itemId,
  };
}

/** Build the negotiation_items rows for a negotiation. Prefers lines[]; otherwise
 *  synthesises one row from the legacy flat product fields (back-compat with
 *  the bulk importer + any caller that still sends a single product). */
export function negotiationLineRows(v: Src): BuiltNegotiationLine[] {
  const list =
    v.lines && v.lines.length
      ? v.lines
      : [
          {
            custProductName: v.custProductName,
            qty: v.qty,
            partNo: v.partNo,
            finalCost: v.finalCost,
            negotiation: v.negotiation,
            quotePrice: v.quotePrice,
            developmentTime: v.developmentTime,
            deliveryTime: v.deliveryTime,
            validity: v.validity,
          } as NegotiationLineInput,
        ];
  return list.map((p, i) => ({
    sortOrder: i,
    custProductName: txt(p.custProductName),
    qty: numStr(p.qty),
    partNo: txt(p.partNo),
    finalCost: numStr(p.finalCost),
    negotiation: numStr(p.negotiation),
    quotePrice: numStr(p.quotePrice),
    developmentTime: txt(p.developmentTime),
    deliveryTime: txt(p.deliveryTime),
    validity: txt(p.validity),
    inquiryItemId: txt(p.inquiryItemId),
    quotationItemId: txt(p.quotationItemId),
    itemId: txt(p.itemId),
  }));
}
