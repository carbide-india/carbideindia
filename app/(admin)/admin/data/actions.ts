"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dataTransferJobs, settingsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { recordAudit } from "@/lib/audit/record";
import type { ImportCommitResult } from "@/lib/import/engine/commit";
import type { ImportRowPayload } from "@/lib/import/engine/spec";
import {
  IMPORT_ENTITY_KEYS,
  type ImportEntityKey,
} from "@/lib/data-transfer/catalog";
import { commitKycImport } from "@/app/(app)/clients/import/actions";
import { commitEnquiryImport } from "@/app/(app)/inquiries/import/actions";
import { commitItemImport } from "@/app/(app)/items/import/actions";
import { commitSampleImport } from "@/app/(app)/samples/import/actions";
import { commitMeetingImport } from "@/app/(app)/meetings/import/actions";
import { commitQuotationImport } from "@/app/(app)/quotations/import/actions";
import { commitNegotiationImport } from "@/app/(app)/negotiations/import/actions";
import { commitSalesOrderImport } from "@/app/(app)/sales-orders/import/actions";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/** Rows are validated cell-by-cell downstream; here we only bound the payload. */
const RowsSchema = z
  .array(z.record(z.string(), z.unknown()))
  .min(1, "No rows to import.")
  .max(5000, "Import at most 5000 rows per run - split the sheet.");

const JobIdSchema = z.string().uuid("Invalid job id");

/**
 * Log one finished import run against `data_transfer_jobs`. Fire-and-forget:
 * the records were already created, so a logging failure must never turn a
 * successful import into an error in the operator's face.
 */
async function logImportJob(
  entity: ImportEntityKey,
  actorId: string,
  rowsAttempted: number,
  result: ImportCommitResult,
): Promise<void> {
  try {
    await db.insert(dataTransferJobs).values({
      direction: "import",
      entity,
      format: "xlsx",
      status: result.errors.length > 0 ? "failed" : "done",
      rowCount: result.created,
      errorCount: result.errors.length,
      params: {
        rowsAttempted,
        duplicatesSkipped: result.duplicates,
        newMastersCreated: result.newMasters,
        // Keep the first few reasons only: the log is a summary, not a mirror
        // of the workbench's per-row grid.
        firstErrors: result.errors.slice(0, 10),
      },
      errorMessage:
        result.errors.length > 0
          ? `${result.errors.length} row(s) failed; first: ${result.errors[0]?.reason ?? ""}`
          : null,
      requestedById: actorId,
      completedAt: new Date(),
    });
  } catch (err) {
    console.error("[logImportJob] job-log write failed (non-fatal)", err);
  }
}

/**
 * Run one of the existing per-module bulk-import commits and record the run in
 * the transfer log. Every wrapper below re-enters the module's own commit
 * action, so business logic (auto numbering, dedupe, master creation, audit)
 * stays identical to launching the import from that module's own page - this
 * hub only adds the log entry and the revalidate.
 */
async function runCatalogImport(
  entity: ImportEntityKey,
  rows: ImportRowPayload[],
  commit: (rows: ImportRowPayload[]) => Promise<ImportCommitResult>,
): Promise<ImportCommitResult> {
  const me = await requireAdmin();

  const parsed = RowsSchema.safeParse(rows);
  if (!parsed.success) {
    const reason = parsed.error.issues[0]?.message ?? "Invalid rows payload";
    // Surface as a normal commit result so the workbench renders it inline.
    return {
      ok: false,
      created: 0,
      skipped: rows.length,
      duplicates: 0,
      newMasters: 0,
      errors: [{ row: 0, reason }],
      duplicateRows: [],
    };
  }

  const result = await commit(rows);
  await logImportJob(entity, me.id, rows.length, result);
  revalidatePath("/admin/data");
  return result;
}

export async function importClients(
  rows: ImportRowPayload[],
): Promise<ImportCommitResult> {
  return runCatalogImport("clients", rows, commitKycImport);
}

export async function importItems(
  rows: ImportRowPayload[],
): Promise<ImportCommitResult> {
  return runCatalogImport("items", rows, commitItemImport);
}

export async function importEnquiries(
  rows: ImportRowPayload[],
): Promise<ImportCommitResult> {
  return runCatalogImport("enquiries", rows, commitEnquiryImport);
}

export async function importSamples(
  rows: ImportRowPayload[],
): Promise<ImportCommitResult> {
  return runCatalogImport("samples", rows, commitSampleImport);
}

export async function importMeetings(
  rows: ImportRowPayload[],
): Promise<ImportCommitResult> {
  return runCatalogImport("meetings", rows, commitMeetingImport);
}

export async function importQuotations(
  rows: ImportRowPayload[],
): Promise<ImportCommitResult> {
  return runCatalogImport("quotations", rows, commitQuotationImport);
}

export async function importNegotiations(
  rows: ImportRowPayload[],
): Promise<ImportCommitResult> {
  return runCatalogImport("negotiations", rows, commitNegotiationImport);
}

export async function importSalesOrders(
  rows: ImportRowPayload[],
): Promise<ImportCommitResult> {
  return runCatalogImport("salesOrders", rows, commitSalesOrderImport);
}

/**
 * Mark a stuck `pending`/`running` job as failed. Export runs open their log
 * row before streaming and close it after, so a process that dies mid-stream
 * leaves an in-flight row behind forever; this is the operator's way to retire
 * one. Irreversible (the log is never edited back) - the UI confirms first.
 */
export async function cancelDataTransferJob(
  jobId: string,
  note: string,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = JobIdSchema.safeParse(jobId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid job id" };
  }
  const parsedNote = z
    .string()
    .trim()
    .max(400, "Keep the reason under 400 characters.")
    .safeParse(note);
  if (!parsedNote.success) {
    return { ok: false, error: parsedNote.error.issues[0]?.message ?? "Invalid reason" };
  }

  const job = await db.query.dataTransferJobs.findFirst({
    where: eq(dataTransferJobs.id, parsedId.data),
  });
  if (!job) return { ok: false, error: "That job is no longer in the log." };
  if (job.status !== "pending" && job.status !== "running") {
    return { ok: false, error: "Only a queued or running job can be retired." };
  }

  const reason = parsedNote.data || "Retired by an administrator.";
  const updated = await db
    .update(dataTransferJobs)
    .set({
      status: "failed",
      errorMessage: `Cancelled: ${reason}`,
      completedAt: new Date(),
    })
    // Re-check the status in the UPDATE so two admins clicking at once can't
    // both "win" and overwrite a run that finished in between.
    .where(
      and(
        eq(dataTransferJobs.id, job.id),
        inArray(dataTransferJobs.status, ["pending", "running"]),
      ),
    )
    .returning({ id: dataTransferJobs.id });
  if (updated.length === 0) {
    return { ok: false, error: "That job finished before it could be retired." };
  }

  await recordAudit({
    entityType: "data_transfer_job",
    entityId: job.id,
    entityLabel: `${job.direction} · ${job.entity}`,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    summary: `Retired a stuck ${job.direction} job: ${reason}`,
  });

  try {
    await db.insert(settingsEvents).values({
      scope: "data_transfer",
      targetId: job.id,
      actorId: me.id,
      eventType: "job_cancelled",
      fromValue: { status: job.status },
      toValue: { status: "failed", reason },
    });
  } catch (err) {
    console.error("[cancelDataTransferJob] settings event write failed", err);
  }

  revalidatePath("/admin/data");
  return { ok: true };
}

/**
 * Record that an admin pulled a blank template for an entity. Templates are
 * generated in the browser from the same spec the importer validates against,
 * so there is no file to stream - but the download is still a data-movement
 * event worth having in the log next to the import it precedes.
 */
export async function logTemplateDownload(
  entity: string,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsed = z
    .enum(IMPORT_ENTITY_KEYS)
    .safeParse(entity);
  if (!parsed.success) return { ok: false, error: "Unknown import entity." };

  try {
    await db.insert(dataTransferJobs).values({
      direction: "export",
      entity: `${parsed.data}_template`,
      format: "xlsx",
      status: "done",
      rowCount: 0,
      fileName: `${parsed.data}-import-template.xlsx`,
      params: { kind: "blank_template" },
      requestedById: me.id,
      completedAt: new Date(),
    });
  } catch (err) {
    console.error("[logTemplateDownload] job-log write failed (non-fatal)", err);
    return { ok: false, error: "Template downloaded, but the log write failed." };
  }

  revalidatePath("/admin/data");
  return { ok: true };
}
