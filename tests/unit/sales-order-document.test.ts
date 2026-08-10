import { describe, it, expect } from "vitest";
import {
  buildSalesOrderDocument,
  isSalesOrderCopy,
  salesOrderCopyFileStem,
  type SoDocInput,
  type SoDocLineInput,
} from "@/lib/sales-orders/so-document";
import type { ResolvedSpec, ResolvedCustomerAsk } from "@/lib/flow/spec-resolve";

/**
 * The dual Sales Order output. The load-bearing assertion in this file is the
 * NEGATIVE one: internal production detail must never reach the customer copy.
 * That rule is enforced in exactly one place (`buildSalesOrderDocument`), so it
 * is testable in exactly one place.
 */

const SPEC: ResolvedSpec = {
  itemId: "item-1",
  itemCode: "S-10001-",
  itemStatus: "active",
  shapeName: "Round",
  gradeName: "CI-K20",
  toleranceName: "h6",
  conditionName: "Sintered",
  sizeCode: "SZ-25",
  outerDia: "25",
  innerDia: null,
  length: "60",
  width: null,
  thickness: null,
  dimensionNotes: "Chamfer both ends",
  partNo: "PN-778",
  hsnCode: "82090010",
  uom: "Nos",
  gradeCustomer: "K20",
  gradeNameForCust: "CI-K20-EXT",
};

const ASK: ResolvedCustomerAsk = {
  custProductName: "Carbide Rod 25x60",
  custDrawingNo: "DRW-441",
  drawingRevisionNo: "R2",
};

const LINE: SoDocLineInput = {
  id: "line-1",
  sortOrder: 0,
  qty: "100",
  qtyOrdered: "120",
  unitPrice: "450",
  quotePrice: "400",
  developmentTime: "2 weeks",
  deliveryTime: "6 weeks",
  validity: "30 days",
  productionNotes: "Use pressing tool P-204",
  spec: SPEC,
  ask: ASK,
  internalGradeName: "IG-90",
  internalProductionCodeName: "IPC-5521",
  productionPartNoName: "PROD-PN-9",
};

const REC: SoDocInput = {
  soNo: "SM9601-SO01",
  companyName: "Acme Tools Pvt Ltd",
  smNumber: "SM9601",
  salesOrderStatus: "pending_approval",
  enquiryDate: new Date("2026-07-01T00:00:00Z"),
  customerPoNo: "PO-3312",
  customerPoDate: new Date("2026-07-04T00:00:00Z"),
  quotePrice: "54000",
  developmentTime: "2 weeks",
  deliveryTime: "6 weeks",
  validity: "30 days",
  customerSoSent: true,
  productionSoSent: false,
  productionNotes: "Release in two batches",
  systemRemark: "Okay for processing",
  salesPersonName: "Manan",
  lines: [LINE],
};

/** Every string that appears anywhere in a built document. */
function allText(rec: SoDocInput, copy: "customer" | "factory"): string {
  const d = buildSalesOrderDocument(rec, copy);
  const parts: string[] = [d.copyLabel, d.soNo, d.companyName, d.statusLabel];
  for (const s of d.sections) {
    parts.push(s.title);
    for (const r of s.rows) parts.push(r.label, r.value);
  }
  for (const l of d.lines) {
    parts.push(l.heading);
    for (const r of [...l.rows, ...l.internalRows]) parts.push(r.label, r.value);
  }
  return parts.join("\n");
}

describe("buildSalesOrderDocument - customer copy", () => {
  it("is not marked internal and carries no pending-field notice", () => {
    const d = buildSalesOrderDocument(REC, "customer");
    expect(d.internal).toBe(false);
    expect(d.copyLabel).toBe("Customer Copy");
    expect(d.pendingFieldList).toBe(false);
    expect(d.sections.some((s) => s.internal)).toBe(false);
  });

  it("NEVER leaks internal production detail", () => {
    const text = allText(REC, "customer");
    for (const secret of [
      "IG-90",
      "IPC-5521",
      "PROD-PN-9",
      "S-10001-",
      "Use pressing tool P-204",
      "Release in two batches",
      "Okay for processing",
      "Chamfer both ends",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(
      buildSalesOrderDocument(REC, "customer").lines[0]?.internalRows,
    ).toEqual([]);
  });

  it("carries the customer-facing spec and commercials", () => {
    const text = allText(REC, "customer");
    expect(text).toContain("Carbide Rod 25x60");
    expect(text).toContain("DRW-441");
    expect(text).toContain("CI-K20-EXT"); // customer-facing grade, not the internal one
    expect(text).toContain("PO-3312");
    expect(text).toContain("OD 25 × L 60 mm");
  });

  it("reports the CUSTOMER copy's own send state", () => {
    expect(buildSalesOrderDocument(REC, "customer").sent).toBe(true);
    expect(buildSalesOrderDocument(REC, "factory").sent).toBe(false);
  });
});

describe("buildSalesOrderDocument - factory copy", () => {
  it("is marked internal and flags the pending field list", () => {
    const d = buildSalesOrderDocument(REC, "factory");
    expect(d.internal).toBe(true);
    expect(d.copyLabel).toBe("Factory Copy");
    expect(d.pendingFieldList).toBe(true);
  });

  it("adds the internal production detail on top of the customer content", () => {
    const customer = buildSalesOrderDocument(REC, "customer");
    const factory = buildSalesOrderDocument(REC, "factory");
    // Additive: every shared line row on the customer copy is on the factory copy.
    expect(factory.lines[0]?.rows).toEqual(customer.lines[0]?.rows);

    const text = allText(REC, "factory");
    for (const detail of [
      "IG-90",
      "IPC-5521",
      "PROD-PN-9",
      "S-10001-",
      "Use pressing tool P-204",
      "Release in two batches",
      "Okay for processing",
    ]) {
      expect(text).toContain(detail);
    }
  });

  it("keeps the production instructions in their own internal section", () => {
    const d = buildSalesOrderDocument(REC, "factory");
    const section = d.sections.find((s) => s.title === "Production Instructions");
    expect(section?.internal).toBe(true);
  });
});

describe("buildSalesOrderDocument - edge cases", () => {
  it("renders an empty sales order without throwing", () => {
    const empty: SoDocInput = {
      soNo: "SM9999-SO01",
      companyName: null,
      smNumber: null,
      salesOrderStatus: "not_started",
      enquiryDate: null,
      customerPoNo: null,
      customerPoDate: null,
      quotePrice: null,
      developmentTime: null,
      deliveryTime: null,
      validity: null,
      customerSoSent: false,
      productionSoSent: false,
      productionNotes: null,
      systemRemark: null,
      salesPersonName: null,
      lines: [],
    };
    const d = buildSalesOrderDocument(empty, "factory");
    expect(d.lines).toEqual([]);
    // The Order section still exists (SO No + stage always resolve).
    expect(d.sections[0]?.title).toBe("Order");
    // Blank-valued rows are dropped, not printed as "-".
    expect(d.sections.every((s) => s.rows.every((r) => r.value !== ""))).toBe(true);
  });

  it("prefers the frozen contract qty/price over the quote values", () => {
    const text = allText(REC, "customer");
    expect(text).toContain("120 Nos"); // qtyOrdered, not qty
    expect(text).toContain("₹450"); // unitPrice, not quotePrice
  });

  it("falls back to the quote values before the order is frozen", () => {
    const unfrozen: SoDocInput = {
      ...REC,
      lines: [{ ...LINE, qtyOrdered: null, unitPrice: null }],
    };
    const text = allText(unfrozen, "customer");
    expect(text).toContain("100 Nos");
    expect(text).toContain("₹400");
  });

  it("orders lines by sortOrder regardless of input order", () => {
    const shuffled: SoDocInput = {
      ...REC,
      lines: [
        { ...LINE, id: "b", sortOrder: 2, ask: { ...ASK, custProductName: "B" } },
        { ...LINE, id: "a", sortOrder: 1, ask: { ...ASK, custProductName: "A" } },
      ],
    };
    const d = buildSalesOrderDocument(shuffled, "customer");
    expect(d.lines.map((l) => l.heading)).toEqual(["A", "B"]);
  });

  it("falls back to the item code then a line number for the heading", () => {
    const noName: SoDocInput = {
      ...REC,
      lines: [
        {
          ...LINE,
          ask: { custProductName: null, custDrawingNo: null, drawingRevisionNo: null },
        },
      ],
    };
    expect(buildSalesOrderDocument(noName, "customer").lines[0]?.heading).toBe(
      "S-10001-",
    );

    const bare: SoDocInput = {
      ...REC,
      lines: [
        {
          ...LINE,
          ask: { custProductName: null, custDrawingNo: null, drawingRevisionNo: null },
          spec: { ...SPEC, itemCode: null },
        },
      ],
    };
    expect(buildSalesOrderDocument(bare, "customer").lines[0]?.heading).toBe(
      "Line 1",
    );
  });
});

describe("salesOrderCopyFileStem", () => {
  it("names each copy distinctly and stays filesystem-safe", () => {
    expect(salesOrderCopyFileStem("SM9601-SO01", "customer")).toBe(
      "SO-SM9601-SO01-Customer-Copy",
    );
    expect(salesOrderCopyFileStem("SM/96 01", "factory")).toBe(
      "SO-SM_96_01-Factory-Copy",
    );
  });
});

describe("isSalesOrderCopy", () => {
  it("accepts only the two copies", () => {
    expect(isSalesOrderCopy("customer")).toBe(true);
    expect(isSalesOrderCopy("factory")).toBe(true);
    expect(isSalesOrderCopy("internal")).toBe(false);
    expect(isSalesOrderCopy(undefined)).toBe(false);
  });
});
