import { describe, it, expect } from "vitest";
import { financialYearLabel, formatDocNumber } from "@/lib/series/next-number";
import {
  compareFinancialYears,
  financialYear,
  financialYearStart,
  isFinancialYearLabel,
  mintedBy,
  nextFinancialYear,
  padValue,
  prefixIsEditable,
  previewNumber,
  renderFySeriesNumber,
  renderSequenceNumber,
  renderSmSuffixNumber,
} from "@/lib/numbering/render";

/**
 * The admin register PREVIEWS the next number for every document family. These
 * tests pin that preview to the code that actually mints the number, so a change
 * on either side fails here instead of quietly making the admin page lie.
 */

describe("fy_series preview matches the real allocator", () => {
  const cases: Array<[string, string, number, number]> = [
    ["INV", "2026-27", 4, 1],
    ["INV", "2026-27", 4, 42],
    ["DN", "2026-27", 4, 9999],
    ["CN", "2027-28", 6, 7],
    ["", "2026-27", 4, 3], // prefix-less series drop the leading segment
    ["INV", "2026-27", 0, 12], // no padding
  ];
  it.each(cases)(
    "formatDocNumber(%s, %s, %i, %i) === renderFySeriesNumber(...)",
    (prefix, fy, pad, value) => {
      expect(renderFySeriesNumber(prefix, fy, pad, value)).toBe(
        formatDocNumber(prefix, fy, pad, value),
      );
    },
  );

  it("renders the shape invoices are actually printed with", () => {
    expect(renderFySeriesNumber("INV", "2026-27", 4, 43)).toBe("INV/2026-27/0043");
  });
});

describe("financialYear mirrors financialYearLabel", () => {
  const dates = [
    "2026-04-01T00:00:00Z",
    "2026-07-02T00:00:00Z",
    "2026-12-31T00:00:00Z",
    "2027-01-15T00:00:00Z",
    "2027-03-31T23:59:59Z",
    "2027-04-01T00:00:00Z",
  ];
  it.each(dates)("%s", (iso) => {
    const d = new Date(iso);
    expect(financialYear(d)).toBe(financialYearLabel(d));
  });
});

describe("sequence preview matches the column defaults in db/schema.ts", () => {
  it("SM number — 'SM' || nextval(), unpadded", () => {
    expect(renderSequenceNumber("SM", 0, 9601)).toBe("SM9601");
  });
  it("client code — 'CL-' || lpad(nextval()::text, 4, '0')", () => {
    expect(renderSequenceNumber("CL-", 4, 7)).toBe("CL-0007");
    expect(renderSequenceNumber("CL-", 4, 12345)).toBe("CL-12345"); // lpad never truncates
  });
  it("vendor code — 'VN-' || lpad(..., 4)", () => {
    expect(renderSequenceNumber("VN-", 4, 31)).toBe("VN-0031");
  });
  it("production order — 'PO-' || nextval()", () => {
    expect(renderSequenceNumber("PO-", 0, 10001)).toBe("PO-10001");
  });
  it("meeting number — 'MTG' || nextval()", () => {
    expect(renderSequenceNumber("MTG", 0, 1001)).toBe("MTG1001");
  });
});

describe("sm_suffix preview matches the server actions", () => {
  it("quotation — `${sm}-Q${padStart(2)}`", () => {
    expect(renderSmSuffixNumber("SM9601", "Q", 2, 1)).toBe("SM9601-Q01");
    expect(renderSmSuffixNumber("SM9601", "Q", 2, 12)).toBe("SM9601-Q12");
  });
  it("sales order and proforma invoice keep their multi-letter prefixes", () => {
    expect(renderSmSuffixNumber("SM9601", "SO", 2, 2)).toBe("SM9601-SO02");
    expect(renderSmSuffixNumber("SM9601", "PI", 2, 3)).toBe("SM9601-PI03");
  });
  it("sample numbers have no prefix at all", () => {
    expect(renderSmSuffixNumber("SM9601", "", 2, 4)).toBe("SM9601-04");
  });
});

describe("padValue", () => {
  it("pads to width and leaves longer values intact", () => {
    expect(padValue(7, 4)).toBe("0007");
    expect(padValue(123456, 4)).toBe("123456");
  });
  it("treats zero/negative padding as 'no padding'", () => {
    expect(padValue(7, 0)).toBe("7");
    expect(padValue(7, -3)).toBe("7");
  });
});

describe("previewNumber dispatches on strategy", () => {
  const ctx = { fyLabel: "2026-27", nextValue: 5, sampleSmNumber: "SM9601" };
  it("fy_series", () => {
    expect(previewNumber({ strategy: "fy_series", prefix: "INV", padTo: 4 }, ctx)).toBe(
      "INV/2026-27/0005",
    );
  });
  it("sequence", () => {
    expect(previewNumber({ strategy: "sequence", prefix: "CL-", padTo: 4 }, ctx)).toBe(
      "CL-0005",
    );
  });
  it("sm_suffix", () => {
    expect(previewNumber({ strategy: "sm_suffix", prefix: "Q", padTo: 2 }, ctx)).toBe(
      "SM9601-Q05",
    );
  });
});

describe("financial-year helpers", () => {
  it("accepts well-formed labels and rejects bad check digits", () => {
    expect(isFinancialYearLabel("2026-27")).toBe(true);
    expect(isFinancialYearLabel("2026-28")).toBe(false);
    expect(isFinancialYearLabel("2026")).toBe(false);
    expect(isFinancialYearLabel("26-27")).toBe(false);
    expect(isFinancialYearLabel("")).toBe(false);
  });
  it("rolls the century over correctly", () => {
    expect(nextFinancialYear("2099-00")).toBe("2100-01");
    expect(financialYearStart("2099-00")).toBe(2099);
  });
  it("advances by one year", () => {
    expect(nextFinancialYear("2026-27")).toBe("2027-28");
    expect(nextFinancialYear("nonsense")).toBeNull();
  });
  it("sorts oldest first", () => {
    const years = ["2027-28", "2025-26", "2026-27"];
    expect([...years].sort(compareFinancialYears)).toEqual([
      "2025-26",
      "2026-27",
      "2027-28",
    ]);
  });
});

describe("edit gating", () => {
  it("only FY series read their prefix/padding at mint time", () => {
    expect(prefixIsEditable("fy_series")).toBe(true);
    expect(prefixIsEditable("sequence")).toBe(false);
    expect(prefixIsEditable("sm_suffix")).toBe(false);
  });
  it("names the mint site for each strategy", () => {
    expect(mintedBy("sequence", "inquiries_sm_number_seq")).toContain(
      "inquiries_sm_number_seq",
    );
    expect(mintedBy("fy_series", null)).toContain("doc_number_series");
    expect(mintedBy("sm_suffix", null)).toContain("SM number");
  });
});
