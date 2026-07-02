import { describe, it, expect } from "vitest";
import {
  computeGst,
  computeGstDocument,
  resolveSupplyType,
  roundPaisa,
} from "@/lib/gst/compute";
import { SELLER_STATE } from "@/db/enums";

describe("resolveSupplyType — intra vs inter vs export", () => {
  it("same state as seller (Maharashtra) → intra_state", () => {
    expect(resolveSupplyType({ placeOfSupply: "Maharashtra" })).toBe("intra_state");
    // case + whitespace tolerant
    expect(resolveSupplyType({ placeOfSupply: "  maharashtra " })).toBe("intra_state");
  });
  it("different state → inter_state", () => {
    expect(resolveSupplyType({ placeOfSupply: "Karnataka" })).toBe("inter_state");
    expect(resolveSupplyType({ placeOfSupply: "Gujarat" })).toBe("inter_state");
  });
  it("export override wins regardless of state", () => {
    expect(resolveSupplyType({ placeOfSupply: "Maharashtra", isExport: true })).toBe("export");
  });
  it("missing place of supply defaults to intra_state", () => {
    expect(resolveSupplyType({ placeOfSupply: null })).toBe("intra_state");
    expect(resolveSupplyType({ placeOfSupply: "" })).toBe("intra_state");
  });
  it("honours a custom seller state", () => {
    expect(resolveSupplyType({ placeOfSupply: "Karnataka", sellerState: "Karnataka" })).toBe(
      "intra_state",
    );
    expect(SELLER_STATE).toBe("Maharashtra");
  });
});

describe("computeGst — intra-state (CGST + SGST split)", () => {
  // 10,000 @ 18% intra → CGST 900 + SGST 900, IGST 0.
  const out = computeGst({ taxableAmount: 10000, ratePct: 18, placeOfSupply: "Maharashtra" });
  it("splits the rate in half, IGST zero", () => {
    expect(out.supplyType).toBe("intra_state");
    expect(out.isInterState).toBe(false);
    expect(out.cgstRate).toBe(9);
    expect(out.sgstRate).toBe(9);
    expect(out.igstRate).toBe(0);
  });
  it("CGST 900, SGST 900, IGST 0, tax 1800, total 11800", () => {
    expect(out.cgstAmount).toBe(900);
    expect(out.sgstAmount).toBe(900);
    expect(out.igstAmount).toBe(0);
    expect(out.taxAmount).toBe(1800);
    expect(out.total).toBe(11800);
  });
  it("CGST + SGST always sum to the total tax (no rounding gap)", () => {
    // 333.33 @ 5% → tax 16.6665 → 16.67; halves must sum to 16.67, not 16.66.
    const odd = computeGst({ taxableAmount: 333.33, ratePct: 5, placeOfSupply: "Maharashtra" });
    expect(odd.cgstAmount + odd.sgstAmount).toBe(odd.taxAmount);
    expect(odd.taxAmount).toBe(16.67);
  });
});

describe("computeGst — inter-state (IGST only)", () => {
  // 10,000 @ 18% inter → IGST 1800, CGST/SGST 0.
  const out = computeGst({ taxableAmount: 10000, ratePct: 18, placeOfSupply: "Karnataka" });
  it("whole rate goes to IGST", () => {
    expect(out.supplyType).toBe("inter_state");
    expect(out.isInterState).toBe(true);
    expect(out.igstRate).toBe(18);
    expect(out.igstAmount).toBe(1800);
    expect(out.cgstAmount).toBe(0);
    expect(out.sgstAmount).toBe(0);
    expect(out.total).toBe(11800);
  });
});

describe("computeGst — export (zero-rated)", () => {
  const out = computeGst({ taxableAmount: 10000, ratePct: 18, isExport: true });
  it("no tax charged", () => {
    expect(out.supplyType).toBe("export");
    expect(out.taxAmount).toBe(0);
    expect(out.igstAmount).toBe(0);
    expect(out.cgstAmount).toBe(0);
    expect(out.total).toBe(10000);
  });
});

describe("computeGstDocument — multi-line totals (persisted header)", () => {
  it("intra-state document sums CGST/SGST and grand total", () => {
    const doc = computeGstDocument({
      placeOfSupply: "Maharashtra",
      lines: [
        { qty: 10, unitPrice: 100, ratePct: 18 }, // taxable 1000, tax 180 (90+90)
        { qty: 5, unitPrice: 200, discount: 100, ratePct: 12 }, // taxable 900, tax 108 (54+54)
      ],
    });
    expect(doc.supplyType).toBe("intra_state");
    expect(doc.subTotal).toBe(1900);
    expect(doc.cgstTotal).toBe(144); // 90 + 54
    expect(doc.sgstTotal).toBe(144);
    expect(doc.igstTotal).toBe(0);
    expect(doc.taxTotal).toBe(288);
    expect(doc.grandTotal).toBe(2188);
  });

  it("inter-state document routes everything to IGST", () => {
    const doc = computeGstDocument({
      placeOfSupply: "Tamil Nadu",
      lines: [{ qty: 10, unitPrice: 100, ratePct: 18 }],
    });
    expect(doc.supplyType).toBe("inter_state");
    expect(doc.cgstTotal).toBe(0);
    expect(doc.sgstTotal).toBe(0);
    expect(doc.igstTotal).toBe(180);
    expect(doc.grandTotal).toBe(1180);
  });
});

describe("roundPaisa", () => {
  it("rounds to 2 dp and normalizes -0", () => {
    expect(roundPaisa(1.005)).toBe(1.01);
    expect(roundPaisa(-0)).toBe(0);
    expect(roundPaisa(2.675)).toBe(2.68);
  });
});
