import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { auditLog, taskEvents } from "@/db/schema";
import type { TaskEventType } from "@/lib/events";
import type { FieldChange } from "@/lib/audit/diff";

export type AuditFeedRow = {
  id: string;
  taskId: string;
  actorId: string;
  actorName: string | null;
  eventType: TaskEventType;
  fromValue: unknown;
  toValue: unknown;
  note: string | null;
  createdAt: Date;
};

/**
 * Returns every event for the task, newest first.  Joins the actor
 * employee row for the rendered name.  RLS enforces the spec's
 * "task participants OR admin" read rule (migration 0008).
 */
export async function listTaskEvents(taskId: string): Promise<AuditFeedRow[]> {
  const rows = await db
    .select({
      id: taskEvents.id,
      taskId: taskEvents.taskId,
      actorId: taskEvents.actorId,
      actorName: employees.name,
      eventType: taskEvents.eventType,
      fromValue: taskEvents.fromValue,
      toValue: taskEvents.toValue,
      note: taskEvents.note,
      createdAt: taskEvents.createdAt,
    })
    .from(taskEvents)
    .leftJoin(employees, eq(taskEvents.actorId, employees.id))
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(desc(taskEvents.createdAt));

  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    actorId: r.actorId,
    actorName: r.actorName ?? null,
    eventType: r.eventType as TaskEventType,
    fromValue: r.fromValue,
    toValue: r.toValue,
    note: r.note,
    createdAt: r.createdAt,
  }));
}

// ── Audit log (ERP Phase 1) ────────────────────────────────────────────────

export type AuditEntry = {
  id: string;
  action: string;
  /** Resolved display name: live employee name, falling back to the snapshot. */
  actorName: string | null;
  changes: FieldChange[] | null;
  summary: string | null;
  createdAt: Date;
};

/**
 * Returns all audit_log rows for the given entity, newest-first.
 * The actor name is resolved by LEFT JOINing the employees table; if the
 * employee row was deleted (actor_id set null) the snapshot actor_name is
 * used instead.
 */
export async function getAuditLog(
  entityType: string,
  entityId: string,
): Promise<AuditEntry[]> {
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorNameLive: employees.name,
      actorNameSnapshot: auditLog.actorName,
      changes: auditLog.changes,
      summary: auditLog.summary,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(employees, eq(auditLog.actorId, employees.id))
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    .orderBy(desc(auditLog.createdAt));

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorName: r.actorNameLive ?? r.actorNameSnapshot ?? null,
    changes: (r.changes as FieldChange[] | null) ?? null,
    summary: r.summary ?? null,
    createdAt: r.createdAt,
  }));
}
