import { describe, expect, it } from "vitest";
import {
  STAGE_TRANSITIONS,
  canTransition,
  actorRoleFor,
  guardsFor,
  nextStagesFrom,
  PIPELINE_STAGES,
  type GuardContext,
} from "@/lib/workflow/transitions";
import {
  itemFurthestStage,
  smRollupStage,
  stageIndex,
} from "@/lib/flow/derive-stage";

describe("STAGE_TRANSITIONS table", () => {
  it("has a spec for every pipeline stage", () => {
    for (const stage of PIPELINE_STAGES) {
      expect(STAGE_TRANSITIONS[stage]).toBeDefined();
      expect(STAGE_TRANSITIONS[stage].actorRole).toBeTruthy();
    }
  });

  it("every edge targets a real stage that is later in the pipeline", () => {
    for (const from of PIPELINE_STAGES) {
      for (const edge of STAGE_TRANSITIONS[from].edges) {
        expect(PIPELINE_STAGES).toContain(edge.to);
        expect(stageIndex(edge.to)).toBeGreaterThan(stageIndex(from));
      }
    }
  });

  it("invoice is terminal (no outgoing edges)", () => {
    expect(STAGE_TRANSITIONS.invoice.edges).toHaveLength(0);
    expect(nextStagesFrom("invoice")).toHaveLength(0);
  });
});

describe("canTransition", () => {
  it("allows a defined forward edge", () => {
    expect(canTransition("quotation", "negotiation")).toBe(true);
    expect(canTransition("negotiation", "sales_order")).toBe(true);
    expect(canTransition("sales_order", "job_card")).toBe(true);
  });

  it("rejects an undefined / skip / backward edge", () => {
    expect(canTransition("quotation", "sales_order")).toBe(false); // skip
    expect(canTransition("sales_order", "quotation")).toBe(false); // backward
    expect(canTransition("enquiry", "invoice")).toBe(false);
  });
});

describe("actorRoleFor", () => {
  it("returns the edge's actor role", () => {
    expect(actorRoleFor("quotation", "negotiation")).toBe("sales");
    expect(actorRoleFor("production", "dispatch")).toBe("qc");
    expect(actorRoleFor("dispatch", "invoice")).toBe("accounts");
  });
});

describe("guardsFor — exit + entry guard evaluation", () => {
  const sendCtx = (over: Partial<GuardContext> = {}): GuardContext => ({
    lineCount: 2,
    linesWithItem: 2,
    linesWithChosenCosting: 2,
    linesWithPrice: 2,
    ...over,
  });

  it("passes quote → negotiation when a priced line exists", () => {
    const r = guardsFor("quotation", "negotiation", sendCtx());
    expect(r.ok).toBe(true);
    expect(r.unmet).toHaveLength(0);
  });

  it("rejects quote → negotiation with no priced line, listing the unmet reason", () => {
    const r = guardsFor("quotation", "negotiation", sendCtx({ linesWithPrice: 0 }));
    expect(r.ok).toBe(false);
    expect(r.unmet.join(" ")).toMatch(/unit price/i);
  });

  it("rejects an undefined transition as a hard fail", () => {
    const r = guardsFor("quotation", "sales_order", sendCtx());
    expect(r.ok).toBe(false);
    expect(r.unmet.join(" ")).toMatch(/no transition/i);
  });

  it("negotiation → SO requires a sent quotation AND priced won lines", () => {
    const base: GuardContext = { lineCount: 1, parentQuoteSent: true };
    expect(
      guardsFor("negotiation", "sales_order", {
        ...base,
        hasSentQuotation: false,
        wonLinesHavePrice: true,
      }).ok,
    ).toBe(false);
    expect(
      guardsFor("negotiation", "sales_order", {
        ...base,
        hasSentQuotation: true,
        wonLinesHavePrice: false,
      }).ok,
    ).toBe(false);
    expect(
      guardsFor("negotiation", "sales_order", {
        ...base,
        hasSentQuotation: true,
        wonLinesHavePrice: true,
      }).ok,
    ).toBe(true);
  });

  it("SO → job_card requires a customer PO and per-line qty", () => {
    const ok = guardsFor("sales_order", "job_card", {
      lineCount: 2,
      hasSentQuotation: true,
      hasCustomerPo: true,
      linesWithQty: 2,
    });
    expect(ok.ok).toBe(true);
    const missingPo = guardsFor("sales_order", "job_card", {
      lineCount: 2,
      hasSentQuotation: true,
      hasCustomerPo: false,
      linesWithQty: 2,
    });
    expect(missingPo.ok).toBe(false);
    expect(missingPo.unmet.join(" ")).toMatch(/customer PO/i);
  });

  it("feasibility → costing requires every line to be item-linked", () => {
    expect(
      guardsFor("feasibility", "costing", { lineCount: 3, linesWithItem: 3 }).ok,
    ).toBe(true);
    const partial = guardsFor("feasibility", "costing", {
      lineCount: 3,
      linesWithItem: 2,
    });
    expect(partial.ok).toBe(false);
    expect(partial.unmet.join(" ")).toMatch(/Item/i);
  });
});

describe("derive-stage sole authorities", () => {
  it("itemFurthestStage returns the furthest reached stage", () => {
    const r = itemFurthestStage({ inquiryCount: 1, costingCount: 1, quotationCount: 1 });
    expect(r.stage).toBe("quotation");
    expect(r.index).toBe(stageIndex("quotation"));
  });

  it("itemFurthestStage clamps a draft item to Enquiry", () => {
    expect(itemFurthestStage({ status: "draft", salesOrderCount: 1 }).stage).toBe(
      "enquiry",
    );
  });

  it("smRollupStage takes the MINIMUM of per-line stages (laggard drives)", () => {
    const r = smRollupStage({
      lineStages: [stageIndex("quotation"), stageIndex("costing"), stageIndex("sales_order")],
    });
    expect(r.stage).toBe("costing");
  });

  it("smRollupStage falls back to header signals when no per-line detail", () => {
    expect(smRollupStage({ hasSalesOrder: true }).stage).toBe("sales_order");
    expect(smRollupStage({}).stage).toBe("enquiry");
  });
});
