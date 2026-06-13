import { describe, it, expect } from "vitest";
import {
  CreateClientMeetingSchema,
  UpdateClientMeetingSchema,
  SetMeetingPurposeSchema,
} from "@/lib/validators/client-meeting";

/** Minimal payload that should pass Create (sales name + company + contact
 *  first name). No selfie — proof-of-visit selfie was dropped. */
const baseCreate = {
  salesName: "Priya Nair",
  companyName: "Acme Tools",
  contactFirstName: "Rahul",
};

describe("CreateClientMeetingSchema", () => {
  it("accepts a minimal payload WITHOUT a selfie and defaults purpose", () => {
    const r = CreateClientMeetingSchema.safeParse(baseCreate);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.purpose).toBe("regular_order");
  });

  it("accepts a fully-specified meeting", () => {
    const r = CreateClientMeetingSchema.safeParse({
      salesPersonId: "8f7b2a4e-1c3d-4e5f-9a6b-7c8d9e0f1a2b",
      salesName: "Priya Nair",
      salesNumber: "+91 98765 43210",
      salesDesignation: "Sales Executive",
      salesEmail: "priya@carbideindia.com",
      companyName: "Acme Tools",
      contactFirstName: "Rahul",
      contactLastName: "Sharma",
      contactPersonDesignation: "Purchase Manager",
      contactNumber: "+91 90000 00000",
      contactEmail: "rahul@acmetools.com",
      meetingDate: "2026-06-12",
      meetingStartTime: "14:30",
      meetingEndTime: "15:15",
      meetingSource: "WhatsApp",
      clientId: "8f7b2a4e-1c3d-4e5f-9a6b-7c8d9e0f1a2b",
      clientType: "OEM",
      purpose: "other",
      purposeOther: "Plant audit",
      meetingNotes: "Discussed Q3 volumes",
      nextFollowUpDate: "2026-07-01",
    });
    expect(r.success).toBe(true);
  });

  it("stores the typed custom source text (Other → specify)", () => {
    const r = CreateClientMeetingSchema.safeParse({
      ...baseCreate,
      meetingSource: "LinkedIn DM",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.meetingSource).toBe("LinkedIn DM");
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

  it("requires salesName, companyName and contactFirstName", () => {
    expect(
      CreateClientMeetingSchema.safeParse({ ...baseCreate, salesName: "" }).success,
    ).toBe(false);
    expect(
      CreateClientMeetingSchema.safeParse({ ...baseCreate, companyName: "" }).success,
    ).toBe(false);
    expect(
      CreateClientMeetingSchema.safeParse({ ...baseCreate, contactFirstName: "  " }).success,
    ).toBe(false);
  });

  it("rejects a malformed meeting time but accepts HH:MM or empty", () => {
    expect(
      CreateClientMeetingSchema.safeParse({ ...baseCreate, meetingStartTime: "2pm" }).success,
    ).toBe(false);
    expect(
      CreateClientMeetingSchema.safeParse({ ...baseCreate, meetingStartTime: "09:05" }).success,
    ).toBe(true);
    const empty = CreateClientMeetingSchema.safeParse({
      ...baseCreate,
      meetingStartTime: "",
      meetingEndTime: "",
    });
    expect(empty.success).toBe(true);
    if (empty.success) {
      expect(empty.data.meetingStartTime).toBeUndefined();
      expect(empty.data.meetingEndTime).toBeUndefined();
    }
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
  it("accepts a single-field patch WITHOUT required base fields", () => {
    expect(UpdateClientMeetingSchema.safeParse({ companyName: "New Co" }).success).toBe(true);
  });

  it("accepts a contact-first-name patch", () => {
    expect(UpdateClientMeetingSchema.safeParse({ contactFirstName: "Anita" }).success).toBe(true);
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
