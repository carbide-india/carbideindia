import "server-only";
import { count, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  costings,
  inquiryItems,
  jobCards,
  negotiationItems,
  quotationItems,
  salesOrderItems,
} from "@/db/schema";
import {
  deriveItemStage,
  type ItemStageSignals,
} from "@/lib/flow/derive-stage";

/**
 * Cheap where-used counts per Item to feed the Stepper (ERP Phase 3 reference).
 * One indexed COUNT per referencing table (all have `(item_id)` indexes). This
 * is the FIRST-CUT signal source for `deriveItemStage`; Phase 8/9 replace it
 * with the single UNION-ALL where-used aggregate (<150ms budget).
 */
export interface ItemStageCounts {
  inquiryCount: number;
  costingCount: number;
  quotationCount: number;
  negotiationCount: number;
  salesOrderCount: number;
  jobCardCount: number;
}

/**
 * COUNT(*) of an item_id-referencing table filtered by `itemId`. A raw SQL
 * predicate keeps one helper working across every table without wrestling
 * Drizzle's per-table column identity types.
 */
async function countByItem(
  from:
    | typeof inquiryItems
    | typeof costings
    | typeof quotationItems
    | typeof negotiationItems
    | typeof salesOrderItems
    | typeof jobCards,
  itemId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(from)
    .where(sql`${from.itemId} = ${itemId}`);
  return row?.n ?? 0;
}

export async function getItemStageCounts(itemId: string): Promise<ItemStageCounts> {
  const [
    inquiryCount,
    costingCount,
    quotationCount,
    negotiationCount,
    salesOrderCount,
    jobCardCount,
  ] = await Promise.all([
    countByItem(inquiryItems, itemId),
    countByItem(costings, itemId),
    countByItem(quotationItems, itemId),
    countByItem(negotiationItems, itemId),
    countByItem(salesOrderItems, itemId),
    countByItem(jobCards, itemId),
  ]);

  return {
    inquiryCount,
    costingCount,
    quotationCount,
    negotiationCount,
    salesOrderCount,
    jobCardCount,
  };
}

/** Convenience: counts → the current stage index for the Stepper. */
export function stageFromCounts(
  counts: ItemStageCounts,
  status: ItemStageSignals["status"],
): number {
  return deriveItemStage({ ...counts, status });
}
