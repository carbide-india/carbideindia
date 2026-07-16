import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  // lib/queries/clients.ts wraps listActiveClientNames in unstable_cache;
  // under vitest just pass the function straight through (no caching).
  unstable_cache: (fn: unknown) => fn,
}));
// createClientKyc now imports lib/clients/dedup, which `import "server-only"`.
// Neutralise it under vitest (the dedup guard early-returns with no GSTIN/PAN).
vi.mock("server-only", () => ({}));

// Recorders, hoisted so the vi.mock factory below can close over them.
// Insert rows are identified by shape: name → clients, firstName → contacts.
// `selectQueue` feeds successive tx.select(...) calls in order — KYC create
// issues (1) the upsert-by-lower(name) duplicate check then, when contact
// fields are present, (2) the primary-contact lookup.
const { insertCalls, updateCalls, selectQueue, txSpy } = vi.hoisted(() => ({
  insertCalls: [] as Record<string, unknown>[],
  updateCalls: [] as Record<string, unknown>[],
  selectQueue: [] as unknown[][],
  txSpy: vi.fn(),
}));

// Same tx-capable mock pattern as tests/unit/inquiry-create-action.test.ts:
// `db.transaction(cb)` invokes the callback with a tx exposing the same
// select/insert/update surface as `db`. The clientContacts insert is awaited
// without `.returning()`, so the values() builder is also thenable.
vi.mock("@/lib/db", () => {
  const insert = vi.fn(() => ({
    values: (v: Record<string, unknown>) => {
      insertCalls.push(v);
      return {
        returning: () => {
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
  const select = vi.fn(() => ({
    from: () => ({
      where: () => {
        const rows = selectQueue.shift() ?? [];
        return { limit: () => Promise.resolve(rows) };
      },
    }),
  }));
  // createClientKyc replace-alls normalized children when addresses/bank are
  // submitted — the tx exposes delete() too (a no-op recorder here).
  const del = vi.fn(() => ({ where: () => Promise.resolve(undefined) }));
  const txDb = { insert, update, select, delete: del };
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

import { createClientKyc, updateClientKyc } from "@/app/(app)/clients/actions";

const TYPE_UUID = "8f7b2a4e-1c3d-4e5f-9a6b-7c8d9e0f1a2b";
const CLIENT_UUID = "44444444-4444-4444-8444-444444444444";

const baseInput = {
  name: "Acme Carbides",
  customerTypeIds: [TYPE_UUID],
  industryTypeIds: [TYPE_UUID],
  productTypeIds: [TYPE_UUID],
  export: false,
  currency: "INR" as const,
  country: "India" as const,
  state: "Maharashtra",
  city: "Nashik",
  addressLine1: "Plot 4, MIDC Ambad",
  pinCode: "422010",
  contactFirstName: "Ravi",
  contactLastName: "Sharma",
  contactNo: "9876543210",
  contactEmail: "ravi@acme.example",
  meetingDate: "2026-06-12",
  meetingStart: "10:30",
  meetingEnd: "11:15",
};

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  selectQueue.length = 0;
  txSpy.mockClear();
});

describe("createClientKyc", () => {
  it("inserts a new client with KYC + meeting fields and a primary contact row", async () => {
    selectQueue.push([]); // no existing client by lower(name)
    const res = await createClientKyc(baseInput);
    expect(res).toEqual({ ok: true, id: "client-new-1" });

    const clientInsert = insertCalls.find((v) => "name" in v);
    expect(clientInsert).toMatchObject({
      name: "Acme Carbides",
      customerTypeIds: [TYPE_UUID],
      industryTypeIds: [TYPE_UUID],
      // Legacy singular column mirrored to the first selection.
      customerTypeId: TYPE_UUID,
      industryTypeId: TYPE_UUID,
      productTypeIds: [TYPE_UUID],
      export: false,
      currency: "INR",
      country: "India",
      state: "Maharashtra",
      city: "Nashik",
      addressLine1: "Plot 4, MIDC Ambad",
      pinCode: "422010",
      kycMeetingStart: "10:30",
      kycMeetingEnd: "11:15",
    });
    expect(clientInsert?.kycMeetingDate).toBeInstanceOf(Date);

    const contactInsert = insertCalls.find((v) => "firstName" in v);
    expect(contactInsert).toMatchObject({
      clientId: "client-new-1",
      firstName: "Ravi",
      lastName: "Sharma",
      contactNo: "9876543210",
      email: "ravi@acme.example",
    });
  });

  it("updates an existing client by lower(name) instead of inserting a duplicate", async () => {
    selectQueue.push([{ id: "client-existing-1" }]); // existing client
    selectQueue.push([{ id: "contact-existing-1" }]); // existing primary contact
    const res = await createClientKyc(baseInput);
    expect(res).toEqual({ ok: true, id: "client-existing-1" });

    expect(insertCalls.find((v) => "name" in v)).toBeUndefined();
    expect(insertCalls.find((v) => "firstName" in v)).toBeUndefined();

    // Client KYC fields land as an update; contact fields update the primary row.
    const clientUpdate = updateCalls.find((v) => "kycMeetingStart" in v);
    expect(clientUpdate).toMatchObject({
      customerTypeIds: [TYPE_UUID],
      customerTypeId: TYPE_UUID,
      city: "Nashik",
      kycMeetingStart: "10:30",
    });
    const contactUpdate = updateCalls.find((v) => "firstName" in v);
    expect(contactUpdate).toMatchObject({ firstName: "Ravi", email: "ravi@acme.example" });
  });

  it("inserts the primary contact when the existing client has none", async () => {
    selectQueue.push([{ id: "client-existing-1" }]); // existing client
    selectQueue.push([]); // no primary contact yet
    const res = await createClientKyc(baseInput);
    expect(res).toEqual({ ok: true, id: "client-existing-1" });

    const contactInsert = insertCalls.find((v) => "firstName" in v);
    expect(contactInsert).toMatchObject({ clientId: "client-existing-1", firstName: "Ravi" });
  });

  it("rejects a payload without a name before touching the db", async () => {
    const res = await createClientKyc({ ...baseInput, name: "" });
    expect(res.ok).toBe(false);
    expect(txSpy).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("rejects a malformed meeting time before touching the db", async () => {
    const res = await createClientKyc({ ...baseInput, meetingStart: "9.30 am" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/HH:MM/);
    expect(txSpy).not.toHaveBeenCalled();
  });
});

describe("updateClientKyc", () => {
  it("rejects an empty patch", async () => {
    const res = await updateClientKyc(CLIENT_UUID, {});
    expect(res.ok).toBe(false);
    expect(txSpy).not.toHaveBeenCalled();
  });

  it("writes a partial client patch with meeting date conversion", async () => {
    const res = await updateClientKyc(CLIENT_UUID, {
      city: "Pune",
      meetingDate: "2026-06-20",
    });
    expect(res).toEqual({ ok: true });
    const clientUpdate = updateCalls.find((v) => "city" in v);
    expect(clientUpdate).toMatchObject({ city: "Pune" });
    expect(clientUpdate?.kycMeetingDate).toBeInstanceOf(Date);
  });
});
