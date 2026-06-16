"use server";

import { requireAdmin } from "@/lib/auth/current";
import { createNegotiation } from "@/app/(app)/negotiations/actions";
import { runImportCommit, type ImportCommitResult } from "@/lib/import/engine/commit";
import type { ImportRowPayload } from "@/lib/import/engine/spec";

export async function commitNegotiationImport(rows: ImportRowPayload[]): Promise<ImportCommitResult> {
  await requireAdmin();
  return runImportCommit(rows, {
    createRecord: (input) => createNegotiation(input as Parameters<typeof createNegotiation>[0]),
  });
}
