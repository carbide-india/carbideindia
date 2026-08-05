import "server-only";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  auditDataExports,
  dataTransferJobs,
  employees,
} from "@/db/schema";
import type {
  DataJobDirection,
  DataJobFormat,
  DataJobStatus,
} from "@/db/enums";

/** One row of the Import / Export job log. */
export interface DataTransferJobRow {
  id: string;
  direction: DataJobDirection;
  entity: string;
  format: DataJobFormat;
  status: DataJobStatus;
  rowCount: number;
  errorCount: number;
  fileName: string | null;
  errorMessage: string | null;
  requestedByName: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface DataTransferJobFilters {
  direction?: DataJobDirection;
  entity?: string;
  status?: DataJobStatus;
}

/**
 * Recent import/export runs, newest first. URL-driven filters (nuqs) make this
 * intentionally uncached - every render hits the DB with the exact filter set.
 * Capped so the page stays fast once the log has years of history in it.
 */
export async function listDataTransferJobs(
  filters: DataTransferJobFilters = {},
  limit = 100,
): Promise<DataTransferJobRow[]> {
  const conds: SQL[] = [];
  if (filters.direction) {
    conds.push(eq(dataTransferJobs.direction, filters.direction));
  }
  if (filters.entity) conds.push(eq(dataTransferJobs.entity, filters.entity));
  if (filters.status) conds.push(eq(dataTransferJobs.status, filters.status));

  const actor = alias(employees, "emp_requested_by");
  return db
    .select({
      id: dataTransferJobs.id,
      direction: dataTransferJobs.direction,
      entity: dataTransferJobs.entity,
      format: dataTransferJobs.format,
      status: dataTransferJobs.status,
      rowCount: dataTransferJobs.rowCount,
      errorCount: dataTransferJobs.errorCount,
      fileName: dataTransferJobs.fileName,
      errorMessage: dataTransferJobs.errorMessage,
      requestedByName: actor.name,
      startedAt: dataTransferJobs.startedAt,
      completedAt: dataTransferJobs.completedAt,
    })
    .from(dataTransferJobs)
    .leftJoin(actor, eq(dataTransferJobs.requestedById, actor.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(dataTransferJobs.startedAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export interface DataTransferStats {
  total: number;
  imports: number;
  exports: number;
  rowsImported: number;
  rowsExported: number;
  failed: number;
  /** Jobs still `pending`/`running` - a stuck run an admin may want to cancel. */
  inFlight: number;
  lastRunAt: Date | null;
}

/** Headline numbers for the page's stat sub-line + KPI strip. */
export async function getDataTransferStats(): Promise<DataTransferStats> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      imports: sql<number>`count(*) filter (where ${dataTransferJobs.direction} = 'import')::int`,
      exports: sql<number>`count(*) filter (where ${dataTransferJobs.direction} = 'export')::int`,
      rowsImported: sql<number>`coalesce(sum(${dataTransferJobs.rowCount}) filter (where ${dataTransferJobs.direction} = 'import'), 0)::int`,
      rowsExported: sql<number>`coalesce(sum(${dataTransferJobs.rowCount}) filter (where ${dataTransferJobs.direction} = 'export'), 0)::int`,
      failed: sql<number>`count(*) filter (where ${dataTransferJobs.status} = 'failed')::int`,
      inFlight: sql<number>`count(*) filter (where ${dataTransferJobs.status} in ('pending','running'))::int`,
      lastRunAt: sql<Date | null>`max(${dataTransferJobs.startedAt})`,
    })
    .from(dataTransferJobs);

  return (
    row ?? {
      total: 0,
      imports: 0,
      exports: 0,
      rowsImported: 0,
      rowsExported: 0,
      failed: 0,
      inFlight: 0,
      lastRunAt: null,
    }
  );
}

/** Distinct entity keys that actually appear in the log - drives the filter. */
export async function listLoggedEntities(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ entity: dataTransferJobs.entity })
    .from(dataTransferJobs)
    .orderBy(dataTransferJobs.entity);
  return rows.map((r) => r.entity);
}

/** One personal "download my data" request from /profile (read-only here). */
export interface PersonalDataExportRow {
  id: string;
  employeeName: string;
  status: "pending" | "processing" | "done" | "failed";
  requestedAt: Date;
  completedAt: Date | null;
  error: string | null;
}

/**
 * The personal export queue (`audit_data_exports`) an employee fills from
 * /profile. Deliberately NOT merged into `data_transfer_jobs`: that table is
 * the admin's bulk register transfers. Surfaced here read-only so an admin can
 * see a request is outstanding without leaving the hub.
 */
export async function listPersonalDataExports(
  limit = 25,
): Promise<PersonalDataExportRow[]> {
  return db
    .select({
      id: auditDataExports.id,
      employeeName: employees.name,
      status: auditDataExports.status,
      requestedAt: auditDataExports.requestedAt,
      completedAt: auditDataExports.completedAt,
      error: auditDataExports.error,
    })
    .from(auditDataExports)
    .innerJoin(employees, eq(auditDataExports.employeeId, employees.id))
    .orderBy(desc(auditDataExports.requestedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}
