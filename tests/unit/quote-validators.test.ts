import { describe, it, expect } from "vitest";
import {
  CreateQuotationSchema,
  UpdateQuotationSchema,
  SetQuotationStatusSchema,
} from "@/lib/validators/quotation";
import {
  CreateNegotiationSchema,
  UpdateNegotiationSchema,
  SetNegotiationStatusSchema,
} from "@/lib/validators/negotiation";
import {
  CreateSalesOrderSchema,
  UpdateSalesOrderSchema,
} from "@/lib/validators/sales-order";

const VALID_UUID = "8f7b2a4e-1c3d-4e5f-9a6b-7c8d9e0f1a2b";

describe("CreateQuotationSchema", () => {
  it("requires a uuid inquiryId and applies first-option defaults", () => {
    expect(CreateQuotationSchema.safeParse({}).success).toBe(false);
    expect(CreateQuotationSchema.safeParse({ inquiryId: "nope" }).success).toBe(false);
    const r = CreateQuotationSchema.safeParse({ inquiryId: VALID_UUID });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.costingDoneStatus).toBe("not_done");
      expect(r.data.quoteSent).toBe(false);
    }
  });

  it("rejects negative money fields", () => {
    expect(
      CreateQuotationSchema.safeParse({ inquiryId: VALID_UUID, finalCost: -1 }).success,
    ).toBe(false);
    expect(
      CreateQuotationSchema.safeParse({ inquiryId: VALID_UUID, quotePrice: -0.5 }).success,
    ).toBe(false);
    expect(
      CreateQuotationSchema.safeParse({ inquiryId: VALID_UUID, finalCost: 100, quotePrice: 250 }).success,
    ).toBe(true);
  });

  it("rejects an unknown costing-done status", () => {
    expect(
      CreateQuotationSchema.safeParse({ inquiryId: VALID_UUID, costingDoneStatus: "done_ish" }).success,
    ).toBe(false);
  });

  it("folds blank quoteNo to undefined", () => {
    const r = CreateQuotationSchema.safeParse({ inquiryId: VALID_UUID, quoteNo: "   " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quoteNo).toBeUndefined();
  });
});

describe("UpdateQuotationSchema", () => {
  it("accepts a single-field patch but rejects an empty one", () => {
    expect(UpdateQuotationSchema.safeParse({ partNo: "P-1" }).success).toBe(true);
    expect(UpdateQuotationSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown keys and bad enums in a patch", () => {
    expect(UpdateQuotationSchema.safeParse({ bogus: 1 }).success).toBe(false);
    expect(UpdateQuotationSchema.safeParse({ costingDoneStatus: "nope" }).success).toBe(false);
  });
});

describe("SetQuotationStatusSchema", () => {
  it("accepts a known status, rejects unknown", () => {
    expect(SetQuotationStatusSchema.safeParse({ status: "done" }).success).toBe(true);
    expect(SetQuotationStatusSchema.safeParse({ status: "to_start" }).success).toBe(false);
  });
});

describe("CreateNegotiationSchema", () => {
  it("requires inquiryId, defaults status to to_start, optional quotationId uuid", () => {
    const r = CreateNegotiationSchema.safeParse({ inquiryId: VALID_UUID });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.negotiationStatus).toBe("to_start");
    expect(
      CreateNegotiationSchema.safeParse({ inquiryId: VALID_UUID, quotationId: "nope" }).success,
    ).toBe(false);
    expect(
      CreateNegotiationSchema.safeParse({ inquiryId: VALID_UUID, quotationId: VALID_UUID }).success,
    ).toBe(true);
  });

  it("rejects negative negotiation money and unknown status", () => {
    expect(
      CreateNegotiationSchema.safeParse({ inquiryId: VALID_UUID, negotiation: -3 }).success,
    ).toBe(false);
    expect(
      CreateNegotiationSchema.safeParse({ inquiryId: VALID_UUID, negotiationStatus: "won" }).success,
    ).toBe(false);
  });
});

describe("UpdateNegotiationSchema / SetNegotiationStatusSchema", () => {
  it("rejects empty patch, accepts notes patch", () => {
    expect(UpdateNegotiationSchema.safeParse({}).success).toBe(false);
    expect(UpdateNegotiationSchema.safeParse({ negotiationNotes: "Asked for 10% off" }).success).toBe(true);
  });
  it("validates the set-status enum", () => {
    expect(SetNegotiationStatusSchema.safeParse({ status: "order_won" }).success).toBe(true);
    expect(SetNegotiationStatusSchema.safeParse({ status: "done" }).success).toBe(false);
  });
});

describe("CreateSalesOrderSchema / UpdateSalesOrderSchema", () => {
  it("requires inquiryId, defaults customerSoSent false, optional quotationId", () => {
    const r = CreateSalesOrderSchema.safeParse({ inquiryId: VALID_UUID });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.customerSoSent).toBe(false);
    expect(CreateSalesOrderSchema.safeParse({ inquiryId: VALID_UUID, quotationId: "x" }).success).toBe(false);
  });

  it("rejects negative quotePrice and empty patch", () => {
    expect(
      CreateSalesOrderSchema.safeParse({ inquiryId: VALID_UUID, quotePrice: -1 }).success,
    ).toBe(false);
    expect(UpdateSalesOrderSchema.safeParse({}).success).toBe(false);
    expect(UpdateSalesOrderSchema.safeParse({ customerPoNo: "PO-7" }).success).toBe(true);
  });
});
