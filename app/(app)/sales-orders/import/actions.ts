"use server";

import { requireAdmin } from "@/lib/auth/current";
import { createSalesOrder } from "@/app/(app)/sales-orders/actions";
import { runImportCommit, type ImportCommitResult } from "@/lib/import/engine/commit";
import type { ImportRowPayload } from "@/lib/import/engine/spec";

export async function commitSalesOrderImport(rows: ImportRowPayload[]): Promise<ImportCommitResult> {
  await requireAdmin();
  return runImportCommit(rows, {
    createRecord: (input) => createSalesOrder(input as Parameters<typeof createSalesOrder>[0]),
  });
}
