"use server";

import { requireUser } from "@/lib/auth/current";
import { commandSearch, type CommandSearchResult } from "@/lib/queries/command-search";
import type { ModuleKey } from "@/components/layout/modules";

/**
 * Server action backing the ⌘K command palette's record-search section, scoped
 * to the caller's current module. Guarded by requireUser; delegates to the
 * module-scoped `commandSearch` (Enquiries/Clients, Items/Clients, Tasks, or
 * nothing for Admin).
 */
export async function commandSearchAction(
  query: string,
  scope: ModuleKey,
): Promise<CommandSearchResult> {
  await requireUser();
  return commandSearch(query, scope);
}
