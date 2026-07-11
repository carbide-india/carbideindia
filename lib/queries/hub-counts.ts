import "server-only";
import { count, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { tasks, inquiries, items, employees } from "@/db/schema";

export interface HubCounts {
  wms: number | null;
  enquiries: number | null;
  masters: number | null;
  admin: number | null;
}

/** Await a `count()` query, degrading to null on any failure (never crashes the hub). */
async function one(q: PromiseLike<{ n: number }[]>): Promise<number | null> {
  try {
    const rows = await q;
    return Number(rows[0]?.n ?? 0);
  } catch {
    return null;
  }
}

/**
 * Live workspace metrics for the Hub launchpad cards. One cheap indexed
 * `count()` per module, run in parallel and cached for 60s. Every count
 * degrades to `null` independently so a slow/failed query just hides that
 * card's number instead of taking down the page.
 */
export const getHubCounts = unstable_cache(
  async (): Promise<HubCounts> => {
    const [wms, enquiries, masters, admin] = await Promise.all([
      one(db.select({ n: count() }).from(tasks).where(eq(tasks.archived, false))),
      one(db.select({ n: count() }).from(inquiries)),
      one(db.select({ n: count() }).from(items)),
      one(db.select({ n: count() }).from(employees).where(eq(employees.isActive, true))),
    ]);
    return { wms, enquiries, masters, admin };
  },
  ["hub-counts"],
  { revalidate: 60 },
);
