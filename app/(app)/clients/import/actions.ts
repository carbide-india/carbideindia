"use server";

import { requireAdmin } from "@/lib/auth/current";
import { createClientKyc } from "@/app/(app)/clients/actions";
import { runImportCommit, type ImportCommitResult } from "@/lib/import/engine/commit";
import type { ImportRowPayload } from "@/lib/import/engine/spec";

export async function commitKycImport(rows: ImportRowPayload[]): Promise<ImportCommitResult> {
  await requireAdmin();
  return runImportCommit(rows, {
    createRecord: (input) => createClientKyc(input as Parameters<typeof createClientKyc>[0]),
  });
}
