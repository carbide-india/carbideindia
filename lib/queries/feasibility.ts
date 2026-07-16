import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries, inquiryItems, employees } from "@/db/schema";
import type {
  FeasibilityStatus,
  FeasPriority,
  InquiryPriority,
  RecheckState,
} from "@/db/enums";

/**
 * Primary-Feasibility queries (client-sheet model). The review lives on the
 * `inquiries` row (the legacy embedded `feas*` columns): five checks, notes,
 * priority, export, actions, who-checked, and the feasibility status the costing
 * gate reads. Every live enquiry is a queue row (a fresh enquiry is simply
 * `not_started`).
 */

export interface FeasibilityQueueItem {
  id: string;
  smNumber: string;
  companyName: string;
  enquiryDate: Date;
  createdAt: Date;
  priority: InquiryPriority;
  feasPriority: FeasPriority | null;
  export: boolean | null;
  status: FeasibilityStatus;
  checkedByName: string | null;
  productCount: number;
  /** How many of the 5 checks are set (Yes/Assumed, i.e. not "Not Done"). */
  checksDone: number;
  checksTotal: number;
}

const notDone = (v: RecheckState | null | undefined) => v != null && v !== "not_done";

/** The feasibility queue: every live enquiry with its review state. */
export async function listFeasibilityQueue(): Promise<FeasibilityQueueItem[]> {
  const rows = await db
    .select({
      id: inquiries.id,
      smNumber: inquiries.smNumber,
      companyName: inquiries.companyName,
      enquiryDate: inquiries.enquiryDate,
      createdAt: inquiries.createdAt,
      priority: inquiries.priority,
      feasPriority: inquiries.feasPriority,
      export: inquiries.feasExport,
      status: inquiries.feasibilityStatus,
      checkedByName: employees.name,
      c1: inquiries.feasSizeDrawingCheck,
      c2: inquiries.feasToleranceCheck,
      c3: inquiries.feasGradeAppCheck,
      c4: inquiries.feasQuantityCheck,
      c5: inquiries.feasConditionCheck,
    })
    .from(inquiries)
    .leftJoin(employees, eq(employees.id, inquiries.feasibilityCheckedById))
    .where(eq(inquiries.isArchived, false))
    .orderBy(desc(inquiries.enquiryDate), desc(inquiries.createdAt));

  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ inquiryId: inquiryItems.inquiryId, n: sql<number>`count(*)::int` })
        .from(inquiryItems)
        .where(inArray(inquiryItems.inquiryId, ids))
        .groupBy(inquiryItems.inquiryId)
    : [];
  const countBy = new Map(counts.map((c) => [c.inquiryId, c.n]));

  return rows.map((r) => ({
    id: r.id,
    smNumber: r.smNumber,
    companyName: r.companyName,
    enquiryDate: r.enquiryDate,
    createdAt: r.createdAt,
    priority: r.priority,
    feasPriority: r.feasPriority ?? null,
    export: r.export ?? null,
    status: r.status,
    checkedByName: r.checkedByName ?? null,
    productCount: countBy.get(r.id) ?? 0,
    checksDone: [r.c1, r.c2, r.c3, r.c4, r.c5].filter(notDone).length,
    checksTotal: 5,
  }));
}

/** @deprecated Alias of {@link listFeasibilityQueue} kept for existing callers. */
export const listFeasibilityReviews = listFeasibilityQueue;

/** The feasibility status for one enquiry (costing gate reads this). */
export async function getFeasibilityStatus(inquiryId: string): Promise<FeasibilityStatus> {
  const [row] = await db
    .select({ status: inquiries.feasibilityStatus })
    .from(inquiries)
    .where(eq(inquiries.id, inquiryId))
    .limit(1);
  return (row?.status ?? "not_started") as FeasibilityStatus;
}

/** True once the review is approved for costing (costing hard-gate helper). */
export async function isFeasibilityApproved(inquiryId: string): Promise<boolean> {
  return (await getFeasibilityStatus(inquiryId)) === "proceed_to_costing";
}
