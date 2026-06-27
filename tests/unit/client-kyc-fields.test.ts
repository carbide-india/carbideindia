import { describe, it, expect } from "vitest";
import { CreateClientKycSchema } from "@/lib/validators/client-kyc";
import { toOptionalNumber } from "@/lib/form-utils";

const BASE = {
  name: "Test Corp",
};

describe("CreateClientKycSchema — credit / bank / ship fields", () => {
  it("coerces creditDays string to integer", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, creditDays: "45" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.creditDays).toBe(45);
  });

  it("coerces creditLimit string to number", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, creditLimit: "500000" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.creditLimit).toBe(500000);
  });

  it("rejects negative creditDays", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, creditDays: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects fractional creditDays", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, creditDays: 30.5 });
    expect(result.success).toBe(false);
  });

  it("rejects negative creditLimit", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, creditLimit: -100 });
    expect(result.success).toBe(false);
  });

  it("accepts bankName text and stores it", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, bankName: "State Bank of India" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bankName).toBe("State Bank of India");
  });

  it("folds blank bankName to undefined", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, bankName: "  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bankName).toBeUndefined();
  });

  it("accepts bankIfsc text and stores it", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, bankIfsc: "SBIN0001234" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bankIfsc).toBe("SBIN0001234");
  });

  it("accepts bankAccountNo text and stores it", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, bankAccountNo: "1234567890" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bankAccountNo).toBe("1234567890");
  });

  it("accepts bankBranch text and stores it", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, bankBranch: "Nashik Main" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.bankBranch).toBe("Nashik Main");
  });

  it("accepts bankAccountHolder text and stores it", () => {
    const result = CreateClientKycSchema.safeParse({
      ...BASE,
      bankAccountHolder: "Yogeshwar Engineering Pvt Ltd",
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.bankAccountHolder).toBe("Yogeshwar Engineering Pvt Ltd");
  });

  it("accepts shipToAddress text and stores it", () => {
    const result = CreateClientKycSchema.safeParse({
      ...BASE,
      shipToAddress: "W-150(A) MIDC Ambad, Nashik",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shipToAddress).toBe("W-150(A) MIDC Ambad, Nashik");
  });

  it("folds blank shipToAddress to undefined", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, shipToAddress: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shipToAddress).toBeUndefined();
  });

  it("accepts transporter text and stores it", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, transporter: "Gati Express" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.transporter).toBe("Gati Express");
  });

  it("accepts otherReferences text and stores it", () => {
    const result = CreateClientKycSchema.safeParse({
      ...BASE,
      otherReferences: "PO-2026-001",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.otherReferences).toBe("PO-2026-001");
  });

  it("accepts msmeUdyamNo text and stores it", () => {
    const result = CreateClientKycSchema.safeParse({
      ...BASE,
      msmeUdyamNo: "UDYAM-MH-27-0012345",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.msmeUdyamNo).toBe("UDYAM-MH-27-0012345");
  });

  it("folds blank msmeUdyamNo to undefined", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, msmeUdyamNo: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.msmeUdyamNo).toBeUndefined();
  });

  it("omitting all new fields still parses successfully (backward compat)", () => {
    const result = CreateClientKycSchema.safeParse(BASE);
    expect(result.success).toBe(true);
  });

  it("schema accepts creditDays: undefined (cleared field)", () => {
    const result = CreateClientKycSchema.safeParse({ ...BASE, creditDays: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.creditDays).toBeUndefined();
  });
});

describe("toOptionalNumber — empty-field coercion helper", () => {
  it('returns undefined for empty string ""', () => {
    expect(toOptionalNumber("")).toBeUndefined();
  });

  it("returns undefined for NaN", () => {
    expect(toOptionalNumber(NaN)).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(toOptionalNumber(null)).toBeUndefined();
  });

  it("returns 30 for numeric input 30", () => {
    expect(toOptionalNumber(30)).toBe(30);
  });
});
