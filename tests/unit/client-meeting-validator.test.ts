import { describe, it, expect } from "vitest";
import {
  CreateClientMeetingSchema,
  UpdateClientMeetingSchema,
  SetMeetingPurposeSchema,
} from "@/lib/validators/client-meeting";

const SELFIE = "meeting-selfies/abc123.jpg";

/** Minimal payload that should pass Create (company + contact + selfie). */
const baseCreate = {
  companyName: "Acme Tools",
  contactPersonName: "R. Sharma",
  selfieUrl: SELFIE,
};

describe("CreateClientMeetingSchema", () => {
  it("accepts a minimal payload and defaults purpose to regular_order", () => {
    const r = CreateClientMeetingSchema.safeParse(baseCreate);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.purpose).toBe("regular_order");
  });

  it("accepts a fully-specified meeting", () => {
    const r = CreateClientMeetingSchema.safeParse({
      salesPersonId: "8f7b2a4e-1c3d-4e5f-9a6b-7c8d9e0f1a2b",
      companyName: "Acme Tools",
      contactPersonName: "R. Sharma",
      contactPersonDesignation: "Purchase Manager",
      meetingDate: "2026-06-12",
      meetingTime: "14:30",
      clientId: "8f7b2a4e-1c3d-4e5f-9a6b-7c8d9e0f1a2b",
      clientType: "OEM",
      purpose: "other",
      purposeOther: "Plant audit",
      meetingNotes: "Discussed Q3 volumes",
      nextFollowUpDate: "2026-07-01",
      selfieUrl: SELFIE,
    });
    expect(r.success).toBe(true);
  });

  it("rejects purpose 'other' without purposeOther", () => {
    const r = CreateClientMeetingSchema.safeParse({
      ...baseCreate,
      purpose: "other",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "purposeOther")).toBe(true);
    }
  });

  it("rejects a meeting with no selfie", () => {
    const r = CreateClientMeetingSchema.safeParse({
      companyName: "Acme Tools",
      contactPersonName: "R. Sharma",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "selfieUrl")).toBe(true);
    }
  });

  it("requires companyName and contactPersonName", () => {
    expect(
      CreateClientMeetingSchema.safeParse({ ...baseCreate, companyName: "" }).success,
    ).toBe(false);
    expect(
      CreateClientMeetingSchema.safeParse({ ...baseCreate, contactPersonName: "  " }).success,
    ).toBe(false);
  });

  it("rejects a malformed meetingTime but accepts HH:MM or empty", () => {
    expect(
      CreateClientMeetingSchema.safeParse({ ...baseCreate, meetingTime: "2pm" }).success,
    ).toBe(false);
    expect(
      CreateClientMeetingSchema.safeParse({ ...baseCreate, meetingTime: "09:05" }).success,
    ).toBe(true);
    const empty = CreateClientMeetingSchema.safeParse({ ...baseCreate, meetingTime: "" });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.meetingTime).toBeUndefined();
  });

  it("rejects a non-uuid salesPersonId / clientId", () => {
    expect(
      CreateClientMeetingSchema.safeParse({ ...baseCreate, salesPersonId: "nope" }).success,
    ).toBe(false);
    expect(
      CreateClientMeetingSchema.safeParse({ ...baseCreate, clientId: "nope" }).success,
    ).toBe(false);
  });
});

describe("UpdateClientMeetingSchema", () => {
  it("accepts a single-field patch WITHOUT a selfie (Create-only superRefine)", () => {
    expect(UpdateClientMeetingSchema.safeParse({ companyName: "New Co" }).success).toBe(true);
  });

  it("rejects an empty patch", () => {
    expect(UpdateClientMeetingSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(UpdateClientMeetingSchema.safeParse({ srNo: 4 }).success).toBe(false);
  });

  it("still rejects bad enum values in a patch", () => {
    expect(UpdateClientMeetingSchema.safeParse({ purpose: "vibing" }).success).toBe(false);
  });
});

describe("SetMeetingPurposeSchema", () => {
  it("accepts a known purpose and rejects an unknown one", () => {
    expect(SetMeetingPurposeSchema.safeParse({ purpose: "upsell" }).success).toBe(true);
    expect(SetMeetingPurposeSchema.safeParse({ purpose: "lunch" }).success).toBe(false);
  });
});
