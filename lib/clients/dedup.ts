import "server-only";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients } from "@/db/schema";

/** Normalize a GSTIN/PAN for comparison: trim + upper, empty → null. */
export function normalizeDedupKey(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = v.trim().toUpperCase();
  return s === "" ? null : s;
}

export interface DuplicateClient {
  id: string;
  name: string;
  clientCode: string | null;
}

/**
 * Hard dedup guard (ERP Phase 4 governance). Returns the first OTHER **active**
 * client whose normalized GSTIN or PAN matches a supplied value, or null. Used
 * to BLOCK a create/update — a master must be unique on its statutory id.
 * Inactive (deactivated) clients are ignored so a reactivation isn't blocked by
 * its own retired twin. Empty input → null (nothing to check).
 */
export async function findActiveDuplicateClient(input: {
  gstin?: string | null;
  panNo?: string | null;
  excludeId?: string | null;
}): Promise<DuplicateClient | null> {
  const gstin = normalizeDedupKey(input.gstin);
  const panNo = normalizeDedupKey(input.panNo);
  if (!gstin && !panNo) return null;

  const matchers = [];
  if (gstin) matchers.push(sql`upper(trim(${clients.gstin})) = ${gstin}`);
  if (panNo) matchers.push(sql`upper(trim(${clients.panNo})) = ${panNo}`);

  const exclude = input.excludeId?.trim();
  const where = and(
    eq(clients.isActive, true),
    or(...matchers),
    ...(exclude ? [ne(clients.id, exclude)] : []),
  );

  const [row] = await db
    .select({ id: clients.id, name: clients.name, clientCode: clients.clientCode })
    .from(clients)
    .where(where)
    .limit(1);

  return row ?? null;
}
