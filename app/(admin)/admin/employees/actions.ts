"use server";

import { revalidatePath, updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { eq, inArray, or, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  departments,
  employeeDepartments,
  employeeEvents,
  employees,
  notifications,
  settingsEvents,
  taskEvents,
  tasks,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import {
  InviteEmployeeSchema,
  EditEmployeeSchema,
  EmployeeIdSchema,
  type InviteEmployeeInput,
  type EditEmployeeInput,
} from "@/lib/validators/employee";
import { siteUrl } from "@/lib/site-url";

/**
 * Sends a Clerk email invitation. The invitee follows the emailed link,
 * sets a password with Clerk, and lands on /login; on their first
 * sign-in getCurrentEmployee() links the Clerk user to the employees
 * row by email and backfills clerk_user_id.
 *
 * `ignoreExisting` keeps re-invites idempotent — Clerk would otherwise
 * reject a second invitation for the same email while one is pending.
 */
async function sendClerkInvitation(email: string): Promise<void> {
  const client = await clerkClient();
  await client.invitations.createInvitation({
    emailAddress: email,
    redirectUrl: `${siteUrl()}/login`,
    notify: true,
    ignoreExisting: true,
  });
}

/**
 * Best-effort revoke of any pending Clerk invitations addressed to `email`,
 * so the emailed invite link stops working once the employee is deactivated
 * or deleted before ever signing in. Failures are logged, never fatal —
 * the DB is already the source of truth and an unrevoked invitation can't
 * link to a row that is inactive or gone.
 */
async function revokePendingInvitations(email: string, logTag: string): Promise<void> {
  const lower = email.toLowerCase();
  try {
    const client = await clerkClient();
    // `query` filters by email/id server-side; single page with a generous
    // limit is plenty for a roster this size.
    const { data } = await client.invitations.getInvitationList({
      status: "pending",
      query: lower,
      limit: 100,
    });
    for (const inv of data) {
      if (inv.emailAddress.toLowerCase() !== lower) continue;
      try {
        await client.invitations.revokeInvitation(inv.id);
      } catch (err) {
        console.error(`[${logTag}] revokeInvitation(${inv.id}) failed`, err);
      }
    }
  } catch (err) {
    console.error(`[${logTag}] listing pending invitations failed`, err);
  }
}

function clerkErrorMessage(err: unknown): string {
  const e = err as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
  return (
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    e?.message ??
    String(err)
  );
}

/**
 * Resolve a set of department IDs to the valid {id,name} rows that exist,
 * and pick the primary one.  The primary defaults to the first valid id
 * when the requested primary is missing or not part of the set.  Unknown
 * ids are silently dropped.
 */
async function resolveDepartmentSelection(
  departmentIds: string[],
  primaryDepartmentId: string | null | undefined,
): Promise<{
  rows: { id: string; name: string }[];
  primaryId: string | null;
  primaryName: string | null;
}> {
  const unique = [...new Set(departmentIds)];
  if (unique.length === 0) {
    return { rows: [], primaryId: null, primaryName: null };
  }
  const rows = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(inArray(departments.id, unique));

  const validIds = new Set(rows.map((r) => r.id));
  const primaryId =
    primaryDepartmentId && validIds.has(primaryDepartmentId)
      ? primaryDepartmentId
      : (rows[0]?.id ?? null);
  const primaryName = rows.find((r) => r.id === primaryId)?.name ?? null;
  return { rows, primaryId, primaryName };
}

/**
 * Replace an employee's department memberships with `rows`, flagging
 * `primaryId` as primary.  Wipe-and-reinsert keeps the logic trivial — the
 * roster is tiny and edits are rare.
 */
async function writeMemberships(
  employeeId: string,
  rows: { id: string }[],
  primaryId: string | null,
): Promise<void> {
  await db
    .delete(employeeDepartments)
    .where(eq(employeeDepartments.employeeId, employeeId));
  if (rows.length > 0) {
    await db.insert(employeeDepartments).values(
      rows.map((r) => ({
        employeeId,
        departmentId: r.id,
        isPrimary: r.id === primaryId,
      })),
    );
  }
}

export async function inviteEmployee(input: InviteEmployeeInput): Promise<{
  ok: boolean;
  id?: string;
  /** Set when the row was created OK but the Clerk invitation email
   *  failed to send. The admin can re-send from the row's overflow menu. */
  warning?: string;
  error?: string;
}> {
  const me = await requireAdmin();

  const parsed = InviteEmployeeSchema.parse(input);

  // Case-insensitive dup check — historical imports may have mixed-case
  // emails even though new ones are normalized by Zod.
  const existing = await db.query.employees.findFirst({
    where: sql`lower(${employees.email}) = ${parsed.email}`,
  });
  if (existing) {
    return { ok: false, error: "An employee with this email already exists." };
  }

  // Resolve the chosen departments + primary so the legacy single-department
  // columns stay in lock-step with the membership join table.
  const selection = await resolveDepartmentSelection(
    parsed.departmentIds,
    parsed.primaryDepartmentId,
  );

  // 1. Insert employees row. clerk_user_id stays NULL until first sign-in:
  // getCurrentEmployee() links the Clerk user to this row by email.
  //
  // The pre-check above is not race-safe — two admins inviting the same
  // email at the same time both see "no existing row" and both reach this
  // point. The DB-side UNIQUE constraint on `employees.email` is the real
  // arbiter; we catch the violation here and translate Postgres error
  // 23505 into a friendly message instead of leaking "DB: duplicate key
  // value violates …" to the admin.
  let inserted;
  try {
    [inserted] = await db.insert(employees).values({
      name:         parsed.name,
      email:        parsed.email,
      role:         parsed.role,
      designation:  parsed.designation || null,
      department:   selection.primaryName,
      departmentId: selection.primaryId,
      isAdmin:      parsed.isAdmin,
      invitedAt:    new Date(),
    }).returning();
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "23505") {
      return { ok: false, error: "An employee with this email already exists." };
    }
    return { ok: false, error: `DB: ${e?.message ?? String(err)}` };
  }
  if (!inserted) {
    return { ok: false, error: "DB: insert returned no row" };
  }

  // 1b. Record department memberships (many-to-many). Non-fatal: the
  // primary department is already on the employees row, so a failure here
  // only loses secondary memberships, which an admin can re-add.
  try {
    await writeMemberships(inserted.id, selection.rows, selection.primaryId);
  } catch (err) {
    console.error("[inviteEmployee] writeMemberships failed", err);
  }

  // 2. Send the Clerk invitation email. We DON'T roll back the row if
  //    this fails — the admin can re-send from the row's overflow menu.
  //    But we DO surface the failure to the caller via `warning`.
  let emailWarning: string | undefined;
  try {
    await sendClerkInvitation(parsed.email);
  } catch (err) {
    emailWarning = `Created the employee but the invitation email failed: ${clerkErrorMessage(err)}. Use "Resend invite" to retry.`;
    console.error("[inviteEmployee] Clerk invitation failed", err);
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: inserted.id,
      actorId: me.id,
      eventType: "invited",
      toValue: {
        name: inserted.name,
        email: inserted.email,
        role: inserted.role,
        department: inserted.department,
        isAdmin: inserted.isAdmin,
      },
    });
  } catch (err) {
    console.error("[inviteEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true, id: inserted.id, warning: emailWarning };
}

export async function editEmployee(
  employeeId: string,
  fields: EditEmployeeInput,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();

  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }

  const parsed = EditEmployeeSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Self-demote guard — an admin can't strip their own admin role here.
  // (We don't block other field edits on self; just the role flag.)
  if (
    parsedId.data === me.id &&
    parsed.data.isAdmin === false
  ) {
    return { ok: false, error: "Can't remove your own admin role." };
  }

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, parsedId.data),
  });
  if (!emp) return { ok: false, error: "Employee not found" };

  // Build the patch — only include keys that were actually supplied.
  // (Zod's `.optional()` leaves omitted keys absent, so we can safely spread.)
  const patch: Partial<typeof employees.$inferInsert> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.role !== undefined) patch.role = parsed.data.role;
  // Empty string clears the designation back to NULL.
  if (parsed.data.designation !== undefined) {
    patch.designation = parsed.data.designation || null;
  }

  // Department membership: when `departmentIds` is supplied we replace the
  // whole set and mirror the primary into the legacy single-department
  // columns.  Resolved here; written to the join table after the row update.
  let departmentSelection:
    | Awaited<ReturnType<typeof resolveDepartmentSelection>>
    | null = null;
  if (parsed.data.departmentIds !== undefined) {
    departmentSelection = await resolveDepartmentSelection(
      parsed.data.departmentIds,
      parsed.data.primaryDepartmentId,
    );
    patch.department = departmentSelection.primaryName;
    patch.departmentId = departmentSelection.primaryId;
  }
  if (parsed.data.isAdmin !== undefined) patch.isAdmin = parsed.data.isAdmin;

  if (parsed.data.managerId !== undefined) {
    if (parsed.data.managerId === emp.id) {
      return { ok: false, error: "An employee can't be their own manager." };
    }
    patch.managerId = parsed.data.managerId;
  }

  // M4 — multi-channel fields.
  if (parsed.data.emailOptIn !== undefined) {
    patch.emailOptIn = parsed.data.emailOptIn;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No changes to save." };
  }

  try {
    await db.update(employees).set(patch).where(eq(employees.id, emp.id));
  } catch (err: any) {
    return { ok: false, error: `DB: ${err.message ?? err}` };
  }

  // Replace department memberships when the patch touched them.
  if (departmentSelection !== null) {
    try {
      await writeMemberships(
        emp.id,
        departmentSelection.rows,
        departmentSelection.primaryId,
      );
    } catch (err) {
      console.error("[editEmployee] writeMemberships failed", err);
    }
  }

  // NOTE: admin status is derived entirely from the employees row — no
  // Clerk metadata is written when isAdmin changes.

  try {
    const fromValue: Record<string, unknown> = {};
    const toValue: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
      const next = patch[key];
      const prev = (emp as Record<string, unknown>)[key as string];
      if (prev !== next) {
        fromValue[key as string] = prev ?? null;
        toValue[key as string] = next ?? null;
      }
    }
    if (Object.keys(toValue).length > 0) {
      await db.insert(employeeEvents).values({
        employeeId: emp.id,
        actorId: me.id,
        eventType: "edited",
        fromValue,
        toValue,
      });
    }
  } catch (err) {
    console.error("[editEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true };
}

export async function resendInvite(employeeId: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, parsedId.data) });
  if (!emp) return { ok: false, error: "Employee not found" };
  if (emp.joinedAt !== null) return { ok: false, error: "Employee has already joined." };
  try {
    await sendClerkInvitation(emp.email);
  } catch (err) {
    return { ok: false, error: clerkErrorMessage(err) };
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: emp.id,
      actorId: me.id,
      eventType: "invite_resent",
    });
  } catch (err) {
    console.error("[resendInvite] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true };
}

export async function deactivateEmployee(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  if (parsedId.data === me.id) {
    return { ok: false, error: "You can't deactivate your own account." };
  }
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, parsedId.data) });
  if (!emp) return { ok: false, error: "Employee not found" };
  if (!emp.isActive) return { ok: false, error: "Employee is already deactivated." };

  try {
    await db.update(employees).set({ isActive: false }).where(eq(employees.id, emp.id));
  } catch (err: any) {
    return { ok: false, error: `DB: ${err.message ?? err}` };
  }

  // Ban the Clerk user (revokes sessions + blocks sign-in). Roll back the
  // DB flag if Clerk rejects, so the two systems stay in sync.
  if (emp.clerkUserId) {
    try {
      const client = await clerkClient();
      await client.users.banUser(emp.clerkUserId);
    } catch (err) {
      await db
        .update(employees)
        .set({ isActive: true })
        .where(eq(employees.id, emp.id))
        .catch((rollbackErr) => {
          console.error("[deactivateEmployee] rollback failed", rollbackErr);
        });
      return { ok: false, error: `Clerk: ${clerkErrorMessage(err)}` };
    }
  }

  // Invited-but-never-joined: revoke any pending Clerk invitation so the
  // emailed link stops working. Best-effort.
  if (emp.joinedAt === null) {
    await revokePendingInvitations(emp.email, "deactivateEmployee");
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: emp.id,
      actorId: me.id,
      eventType: "deactivated",
      fromValue: { isActive: true },
      toValue: { isActive: false },
    });
  } catch (err) {
    console.error("[deactivateEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true };
}

export async function reactivateEmployee(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, parsedId.data) });
  if (!emp) return { ok: false, error: "Employee not found" };
  if (emp.isActive) return { ok: false, error: "Employee is already active." };

  try {
    await db.update(employees).set({ isActive: true }).where(eq(employees.id, emp.id));
  } catch (err: any) {
    return { ok: false, error: `DB: ${err.message ?? err}` };
  }

  if (emp.clerkUserId) {
    try {
      const client = await clerkClient();
      await client.users.unbanUser(emp.clerkUserId);
    } catch (err) {
      await db
        .update(employees)
        .set({ isActive: false })
        .where(eq(employees.id, emp.id))
        .catch((rollbackErr) => {
          console.error("[reactivateEmployee] rollback failed", rollbackErr);
        });
      return { ok: false, error: `Clerk: ${clerkErrorMessage(err)}` };
    }
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: emp.id,
      actorId: me.id,
      eventType: "reactivated",
      fromValue: { isActive: false },
      toValue: { isActive: true },
    });
  } catch (err) {
    console.error("[reactivateEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Hard delete (admin power tool)
//
// Permanently removes the employees row, the Clerk user, and every row
// that referenced them as doer/initiator/creator/actor. Audit history about
// those tasks is destroyed by design — this is the GDPR right-to-erasure
// shape, NOT the deactivate flow. The deletion itself is logged to
// settings_events under the *deleting admin's* actor_id so the act of
// erasure is preserved even though the erased identity is gone.
//
// Order matters because the schema's RESTRICT FKs block several paths:
//   1. settings_events.actor_id  (RESTRICT)
//   2. employee_events.actor_id  (RESTRICT — employee_id cascades from step 5)
//   3. task_events.actor_id      (RESTRICT — task_id cascades from step 4)
//   4. tasks owned by them       (RESTRICT chain on doer / initiator / created_by)
//   5. employees row             (cascades notifications, push_subs, their own
//                                  lifecycle employee_events)
//   6. Clerk user
// ---------------------------------------------------------------------------

export interface EmployeeDeletionImpact {
  ok: boolean;
  error?: string;
  /** Tasks where this employee is doer / initiator / creator — all deleted. */
  tasks: number;
  /** task_events authored by this employee — deleted. */
  taskEventsAsActor: number;
  /** employee_events lifecycle entries ABOUT them — cascaded. */
  employeeEventsAboutThem: number;
  /** employee_events authored by them — deleted. */
  employeeEventsAsActor: number;
  /** settings_events authored by them — deleted. */
  settingsEventsAsActor: number;
  /** Their own inbox notifications — cascaded. */
  notifications: number;
}

/**
 * Counts what `deleteEmployee` would destroy. Admin-only. Pure read; no
 * mutations. Use this to populate the confirmation dialog before the
 * destructive call lands.
 */
export async function getEmployeeDeletionImpact(
  employeeId: string,
): Promise<EmployeeDeletionImpact> {
  await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: parsedId.error.issues[0]?.message ?? "Invalid employee id",
      tasks: 0,
      taskEventsAsActor: 0,
      employeeEventsAboutThem: 0,
      employeeEventsAsActor: 0,
      settingsEventsAsActor: 0,
      notifications: 0,
    };
  }
  const id = parsedId.data;

  const [[t], [te], [eeAbout], [eeActor], [se], [n]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        or(
          eq(tasks.doerId, id),
          eq(tasks.initiatorId, id),
          eq(tasks.createdById, id),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(taskEvents)
      .where(eq(taskEvents.actorId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(employeeEvents)
      .where(eq(employeeEvents.employeeId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(employeeEvents)
      .where(eq(employeeEvents.actorId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(settingsEvents)
      .where(eq(settingsEvents.actorId, id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(eq(notifications.userId, id)),
  ]);

  return {
    ok: true,
    tasks: Number(t?.n ?? 0),
    taskEventsAsActor: Number(te?.n ?? 0),
    employeeEventsAboutThem: Number(eeAbout?.n ?? 0),
    employeeEventsAsActor: Number(eeActor?.n ?? 0),
    settingsEventsAsActor: Number(se?.n ?? 0),
    notifications: Number(n?.n ?? 0),
  };
}

/**
 * Hard-delete an employee and every row that depended on them. Requires the
 * admin to pass `confirmationEmail` exactly equal to the target's email —
 * client-side belt + server-side suspenders for "I really mean it".
 *
 * Returns the destruction counts on success so the caller can surface a
 * confirmation toast ("Deleted Hetesh — 12 tasks, 47 events").
 */
export async function deleteEmployee(
  employeeId: string,
  confirmationEmail: string,
): Promise<{
  ok: boolean;
  error?: string;
  deleted?: {
    tasks: number;
    taskEvents: number;
    employeeEvents: number;
    settingsEvents: number;
  };
}> {
  const me = await requireAdmin();
  const parsedId = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid employee id" };
  }
  if (parsedId.data === me.id) {
    return { ok: false, error: "You can't delete your own account." };
  }
  const id = parsedId.data;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, id) });
  if (!emp) return { ok: false, error: "Employee not found." };

  if (
    typeof confirmationEmail !== "string" ||
    confirmationEmail.trim().toLowerCase() !== emp.email.toLowerCase()
  ) {
    return { ok: false, error: "Confirmation email does not match." };
  }

  // Snapshot identity BEFORE we wipe the row so we can audit the deletion.
  const snapshot = {
    id: emp.id,
    name: emp.name,
    email: emp.email,
    role: emp.role,
    department: emp.department,
    clerkUserId: emp.clerkUserId,
  };

  let counts: {
    tasks: number;
    taskEvents: number;
    employeeEvents: number;
    settingsEvents: number;
  };

  try {
    counts = await db.transaction(async (tx) => {
      // 1. settings_events authored by them — RESTRICT, must precede employees.
      const seDeleted = await tx
        .delete(settingsEvents)
        .where(eq(settingsEvents.actorId, id))
        .returning({ id: settingsEvents.id });

      // 2. employee_events where they're the actor — RESTRICT. The lifecycle
      //    entries ABOUT them (employee_id = id) cascade with step 5.
      const eeDeleted = await tx
        .delete(employeeEvents)
        .where(eq(employeeEvents.actorId, id))
        .returning({ id: employeeEvents.id });

      // 3. task_events authored by them — RESTRICT. Events tied to tasks we
      //    delete in step 4 cascade automatically (task_events.task_id is
      //    ON DELETE CASCADE), so this only catches events on OTHER tasks.
      const teDeleted = await tx
        .delete(taskEvents)
        .where(eq(taskEvents.actorId, id))
        .returning({ id: taskEvents.id });

      // 4. tasks owned by them (RESTRICT chain) — cascades their remaining
      //    task_events and notifications-with-this-task_id.
      const tDeleted = await tx
        .delete(tasks)
        .where(
          or(
            eq(tasks.doerId, id),
            eq(tasks.initiatorId, id),
            eq(tasks.createdById, id),
          ),
        )
        .returning({ id: tasks.id });

      // 5. The employees row itself. Cascades:
      //    - notifications WHERE user_id = id  (their inbox)
      //    - push_subscriptions WHERE user_id = id
      //    - employee_events WHERE employee_id = id  (lifecycle about-them)
      await tx.delete(employees).where(eq(employees.id, id));

      return {
        tasks: tDeleted.length,
        taskEvents: teDeleted.length,
        employeeEvents: eeDeleted.length,
        settingsEvents: seDeleted.length,
      };
    });
  } catch (err: any) {
    return { ok: false, error: `DB: ${err?.message ?? err}` };
  }

  // 6. Clerk user. Best-effort — the DB is already consistent, so a
  //    Clerk failure leaves at most an orphan account that can no longer
  //    link to an employees row. Invited-but-never-joined employees have
  //    no Clerk user yet, only a pending invitation — revoke it instead.
  if (emp.joinedAt === null) {
    await revokePendingInvitations(snapshot.email, "deleteEmployee");
  }
  if (snapshot.clerkUserId) {
    try {
      const client = await clerkClient();
      await client.users.deleteUser(snapshot.clerkUserId);
    } catch (err) {
      console.warn(
        `[deleteEmployee] Clerk deleteUser(${snapshot.clerkUserId}) failed — clean up manually`,
        err,
      );
    }
  }

  // 7. Audit the erasure itself under the deleting admin's actor_id. Scoped
  //    to "employees" + the deleted id so /admin/activity can surface it
  //    alongside other employee-scoped events.
  try {
    await db.insert(settingsEvents).values({
      scope: "employees",
      targetId: snapshot.id,
      actorId: me.id,
      eventType: "employee_deleted",
      fromValue: snapshot,
      toValue: counts,
    });
  } catch (err) {
    console.error("[deleteEmployee] audit write failed", err);
  }

  revalidatePath("/admin/employees");
  updateTag(CACHE_TAGS.employees);
  return { ok: true, deleted: counts };
}
