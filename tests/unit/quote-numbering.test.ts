import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

// Insert/select recorders, hoisted so the vi.mock factory can close over them.
// Each create action issues one db.select(...) — the per-inquiry row count —
// awaited directly off where(); the smNumber + snapshot arrive from the mocked
// getQuoteAutofill, so no inquiry lookup hits the db here.
const { insertCalls, insertErrors, selectQueue, selectSpy } = vi.hoisted(() => ({
  insertCalls: [] as Record<string, unknown>[],
  insertErrors: [] as (Record<string, unknown> | null)[],
  selectQueue: [] as unknown[][],
  selectSpy: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const insert = vi.fn(() => ({
    values: (v: Record<string, unknown>) => {
      insertCalls.push(v);
      return {
        returning: () => {
          const err = insertErrors.shift() ?? null;
          if (err) return Promise.reject(err);
          return Promise.resolve([{ id: "row-1" }]);
        },
      };
    },
  }));
  const update = vi.fn(() => ({
    set: () => ({ where: () => Promise.resolve(undefined) }),
  }));
  const select = selectSpy.mockImplementation(() => ({
    from: () => ({
      where: () => {
        const rows = selectQueue.shift() ?? [];
        return {
          limit: () => Promise.resolve(rows),
          then: (
            resolve: (v: unknown) => unknown,
            reject?: (e: unknown) => unknown,
          ) => Promise.resolve(rows).then(resolve, reject),
        };
      },
      // lib/queries/negotiations.ts builds a grouped SUBQUERY at module scope,
      // so importing the action under test evaluates this chain immediately —
      // before any test runs. It only needs to not throw; nothing reads it here.
      groupBy: () => ({ as: (alias: string) => ({ alias }) }),
    }),
  }));
  // createQuotation/createNegotiation/createSalesOrder wrap the header + line
  // inserts in db.transaction(cb); the tx exposes the same insert/update/select.
  const txDb = { insert, update, select };
  return {
    db: {
      insert,
      update,
      select,
      transaction: vi.fn(async (cb: (tx: typeof txDb) => unknown) => cb(txDb)),
    },
  };
});

vi.mock("@/lib/auth/current", () => ({
  requireUser: vi.fn(async () => ({ id: "emp-1", isActive: true })),
}));

const AUTOFILL: {
  smNumber: string;
  companyName: string | null;
  enquiryDate: Date | null;
  salesPersonId: string | null;
  salesPersonName: string | null;
  productDescription: string | null;
  quantityNos: string | null;
  gradeName: string | null;
  toleranceName: string | null;
  conditionName: string | null;
} = {
  smNumber: "SM9579",
  companyName: "Acme Carbide",
  enquiryDate: new Date("2026-06-01T00:00:00Z"),
  salesPersonId: "sp-1",
  salesPersonName: "Manan",
  productDescription: "Tungsten insert",
  quantityNos: "500",
  gradeName: "K20",
  toleranceName: "h6",
  conditionName: "Ground",
};

const getQuoteAutofill = vi.fn<() => Promise<typeof AUTOFILL | null>>(
  async () => AUTOFILL,
);
const getQuotationAutofill = vi.fn<() => Promise<unknown | null>>(
  async () => null,
);
vi.mock("@/lib/queries/quotes", () => ({
  getQuoteAutofill: (...a: unknown[]) => getQuoteAutofill(...(a as [])),
  getQuotationAutofill: (...a: unknown[]) => getQuotationAutofill(...(a as [])),
}));

import { createQuotation } from "@/app/(app)/quotations/actions";
import { createNegotiation } from "@/app/(app)/negotiations/actions";
import { createSalesOrder } from "@/app/(app)/sales-orders/actions";

const INQUIRY_UUID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  insertCalls.length = 0;
  insertErrors.length = 0;
  selectQueue.length = 0;
  selectSpy.mockClear();
  getQuoteAutofill.mockClear();
  getQuoteAutofill.mockResolvedValue(AUTOFILL);
  getQuotationAutofill.mockClear();
  getQuotationAutofill.mockResolvedValue(null);
});

describe("createQuotation", () => {
  it("derives quoteNo SM9579-Q01 and copies the autofetch snapshot", async () => {
    selectQueue.push([{ n: 0 }]); // existing quotations count
    // The costing hard-gate is off here on purpose: this fixture's autofill
    // carries no inquiry_item, so every line would be blocked for want of a
    // locked costing and the test would stop being about NUMBERING. The gate
    // has its own coverage.
    const res = await createQuotation(
      { inquiryId: INQUIRY_UUID },
      { enforceCostingGate: false },
    );
    expect(res).toEqual({ ok: true, id: "row-1", quoteNo: "SM9579-Q01" });

    // Header inserts are objects; the quotation_items line insert pushes an
    // array — filter it out so we assert on the header row only.
    const headerInserts = insertCalls.filter((c) => !Array.isArray(c));
    expect(headerInserts).toHaveLength(1);
    expect(headerInserts[0]).toMatchObject({
      inquiryId: INQUIRY_UUID,
      quoteNo: "SM9579-Q01",
      companyName: "Acme Carbide",
      custProductName: "Tungsten insert",
      qty: "500",
      gradeCustomer: "K20",
      tolerance: "h6",
      condition: "Ground",
      costingDoneStatus: "not_done",
      quoteSent: false,
      createdById: "emp-1",
    });
  });

  it("bumps the suffix and retries on a 23505 collision", async () => {
    selectQueue.push([{ n: 0 }]);
    insertErrors.push({ code: "23505", constraint: "quotations_quote_no_unique" });
    const res = await createQuotation(
      { inquiryId: INQUIRY_UUID },
      { enforceCostingGate: false }, // same reason as above
    );
    expect(res).toEqual({ ok: true, id: "row-1", quoteNo: "SM9579-Q02" });
    const headerInserts = insertCalls.filter((c) => !Array.isArray(c));
    expect(headerInserts).toHaveLength(2);
    expect(headerInserts[0]?.quoteNo).toBe("SM9579-Q01");
    expect(headerInserts[1]?.quoteNo).toBe("SM9579-Q02");
  });

  it("errors when the linked enquiry is missing", async () => {
    getQuoteAutofill.mockResolvedValueOnce(null);
    const res = await createQuotation({ inquiryId: INQUIRY_UUID });
    expect(res).toEqual({ ok: false, error: "Linked enquiry not found." });
    expect(insertCalls).toHaveLength(0);
  });
});

describe("createNegotiation", () => {
  it("derives negotiationNo SM9579-N01 and copies the snapshot", async () => {
    selectQueue.push([{ n: 0 }]);
    const res = await createNegotiation({ inquiryId: INQUIRY_UUID });
    expect(res).toEqual({ ok: true, id: "row-1", negotiationNo: "SM9579-N01" });
    expect(insertCalls[0]).toMatchObject({
      inquiryId: INQUIRY_UUID,
      negotiationNo: "SM9579-N01",
      companyName: "Acme Carbide",
      salesPersonId: "sp-1",
      custProductName: "Tungsten insert",
      qty: "500",
      negotiationStatus: "to_start",
    });
  });
});

describe("createSalesOrder", () => {
  it("derives soNo SM9579-SO01 and copies the snapshot", async () => {
    selectQueue.push([{ n: 0 }]);
    const res = await createSalesOrder({ inquiryId: INQUIRY_UUID });
    expect(res).toEqual({ ok: true, id: "row-1", soNo: "SM9579-SO01" });
    expect(insertCalls[0]).toMatchObject({
      inquiryId: INQUIRY_UUID,
      soNo: "SM9579-SO01",
      companyName: "Acme Carbide",
      salesPersonId: "sp-1",
      custProductName: "Tungsten insert",
      qty: "500",
      customerSoSent: false,
    });
  });
});
