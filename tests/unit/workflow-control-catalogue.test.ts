import { describe, expect, it } from "vitest";
import { WORKFLOW_FLAG_KEYS } from "@/db/enums";
import {
  WORKFLOW_CHAIN,
  WORKFLOW_GATES,
  gateActorRole,
  gateConditions,
  gateSpecFor,
  normaliseGateFlags,
} from "@/lib/workflow-control-catalogue";

describe("workflow-control catalogue", () => {
  it("describes every workflow flag key exactly once, in enum order", () => {
    expect(WORKFLOW_GATES.map((g) => g.key)).toEqual([...WORKFLOW_FLAG_KEYS]);
  });

  it("gives every gate a place in the pipeline chain", () => {
    const gated = WORKFLOW_CHAIN.map((n) => n.gateAfter).filter(
      (k): k is (typeof WORKFLOW_FLAG_KEYS)[number] => k !== null,
    );
    expect(new Set(gated)).toEqual(new Set(WORKFLOW_FLAG_KEYS));
    // No gate may govern two hand-offs.
    expect(gated.length).toBe(new Set(gated).size);
  });

  it("derives the enforced conditions from the transition table", () => {
    // Sending a quote must require a priced line - the table's exit guard.
    expect(gateConditions(WORKFLOW_GATES[0]!)).toContain(
      "at least one line must have a unit price before sending",
    );
    // Confirming an order must require the customer PO + per-line quantity.
    const so = WORKFLOW_GATES.find((g) => g.key === "sales_order")!;
    expect(gateConditions(so)).toEqual([
      "a customer PO must be attached",
      "every line needs an ordered quantity",
    ]);
  });

  it("returns no conditions for the terminal stage", () => {
    const invoice = WORKFLOW_GATES.find((g) => g.key === "invoice")!;
    expect(invoice.to).toBeNull();
    expect(gateConditions(invoice)).toEqual([]);
  });

  it("resolves the actor role for every gate", () => {
    for (const g of WORKFLOW_GATES) {
      expect(gateActorRole(g)).toBeTruthy();
    }
  });

  it("looks gates up by key and ignores unknown keys", () => {
    expect(gateSpecFor("negotiation")?.label).toBe("Negotiation");
    expect(gateSpecFor("not_a_gate")).toBeUndefined();
  });

  it("defaults every flag OFF unless it is exactly true", () => {
    expect(normaliseGateFlags(null)).toEqual({
      quotation: false,
      negotiation: false,
      sales_order: false,
      job_card: false,
      production: false,
      dispatch: false,
      invoice: false,
    });
    // Truthy-but-not-true values stay OFF, matching lib/workflow/flags.ts.
    const raw = { quotation: true, negotiation: "yes", stray: true } as unknown as Record<
      string,
      boolean
    >;
    const out = normaliseGateFlags(raw);
    expect(out.quotation).toBe(true);
    expect(out.negotiation).toBe(false);
    expect(Object.keys(out)).toEqual([...WORKFLOW_FLAG_KEYS]);
  });
});
