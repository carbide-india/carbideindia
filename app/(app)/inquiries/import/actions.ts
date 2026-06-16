"use server";

import { requireAdmin } from "@/lib/auth/current";
import { createInquiry } from "@/app/(app)/inquiries/actions";
import { runImportCommit, type ImportCommitResult } from "@/lib/import/engine/commit";
import type { ImportRowPayload } from "@/lib/import/engine/spec";

/** Admin-only. One inquiry per valid row via the existing createInquiry path
 *  (so SM auto-numbering etc. are identical). Injects the fields the schema
 *  requires but the sheet doesn't carry: clientMode "new" (upsert client by
 *  companyName), plus priority/currency/country defaults. */
export async function commitEnquiryImport(rows: ImportRowPayload[]): Promise<ImportCommitResult> {
  await requireAdmin();
  return runImportCommit(rows, {
    defaults: { clientMode: "new", priority: "normal", currency: "INR", country: "India" },
    createRecord: (input) => createInquiry(input as Parameters<typeof createInquiry>[0]),
  });
}
