"use server";

import { requireUser } from "@/lib/auth/current";
import { commandSearch, type CommandSearchResult } from "@/lib/queries/command-search";

/**
 * Server action backing the ⌘K command palette's "search records" section
 * (ERP redesign — Phase 3). Guarded by requireUser; delegates to the
 * lightweight federated `commandSearch` (Items + Clients, top 5 each).
 */
export async function commandSearchAction(query: string): Promise<CommandSearchResult> {
  await requireUser();
  return commandSearch(query);
}
