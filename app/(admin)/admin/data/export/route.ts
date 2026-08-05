import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dataTransferJobs } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { csvResponse, MAX_EXPORT_ROWS } from "@/lib/exports/csv";
import { DATA_JOB_FORMATS } from "@/db/enums";
import {
  EXPORT_ENTITY_KEYS,
  findExportEntry,
  transferFilename,
} from "@/lib/data-transfer/catalog";
import {
  buildExportDataset,
  contentTypeFor,
  datasetToXlsx,
  getExportRowCounts,
  hasBuilder,
} from "@/lib/data-transfer/exporters";

/**
 * GET /admin/data/export?entity=<key>&format=xlsx|csv
 *
 * The one door every admin bulk export goes through. Admin-only. Two paths:
 *
 *  - Datasets whose module already ships a canonical export route (Client
 *    Master, Item Master, Vendors, Tasks, Employees, Activity) get their run
 *    logged here and are then 302'd to that route - the humanised column set
 *    stays owned by the module, not duplicated.
 *  - Everything else is generated from `lib/data-transfer/exporters` and
 *    streamed back as XLSX or CSV.
 *
 * Either way a `data_transfer_jobs` row records who pulled what, when, in which
 * format, and how many rows it covered.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  entity: z.enum(EXPORT_ENTITY_KEYS),
  format: z.enum(DATA_JOB_FORMATS).default("xlsx"),
});

export async function GET(request: Request): Promise<Response> {
  let actorId: string;
  try {
    const me = await requireAdmin();
    actorId = me.id;
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    entity: url.searchParams.get("entity") ?? "",
    format: url.searchParams.get("format") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid export request" },
      { status: 400 },
    );
  }
  const { entity, format } = parsed.data;

  const entry = findExportEntry(entity);
  if (!entry) {
    return Response.json({ error: "Unknown dataset" }, { status: 400 });
  }
  if (!entry.formats.includes(format)) {
    return Response.json(
      { error: `${entry.label} is not available as ${format.toUpperCase()}.` },
      { status: 400 },
    );
  }

  // ── Delegated: log the run, then hand off to the module's own route ──
  if (entry.delegateTo) {
    const counts = await getExportRowCounts();
    await logJob({
      actorId,
      entity,
      format,
      status: "done",
      rowCount: counts[entry.key],
      fileName: entry.delegateTo,
      params: { delegatedTo: entry.delegateTo },
      completed: true,
    });
    return NextResponse.redirect(new URL(entry.delegateTo, request.url), 302);
  }

  if (!hasBuilder(entry.key)) {
    return Response.json(
      { error: `${entry.label} has no generator configured.` },
      { status: 500 },
    );
  }

  // ── Generated locally: open the log row, build, then close it ──
  const jobId = await logJob({
    actorId,
    entity,
    format,
    status: "running",
    rowCount: 0,
    fileName: transferFilename(entity, format),
    params: {},
    completed: false,
  });

  try {
    const dataset = await buildExportDataset(entry.key);
    const filename = transferFilename(entity, format);

    if (format === "csv") {
      const res = csvResponse({
        filename,
        headers: dataset.headers,
        rows: dataset.rows,
      });
      // csvResponse 422s above the row cap rather than truncating - record the
      // refusal so the admin can see why nothing downloaded.
      const overCap = dataset.rows.length > MAX_EXPORT_ROWS;
      await closeJob(jobId, {
        status: overCap ? "failed" : "done",
        rowCount: dataset.rows.length,
        errorCount: overCap ? 1 : 0,
        errorMessage: overCap
          ? `${dataset.rows.length} rows exceeds the ${MAX_EXPORT_ROWS}-row CSV cap - export as XLSX instead.`
          : null,
      });
      return res;
    }

    const body = datasetToXlsx(dataset);
    await closeJob(jobId, {
      status: "done",
      rowCount: dataset.rows.length,
      errorCount: 0,
      errorMessage: null,
    });
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": contentTypeFor(format),
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await closeJob(jobId, {
      status: "failed",
      rowCount: 0,
      errorCount: 1,
      errorMessage: message.slice(0, 500),
    });
    console.error("[admin/data/export] generation failed", err);
    return Response.json({ error: "Export failed. See the job log." }, { status: 500 });
  }
}

/** Insert the transfer-log row. Returns its id, or null if the write failed. */
async function logJob(input: {
  actorId: string;
  entity: string;
  format: (typeof DATA_JOB_FORMATS)[number];
  status: "running" | "done";
  rowCount: number;
  fileName: string;
  params: Record<string, unknown>;
  completed: boolean;
}): Promise<string | null> {
  try {
    const [row] = await db
      .insert(dataTransferJobs)
      .values({
        direction: "export",
        entity: input.entity,
        format: input.format,
        status: input.status,
        rowCount: input.rowCount,
        fileName: input.fileName,
        params: input.params,
        requestedById: input.actorId,
        completedAt: input.completed ? new Date() : null,
      })
      .returning({ id: dataTransferJobs.id });
    return row?.id ?? null;
  } catch (err) {
    // Never fail an export because its log row could not be written.
    console.error("[admin/data/export] job-log write failed (non-fatal)", err);
    return null;
  }
}

async function closeJob(
  jobId: string | null,
  patch: {
    status: "done" | "failed";
    rowCount: number;
    errorCount: number;
    errorMessage: string | null;
  },
): Promise<void> {
  if (!jobId) return;
  try {
    await db
      .update(dataTransferJobs)
      .set({ ...patch, completedAt: new Date() })
      .where(eq(dataTransferJobs.id, jobId));
  } catch (err) {
    console.error("[admin/data/export] job-log close failed (non-fatal)", err);
  }
}
