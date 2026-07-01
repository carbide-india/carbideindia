import { describe, expect, it } from "vitest";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  deriveItemStage,
  deriveSmStage,
  stageIndex,
} from "@/lib/flow/derive-stage";

describe("PIPELINE_STAGES", () => {
  it("has a label for every stage", () => {
    for (const stage of PIPELINE_STAGES) {
      expect(PIPELINE_STAGE_LABELS[stage]).toBeTruthy();
    }
  });

  it("stageIndex agrees with array order", () => {
    PIPELINE_STAGES.forEach((stage, i) => {
      expect(stageIndex(stage)).toBe(i);
    });
  });
});

describe("deriveItemStage", () => {
  it("floors at Enquiry with no signals", () => {
    expect(deriveItemStage({})).toBe(stageIndex("enquiry"));
  });

  it("clamps a draft item to Enquiry even with downstream rows", () => {
    expect(
      deriveItemStage({ status: "draft", quotationCount: 3, salesOrderCount: 1 }),
    ).toBe(stageIndex("enquiry"));
  });

  it("advances to Costing when a costing row exists", () => {
    expect(deriveItemStage({ inquiryCount: 1, costingCount: 1 })).toBe(
      stageIndex("costing"),
    );
  });

  it("takes the furthest reached stage", () => {
    expect(
      deriveItemStage({
        inquiryCount: 2,
        costingCount: 1,
        quotationCount: 1,
        salesOrderCount: 1,
      }),
    ).toBe(stageIndex("sales_order"));
  });

  it("reaches Job Card when a job card exists", () => {
    expect(deriveItemStage({ jobCardCount: 1 })).toBe(stageIndex("job_card"));
  });

  it("never regresses below Enquiry", () => {
    expect(deriveItemStage({ status: "active" })).toBe(stageIndex("enquiry"));
  });
});

describe("deriveSmStage", () => {
  it("floors at Enquiry with no signals", () => {
    expect(deriveSmStage({})).toBe(stageIndex("enquiry"));
  });

  it("prefers explicit flags", () => {
    expect(deriveSmStage({ hasQuotation: true })).toBe(stageIndex("quotation"));
    expect(deriveSmStage({ hasSalesOrder: true })).toBe(stageIndex("sales_order"));
  });

  it("takes the furthest flag", () => {
    expect(
      deriveSmStage({ hasCosting: true, hasQuotation: true, hasJobCard: true }),
    ).toBe(stageIndex("job_card"));
  });

  it("falls back to a status keyword read", () => {
    expect(deriveSmStage({ enquiryStatus: "Quotation Sent" })).toBe(
      stageIndex("quotation"),
    );
    expect(deriveSmStage({ enquiryStatus: "PO Received" })).toBe(
      stageIndex("sales_order"),
    );
    expect(deriveSmStage({ enquiryStatus: "In Negotiation" })).toBe(
      stageIndex("negotiation"),
    );
  });

  it("flags win over status string", () => {
    expect(
      deriveSmStage({ hasSalesOrder: true, enquiryStatus: "quotation" }),
    ).toBe(stageIndex("sales_order"));
  });

  it("unknown status stays at Enquiry", () => {
    expect(deriveSmStage({ enquiryStatus: "brand new lead" })).toBe(
      stageIndex("enquiry"),
    );
  });
});
