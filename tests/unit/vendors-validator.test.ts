import { describe, it, expect } from "vitest";
import {
  CreateVendorSchema,
  normalizeVendorWebsite,
} from "@/lib/validators/vendor";

/**
 * Vendor Master validator — the GST number and the website are the two fields
 * the 2026-08 rebuild added, and both are optional by design. These lock the
 * two rules that are easy to regress: a blank field must never become an empty
 * string in the DB, and a non-blank field must be stored in ONE canonical form.
 */

const base = { name: "Sandvik Hard Materials" };

describe("normalizeVendorWebsite", () => {
  it("adds https:// when no scheme was typed", () => {
    expect(normalizeVendorWebsite("carbideindia.com")).toBe("https://carbideindia.com");
  });

  it("lowercases the host and keeps the path", () => {
    expect(normalizeVendorWebsite("WWW.Example.CO.IN/about")).toBe(
      "https://www.example.co.in/about",
    );
  });

  it("keeps an explicit http:// scheme rather than forcing https", () => {
    expect(normalizeVendorWebsite("http://legacy-vendor.in")).toBe(
      "http://legacy-vendor.in",
    );
  });

  it("drops the trailing slash on a bare host", () => {
    expect(normalizeVendorWebsite("https://vendor.co.in/")).toBe("https://vendor.co.in");
  });

  it("returns null for blanks, prose and hostnames without a TLD", () => {
    expect(normalizeVendorWebsite("")).toBeNull();
    expect(normalizeVendorWebsite("   ")).toBeNull();
    expect(normalizeVendorWebsite("ask Rahul for the site")).toBeNull();
    expect(normalizeVendorWebsite("localhost")).toBeNull();
    expect(normalizeVendorWebsite("javascript:alert(1)")).toBeNull();
  });
});

describe("CreateVendorSchema · website", () => {
  it("folds a blank website to undefined (never an empty string)", () => {
    const res = CreateVendorSchema.safeParse({ ...base, website: "   " });
    expect(res.success).toBe(true);
    expect(res.success && res.data.website).toBeUndefined();
  });

  it("stores the canonical URL", () => {
    const res = CreateVendorSchema.safeParse({ ...base, website: "carbideindia.com" });
    expect(res.success && res.data.website).toBe("https://carbideindia.com");
  });

  it("rejects something that is not a website", () => {
    const res = CreateVendorSchema.safeParse({ ...base, website: "no website yet" });
    expect(res.success).toBe(false);
  });

  it("saves fine with no website at all — it is not compulsory", () => {
    expect(CreateVendorSchema.safeParse(base).success).toBe(true);
  });
});

describe("CreateVendorSchema · gstin", () => {
  // 27AAPFU0939F1ZV is the GSTN's own documented example number.
  const VALID = "27AAPFU0939F1ZV";

  it("accepts a valid GSTIN", () => {
    const res = CreateVendorSchema.safeParse({ ...base, gstin: VALID });
    expect(res.success && res.data.gstin).toBe(VALID);
  });

  it("normalizes a pasted number (lowercase, spaces, hyphens)", () => {
    const res = CreateVendorSchema.safeParse({ ...base, gstin: " 27-aapfu 0939f1zv " });
    expect(res.success && res.data.gstin).toBe(VALID);
  });

  it("folds a blank GSTIN to undefined", () => {
    const res = CreateVendorSchema.safeParse({ ...base, gstin: "" });
    expect(res.success).toBe(true);
    expect(res.success && res.data.gstin).toBeUndefined();
  });

  it("rejects a wrong check digit", () => {
    expect(CreateVendorSchema.safeParse({ ...base, gstin: "27AAPFU0939F1ZA" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown state code even when the checksum is right", () => {
    // "28" is not a live GSTN state code; the check digit below IS correct, so
    // only the state lookup can reject this.
    expect(CreateVendorSchema.safeParse({ ...base, gstin: "28AAPFU0939F1ZT" }).success).toBe(
      false,
    );
  });

  it("rejects a short number", () => {
    expect(CreateVendorSchema.safeParse({ ...base, gstin: "27AAPFU0939" }).success).toBe(
      false,
    );
  });
});
