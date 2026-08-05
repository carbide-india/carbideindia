"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  employees,
  loginSessions,
  pushSubscriptions,
  settingsEvents,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { recordAudit } from "@/lib/audit/record";
import { adminAuth } from "@/lib/firebase/admin";

/**
 * Server actions for /admin/sessions.
 *
 * What "revoke" can actually mean here, honestly:
 *  - `login_sessions.revoked_at`  - our record is marked dead (admin-visible trail)
 *  - `push_subscriptions`         - deleted, so the device stops receiving pushes (real, immediate)
 *  - Firebase `revokeRefreshTokens` - the user's refresh tokens are invalidated, so no
 *    NEW session cookie can be minted; an already-issued `__session` cookie stays
 *    cryptographically valid until it expires because lib/auth/current.ts verifies
 *    with checkRevoked=false. The UI states this rather than implying a hard kill.
 *
 * The hard kill is deactivating the employee (/admin/employees), which
 * requireUser() enforces on every request - linked from the page, not done here.
 */

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const ReasonSchema = z
  .string()
  .trim()
  .max(300, "Reason must be 300 characters or fewer")
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const RevokeSessionSchema = z.object({
  sessionId: z.string().uuid("Invalid session id"),
  reason: ReasonSchema,
});

const RevokeEmployeeSchema = z.object({
  employeeId: z.string().uuid("Invalid employee id"),
  reason: ReasonSchema,
  revokePushDevices: z.boolean(),
  revokeFirebaseTokens: z.boolean(),
});

const RevokeStaleSchema = z.object({
  olderThanHours: z
    .number()
    .int("Hours must be a whole number")
    .min(1, "Must be at least 1 hour")
    .max(24 * 90, "Must be 90 days or fewer"),
  reason: ReasonSchema,
});

const RemovePushSchema = z.object({
  subscriptionId: z.string().uuid("Invalid device id"),
});

/** settings_events is best-effort telemetry - never fail the action on it. */
async function logSettingsEvent(input: {
  actorId: string;
  targetId: string;
  eventType: string;
  fromValue?: Record<string, unknown>;
  toValue?: Record<string, unknown>;
  note?: string | null;
}): Promise<void> {
  try {
    await db.insert(settingsEvents).values({
      scope: "session",
      targetId: input.targetId,
      actorId: input.actorId,
      eventType: input.eventType,
      fromValue: input.fromValue ?? null,
      toValue: input.toValue ?? null,
      note: input.note ?? null,
    });
  } catch (err) {
    console.error("[sessions] settings event write failed", err);
  }
}

/** Revoke ONE recorded session row. */
export async function revokeLoginSession(
  input: z.input<typeof RevokeSessionSchema>,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsed = RevokeSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const row = await db.query.loginSessions.findFirst({
    where: eq(loginSessions.id, parsed.data.sessionId),
  });
  if (!row) return { ok: false, error: "Session not found." };
  if (row.revokedAt) return { ok: false, error: "That session is already revoked." };

  const owner = await db.query.employees.findFirst({
    where: eq(employees.id, row.employeeId),
    columns: { id: true, name: true },
  });

  try {
    await db
      .update(loginSessions)
      .set({
        revokedAt: new Date(),
        revokedById: me.id,
        revokeReason: parsed.data.reason,
      })
      .where(and(eq(loginSessions.id, row.id), isNull(loginSessions.revokedAt)));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await recordAudit({
    entityType: "login_session",
    entityId: row.id,
    entityLabel: owner?.name ?? row.employeeId,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    summary: `Revoked a session for ${owner?.name ?? "an employee"}${
      parsed.data.reason ? ` - ${parsed.data.reason}` : ""
    }`,
  });
  await logSettingsEvent({
    actorId: me.id,
    targetId: row.id,
    eventType: "session_revoked",
    fromValue: { ip: row.ip, lastSeenAt: row.lastSeenAt.toISOString() },
    toValue: { revoked: true },
    note: parsed.data.reason,
  });

  revalidatePath("/admin/sessions");
  return { ok: true };
}

/**
 * Revoke everything we can for one employee: all live session rows, optionally
 * their push subscriptions, optionally their Firebase refresh tokens.
 */
export async function revokeEmployeeAccess(
  input: z.input<typeof RevokeEmployeeSchema>,
): Promise<
  ActionResult<{
    sessionsRevoked: number;
    pushDevicesRemoved: number;
    firebaseRevoked: boolean;
    firebaseError: string | null;
  }>
> {
  const me = await requireAdmin();

  const parsed = RevokeEmployeeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { employeeId, reason, revokePushDevices, revokeFirebaseTokens } =
    parsed.data;

  const person = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    columns: { id: true, name: true, email: true, firebaseUid: true },
  });
  if (!person) return { ok: false, error: "Employee not found." };

  let sessionsRevoked = 0;
  let pushDevicesRemoved = 0;
  try {
    await db.transaction(async (tx) => {
      const revoked = await tx
        .update(loginSessions)
        .set({
          revokedAt: new Date(),
          revokedById: me.id,
          revokeReason: reason,
        })
        .where(
          and(
            eq(loginSessions.employeeId, employeeId),
            isNull(loginSessions.revokedAt),
          ),
        )
        .returning({ id: loginSessions.id });
      sessionsRevoked = revoked.length;

      if (revokePushDevices) {
        const removed = await tx
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, employeeId))
          .returning({ id: pushSubscriptions.id });
        pushDevicesRemoved = removed.length;
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  // Firebase is outside the transaction on purpose - it cannot be rolled back,
  // so it runs last and its failure is reported rather than losing the DB work.
  let firebaseRevoked = false;
  let firebaseError: string | null = null;
  if (revokeFirebaseTokens) {
    if (!person.firebaseUid) {
      firebaseError = "This employee has never signed in with Firebase.";
    } else {
      try {
        await adminAuth.revokeRefreshTokens(person.firebaseUid);
        firebaseRevoked = true;
      } catch (err: unknown) {
        firebaseError = err instanceof Error ? err.message : String(err);
        console.error("[sessions] revokeRefreshTokens failed", err);
      }
    }
  }

  await recordAudit({
    entityType: "employee",
    entityId: person.id,
    entityLabel: person.name,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    summary:
      `Revoked access for ${person.name}: ${sessionsRevoked} session(s)` +
      (revokePushDevices ? `, ${pushDevicesRemoved} push device(s)` : "") +
      (firebaseRevoked ? ", Firebase refresh tokens" : "") +
      (reason ? ` - ${reason}` : ""),
  });
  await logSettingsEvent({
    actorId: me.id,
    targetId: person.id,
    eventType: "employee_access_revoked",
    toValue: {
      sessionsRevoked,
      pushDevicesRemoved,
      firebaseRevoked,
    },
    note: reason,
  });

  revalidatePath("/admin/sessions");
  return {
    ok: true,
    sessionsRevoked,
    pushDevicesRemoved,
    firebaseRevoked,
    firebaseError,
  };
}

/** Bulk-revoke every session row not seen for longer than `olderThanHours`. */
export async function revokeStaleSessions(
  input: z.input<typeof RevokeStaleSchema>,
): Promise<ActionResult<{ revoked: number }>> {
  const me = await requireAdmin();

  const parsed = RevokeStaleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const cutoff = new Date(Date.now() - parsed.data.olderThanHours * 3_600_000);
  let revoked: { id: string }[] = [];
  try {
    revoked = await db
      .update(loginSessions)
      .set({
        revokedAt: new Date(),
        revokedById: me.id,
        revokeReason: parsed.data.reason ?? `Stale for ${parsed.data.olderThanHours}h`,
      })
      .where(
        and(
          isNull(loginSessions.revokedAt),
          lt(loginSessions.lastSeenAt, cutoff),
        ),
      )
      .returning({ id: loginSessions.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  if (revoked.length > 0) {
    await recordAudit({
      entityType: "login_session",
      entityId: me.id,
      entityLabel: "Stale session sweep",
      action: "update",
      actorId: me.id,
      actorName: me.name,
      summary: `Revoked ${revoked.length} session(s) idle for more than ${parsed.data.olderThanHours}h`,
    });
    await logSettingsEvent({
      actorId: me.id,
      targetId: "stale-sweep",
      eventType: "stale_sessions_revoked",
      toValue: { count: revoked.length, olderThanHours: parsed.data.olderThanHours },
      note: parsed.data.reason,
    });
  }

  revalidatePath("/admin/sessions");
  return { ok: true, revoked: revoked.length };
}

/** Remove a single registered push device (the browser re-subscribes if it wants). */
export async function removePushDevice(
  input: z.input<typeof RemovePushSchema>,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsed = RemovePushSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const row = await db.query.pushSubscriptions.findFirst({
    where: eq(pushSubscriptions.id, parsed.data.subscriptionId),
    columns: { id: true, userId: true, userAgent: true },
  });
  if (!row) return { ok: false, error: "Device not found." };

  const owner = await db.query.employees.findFirst({
    where: eq(employees.id, row.userId),
    columns: { name: true },
  });

  try {
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.id, row.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await recordAudit({
    entityType: "push_subscription",
    entityId: row.id,
    entityLabel: owner?.name ?? row.userId,
    action: "delete",
    actorId: me.id,
    actorName: me.name,
    summary: `Removed a push device for ${owner?.name ?? "an employee"}`,
  });
  await logSettingsEvent({
    actorId: me.id,
    targetId: row.userId,
    eventType: "push_device_removed",
    fromValue: { userAgent: row.userAgent },
  });

  revalidatePath("/admin/sessions");
  return { ok: true };
}
