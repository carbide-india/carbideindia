import { describe, it, expect, vi, beforeEach } from "vitest";

// The shared commit engine imports "server-only"; neutralise it under vitest.
vi.mock("server-only", () => ({}));

const createInquiry = vi.fn();
const createMasterOptionsBulk = vi.fn(async (_input: unknown) => ({ ok: true as const, created: 1, skipped: 0 }));
const listMasterOptions = vi.fn(async (_kind: unknown) => [{ id: "gNew", name: "WC99" }]);
vi.mock("@/app/(app)/inquiries/actions", () => ({ createInquiry: (...a: unknown[]) => createInquiry(...a) }));
vi.mock("@/lib/auth/current", () => ({ requireAdmin: vi.fn(async () => ({ id: "admin1" })) }));
vi.mock("@/app/(admin)/admin/masters/actions", () => ({ createMasterOptionsBulk: (a: unknown) => createMasterOptionsBulk(a) }));
vi.mock("@/lib/queries/masters", () => ({ listMasterOptions: (a: unknown) => listMasterOptions(a) }));

import { commitEnquiryImport } from "@/app/(app)/inquiries/import/actions";

beforeEach(() => { createInquiry.mockReset().mockResolvedValue({ ok: true, smNumber: "SM9600" }); });

describe("commitEnquiryImport", () => {
  it("creates one inquiry per valid row and tallies", async () => {
    const res = await commitEnquiryImport([
      { companyName: "Acme", productDescription: "insert", gradeId: "g1" },
      { companyName: "Beta", productDescription: "rod" },
    ]);
    expect(createInquiry).toHaveBeenCalledTimes(2);
    expect(res.created).toBe(2);
  });

  it("injects priority/currency/country defaults", async () => {
    await commitEnquiryImport([{ companyName: "Acme", productDescription: "insert" }]);
    const arg = createInquiry.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.priority).toBe("normal");
    expect(arg.currency).toBe("INR");
    expect(arg.country).toBe("India");
    // clientMode "new" is REQUIRED by CreateInquirySchema (no default) — without
    // this every imported row would fail validation and silently import nothing.
    expect(arg.clientMode).toBe("new");
  });

  it("creates a staged master then links its new id", async () => {
    await commitEnquiryImport([
      { companyName: "Acme", productDescription: "insert", gradeId: { __createMaster: { kind: "grade", name: "WC99" } } },
    ]);
    expect(createMasterOptionsBulk).toHaveBeenCalledWith({ kind: "internal_grade", names: ["WC99"] });
    const arg = createInquiry.mock.calls[0]![0] as { gradeId?: string };
    expect(arg.gradeId).toBe("gNew");
  });
});
