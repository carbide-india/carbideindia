import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

const { insertCalls, updateCalls } = vi.hoisted(() => ({
  insertCalls: [] as Record<string, unknown>[],
  updateCalls: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => {
  const insert = vi.fn(() => ({
    values: (v: Record<string, unknown>) => {
      insertCalls.push(v);
      return {
        returning: () =>
          Promise.resolve([{ id: "mtg-1", meetingNo: "MTG1001" }]),
      };
    },
  }));
  const update = vi.fn(() => ({
    set: (v: Record<string, unknown>) => {
      updateCalls.push(v);
      return { where: () => Promise.resolve(undefined) };
    },
  }));
  return { db: { insert, update } };
});

vi.mock("@/lib/auth/current", () => ({
  requireUser: vi.fn(async () => ({ id: "emp-1", isActive: true })),
}));

import {
  createClientMeeting,
  updateClientMeeting,
  setMeetingPurpose,
} from "@/app/(app)/meetings/actions";

const MEETING_UUID = "33333333-3333-4333-8333-333333333333";
const SELFIE = "meeting-selfies/abc123.jpg";

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
});

describe("createClientMeeting", () => {
  it("defaults salesPersonId to the current user and returns the meetingNo", async () => {
    const res = await createClientMeeting({
      companyName: "Acme Tools",
      contactPersonName: "R. Sharma",
      selfieUrl: SELFIE,
    });
    expect(res).toEqual({ ok: true, id: "mtg-1", meetingNo: "MTG1001" });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      salesPersonId: "emp-1",
      companyName: "Acme Tools",
      contactPersonName: "R. Sharma",
      purpose: "regular_order",
      selfieUrl: SELFIE,
      createdById: "emp-1",
    });
    // DB default supplies the meeting number — never sent in the insert.
    expect(insertCalls[0]?.meetingNo).toBeUndefined();
  });

  it("honours an explicit salesPersonId and converts dates", async () => {
    const res = await createClientMeeting({
      salesPersonId: "8f7b2a4e-1c3d-4e5f-9a6b-7c8d9e0f1a2b",
      companyName: "Acme Tools",
      contactPersonName: "R. Sharma",
      meetingDate: "2026-06-12",
      nextFollowUpDate: "2026-07-01",
      selfieUrl: SELFIE,
    });
    expect(res).toEqual({ ok: true, id: "mtg-1", meetingNo: "MTG1001" });
    expect(insertCalls[0]?.salesPersonId).toBe("8f7b2a4e-1c3d-4e5f-9a6b-7c8d9e0f1a2b");
    expect(insertCalls[0]?.meetingDate).toBeInstanceOf(Date);
    expect(insertCalls[0]?.nextFollowUpDate).toBeInstanceOf(Date);
  });

  it("rejects a meeting with no selfie and never touches the db", async () => {
    const res = await createClientMeeting({
      companyName: "Acme Tools",
      contactPersonName: "R. Sharma",
    });
    expect(res.ok).toBe(false);
    expect(insertCalls).toHaveLength(0);
  });
});

describe("updateClientMeeting", () => {
  it("treats an all-empty patch as a no-op", async () => {
    const res = await updateClientMeeting(MEETING_UUID, { meetingNotes: "" });
    expect(res).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(0);
  });

  it("converts ISO date strings to Date columns", async () => {
    const res = await updateClientMeeting(MEETING_UUID, {
      nextFollowUpDate: "2026-07-01",
    });
    expect(res).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.nextFollowUpDate).toBeInstanceOf(Date);
  });
});

describe("setMeetingPurpose", () => {
  it("rejects an invalid purpose without a db write", async () => {
    const res = await setMeetingPurpose(MEETING_UUID, "bogus");
    expect(res).toEqual({ ok: false, error: "Invalid purpose" });
    expect(updateCalls).toHaveLength(0);
  });

  it("updates the purpose for a valid value", async () => {
    const res = await setMeetingPurpose(MEETING_UUID, "upsell");
    expect(res).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ purpose: "upsell" });
  });
});
