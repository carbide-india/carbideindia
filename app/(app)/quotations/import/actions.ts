"use server";

import { requireAdmin } from "@/lib/auth/current";
import { createQuotation } from "@/app/(app)/quotations/actions";
import { runImportCommit, type ImportCommitResult } from "@/lib/import/engine/commit";
import type { ImportRowPayload } from "@/lib/import/engine/spec";

export async function commitQuotationImport(rows: ImportRowPayload[]): Promise<ImportCommitResult> {
  await requireAdmin();
  return runImportCommit(rows, {
    // Legacy bulk import of historical quote-master rows: these predate the
    // costing-lock workflow and carry no per-line inquiry_item link, so the
    // Phase 5 costing hard-gate is bypassed for the importer only.
    createRecord: (input) =>
      createQuotation(input as Parameters<typeof createQuotation>[0], {
        enforceCostingGate: false,
      }),
  });
}
