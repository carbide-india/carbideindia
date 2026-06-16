"use server";

import { requireAdmin } from "@/lib/auth/current";
import { createSample } from "@/app/(app)/samples/actions";
import { runImportCommit, type ImportCommitResult } from "@/lib/import/engine/commit";
import type { ImportRowPayload } from "@/lib/import/engine/spec";

export async function commitSampleImport(rows: ImportRowPayload[]): Promise<ImportCommitResult> {
  await requireAdmin();
  return runImportCommit(rows, {
    createRecord: (input) => createSample(input as Parameters<typeof createSample>[0]),
  });
}
