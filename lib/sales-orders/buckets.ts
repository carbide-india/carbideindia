import {
  SALES_ORDER_STAGE_BUCKETS,
  SALES_ORDER_STATUS_LABELS,
  SALES_ORDER_STATUS_COLORS,
  type SalesOrderStatus,
} from "@/db/enums";

/**
 * Sales Order stage buckets + the dual-output (customer copy / factory copy)
 * axis, as PURE functions over an already-loaded register set.
 *
 * Manan's rule for every stage: the register must show WHAT IS LEFT. The stage
 * buckets answer "how far has the SO got"; the OUTPUT counts answer the Sales
 * Order's own version of the same question - "one order, two copies, which copy
 * has not gone out yet".
 *
 * The two axes are deliberately separate and must never be summed together:
 *   - `sales_order_status` is NOT NULL DEFAULT 'not_started', so every row lands
 *     in exactly one stage bucket and the bucket counts always sum to the total.
 *   - `customer_so_sent` / `production_so_sent` are independent booleans - a
 *     row is counted in BOTH output rows (once per copy), never once overall.
 */

/** The minimum a row must expose to be bucketed (the register list item). */
export interface BucketableSalesOrder {
  salesOrderStatus: SalesOrderStatus;
  customerSoSent: boolean;
  productionSoSent: boolean;
}

export interface StageBucketCount {
  status: SalesOrderStatus;
  label: string;
  /** Status colour TOKEN name (globals.css `--color-*`) - never a hex. */
  tone: string;
  count: number;
}

/**
 * One tile per house bucket, in the enum's display order, with live counts.
 * Zero-count buckets are KEPT: a bucket that disappears when empty is exactly
 * the "count that silently excludes rows" Manan complained about - an empty
 * Pending Approval must read 0, not vanish.
 */
export function stageBucketCounts(
  rows: ReadonlyArray<BucketableSalesOrder>,
): StageBucketCount[] {
  const tally = new Map<SalesOrderStatus, number>();
  for (const b of SALES_ORDER_STAGE_BUCKETS) tally.set(b, 0);
  for (const r of rows) {
    // A row whose status is somehow outside the enum (impossible through the
    // app, but a hostile/legacy DB write is not) is still counted so the strip
    // can never under-report - it falls into `not_started`.
    const key = tally.has(r.salesOrderStatus) ? r.salesOrderStatus : "not_started";
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return SALES_ORDER_STAGE_BUCKETS.map((status) => ({
    status,
    label: SALES_ORDER_STATUS_LABELS[status],
    tone: SALES_ORDER_STATUS_COLORS[status],
    count: tally.get(status) ?? 0,
  }));
}

/** The four output filters exposed by the dual-copy strip. */
export const SALES_ORDER_OUTPUT_FILTERS = [
  "customer_pending",
  "customer_sent",
  "factory_pending",
  "factory_sent",
] as const;
export type SalesOrderOutputFilter =
  (typeof SALES_ORDER_OUTPUT_FILTERS)[number];

export function isOutputFilter(v: unknown): v is SalesOrderOutputFilter {
  return (
    typeof v === "string" &&
    (SALES_ORDER_OUTPUT_FILTERS as readonly string[]).includes(v)
  );
}

export interface OutputCounts {
  total: number;
  customerPending: number;
  customerSent: number;
  factoryPending: number;
  factorySent: number;
}

/**
 * Dual-output counts. `pending + sent === total` INDEPENDENTLY for each copy -
 * the customer split and the factory split are two separate partitions of the
 * same rows, which is the whole point of "one SO, two outputs".
 */
export function outputCounts(
  rows: ReadonlyArray<BucketableSalesOrder>,
): OutputCounts {
  let customerSent = 0;
  let factorySent = 0;
  for (const r of rows) {
    if (r.customerSoSent) customerSent++;
    if (r.productionSoSent) factorySent++;
  }
  return {
    total: rows.length,
    customerPending: rows.length - customerSent,
    customerSent,
    factoryPending: rows.length - factorySent,
    factorySent,
  };
}

/** Apply the URL filters (both optional, AND-ed) to the loaded register set. */
export function applySalesOrderFilters<T extends BucketableSalesOrder>(
  rows: ReadonlyArray<T>,
  filters: {
    status?: SalesOrderStatus | null;
    output?: SalesOrderOutputFilter | null;
  },
): T[] {
  let out = rows.slice();
  if (filters.status) {
    out = out.filter((r) => r.salesOrderStatus === filters.status);
  }
  switch (filters.output) {
    case "customer_pending":
      return out.filter((r) => !r.customerSoSent);
    case "customer_sent":
      return out.filter((r) => r.customerSoSent);
    case "factory_pending":
      return out.filter((r) => !r.productionSoSent);
    case "factory_sent":
      return out.filter((r) => r.productionSoSent);
    default:
      return out;
  }
}
