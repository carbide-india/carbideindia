import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { costings, inquiries, inquiryItems } from "@/db/schema";

/**
 * One row of the /costings register — joins inquiry smNumber/companyName and
 * the inquiry_item's custProductName so the register is human-readable without
 * extra round-trips.
 */
export interface CostingListItem {
  id: string;
  inquiryId: string;
  inquiryItemId: string;
  smNumber: string | null;
  companyName: string | null;
  custProductName: string | null;
  costingType: "inhouse" | "bought_out";
  isChosen: boolean;
  finalCostPerPiece: string | null;
  quoteValue: string | null;
  costingDoneStatus: "not_done" | "in_process" | "done";
  createdAt: Date;
}

/** Full costing row (all inputs + outputs). */
export type CostingRow = typeof costings.$inferSelect;

/** Chosen costing summary per inquiry_item — used by Task 5 to avoid N+1. */
export interface ChosenCostingSummary {
  inquiryItemId: string;
  finalCostPerPiece: string | null;
  costingDoneStatus: "not_done" | "in_process" | "done";
}

/**
 * Costing register — all costings, newest first. Joins inquiry smNumber +
 * companyName and inquiry_item custProductName for display.
 */
export async function listCostings(): Promise<CostingListItem[]> {
  return db
    .select({
      id: costings.id,
      inquiryId: costings.inquiryId,
      inquiryItemId: costings.inquiryItemId,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      custProductName: inquiryItems.custProductName,
      costingType: costings.costingType,
      isChosen: costings.isChosen,
      finalCostPerPiece: costings.finalCostPerPiece,
      quoteValue: costings.quoteValue,
      costingDoneStatus: costings.costingDoneStatus,
      createdAt: costings.createdAt,
    })
    .from(costings)
    .leftJoin(inquiries, eq(costings.inquiryId, inquiries.id))
    .leftJoin(inquiryItems, eq(costings.inquiryItemId, inquiryItems.id))
    .orderBy(desc(costings.createdAt));
}

/**
 * All costings for an inquiry, ordered by item sort order then creation time.
 * Used on the SM detail page costing tab.
 */
export async function getCostingsForInquiry(
  inquiryId: string,
): Promise<CostingRow[]> {
  return db
    .select()
    .from(costings)
    .where(eq(costings.inquiryId, inquiryId))
    .orderBy(asc(costings.sortOrder), desc(costings.createdAt));
}

/**
 * Single costing by id — used for the costing detail / edit view.
 */
export async function getCostingById(
  id: string,
): Promise<CostingRow | null> {
  const [row] = await db
    .select()
    .from(costings)
    .where(eq(costings.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * The chosen costing for a single inquiry_item — at most one row (saveCosting
 * guarantees exactly-one-chosen per item). Returns the most recently created
 * chosen costing in case of legacy duplicates.
 */
export async function getChosenCostingForItem(
  inquiryItemId: string,
): Promise<CostingRow | null> {
  const [row] = await db
    .select()
    .from(costings)
    .where(
      and(
        eq(costings.inquiryItemId, inquiryItemId),
        eq(costings.isChosen, true),
      ),
    )
    .orderBy(desc(costings.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Chosen costing summary for every inquiry_item of an inquiry — avoids N+1
 * on the SM detail costing tab. Returns an array keyed by inquiryItemId with
 * the finalCostPerPiece + costingDoneStatus of the chosen costing (if any).
 */
export async function getChosenCostingsForInquiry(
  inquiryId: string,
): Promise<ChosenCostingSummary[]> {
  return db
    .select({
      inquiryItemId: costings.inquiryItemId,
      finalCostPerPiece: costings.finalCostPerPiece,
      costingDoneStatus: costings.costingDoneStatus,
    })
    .from(costings)
    .where(
      and(
        eq(costings.inquiryId, inquiryId),
        eq(costings.isChosen, true),
      ),
    )
    .orderBy(desc(costings.createdAt));
}
