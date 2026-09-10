import { describe, it, expect } from "vitest";
import {
  applySalesOrderFilters,
  isOutputFilter,
  outputCounts,
  poConfirmationCount,
  stageBucketCounts,
  type BucketableSalesOrder,
} from "@/lib/sales-orders/buckets";
import {
  SALES_ORDER_STAGE_BUCKETS,
  type SalesOrderPoConfirmationStatus,
} from "@/db/enums";

/**
 * The register's "what is left" counts. The point of these tests is that no
 * count can silently exclude a row - the stage buckets must partition the set
 * exactly, and each copy's pending/sent split must cover it exactly.
 */

const row = (
  status: BucketableSalesOrder["salesOrderStatus"],
  customerSoSent = false,
  productionSoSent = false,
  customerPoConfirmation: SalesOrderPoConfirmationStatus = "not_read",
): BucketableSalesOrder => ({
  salesOrderStatus: status,
  customerSoSent,
  productionSoSent,
  customerPoConfirmation,
});

const SET: BucketableSalesOrder[] = [
  row("not_started"),
  row("not_started", true),
  row("draft"),
  row("need_info", true, true),
  row("pending_approval", true),
  row("sales_order_approved", true, true),
  row("sales_order_approved", true, true),
];

describe("stageBucketCounts", () => {
  it("returns one tile per house bucket, in enum order, even when empty", () => {
    const counts = stageBucketCounts([]);
    expect(counts.map((c) => c.status)).toEqual([...SALES_ORDER_STAGE_BUCKETS]);
    expect(counts.every((c) => c.count === 0)).toBe(true);
  });

  it("partitions the register exactly - the buckets sum to the total", () => {
    const counts = stageBucketCounts(SET);
    expect(counts.reduce((n, c) => n + c.count, 0)).toBe(SET.length);
    const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.count]));
    expect(byStatus.not_started).toBe(2);
    expect(byStatus.draft).toBe(1);
    expect(byStatus.need_info).toBe(1);
    expect(byStatus.pending_approval).toBe(1);
    expect(byStatus.sales_order_approved).toBe(2);
  });

  it("never drops a row with an out-of-enum status", () => {
    const rogue = [
      ...SET,
      { salesOrderStatus: "who_knows", customerSoSent: false, productionSoSent: false },
    ] as BucketableSalesOrder[];
    const counts = stageBucketCounts(rogue);
    expect(counts.reduce((n, c) => n + c.count, 0)).toBe(rogue.length);
  });

  it("carries a colour TOKEN, never a hex", () => {
    for (const c of stageBucketCounts(SET)) {
      expect(c.tone).not.toMatch(/^#/);
      expect(c.tone).toMatch(/^[a-z]+$/);
    }
  });
});

describe("outputCounts", () => {
  it("splits each copy independently and both splits cover the whole set", () => {
    const o = outputCounts(SET);
    expect(o.total).toBe(7);
    expect(o.customerSent).toBe(5);
    expect(o.customerPending).toBe(2);
    expect(o.customerSent + o.customerPending).toBe(o.total);
    expect(o.factorySent).toBe(3);
    expect(o.factoryPending).toBe(4);
    expect(o.factorySent + o.factoryPending).toBe(o.total);
  });

  it("handles a fresh install (empty register)", () => {
    expect(outputCounts([])).toEqual({
      total: 0,
      customerPending: 0,
      customerSent: 0,
      factoryPending: 0,
      factorySent: 0,
    });
  });
});

describe("applySalesOrderFilters", () => {
  it("returns everything when nothing is filtered", () => {
    expect(applySalesOrderFilters(SET, {}).length).toBe(SET.length);
  });

  it("filters by stage bucket", () => {
    expect(
      applySalesOrderFilters(SET, { status: "sales_order_approved" }).length,
    ).toBe(2);
  });

  it("filters by output, matching the tile counts exactly", () => {
    const o = outputCounts(SET);
    expect(applySalesOrderFilters(SET, { output: "customer_pending" }).length).toBe(
      o.customerPending,
    );
    expect(applySalesOrderFilters(SET, { output: "factory_pending" }).length).toBe(
      o.factoryPending,
    );
    expect(applySalesOrderFilters(SET, { output: "factory_sent" }).length).toBe(
      o.factorySent,
    );
  });

  it("AND-s the two axes", () => {
    const out = applySalesOrderFilters(SET, {
      status: "sales_order_approved",
      output: "factory_sent",
    });
    expect(out.length).toBe(2);
  });

  it("does not mutate the input set", () => {
    const copy = [...SET];
    applySalesOrderFilters(SET, { status: "draft" });
    expect(SET).toEqual(copy);
  });
});

describe("Customer PO Confirmation", () => {
  const POSET = [
    row("draft", false, false, "revised_so"),
    row("draft", false, false, "revised_so"),
    row("need_info", true, false, "revised_po"),
    row("not_started", false, false, "not_read"),
    row("not_started", false, false, "po_read"),
  ];

  it("counts each confirmation value", () => {
    expect(poConfirmationCount(POSET, "revised_so")).toBe(2);
    expect(poConfirmationCount(POSET, "revised_po")).toBe(1);
    expect(poConfirmationCount(POSET, "po_read")).toBe(1);
    expect(poConfirmationCount(POSET, "email_confirmation")).toBe(0);
  });

  it("filters by confirmation, matching the count", () => {
    expect(applySalesOrderFilters(POSET, { poConfirm: "revised_so" }).length).toBe(2);
    expect(applySalesOrderFilters(POSET, { poConfirm: "revised_po" }).length).toBe(1);
  });

  it("AND-s confirmation with the stage bucket", () => {
    expect(
      applySalesOrderFilters(POSET, { status: "draft", poConfirm: "revised_so" }).length,
    ).toBe(2);
    expect(
      applySalesOrderFilters(POSET, { status: "need_info", poConfirm: "revised_so" }).length,
    ).toBe(0);
  });
});

describe("isOutputFilter", () => {
  it("accepts only the four known output filters", () => {
    expect(isOutputFilter("customer_pending")).toBe(true);
    expect(isOutputFilter("factory_sent")).toBe(true);
    expect(isOutputFilter("factory")).toBe(false);
    expect(isOutputFilter(null)).toBe(false);
  });
});
