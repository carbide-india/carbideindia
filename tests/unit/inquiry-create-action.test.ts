import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

// Recorders, hoisted so the vi.mock factory below can close over them.
// Insert rows are identified by shape (no table identity needed):
//   productDescription → inquiries, firstName → client_contacts, name → clients.
const { insertCalls, updateCalls, selectState, txSpy } = vi.hoisted(() => ({
  insertCalls: [] as Record<string, unknown>[],
  updateCalls: [] as Record<string, unknown>[],
  // Rows returned by the upsert-by-name duplicate check
  // (tx.select(...).from(clients).where(lower(name)=...).limit(1)).
  selectState: { rows: [] as unknown[], calls: 0 },
  txSpy: vi.fn(),
}));

// `db.transaction(cb)` invokes the callback with a tx object exposing the
// same select/insert/update surface as `db` — same pattern as
// tests/unit/task-actions-create-edit.test.ts. The clientContacts insert is
// awaited without `.returning()`, so the values() builder is also thenable.
vi.mock("@/lib/db", () => {
  const insert = vi.fn(() => ({
    values: (v: Record<string, unknown>) => {
      insertCalls.push(v);
      return {
        returning: () => {
          if ("productDescription" in v) {
            return Promise.resolve([{ id: "inq-1", smNumber: "SM9579" }]);
          }
          if ("firstName" in v) return Promise.resolve([{ id: "contact-1" }]);
          return Promise.resolve([{ id: "client-new-1" }]);
        },
        then: (resolve: (v: unknown) => unknown) => resolve(undefined),
      };
    },
  }));
  const update = vi.fn(() => ({
    set: (v: Record<string, unknown>) => {
      updateCalls.push(v);
      return { where: () => Promise.resolve(undefined) };
    },
  }));
  const select = vi.fn(() => {
    selectState.calls += 1;
    return {
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(selectState.rows) }),
      }),
    };
  });
  const txDb = { insert, update, select };
  return {
    db: {
      insert,
      update,
      select,
      transaction: txSpy.mockImplementation(
        async (cb: (tx: typeof txDb) => unknown) => cb(txDb),
      ),
    },
  };
});

vi.mock("@/lib/auth/current", () => ({
  requireUser: vi.fn(async () => ({ id: "emp-1", isActive: true })),
}));

import {
  createInquiry,
  setEnquiryStatus,
  saveFeasibility,
} from "@/app/(app)/inquiries/actions";

// RFC-4122-shaped (zod v4 .uuid() checks version/variant nibbles).
const VALID_UUID = "22222222-2222-4222-8222-222222222222";

const baseInput = {
  clientMode: "new" as const,
  enquiryDate: "2026-06-11",
  priority: "normal" as const,
  source: "email" as const,
  companyName: "Acme Carbides",
  export: false,
  currency: "INR" as const,
  country: "India" as const,
  city: "Nashik",
  addressLine1: "Plot 4, MIDC Ambad",
  pinCode: "422010",
  contactFirstName: "Ravi",
  contactLastName: "Sharma",
  contactNo: "9876543210",
  contactEmail: "ravi@acme.example",
  productDescription: "Tungsten carbide bush, OD 20.5",
  quantityNos: 50,
  quantityUom: "Nos" as const,
  shape: "Cylinder - Reg" as const,
  outerDia: 20.5,
};

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  selectState.rows = [];
  selectState.calls = 0;
  txSpy.mockClear();
});

describe("createInquiry", () => {
  it("new-client mode inserts client + contact + inquiry snapshot and returns SM number", async () => {
    const res = await createInquiry(baseInput);
    expect(res).toEqual({ ok: true, id: "inq-1", smNumber: "SM9579" });

    const clientInsert = insertCalls.find((v) => "name" in v);
    expect(clientInsert).toMatchObject({
      name: "Acme Carbides",
      export: false,
      currency: "INR",
      country: "India",
      city: "Nashik",
      addressLine1: "Plot 4, MIDC Ambad",
      pinCode: "422010",
    });

    const contactInsert = insertCalls.find((v) => "firstName" in v);
    expect(contactInsert).toMatchObject({
      clientId: "client-new-1",
      firstName: "Ravi",
      lastName: "Sharma",
      contactNo: "9876543210",
      email: "ravi@acme.example",
    });

    const inquiryInsert = insertCalls.find((v) => "productDescription" in v);
    expect(inquiryInsert).toMatchObject({
      clientId: "client-new-1",
      companyName: "Acme Carbides",
      contactFirstName: "Ravi",
      contactEmail: "ravi@acme.example",
      productDescription: "Tungsten carbide bush, OD 20.5",
      priority: "normal",
      source: "email",
      quantityNos: "50", // numeric column → String()
      quantityUom: "Nos",
      outerDia: "20.5",
      shape: "Cylinder - Reg",
      createdById: "emp-1",
    });
    expect(inquiryInsert?.enquiryDate).toBeInstanceOf(Date);
  });

  it("new-client mode reuses an existing client by name (no clients insert)", async () => {
    selectState.rows = [{ id: "client-existing-1" }];
    const res = await createInquiry(baseInput);
    expect(res).toMatchObject({ ok: true, id: "inq-1", smNumber: "SM9579" });

    expect(insertCalls.find((v) => "name" in v)).toBeUndefined();
    expect(insertCalls.find((v) => "firstName" in v)).toBeUndefined();
    const inquiryInsert = insertCalls.find((v) => "productDescription" in v);
    expect(inquiryInsert?.clientId).toBe("client-existing-1");
  });

  it("old-client mode passes clientId through without touching clients", async () => {
    const res = await createInquiry({
      ...baseInput,
      clientMode: "old",
      clientId: VALID_UUID,
    });
    expect(res).toMatchObject({ ok: true, id: "inq-1", smNumber: "SM9579" });

    expect(selectState.calls).toBe(0);
    expect(insertCalls).toHaveLength(1);
    const inquiryInsert = insertCalls[0];
    expect(inquiryInsert?.clientId).toBe(VALID_UUID);
    expect(inquiryInsert?.companyName).toBe("Acme Carbides");
  });

  it("rejects a payload without companyName before touching the db", async () => {
    const res = await createInquiry({ ...baseInput, companyName: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/company name/i);
    expect(txSpy).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("rejects an unparseable enquiryDate before touching the db", async () => {
    const res = await createInquiry({ ...baseInput, enquiryDate: "not-a-date" });
    expect(res).toEqual({ ok: false, error: "Invalid enquiry date" });
    expect(txSpy).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
  });
});

describe("setEnquiryStatus", () => {
  it("rejects an invalid status string without a db write", async () => {
    const res = await setEnquiryStatus(VALID_UUID, "bogus");
    expect(res).toEqual({ ok: false, error: "Invalid status" });
    expect(updateCalls).toHaveLength(0);
  });

  it("updates enquiryStatus for a valid status", async () => {
    const res = await setEnquiryStatus(VALID_UUID, "initiated");
    expect(res).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ enquiryStatus: "initiated" });
  });
});

describe("saveFeasibility", () => {
  it("treats an all-empty patch ({feasGradeAppNotes: ''}) as a no-op", async () => {
    // OptionalText folds "" → undefined after the nonempty refine passes,
    // so nothing remains to write — the action must short-circuit.
    const res = await saveFeasibility(VALID_UUID, { feasGradeAppNotes: "" });
    expect(res).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(0);
  });

  it("writes surviving fields when the patch has real values", async () => {
    const res = await saveFeasibility(VALID_UUID, {
      feasGradeVerdict: "available",
      feasGradeAppNotes: "",
    });
    expect(res).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ feasGradeVerdict: "available" });
    expect(updateCalls[0]).not.toHaveProperty("feasGradeAppNotes");
  });
});
