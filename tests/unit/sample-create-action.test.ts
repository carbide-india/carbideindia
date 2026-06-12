import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

// Recorders, hoisted so the vi.mock factory below can close over them.
// `selectQueue` feeds successive db.select(...) calls in order — createSample
// issues (1) the linked inquiry's smNumber lookup (.where().limit(1)) then
// (2) the per-inquiry sample count (.where() awaited directly), so the
// builder returned by where() is both thenable and .limit()-able.
const { insertCalls, insertErrors, updateCalls, selectQueue, selectSpy } = vi.hoisted(() => ({
  insertCalls: [] as Record<string, unknown>[],
  // One entry consumed per insert attempt; null → insert succeeds.
  insertErrors: [] as (Record<string, unknown> | null)[],
  updateCalls: [] as Record<string, unknown>[],
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
          return Promise.resolve([{ id: "sample-1" }]);
        },
      };
    },
  }));
  const update = vi.fn(() => ({
    set: (v: Record<string, unknown>) => {
      updateCalls.push(v);
      return { where: () => Promise.resolve(undefined) };
    },
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
    }),
  }));
  return { db: { insert, update, select } };
});

vi.mock("@/lib/auth/current", () => ({
  requireUser: vi.fn(async () => ({ id: "emp-1", isActive: true })),
}));

import { createSample, updateSample, setSampleStatus } from "@/app/(app)/samples/actions";

const INQUIRY_UUID = "22222222-2222-4222-8222-222222222222";
const SAMPLE_UUID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  insertCalls.length = 0;
  insertErrors.length = 0;
  updateCalls.length = 0;
  selectQueue.length = 0;
  selectSpy.mockClear();
});

describe("createSample", () => {
  it("derives the sampleNo from the linked enquiry's SM number (count 0 → -01)", async () => {
    selectQueue.push([{ smNumber: "SM9579" }]); // inquiry lookup
    selectQueue.push([{ n: 0 }]); // existing samples count
    const res = await createSample({ inquiryId: INQUIRY_UUID });
    expect(res).toEqual({ ok: true, id: "sample-1", sampleNo: "SM9579-01" });

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      inquiryId: INQUIRY_UUID,
      sampleNo: "SM9579-01",
      location: "AYK Cabin",
      sampleStatus: "received",
      dimensionStatus: "not_started",
      createdById: "emp-1",
    });
  });

  it("bumps the suffix and retries when the derived sampleNo collides (23505)", async () => {
    selectQueue.push([{ smNumber: "SM9579" }]);
    selectQueue.push([{ n: 0 }]);
    insertErrors.push({ code: "23505", constraint: "samples_sample_no_unique" });
    const res = await createSample({ inquiryId: INQUIRY_UUID });
    expect(res).toEqual({ ok: true, id: "sample-1", sampleNo: "SM9579-02" });

    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]?.sampleNo).toBe("SM9579-01");
    expect(insertCalls[1]?.sampleNo).toBe("SM9579-02");
  });

  it("rejects an unlinked sample without a sampleNo before touching the db", async () => {
    const res = await createSample({});
    expect(res).toEqual({
      ok: false,
      error: "Sample No is required when no enquiry is linked.",
    });
    expect(selectSpy).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
  });

  it("passes an explicit sampleNo through untouched (no derivation reads)", async () => {
    const res = await createSample({ sampleNo: "CUST-OLD-7" });
    expect(res).toEqual({ ok: true, id: "sample-1", sampleNo: "CUST-OLD-7" });
    expect(selectSpy).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.sampleNo).toBe("CUST-OLD-7");
  });
});

describe("updateSample", () => {
  it("treats an all-empty patch ({sampleNotes: ''}) as a no-op", async () => {
    const res = await updateSample(SAMPLE_UUID, { sampleNotes: "" });
    expect(res).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(0);
  });

  it("converts ISO date strings to Date columns", async () => {
    const res = await updateSample(SAMPLE_UUID, {
      dimensionStatus: "done",
      dimensionCompletedOn: "2026-06-12",
    });
    expect(res).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ dimensionStatus: "done" });
    expect(updateCalls[0]?.dimensionCompletedOn).toBeInstanceOf(Date);
  });
});

describe("setSampleStatus", () => {
  it("rejects an invalid status string without a db write", async () => {
    const res = await setSampleStatus(SAMPLE_UUID, "bogus");
    expect(res).toEqual({ ok: false, error: "Invalid status" });
    expect(updateCalls).toHaveLength(0);
  });

  it("updates sampleStatus for a valid status", async () => {
    const res = await setSampleStatus(SAMPLE_UUID, "processed");
    expect(res).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ sampleStatus: "processed" });
  });
});
