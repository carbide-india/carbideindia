"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, isNotNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";

type Result = { ok: true } | { ok: false; error: string };

/** Recycled enquiries are purged this long after deletion (48h). */
const RECYCLE_TTL_MS = 48 * 60 * 60 * 1000;

function revalidateRecycleViews(): void {
  revalidatePath("/enquiries/register");
  revalidatePath("/enquiries/recycle-bin");
  revalidatePath("/pipeline");
  revalidatePath("/feasibility");
  revalidatePath("/secondary-feasibility");
}

/**
 * Soft-delete an enquiry → Recycle Bin. The whole pipeline hangs off the
 * inquiry, so stamping `deleted_at` makes the entire thing (every stage)
 * disappear from the registers at once. Reversible via `restoreInquiry`;
 * permanently purged 48h later.
 */
export async function recycleInquiry(inquiryId: string): Promise<Result> {
  await requireUser();
  try {
    await db
      .update(inquiries)
      .set({ deletedAt: new Date() })
      .where(and(eq(inquiries.id, inquiryId), isNull(inquiries.deletedAt)));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete." };
  }
  revalidateRecycleViews();
  return { ok: true };
}

/** Restore a recycled enquiry (clear `deleted_at`) — the whole pipeline returns. */
export async function restoreInquiry(inquiryId: string): Promise<Result> {
  await requireUser();
  try {
    await db
      .update(inquiries)
      .set({ deletedAt: null })
      .where(eq(inquiries.id, inquiryId));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not restore." };
  }
  revalidateRecycleViews();
  return { ok: true };
}

/**
 * Permanently remove enquiries recycled more than 48h ago. Hard delete cascades
 * to the pipeline children (inquiry_items, costings, quotations, negotiations,
 * sales_orders — all `on delete cascade`); linked samples are `set null`, so the
 * physical sample record survives, just unlinked. Called by the nightly cron.
 */
export async function purgeExpiredRecycledInquiries(): Promise<{ purged: number }> {
  const cutoff = new Date(Date.now() - RECYCLE_TTL_MS);
  const rows = await db
    .delete(inquiries)
    .where(and(isNotNull(inquiries.deletedAt), lt(inquiries.deletedAt, cutoff)))
    .returning({ id: inquiries.id });
  return { purged: rows.length };
}
