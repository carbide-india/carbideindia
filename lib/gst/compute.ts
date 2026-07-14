/**
 * Pure GST computation (Phase 7, §11.3). No DB, no side effects - the single
 * source of truth for the India CGST/SGST vs IGST split so invoice actions,
 * credit notes and any preview UI all agree to the paisa.
 *
 * The rule (India GST):
 *   • Place of supply in the SAME state as the seller  → INTRA-state supply →
 *     the tax splits into CGST (half) + SGST (half), IGST = 0.
 *   • Place of supply in a DIFFERENT state              → INTER-state supply →
 *     the whole tax is IGST, CGST = SGST = 0.
 *   • Export / SEZ                                       → zero-rated; the caller
 *     passes supplyType "export" (or rate 0) and no tax is charged (LUT/bond).
 *
 * The seller (Carbide India / Yogeshwar Engineering Pvt Ltd) is in Maharashtra
 * (`SELLER_STATE`). State names are compared case- and whitespace-insensitively
 * so "maharashtra " and "Maharashtra" match; the intent is a data-entry-tolerant
 * comparison, NOT a canonical GST-state-code lookup (that can layer on later).
 *
 * Money: amounts are rounded to 2 decimals (paisa). Rates are percentages
 * (e.g. 18 means 18%). CGST/SGST each get half the rate; to avoid a rounding
 * gap we compute SGST as (total tax − CGST) rather than rounding half twice.
 */
import { SELLER_STATE, type GstSupplyType } from "@/db/enums";

/** Round to 2 dp (paisa), guarding against −0 and FP noise. */
export function roundPaisa(n: number): number {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** Normalize a state name for tolerant equality (case/space-insensitive). */
function normState(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Decide the supply type from place-of-supply vs the seller state.
 * `isExport` (an explicit override for export/SEZ/overseas buyers) short-circuits
 * to "export" regardless of state text.
 */
export function resolveSupplyType(args: {
  placeOfSupply: string | null | undefined;
  sellerState?: string;
  isExport?: boolean;
}): GstSupplyType {
  if (args.isExport) return "export";
  const seller = normState(args.sellerState ?? SELLER_STATE);
  const pos = normState(args.placeOfSupply);
  // No place-of-supply info → treat as intra-state (the safe domestic default;
  // the caller should supply a place of supply for real invoices).
  if (!pos) return "intra_state";
  return pos === seller ? "intra_state" : "inter_state";
}

export interface GstInput {
  /** Taxable value (post-discount line/base amount) in rupees. */
  taxableAmount: number;
  /** Total GST rate in percent (e.g. 18 for 18%). */
  ratePct: number;
  /** Buyer's place of supply (state name). */
  placeOfSupply?: string | null;
  /** Seller state; defaults to Carbide India's Maharashtra. */
  sellerState?: string;
  /** Explicit export/zero-rated override. */
  isExport?: boolean;
  /** Precomputed supply type (skips resolution when the caller already knows). */
  supplyType?: GstSupplyType;
}

export interface GstSplit {
  supplyType: GstSupplyType;
  isInterState: boolean;
  taxableAmount: number;
  /** The applied total rate (0 for export). */
  ratePct: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  /** cgst+sgst+igst, rounded. */
  taxAmount: number;
  /** taxable + tax, rounded. */
  total: number;
}

/**
 * Compute the CGST/SGST/IGST split for a single taxable amount + rate.
 * Intra-state → CGST+SGST (rate halved); inter-state → IGST (full rate);
 * export → all zero. Amounts rounded to paisa; SGST derived as (tax − CGST)
 * so the two halves always sum exactly to the intra-state tax.
 */
export function computeGst(input: GstInput): GstSplit {
  const taxable = roundPaisa(input.taxableAmount);
  const supplyType =
    input.supplyType ??
    resolveSupplyType({
      placeOfSupply: input.placeOfSupply,
      sellerState: input.sellerState,
      isExport: input.isExport,
    });
  const isInterState = supplyType === "inter_state";

  // Export / zero-rated: no tax.
  if (supplyType === "export") {
    return {
      supplyType, isInterState: false, taxableAmount: taxable, ratePct: 0,
      cgstRate: 0, cgstAmount: 0, sgstRate: 0, sgstAmount: 0,
      igstRate: 0, igstAmount: 0, taxAmount: 0, total: taxable,
    };
  }

  const rate = input.ratePct;
  const taxAmount = roundPaisa((taxable * rate) / 100);

  if (isInterState) {
    return {
      supplyType, isInterState: true, taxableAmount: taxable, ratePct: rate,
      cgstRate: 0, cgstAmount: 0, sgstRate: 0, sgstAmount: 0,
      igstRate: rate, igstAmount: taxAmount,
      taxAmount, total: roundPaisa(taxable + taxAmount),
    };
  }

  // Intra-state: split. CGST = round(half); SGST = tax − CGST (no double round).
  const halfRate = rate / 2;
  const cgstAmount = roundPaisa((taxable * halfRate) / 100);
  const sgstAmount = roundPaisa(taxAmount - cgstAmount);
  return {
    supplyType, isInterState: false, taxableAmount: taxable, ratePct: rate,
    cgstRate: halfRate, cgstAmount, sgstRate: halfRate, sgstAmount,
    igstRate: 0, igstAmount: 0,
    taxAmount, total: roundPaisa(taxable + taxAmount),
  };
}

export interface GstLineInput {
  qty: number;
  unitPrice: number;
  /** Per-line discount (rupees, subtracted from qty*unitPrice). */
  discount?: number;
  ratePct: number;
  /** Optional per-line HSN - not used in math, carried for convenience. */
  hsnCode?: string | null;
}

export interface GstLineResult extends GstSplit {
  qty: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface GstDocResult {
  supplyType: GstSupplyType;
  isInterState: boolean;
  lines: GstLineResult[];
  subTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  grandTotal: number;
}

/**
 * Compute a full document's GST: one split per line + summed persisted header
 * totals (§11.3 - totals are computed but stored). Supply type is resolved once
 * for the document (place-of-supply vs seller state) and applied to every line.
 */
export function computeGstDocument(args: {
  lines: GstLineInput[];
  placeOfSupply?: string | null;
  sellerState?: string;
  isExport?: boolean;
  supplyType?: GstSupplyType;
}): GstDocResult {
  const supplyType =
    args.supplyType ??
    resolveSupplyType({
      placeOfSupply: args.placeOfSupply,
      sellerState: args.sellerState,
      isExport: args.isExport,
    });

  const lines: GstLineResult[] = args.lines.map((l) => {
    const taxable = roundPaisa(l.qty * l.unitPrice - (l.discount ?? 0));
    const split = computeGst({ taxableAmount: taxable, ratePct: l.ratePct, supplyType });
    return {
      ...split,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discount: roundPaisa(l.discount ?? 0),
      lineTotal: split.total,
    };
  });

  const sum = (pick: (r: GstLineResult) => number): number =>
    roundPaisa(lines.reduce((acc, r) => acc + pick(r), 0));

  const subTotal = sum((r) => r.taxableAmount);
  const cgstTotal = sum((r) => r.cgstAmount);
  const sgstTotal = sum((r) => r.sgstAmount);
  const igstTotal = sum((r) => r.igstAmount);
  const taxTotal = roundPaisa(cgstTotal + sgstTotal + igstTotal);
  const grandTotal = roundPaisa(subTotal + taxTotal);

  return {
    supplyType,
    isInterState: supplyType === "inter_state",
    lines,
    subTotal, cgstTotal, sgstTotal, igstTotal, taxTotal, grandTotal,
  };
}
