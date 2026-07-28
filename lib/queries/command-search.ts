import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, items } from "@/db/schema";
import { searchInquiries } from "@/lib/queries/inquiries";
import { searchTasks } from "@/lib/queries/task-search";
import type { ModuleKey } from "@/components/layout/modules";

/**
 * Command-palette record search - MODULE-SCOPED (⌘K palette).
 *
 * Search stays within the section the user is in: the Forms/Enquiries module
 * searches Enquiries + Clients, Masters searches Items + Clients, WMS searches
 * Tasks, and Admin has no record search (navigation only). Results come back in
 * a generic grouped shape so the palette can render any module's groups the same
 * way. Each hit carries its own destination href.
 */

/** A single navigable record hit. */
export interface CommandHit {
  id: string;
  /** Primary line (company name, item code, task title …). */
  primary: string;
  /** Secondary line (SM number, item label, #taskNo …). */
  secondary?: string;
  /** Destination for this hit. */
  href: string;
}

/** A labelled group of hits (e.g. "Enquiries", "Clients"). */
export interface CommandGroup {
  key: string;
  label: string;
  hits: CommandHit[];
}

export interface CommandSearchResult {
  groups: CommandGroup[];
}

const LIMIT = 5;

/** Escape ILIKE wildcards so "100%" matches literally. */
function toLike(q: string): string {
  return `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
}

async function searchItems(like: string): Promise<CommandHit[]> {
  const rows = await db
    .select({
      id: items.id,
      code: items.itemCode,
      // Display-only provenance label; origin_* is never part of the predicate
      // (Canonical Decisions) - items are searched by item_code.
      label: items.originCustProductName,
    })
    .from(items)
    .where(and(eq(items.isActive, true), ilike(items.itemCode, like)))
    .orderBy(desc(items.createdAt))
    .limit(LIMIT);
  return rows.map((r) => ({
    id: r.id,
    primary: r.code,
    secondary: r.label ?? undefined,
    href: `/items/${r.id}`,
  }));
}

async function searchClients(like: string): Promise<CommandHit[]> {
  const rows = await db
    .select({ id: clients.id, code: clients.clientCode, label: clients.name })
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
    .limit(LIMIT);
  return rows.map((r) => ({
    id: r.id,
    primary: r.label,
    secondary: r.code ?? undefined,
    href: `/clients/${r.id}`,
  }));
}

export async function commandSearch(
  rawQuery: string,
  scope: ModuleKey,
): Promise<CommandSearchResult> {
  const q = rawQuery.trim();
  if (q.length < 2) return { groups: [] };
  const like = toLike(q);

  if (scope === "enquiries") {
    const [enquiries, clientHits] = await Promise.all([
      searchInquiries(q),
      searchClients(like),
    ]);
    return {
      groups: [
        {
          key: "enquiries",
          label: "Enquiries",
          hits: enquiries.map((e) => ({
            id: e.id,
            primary: e.companyName,
            secondary: e.smNumber,
            href: `/enquiries/register/${e.id}`,
          })),
        },
        { key: "clients", label: "Clients", hits: clientHits },
      ].filter((g) => g.hits.length > 0),
    };
  }

  if (scope === "masters") {
    const [itemHits, clientHits] = await Promise.all([
      searchItems(like),
      searchClients(like),
    ]);
    return {
      groups: [
        { key: "items", label: "Items", hits: itemHits },
        { key: "clients", label: "Clients", hits: clientHits },
      ].filter((g) => g.hits.length > 0),
    };
  }

  if (scope === "wms") {
    const taskHits = await searchTasks(q);
    return {
      groups: [
        {
          key: "tasks",
          label: "Tasks",
          hits: taskHits.map((t) => ({
            id: t.id,
            primary: t.title,
            secondary: t.taskNo != null ? `#${t.taskNo}` : undefined,
            href: `/tasks/${t.id}`,
          })),
        },
      ].filter((g) => g.hits.length > 0),
    };
  }

  // admin: navigation only, no record search.
  return { groups: [] };
}
