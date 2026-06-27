import { describe, it, expect } from "vitest";
import {
  ClientAddressSchema,
  ClientBankAccountSchema,
  CreateClientKycSchema,
} from "@/lib/validators/client-kyc";

describe("ClientAddressSchema", () => {
  it("accepts a registered address", () => {
    const result = ClientAddressSchema.safeParse({
      addressType: "registered",
      line1: "W-150(A) MIDC Ambad",
      city: "Nashik",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.addressType).toBe("registered");
      expect(result.data.line1).toBe("W-150(A) MIDC Ambad");
      expect(result.data.city).toBe("Nashik");
    }
  });

  it("folds blank text fields to undefined", () => {
    const result = ClientAddressSchema.safeParse({
      addressType: "bill_to",
      line1: "   ",
      city: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.line1).toBeUndefined();
      expect(result.data.city).toBeUndefined();
    }
  });

  it("rejects a bad addressType", () => {
    const result = ClientAddressSchema.safeParse({ addressType: "warehouse" });
    expect(result.success).toBe(false);
  });

  it("coerces isPrimary truthy values", () => {
    const result = ClientAddressSchema.safeParse({
      addressType: "ship_to",
      isPrimary: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isPrimary).toBe(true);
  });
});

describe("ClientBankAccountSchema", () => {
  it("accepts a bank account and folds blanks", () => {
    const result = ClientBankAccountSchema.safeParse({
      bankName: "State Bank of India",
      ifsc: "SBIN0001234",
      branch: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bankName).toBe("State Bank of India");
      expect(result.data.branch).toBeUndefined();
    }
  });
});

describe("CreateClientKycSchema — addresses / bank / GST fields", () => {
  it("accepts optional addresses[], bankAccounts[], and gstRegistrationType", () => {
    const result = CreateClientKycSchema.safeParse({
      name: "Test Corp",
      gstRegistrationType: "regular",
      placeOfSupply: "Maharashtra",
      isTransporter: "true",
      addresses: [
        { addressType: "registered", line1: "Plot 1", city: "Nashik" },
        { addressType: "ship_to", line1: "Plot 2" },
      ],
      bankAccounts: [{ bankName: "SBI", ifsc: "SBIN0001234" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gstRegistrationType).toBe("regular");
      expect(result.data.placeOfSupply).toBe("Maharashtra");
      expect(result.data.isTransporter).toBe(true);
      expect(result.data.addresses).toHaveLength(2);
      expect(result.data.bankAccounts).toHaveLength(1);
    }
  });

  it("rejects a bad gstRegistrationType", () => {
    const result = CreateClientKycSchema.safeParse({
      name: "Test Corp",
      gstRegistrationType: "made_up",
    });
    expect(result.success).toBe(false);
  });

  it("still parses with the new fields omitted (backward compat)", () => {
    const result = CreateClientKycSchema.safeParse({ name: "Test Corp" });
    expect(result.success).toBe(true);
  });
});
