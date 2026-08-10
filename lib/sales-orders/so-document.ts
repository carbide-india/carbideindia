import {
  SALES_ORDER_STATUS_LABELS,
  type SalesOrderStatus,
} from "@/db/enums";
import { formatDate } from "@/lib/format";
import type { ResolvedSpec, ResolvedCustomerAsk } from "@/lib/flow/spec-resolve";

/**
 * ONE Sales Order, TWO outputs.
 *
 * Manan was firm about this: the same order goes out twice - a CUSTOMER copy
 * carrying only what the customer needs, and a FACTORY / production copy that
 * additionally carries the internal detail production needs to start making
 * material (internal grade, production code, part numbers, production notes).
 *
 * This module turns one loaded SO record into an ordered, presentation-ready
 * document for EITHER copy. The on-screen preview (so-copy-view.tsx) and the
 * PDF (so-pdf.ts) both consume THIS, exactly as the Client KYC PDF/Word pair
 * consume `buildKycDocument` - so the printed copy can never drift from the
 * previewed one, and "what is on the customer copy" is decided in exactly one
 * place.
 *
 * *** THE FACTORY FIELD LIST IS NOT FINAL. *** Manan said the precise extra
 * production fields must be collected by sitting with Alok ("आलोक भाई से बैठ के
 * समझना है कि आप एक्स्ट्रा क्या डिटेल भेजते हो"). Everything the factory copy
 * prints below already exists on the item / line / enquiry spine - NOTHING is
 * invented. The document therefore carries an explicit `pendingFieldList`
 * placeholder so the gap is visible on the page instead of being papered over
 * with a made-up spec sheet.
 */

export type SalesOrderCopy = "customer" | "factory";

export const SALES_ORDER_COPIES = ["customer", "factory"] as const;

export function isSalesOrderCopy(v: unknown): v is SalesOrderCopy {
  return v === "customer" || v === "factory";
}

export interface SoDocRow {
  label: string;
  value: string;
}

export interface SoDocSection {
  title: string;
  rows: SoDocRow[];
  /** Marks a section that must NEVER appear on the customer copy. */
  internal?: boolean;
}

/** One product line, rendered as a labelled block. */
export interface SoDocLineBlock {
  heading: string;
  /** Commercial + spec rows that appear on both copies. */
  rows: SoDocRow[];
  /** Extra rows printed on the FACTORY copy only (empty on the customer copy). */
  internalRows: SoDocRow[];
}

export interface SalesOrderDocument {
  copy: SalesOrderCopy;
  /** "Customer Copy" / "Factory Copy" - the printed sub-title. */
  copyLabel: string;
  /** true for the factory copy: drives the INTERNAL banner + watermarking. */
  internal: boolean;
  soNo: string;
  companyName: string;
  smNumber: string;
  statusLabel: string;
  /** "Sent" / "Not sent" for THIS copy (customer_so_sent vs production_so_sent). */
  sentLabel: string;
  sent: boolean;
  sections: SoDocSection[];
  lines: SoDocLineBlock[];
  /**
   * Factory copy only. True until Alok's extra-field list has been collected and
   * modelled - the preview and the PDF both print a visible placeholder so the
   * shop floor knows the sheet is not yet complete.
   */
  pendingFieldList: boolean;
}

// ── Input shape ────────────────────────────────────────────────────────────
// Deliberately structural (not the Drizzle row type) so the builder stays pure
// and unit-testable without a DB.

export interface SoDocLineInput {
  id: string;
  sortOrder: number;
  qty: string | null;
  /** Frozen contract quantity (set at confirmation); falls back to `qty`. */
  qtyOrdered: string | null;
  /** Frozen contract price (set at confirmation); falls back to `quotePrice`. */
  unitPrice: string | null;
  quotePrice: string | null;
  developmentTime: string | null;
  deliveryTime: string | null;
  validity: string | null;
  /** Per-line note that prints on the FACTORY copy only. */
  productionNotes: string | null;
  spec: ResolvedSpec;
  ask: ResolvedCustomerAsk;
  /** Master NAMES resolved from the provenance inquiry_item (internal only). */
  internalGradeName: string | null;
  internalProductionCodeName: string | null;
  productionPartNoName: string | null;
}

export interface SoDocInput {
  soNo: string;
  companyName: string | null;
  smNumber: string | null;
  salesOrderStatus: SalesOrderStatus;
  enquiryDate: Date | null;
  customerPoNo: string | null;
  customerPoDate: Date | null;
  quotePrice: string | null;
  developmentTime: string | null;
  deliveryTime: string | null;
  validity: string | null;
  customerSoSent: boolean;
  productionSoSent: boolean;
  /** Header-level factory note (factory copy only). */
  productionNotes: string | null;
  systemRemark: string | null;
  salesPersonName: string | null;
  lines: SoDocLineInput[];
}

// ── Formatting helpers (shared with the PDF so both copies read identically) ──

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return formatDate(date);
}

/** numeric-string → ₹ with Indian grouping; "" when unset/unparseable. */
function fmtMoney(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** numeric-string → plain grouped number; "" when unset/unparseable. */
function fmtNum(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

/** Keep only rows with a non-empty value (identical to the KYC doc rule). */
function rows(list: Array<[string, string | null | undefined]>): SoDocRow[] {
  return list
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([label, v]) => ({ label, value: String(v) }));
}

/** Human dimension string from the resolved item spec, e.g. "OD 25 × L 60 mm". */
function dimensionText(spec: ResolvedSpec): string {
  const parts: Array<[string, string | null]> = [
    ["OD", spec.outerDia],
    ["ID", spec.innerDia],
    ["L", spec.length],
    ["W", spec.width],
    ["T", spec.thickness],
  ];
  const used = parts
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `${k} ${fmtNum(v)}`);
  return used.length ? `${used.join(" × ")} mm` : "";
}

// ── Builder ────────────────────────────────────────────────────────────────

/**
 * Build the ordered document for one copy.
 *
 * The ONLY difference between the two copies is additive: the factory copy adds
 * the internal sections/rows on top of everything the customer copy shows. The
 * customer copy never sees an `internal` section or an `internalRows` entry -
 * that exclusion is enforced here, once, rather than at each render site.
 */
export function buildSalesOrderDocument(
  rec: SoDocInput,
  copy: SalesOrderCopy,
): SalesOrderDocument {
  const internal = copy === "factory";
  const sent = internal ? rec.productionSoSent : rec.customerSoSent;

  const sections: SoDocSection[] = [];
  const push = (title: string, list: SoDocRow[], isInternal = false) => {
    if (list.length > 0) sections.push({ title, rows: list, internal: isInternal });
  };

  push(
    "Order",
    rows([
      ["Sales Order No", rec.soNo],
      ["SM Number", rec.smNumber],
      ["Customer", rec.companyName],
      ["Enquiry Date", fmtDate(rec.enquiryDate)],
      ["Sales Person", rec.salesPersonName],
      ["Stage", SALES_ORDER_STATUS_LABELS[rec.salesOrderStatus]],
    ]),
  );

  push(
    "Customer PO",
    rows([
      ["Customer PO No", rec.customerPoNo],
      ["Customer PO Date", fmtDate(rec.customerPoDate)],
    ]),
  );

  push(
    "Commercial Terms",
    rows([
      ["Order Value", fmtMoney(rec.quotePrice)],
      ["Development Time", rec.developmentTime],
      ["Delivery Time", rec.deliveryTime],
      ["Validity", rec.validity],
    ]),
  );

  if (internal) {
    // Header-level internal narrative. `systemRemark` is the processing stamp
    // written when the order is handed to production, so it belongs on the
    // factory sheet, not on the customer's.
    push(
      "Production Instructions",
      rows([
        ["Production Notes", rec.productionNotes],
        ["System Remark", rec.systemRemark],
      ]),
      true,
    );
  }

  const lines: SoDocLineBlock[] = rec.lines
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l, idx) => {
      const heading =
        l.ask.custProductName?.trim() ||
        l.spec.itemCode?.trim() ||
        `Line ${idx + 1}`;

      // Contract-frozen values win where present (the SO is a contract); the
      // pre-freeze quote values are the fallback for un-confirmed orders.
      const qty = l.qtyOrdered ?? l.qty;
      const price = l.unitPrice ?? l.quotePrice;

      const shared = rows([
        ["Product", l.ask.custProductName],
        ["Drawing No", l.ask.custDrawingNo],
        ["Drawing Rev", l.ask.drawingRevisionNo],
        ["Part No", l.spec.partNo],
        ["Shape", l.spec.shapeName],
        ["Size", l.spec.sizeCode],
        ["Dimensions", dimensionText(l.spec)],
        // Customer-facing grade ONLY - the internal production grade is added
        // below and never reaches the customer copy.
        ["Grade", l.spec.gradeNameForCust ?? l.spec.gradeCustomer],
        ["Tolerance", l.spec.toleranceName],
        ["Condition", l.spec.conditionName],
        ["HSN Code", l.spec.hsnCode],
        ["Qty", qty == null ? "" : `${fmtNum(qty)}${l.spec.uom ? ` ${l.spec.uom}` : ""}`],
        ["Unit Price", fmtMoney(price)],
        ["Development Time", l.developmentTime],
        ["Delivery Time", l.deliveryTime],
        ["Validity", l.validity],
      ]);

      const internalRows = internal
        ? rows([
            ["Item Code", l.spec.itemCode],
            ["Internal Grade", l.internalGradeName],
            ["Internal Production Code", l.internalProductionCodeName],
            ["Production Part No", l.productionPartNoName],
            ["Dimension Notes", l.spec.dimensionNotes],
            ["Production Notes", l.productionNotes],
          ])
        : [];

      return { heading, rows: shared, internalRows };
    });

  return {
    copy,
    copyLabel: internal ? "Factory Copy" : "Customer Copy",
    internal,
    soNo: rec.soNo,
    companyName: rec.companyName ?? "",
    smNumber: rec.smNumber ?? "",
    statusLabel: SALES_ORDER_STATUS_LABELS[rec.salesOrderStatus],
    sentLabel: sent ? "Sent" : "Not sent",
    sent,
    sections,
    lines,
    pendingFieldList: internal,
  };
}

/** A filesystem-safe filename stem for the two downloads. */
export function salesOrderCopyFileStem(
  soNo: string,
  copy: SalesOrderCopy,
): string {
  const suffix = copy === "factory" ? "Factory-Copy" : "Customer-Copy";
  return `SO-${soNo}-${suffix}`.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 90);
}
