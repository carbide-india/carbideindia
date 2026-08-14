import { describe, it, expect } from "vitest";
import {
  NEGOTIATION_STATUSES,
  NEGOTIATION_STAGE_BUCKETS,
  NEGOTIATION_STAGES,
  type NegotiationStatus,
} from "@/db/enums";
import {
  buildNegotiationDashboard,
  emptyNegotiationDashboard,
  isNegotiationApprovedForSo,
  isNegotiationBucket,
  isNegotiationOpen,
  NEGOTIATION_OPEN_STATUSES,
  NEGOTIATION_OFF_BOARD_STATUSES,
  type NegotiationGroupRow,
} from "@/lib/negotiations/buckets";

const g = (
  status: NegotiationStatus,
  count: number,
  extra: Partial<NegotiationGroupRow> = {},
): NegotiationGroupRow => ({
  status,
  stage: "quote_send",
  piSent: false,
  count,
  value: 0,
  ...extra,
});

describe("negotiation axes", () => {
  it("splits every enum value into exactly one axis", () => {
    for (const s of NEGOTIATION_STATUSES) {
      const inBucket = isNegotiationBucket(s);
      const inOutcome = NEGOTIATION_OFF_BOARD_STATUSES.includes(s);
      expect(inBucket !== inOutcome).toBe(true);
    }
    expect(NEGOTIATION_STAGE_BUCKETS.length + NEGOTIATION_OFF_BOARD_STATUSES.length).toBe(
      NEGOTIATION_STATUSES.length,
    );
  });

  it("keeps the off-board set in enum order", () => {
    const idx = NEGOTIATION_OFF_BOARD_STATUSES.map((s) => NEGOTIATION_STATUSES.indexOf(s));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it("puts the three outcomes ON the board, not off it", () => {
    // They used to sit on the off-board axis, when the board ran the house
    // approval ladder instead. Won / Lost / Abandoned are columns now, so a
    // deal reaching one is IN the workflow, not a leftover to be migrated.
    for (const s of ["order_won", "order_lost", "order_abandoned"] as const) {
      expect(isNegotiationBucket(s), s).toBe(true);
      expect(NEGOTIATION_OFF_BOARD_STATUSES, s).not.toContain(s);
    }
  });

  it("leaves the retired approval ladder off the board", () => {
    // Nothing new can reach these; the register still lists them so the rows
    // are not invisible, but they get no column.
    for (const s of ["draft", "pending_approval", "negotiation_approved"] as const) {
      expect(NEGOTIATION_OFF_BOARD_STATUSES, s).toContain(s);
      expect(isNegotiationBucket(s), s).toBe(false);
    }
  });

  it("treats only won / lost / abandoned as closed", () => {
    expect(isNegotiationOpen("to_start")).toBe(true);
    expect(isNegotiationOpen("negotiation_approved")).toBe(true);
    expect(isNegotiationOpen("follow_up")).toBe(true);
    expect(isNegotiationOpen("order_won")).toBe(false);
    expect(isNegotiationOpen("order_lost")).toBe(false);
    expect(isNegotiationOpen("order_abandoned")).toBe(false);
  });

  it("exposes the open set the In-Negotiation tile drills through", () => {
    expect(NEGOTIATION_OPEN_STATUSES.every(isNegotiationOpen)).toBe(true);
    expect(NEGOTIATION_OPEN_STATUSES).not.toContain("order_won");
    expect(NEGOTIATION_OPEN_STATUSES.length).toBe(NEGOTIATION_STATUSES.length - 3);
  });

  it("accepts order_won as the legacy synonym on the sales-order gate", () => {
    expect(isNegotiationApprovedForSo("negotiation_approved")).toBe(true);
    expect(isNegotiationApprovedForSo("order_won")).toBe(true);
    expect(isNegotiationApprovedForSo("verbal_yes")).toBe(false);
    expect(isNegotiationApprovedForSo("pending_approval")).toBe(false);
    expect(isNegotiationApprovedForSo("to_start")).toBe(false);
  });
});

describe("buildNegotiationDashboard", () => {
  it("renders a fresh install as all zeroes with every key present", () => {
    const d = emptyNegotiationDashboard();
    expect(d.total).toBe(0);
    expect(d.totalValue).toBe(0);
    expect(d.bucketTotal).toBe(0);
    expect(d.offBoardTotal).toEqual({ count: 0, value: 0 });
    for (const s of NEGOTIATION_STATUSES) expect(d.counts[s]).toBe(0);
    for (const s of NEGOTIATION_STAGES) expect(d.stages[s]).toBe(0);
  });

  it("never loses a row: total === board columns + off-board", () => {
    const d = buildNegotiationDashboard([
      g("to_start", 5),
      g("draft", 3),
      g("need_info", 2),
      g("pending_approval", 4),
      g("negotiation_approved", 1),
      g("order_won", 7),
      g("follow_up", 6),
      g("on_hold", 2),
    ]);
    expect(d.total).toBe(30);
    // On the board: to_start 5 + need_info 2 + order_won 7 + follow_up 6.
    expect(d.bucketTotal).toBe(20);
    // Off it: draft 3 + pending_approval 4 + negotiation_approved 1 + on_hold 2.
    expect(d.offBoardTotal.count).toBe(10);
    expect(d.bucketTotal + d.offBoardTotal.count).toBe(d.total);
  });

  it("sums a status split across several stage / pi-sent groups", () => {
    const d = buildNegotiationDashboard([
      g("draft", 2, { stage: "quote_send", value: 1000 }),
      g("draft", 3, { stage: "pi_issued", piSent: true, value: 4000 }),
    ]);
    expect(d.counts.draft).toBe(5);
    expect(d.values.draft).toBe(5000);
    expect(d.stages.quote_send).toBe(2);
    expect(d.stages.pi_issued).toBe(3);
    expect(d.sent).toEqual({ count: 3, value: 4000 });
  });

  it("derives sent / open / won independently of each other", () => {
    const d = buildNegotiationDashboard([
      // sent AND open
      g("pending_approval", 2, { stage: "pi_issued", piSent: true, value: 200 }),
      // sent AND closed-won
      g("order_won", 1, { stage: "customer_po_received", piSent: true, value: 900 }),
      // not sent, open
      g("to_start", 4, { value: 40 }),
      // not sent, closed-lost
      g("order_lost", 3, { value: 30 }),
    ]);
    expect(d.total).toBe(10);
    expect(d.totalValue).toBe(1170);
    expect(d.sent).toEqual({ count: 3, value: 1100 });
    expect(d.open).toEqual({ count: 6, value: 240 });
    expect(d.won).toEqual({ count: 1, value: 900 });
  });

  it("folds non-finite counts and values to zero rather than NaN", () => {
    const d = buildNegotiationDashboard([
      g("draft", Number.NaN, { value: Number.NaN }),
      g("draft", 2, { value: 50 }),
    ]);
    expect(d.total).toBe(2);
    expect(d.totalValue).toBe(50);
    expect(d.counts.draft).toBe(2);
  });
});
