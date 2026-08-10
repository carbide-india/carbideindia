import { describe, it, expect } from "vitest";
import {
  VENDOR_VIEWS,
  countVendorViews,
  isVendorView,
  matchesVendorView,
} from "@/components/vendors/vendor-views";
import type { VendorRegisterRow } from "@/lib/queries/vendors";

/**
 * The vendor register's bucket tiles ARE these predicates — the number on a
 * tile and the rows behind it come from the same function, so these tests are
 * what stops a tile ever claiming a count its list can't produce.
 */

function vendor(over: Partial<VendorRegisterRow> = {}): VendorRegisterRow {
  return {
    id: crypto.randomUUID(),
    vendorCode: "VN-0001",
    name: "Test Vendor",
    contactPerson: "Rahul",
    contactNo: "+91 98765 43210",
    email: "sales@test.in",
    city: "Nashik",
    state: "Maharashtra",
    gstin: "27AAPFU0939F1ZV",
    isGstApplicable: true,
    website: "https://test.in",
    defaultCreditDays: 30,
    paymentTerms: "30 days",
    attachmentCount: 2,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

describe("isVendorView", () => {
  it("accepts every declared view and nothing else", () => {
    for (const v of VENDOR_VIEWS) expect(isVendorView(v)).toBe(true);
    expect(isVendorView("gst")).toBe(false);
    expect(isVendorView("")).toBe(false);
    expect(isVendorView(null)).toBe(false);
    expect(isVendorView(undefined)).toBe(false);
  });
});

describe("matchesVendorView", () => {
  it("'all' holds every row, active or not", () => {
    expect(matchesVendorView(vendor(), "all")).toBe(true);
    expect(matchesVendorView(vendor({ isActive: false }), "all")).toBe(true);
  });

  it("splits active from deactivated with no overlap and no gap", () => {
    const rows = [vendor(), vendor({ isActive: false })];
    const c = countVendorViews(rows);
    expect(c.active + c.inactive).toBe(c.all);
  });

  it("counts a GST-applicable vendor with no number as GST-missing", () => {
    expect(matchesVendorView(vendor({ gstin: null }), "gst-missing")).toBe(true);
    expect(matchesVendorView(vendor({ gstin: "   " }), "gst-missing")).toBe(true);
  });

  it("does NOT count a non-GST vendor as GST-missing — that's a deliberate answer", () => {
    expect(
      matchesVendorView(vendor({ gstin: null, isGstApplicable: false }), "gst-missing"),
    ).toBe(false);
  });

  it("never counts a deactivated vendor as outstanding work", () => {
    const dead = vendor({
      isActive: false,
      gstin: null,
      attachmentCount: 0,
      contactPerson: null,
      contactNo: null,
      email: null,
    });
    expect(matchesVendorView(dead, "gst-missing")).toBe(false);
    expect(matchesVendorView(dead, "no-attachment")).toBe(false);
    expect(matchesVendorView(dead, "no-contact")).toBe(false);
  });

  it("counts no-attachment only at exactly zero files", () => {
    expect(matchesVendorView(vendor({ attachmentCount: 0 }), "no-attachment")).toBe(true);
    expect(matchesVendorView(vendor({ attachmentCount: 1 }), "no-attachment")).toBe(false);
  });

  it("counts no-contact only when there is NO way to reach the vendor", () => {
    const none = vendor({ contactPerson: null, contactNo: null, email: null });
    expect(matchesVendorView(none, "no-contact")).toBe(true);
    // Any single channel present means they are reachable.
    expect(matchesVendorView({ ...none, email: "a@b.in" }, "no-contact")).toBe(false);
    expect(matchesVendorView({ ...none, contactNo: "99999 99999" }, "no-contact")).toBe(false);
    expect(matchesVendorView({ ...none, contactPerson: "Rahul" }, "no-contact")).toBe(false);
    // Whitespace is not a contact detail.
    expect(matchesVendorView({ ...none, email: "  " }, "no-contact")).toBe(true);
  });
});

describe("countVendorViews", () => {
  it("returns 0 for every bucket on an empty database", () => {
    const c = countVendorViews([]);
    for (const v of VENDOR_VIEWS) expect(c[v]).toBe(0);
  });

  it("agrees with filtering the same rows one bucket at a time", () => {
    const rows = [
      vendor(),
      vendor({ gstin: null }),
      vendor({ attachmentCount: 0 }),
      vendor({ contactPerson: null, contactNo: null, email: null }),
      vendor({ isActive: false }),
      vendor({ isGstApplicable: false, gstin: null }),
    ];
    const c = countVendorViews(rows);
    for (const v of VENDOR_VIEWS) {
      expect(c[v]).toBe(rows.filter((r) => matchesVendorView(r, v)).length);
    }
    expect(c.all).toBe(rows.length);
  });
});
