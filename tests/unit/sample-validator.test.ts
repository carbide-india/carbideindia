import { describe, it, expect } from "vitest";
import {
  CreateSampleSchema,
  UpdateSampleSchema,
  SetSampleStatusSchema,
} from "@/lib/validators/sample";

const VALID_UUID = "8f7b2a4e-1c3d-4e5f-9a6b-7c8d9e0f1a2b";

describe("CreateSampleSchema", () => {
  it("accepts an empty payload and applies first-option defaults", () => {
    const r = CreateSampleSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.location).toBe("AYK Cabin");
      expect(r.data.sampleStatus).toBe("received");
      expect(r.data.dimensionStatus).toBe("not_started");
      expect(r.data.chemicalStatus).toBe("not_started");
      expect(r.data.drawingStatus).toBe("not_started");
      expect(r.data.costingStatus).toBe("not_started");
      expect(r.data.dimensionLocation).toBe("Undecided");
      expect(r.data.chemicalLocation).toBe("Undecided");
      expect(r.data.drawingLocation).toBe("Undecided");
      expect(r.data.reportsInSmFolder).toBe(false);
    }
  });

  it("accepts a fully-specified sample", () => {
    const r = CreateSampleSchema.safeParse({
      sampleDate: "2026-06-12",
      inquiryId: VALID_UUID,
      sampleNo: "SM9579-01",
      location: "Lab",
      responsiblePersonId: VALID_UUID,
      sampleNotes: "Cylinder sample, slightly chipped",
      sampleStatus: "in_process",
      dimensionStatus: "done",
      dimensionLocation: "Inhouse",
      dimensionCompletedOn: "2026-06-12",
      chemicalStatus: "in_process",
      chemicalLocation: "Lab Testing Company List (to make)",
      drawingStatus: "need_info",
      drawingLocation: "To Find",
      costingStatus: "on_hold",
      reportsUploaded: ["Dimension Report", "Chemical Analysis Report"],
      reportsInSmFolder: true,
      processedDate: "2026-06-12",
      processNotes: "Sent to lab on Friday",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown location", () => {
    expect(CreateSampleSchema.safeParse({ location: "Warehouse" }).success).toBe(false);
  });

  it("rejects an unknown sample status", () => {
    expect(CreateSampleSchema.safeParse({ sampleStatus: "done" }).success).toBe(false);
  });

  it("rejects an unknown stage status / stage location", () => {
    expect(CreateSampleSchema.safeParse({ dimensionStatus: "received" }).success).toBe(false);
    expect(CreateSampleSchema.safeParse({ chemicalLocation: "Outhouse" }).success).toBe(false);
  });

  it("rejects unknown report types", () => {
    expect(
      CreateSampleSchema.safeParse({ reportsUploaded: ["Vibe Report"] }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid inquiryId / responsiblePersonId", () => {
    expect(CreateSampleSchema.safeParse({ inquiryId: "not-a-uuid" }).success).toBe(false);
    expect(CreateSampleSchema.safeParse({ responsiblePersonId: "nope" }).success).toBe(false);
  });

  it("folds empty notes and sampleNo to undefined", () => {
    const r = CreateSampleSchema.safeParse({ sampleNo: "   ", sampleNotes: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sampleNo).toBeUndefined();
      expect(r.data.sampleNotes).toBeUndefined();
    }
  });
});

describe("UpdateSampleSchema", () => {
  it("accepts a single-field patch", () => {
    expect(UpdateSampleSchema.safeParse({ dimensionStatus: "done" }).success).toBe(true);
  });

  it("rejects an empty patch (defaults must not leak in)", () => {
    expect(UpdateSampleSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(UpdateSampleSchema.safeParse({ srNo: 4 }).success).toBe(false);
  });

  it("rejects bad enum values in a patch", () => {
    expect(UpdateSampleSchema.safeParse({ location: "Moonbase" }).success).toBe(false);
  });
});

describe("SetSampleStatusSchema", () => {
  it("accepts a known status and rejects an unknown one", () => {
    expect(SetSampleStatusSchema.safeParse({ status: "processed" }).success).toBe(true);
    expect(SetSampleStatusSchema.safeParse({ status: "done" }).success).toBe(false);
  });
});
