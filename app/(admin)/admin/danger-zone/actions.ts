"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employeeEvents,
  employees,
  formDrafts,
  loginSessions,
  notifications,
  pushSubscriptions,
  settingsEvents,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { recordAudit } from "@/lib/audit/record";
import { adminAuth } from "@/lib/firebase/admin";
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  DANGER_ZONE_OPERATIONS,
  DANGER_ZONE_WINDOW_MAX,
  DANGER_ZONE_WINDOW_MIN,
  clampWindow,
  confirmationMatches,
  type DangerZoneOperationMeta,
} from "@/lib/danger-zone/operations";
import {
  cutoffFor,
  getDangerZonePreview,
  type DangerZonePreview,
} from "@/lib/queries/danger-zone";

/**
 * Server actions for /admin/danger-zone. Every one of them:
 *   1. `requireAdmin()` first - no exceptions;
 *   2. re-validates the typed confirmation server-side (the dialog's gate is a
 *      convenience, this is the guard);
 *   3. re-counts server-side at execution time, so the number that runs is the
 *      number that existed a second ago, not whatever the client believed;
 *   4. writes an append-only `audit_log` row plus a `settings_events` receipt
 *      naming who ran what, when, and how many rows it touched.
 *
 * Nothing here hard-deletes a governed business entity. Employees are
 * deactivated, never removed; only recycle-bin drafts, read notifications and
 * device push tokens are actually destroyed.
 */

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const WindowSchema = z
  .number()
  .int("Window must be a whole number of days")
  .min(DANGER_ZONE_WINDOW_MIN, "Window can't be negative")
  .max(DANGER_ZONE_WINDOW_MAX, "Window is too large");

const WindowsSchema = z.object({
  recycledDraftDays: WindowSchema,
  readNotificationDays: WindowSchema,
  stalePushDeviceDays: WindowSchema,
});

const PurgeSchema = z.object({
  olderThanDays: WindowSchema,
  confirmation: z.string().max(200),
});

const RevokeSchema = z.object({
  employeeId: z.string().uuid("Invalid employee id"),
  confirmation: z.string().max(320),
});

const firstIssue = (err: z.ZodError): string =>
  err.issues[0]?.message ?? "Invalid input";

/**
 * Write the two trails for one run. `audit_log` is the legally-required
 * append-only record (a DB trigger blocks UPDATE/DELETE on it); the
 * `settings_events` row is what the page's "recent runs" strip reads back.
 * Neither failure is allowed to fail the operation that already happened -
 * both are logged instead.
 */
async function recordRun(
  meta: DangerZoneOperationMeta,
  actor: { id: string; name: string },
  input: {
    action: "delete" | "update";
    summary: string;
    details: Record<string, unknown>;
    /** Override for operations that act on a real entity (revoke). */
    entityType?: string;
    entityId?: string;
    entityLabel?: string;
  },
): Promise<void> {
  await recordAudit({
    entityType: input.entityType ?? "danger_zone_operation",
    entityId: input.entityId ?? meta.auditEntityId,
    entityLabel: input.entityLabel ?? meta.title,
    action: input.action,
    actorId: actor.id,
    actorName: actor.name,
    summary: input.summary,
  });
  try {
    await db.insert(settingsEvents).values({
      scope: "danger_zone",
      targetId: meta.key,
      actorId: actor.id,
      eventType: meta.key,
      toValue: input.details,
      note: input.summary,
    });
  } catch (err) {
    console.error(`[danger-zone] settings_events write failed for ${meta.key}`, err);
  }
}

/** Rows touched by a raw `db.execute` (postgres-js reports it on `.count`). */
function rowsAffected(result: unknown): number {
  const c = (result as { count?: unknown } | null)?.count;
  return typeof c === "number" ? c : 0;
}

/** Danger Zone pages always re-render from scratch after a run. */
function revalidateDangerZone(): void {
  revalidatePath("/admin/danger-zone");
  revalidatePath("/admin/activity");
}

// ── Preview ────────────────────────────────────────────────────────────────

/**
 * Re-count every operation for a new set of retention windows. Read-only;
 * exists so changing a window updates the shown blast radius without a full
 * page navigation.
 */
export async function previewDangerZone(input: {
  recycledDraftDays: number;
  readNotificationDays: number;
  stalePushDeviceDays: number;
}): Promise<ActionResult<{ preview: DangerZonePreview }>> {
  await requireAdmin();
  const parsed = WindowsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  try {
    const preview = await getDangerZonePreview(parsed.data);
    return { ok: true, preview };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not read the counts: ${msg}` };
  }
}

// ── 1. Purge recycled form drafts ──────────────────────────────────────────

export async function purgeRecycledDrafts(input: {
  olderThanDays: number;
  confirmation: string;
}): Promise<ActionResult<{ deleted: number }>> {
  const me = await requireAdmin();
  const meta = DANGER_ZONE_OPERATIONS.purge_recycled_drafts;

  const parsed = PurgeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!confirmationMatches(meta, parsed.data.confirmation)) {
    return { ok: false, error: `Type ${meta.confirmPhrase} exactly to confirm.` };
  }

  const days = clampWindow(parsed.data.olderThanDays);
  const cutoff = cutoffFor(days);

  let deleted: { id: string }[];
  try {
    // `lt(deletedAt, cutoff)` is false for NULL, so an ACTIVE draft can never
    // match - the isNotNull is belt-and-braces on the same guarantee.
    deleted = await db
      .delete(formDrafts)
      .where(and(isNotNull(formDrafts.deletedAt), lt(formDrafts.deletedAt, cutoff)))
      .returning({ id: formDrafts.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await recordRun(meta, me, {
    action: "delete",
    summary: `Purged ${deleted.length} recycled form draft(s) older than ${days} day(s)`,
    details: { olderThanDays: days, cutoff: cutoff.toISOString(), deleted: deleted.length },
  });

  revalidateDangerZone();
  return { ok: true, deleted: deleted.length };
}

// ── 2. Prune read notifications ────────────────────────────────────────────

export async function pruneReadNotifications(input: {
  olderThanDays: number;
  confirmation: string;
}): Promise<ActionResult<{ deleted: number }>> {
  const me = await requireAdmin();
  const meta = DANGER_ZONE_OPERATIONS.prune_read_notifications;

  const parsed = PurgeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!confirmationMatches(meta, parsed.data.confirmation)) {
    return { ok: false, error: `Type ${meta.confirmPhrase} exactly to confirm.` };
  }

  const days = clampWindow(parsed.data.olderThanDays);
  const cutoff = cutoffFor(days);

  let deleted: { id: string }[];
  try {
    // Unread rows are never eligible, whatever their age.
    deleted = await db
      .delete(notifications)
      .where(
        and(isNotNull(notifications.readAt), lt(notifications.createdAt, cutoff)),
      )
      .returning({ id: notifications.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await recordRun(meta, me, {
    action: "delete",
    summary: `Pruned ${deleted.length} read notification(s) older than ${days} day(s)`,
    details: { olderThanDays: days, cutoff: cutoff.toISOString(), deleted: deleted.length },
  });

  revalidateDangerZone();
  revalidatePath("/admin/notifications");
  return { ok: true, deleted: deleted.length };
}

// ── 3. Prune stale push devices ────────────────────────────────────────────

export async function pruneStalePushDevices(input: {
  olderThanDays: number;
  confirmation: string;
}): Promise<ActionResult<{ deleted: number }>> {
  const me = await requireAdmin();
  const meta = DANGER_ZONE_OPERATIONS.prune_stale_devices;

  const parsed = PurgeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!confirmationMatches(meta, parsed.data.confirmation)) {
    return { ok: false, error: `Type ${meta.confirmPhrase} exactly to confirm.` };
  }

  const days = clampWindow(parsed.data.olderThanDays);
  const cutoff = cutoffFor(days);

  let deleted: { id: string }[];
  try {
    deleted = await db
      .delete(pushSubscriptions)
      .where(lt(pushSubscriptions.lastSeenAt, cutoff))
      .returning({ id: pushSubscriptions.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await recordRun(meta, me, {
    action: "delete",
    summary: `Pruned ${deleted.length} push subscription(s) not seen for ${days} day(s)`,
    details: { olderThanDays: days, cutoff: cutoff.toISOString(), deleted: deleted.length },
  });

  revalidateDangerZone();
  return { ok: true, deleted: deleted.length };
}

// ── 4. Deactivate an employee and revoke their access ──────────────────────

function isFirebaseCode(err: unknown, code: string): boolean {
  const e = err as { code?: string; errorInfo?: { code?: string } };
  return e?.code === code || e?.errorInfo?.code === code;
}

function firebaseErrorMessage(err: unknown): string {
  const e = err as { errorInfo?: { message?: string }; message?: string };
  return e?.errorInfo?.message ?? e?.message ?? String(err);
}

/**
 * The Firebase uid for an employee: the linked `firebase_uid` when present,
 * else an email lookup (invited-but-never-joined rows have an account but no
 * link yet). Null means no Firebase account exists - nothing to disable.
 */
async function resolveFirebaseUid(
  firebaseUid: string | null,
  email: string,
): Promise<string | null> {
  if (firebaseUid) return firebaseUid;
  try {
    const user = await adminAuth.getUserByEmail(email);
    return user.uid;
  } catch (err) {
    if (isFirebaseCode(err, "auth/user-not-found")) return null;
    throw err;
  }
}

export async function deactivateAndRevokeEmployee(input: {
  employeeId: string;
  confirmation: string;
}): Promise<
  ActionResult<{
    name: string;
    deactivated: boolean;
    sessionsRevoked: number;
    devicesRemoved: number;
  }>
> {
  const me = await requireAdmin();
  const meta = DANGER_ZONE_OPERATIONS.revoke_employee_access;

  const parsed = RevokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (parsed.data.employeeId === me.id) {
    return { ok: false, error: "You can't revoke your own access." };
  }

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, parsed.data.employeeId),
  });
  if (!emp) return { ok: false, error: "Employee not found." };

  if (!confirmationMatches(meta, parsed.data.confirmation, emp.email)) {
    return { ok: false, error: "Confirmation email does not match." };
  }

  // 1. Deactivate the row. Already-inactive people are allowed through so the
  //    operation can still sweep sessions + devices (it is idempotent).
  const deactivatedNow = emp.isActive;
  if (deactivatedNow) {
    try {
      await db
        .update(employees)
        .set({ isActive: false })
        .where(eq(employees.id, emp.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `DB: ${msg}` };
    }
  }

  // 2. Disable the sign-in account. Roll the DB flag back if Firebase rejects,
  //    so the two systems never disagree about who can sign in.
  try {
    const uid = await resolveFirebaseUid(emp.firebaseUid, emp.email);
    if (uid) await adminAuth.updateUser(uid, { disabled: true });
  } catch (err) {
    if (deactivatedNow) {
      await db
        .update(employees)
        .set({ isActive: true })
        .where(eq(employees.id, emp.id))
        .catch((rollbackErr) => {
          console.error("[deactivateAndRevokeEmployee] rollback failed", rollbackErr);
        });
    }
    return { ok: false, error: `Firebase: ${firebaseErrorMessage(err)}` };
  }

  // 3. Kill live sessions (rows are revoked, never deleted - the trail stays).
  let sessionsRevoked = 0;
  try {
    const revoked = await db
      .update(loginSessions)
      .set({
        revokedAt: new Date(),
        revokedById: me.id,
        revokeReason: "Access revoked from the Danger Zone",
      })
      .where(
        and(eq(loginSessions.employeeId, emp.id), isNull(loginSessions.revokedAt)),
      )
      .returning({ id: loginSessions.id });
    sessionsRevoked = revoked.length;
  } catch (err) {
    // Non-fatal: the account is already disabled and the row deactivated, so
    // the person is locked out regardless of the session bookkeeping.
    console.error("[deactivateAndRevokeEmployee] session revoke failed", err);
  }

  // 4. Drop device push registrations so notifications stop reaching them.
  let devicesRemoved = 0;
  try {
    const removed = await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, emp.id))
      .returning({ id: pushSubscriptions.id });
    devicesRemoved = removed.length;
  } catch (err) {
    console.error("[deactivateAndRevokeEmployee] push cleanup failed", err);
  }

  const summary =
    `Access revoked for ${emp.name} (${emp.email}) - ` +
    `${deactivatedNow ? "deactivated" : "already inactive"}, ` +
    `${sessionsRevoked} session(s) revoked, ${devicesRemoved} device(s) removed`;

  await recordRun(meta, me, {
    action: "update",
    summary,
    details: { employeeId: emp.id, deactivatedNow, sessionsRevoked, devicesRemoved },
    entityType: "employee",
    entityId: emp.id,
    entityLabel: emp.name,
  });

  // Mirror into the employee's own lifecycle trail so /admin/employees and the
  // activity feed show the deactivation in context.
  if (deactivatedNow) {
    try {
      await db.insert(employeeEvents).values({
        employeeId: emp.id,
        actorId: me.id,
        eventType: "deactivated",
        fromValue: { isActive: true },
        toValue: { isActive: false },
        note: "Danger Zone: deactivate + revoke access",
      });
    } catch (err) {
      console.error("[deactivateAndRevokeEmployee] employee_events write failed", err);
    }
  }

  revalidateDangerZone();
  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return {
    ok: true,
    name: emp.name,
    deactivated: deactivatedNow,
    sessionsRevoked,
    devicesRemoved,
  };
}

// ── 5. Rebuild department mirrors (repair, nothing destroyed) ──────────────

export async function rebuildDerivedData(): Promise<
  ActionResult<{ linked: number; mirrored: number; memberships: number }>
> {
  const me = await requireAdmin();
  const meta = DANGER_ZONE_OPERATIONS.rebuild_derived_data;

  let linked = 0;
  let mirrored = 0;
  let memberships = 0;
  try {
    // 1. Legacy department text that names a real department but was never
    //    linked - attach the FK.
    linked = rowsAffected(
      await db.execute(sql`
        update employees e
           set department_id = d.id
          from departments d
         where e.department_id is null
           and e.department is not null
           and trim(e.department) <> ''
           and lower(trim(e.department)) = lower(d.name)
      `),
    );

    // 2. The text mirror follows the canonical name (renames propagate here).
    mirrored = rowsAffected(
      await db.execute(sql`
        update employees e
           set department = d.name
          from departments d
         where e.department_id = d.id
           and e.department is distinct from d.name
      `),
    );

    // 3. Every employee with a primary department gets its membership row.
    memberships = rowsAffected(
      await db.execute(sql`
        insert into employee_departments (employee_id, department_id, is_primary)
          select id, department_id, true
            from employees
           where department_id is not null
        on conflict (employee_id, department_id) do nothing
      `),
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await recordRun(meta, me, {
    action: "update",
    summary: `Rebuilt department mirrors - ${linked} linked, ${mirrored} renamed, ${memberships} membership(s) added`,
    details: { linked, mirrored, memberships },
  });

  revalidateDangerZone();
  revalidatePath("/admin/departments");
  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true, linked, mirrored, memberships };
}

// ── 6. Clear application caches (no data touched) ──────────────────────────

export async function clearApplicationCaches(): Promise<
  ActionResult<{ tags: number }>
> {
  const me = await requireAdmin();
  const meta = DANGER_ZONE_OPERATIONS.clear_caches;

  const tags = Object.values(CACHE_TAGS);
  for (const tag of tags) updateTag(tag);
  // Root layout revalidation covers every route below it, admin + app alike.
  revalidatePath("/", "layout");

  await recordRun(meta, me, {
    action: "update",
    summary: `Cleared ${tags.length} cache tag(s) and revalidated every route`,
    details: { tags },
  });

  return { ok: true, tags: tags.length };
}
