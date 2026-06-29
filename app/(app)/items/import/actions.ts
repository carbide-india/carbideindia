"use server";

import { requireUser } from "@/lib/auth/current";
import { createItem } from "@/app/(app)/items/actions";
import { runImportCommit, type ImportCommitResult } from "@/lib/import/engine/commit";
import type { ImportRowPayload } from "@/lib/import/engine/spec";

/** Role-open (requireUser). One Item per valid row via the existing createItem
 *  path, so the internal item-code generation, dedup/reuse and audit trail stay
 *  identical to single-record entry. */
export async function commitItemImport(rows: ImportRowPayload[]): Promise<ImportCommitResult> {
  await requireUser();
  return runImportCommit(rows, {
    createRecord: (input) => createItem(input as Parameters<typeof createItem>[0]),
  });
}
