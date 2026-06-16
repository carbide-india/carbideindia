"use server";

import { requireAdmin } from "@/lib/auth/current";
import { createClientMeeting } from "@/app/(app)/meetings/actions";
import { runImportCommit, type ImportCommitResult } from "@/lib/import/engine/commit";
import type { ImportRowPayload } from "@/lib/import/engine/spec";

export async function commitMeetingImport(rows: ImportRowPayload[]): Promise<ImportCommitResult> {
  await requireAdmin();
  return runImportCommit(rows, {
    defaults: { purpose: "regular_order" },
    createRecord: (input) => createClientMeeting(input as Parameters<typeof createClientMeeting>[0]),
  });
}
