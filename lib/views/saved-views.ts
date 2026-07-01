import "server-only";
import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedViews, type SavedView } from "@/db/schema";

/**
 * Saved views (ERP redesign — Phase 1 backend). The SavedViews bar UI is wired
 * in Phase 3; this module is the read side it consumes. A view is a per-employee
 * (optionally shared) named bundle of filters/sort/columns for a register
 * module ("items", "clients", "enquiries", …).
 */

/**
 * The views visible to `employeeId` in `module`: their own plus any shared ones.
 * Sorted by sort_order then name for a stable bar order.
 */
export async function listSavedViews(
  module: string,
  employeeId: string,
): Promise<SavedView[]> {
  return db
    .select()
    .from(savedViews)
    .where(
      and(
        eq(savedViews.module, module),
        or(eq(savedViews.employeeId, employeeId), eq(savedViews.isShared, true)),
      ),
    )
    .orderBy(asc(savedViews.sortOrder), asc(savedViews.name));
}
