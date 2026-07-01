import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, items } from "@/db/schema";

/**
 * Command-palette record search (ERP redesign — Phase 3, STUB).
 *
 * A lightweight federated search feeding the ⌘K palette's "search records"
 * section. This phase covers two spines: Items (by code / customer product name)
 * and Clients (by name / client code). Top 5 each, indexed `ILIKE` on the code
 * columns — no client-side scanning. Phase 9 (§1.4) expands this into the full
 * `command-search` UNION over SM / quotes / orders with trigram ranking.
 */

export interface CommandItemHit {
  type: "item";
  id: string;
  code: string;
  label: string | null;
}

export interface CommandClientHit {
  type: "client";
  id: string;
  code: string | null;
  label: string;
}

export interface CommandSearchResult {
  items: CommandItemHit[];
  clients: CommandClientHit[];
}

const LIMIT = 5;

export async function commandSearch(rawQuery: string): Promise<CommandSearchResult> {
  const q = rawQuery.trim();
  if (q.length < 2) return { items: [], clients: [] };
  const like = `%${q}%`;

  const [itemRows, clientRows] = await Promise.all([
    db
      .select({
        id: items.id,
        code: items.itemCode,
        // Display-only provenance label; origin_* is never part of the search
        // predicate (Canonical Decisions) — items are searched by item_code.
        label: items.originCustProductName,
      })
      .from(items)
      .where(and(eq(items.isActive, true), ilike(items.itemCode, like)))
      .orderBy(desc(items.createdAt))
      .limit(LIMIT),
    db
      .select({
        id: clients.id,
        code: clients.clientCode,
        label: clients.name,
      })
      .from(clients)
      .where(
        and(
          eq(clients.isActive, true),
          or(
            ilike(clients.name, like),
            ilike(sql`coalesce(${clients.clientCode}, '')`, like),
          ),
        ),
      )
      .orderBy(clients.name)
      .limit(LIMIT),
  ]);

  return {
    items: itemRows.map((r) => ({
      type: "item" as const,
      id: r.id,
      code: r.code,
      label: r.label,
    })),
    clients: clientRows.map((r) => ({
      type: "client" as const,
      id: r.id,
      code: r.code,
      label: r.label,
    })),
  };
}
