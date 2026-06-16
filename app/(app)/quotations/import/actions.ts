"use server";

import { requireAdmin } from "@/lib/auth/current";
import { createQuotation } from "@/app/(app)/quotations/actions";
import { runImportCommit, type ImportCommitResult } from "@/lib/import/engine/commit";
import type { ImportRowPayload } from "@/lib/import/engine/spec";

export async function commitQuotationImport(rows: ImportRowPayload[]): Promise<ImportCommitResult> {
  await requireAdmin();
  return runImportCommit(rows, {
    createRecord: (input) => createQuotation(input as Parameters<typeof createQuotation>[0]),
  });
}
