"use server";

import { revalidatePath, updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { eq, inArray, or, sql } from "drizzle-orm";
import { adminAuth } from "@/lib/firebase/admin";
import { sendInviteEmail } from "@/lib/email/resend";
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
 * Provisions/refreshes a Firebase account for `email` and emails the branded
 * onboarding link. The invitee follows the emailed link to
 * `/accept-invite?oobCode=…`, sets a password (completeOnboarding), and is
 * signed in; on their first sign-in getCurrentEmployee() links the Firebase
 * user to the employees row by verified email and backfills firebase_uid.
 *
 * Idempotent for re-invites: createUser is skipped when the account already
 * exists, and a fresh password-reset (onboarding) link is minted either way.
 */
async function sendFirebaseInvitation(email: string, displayName: string): Promise<void> {
  // 1. Ensure a Firebase account exists. A second invite for the same email
  //    hits auth/email-already-exists — harmless, we just re-issue the link.
  try {
    await adminAuth.createUser({ email, emailVerified: false, displayName });
  } catch (err) {
    if (!isEmailAlreadyExists(err)) throw err;
  }

  // 2. Mint a password-reset link. Firebase returns its own action URL with an
  //    `oobCode` query param; we parse that out and point the user at our own
  //    accept-invite card, which consumes the code via completeOnboarding().
  const rawLink = await adminAuth.generatePasswordResetLink(email, {
    url: `${siteUrl()}/accept-invite`,
  });
  const oobCode = new URL(rawLink).searchParams.get("oobCode");
  if (!oobCode) {
    throw new Error("Firebase did not return an onboarding code.");
  }
  const onboardingUrl = `${siteUrl()}/accept-invite?oobCode=${encodeURIComponent(oobCode)}`;

  // 3. Deliver it via Resend (branded "Carbide India WMS" sender).
  await sendInviteEmail(email, displayName, onboardingUrl);
}

/**
 * Resolve the Firebase uid for an employee. Prefers the linked `firebase_uid`
 * on the row; for invited-but-never-joined employees (row not yet linked) it
 * falls back to an email lookup. Returns null when no Firebase account exists
 * for the email (nothing to ban/delete), so callers can no-op cleanly.
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
    if (isUserNotFound(err)) return null;
    throw err;
  }
}

function isFirebaseCode(err: unknown, code: string): boolean {
  const e = err as { code?: string; errorInfo?: { code?: string } };
  return e?.code === code || e?.errorInfo?.code === code;
}

function isUserNotFound(err: unknown): boolean {
  return isFirebaseCode(err, "auth/user-not-found");
}

function isEmailAlreadyExists(err: unknown): boolean {
  return isFirebaseCode(err, "auth/email-already-exists");
}

function firebaseErrorMessage(err: unknown): string {
  const e = err as { errorInfo?: { message?: string }; message?: string };
  return e?.errorInfo?.message ?? e?.message ?? String(err);
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
 * `primaryId` as primary.  Wipe-and-reinsert keeps the logic trivial - the
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
  /** Set when the row was created OK but the invitation email failed to
   *  send. The admin can re-send from the row's overflow menu. */
  warning?: string;
  error?: string;
}> {
  const me = await requireAdmin();

  const parsed = InviteEmployeeSchema.parse(input);

  // Case-insensitive dup check - historical imports may have mixed-case
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

  // 1. Insert employees row. firebase_uid stays NULL until first sign-in:
  // getCurrentEmployee() links the Firebase user to this row by email.
  //
  // The pre-check above is not race-safe - two admins inviting the same
  // email at the same time both see "no existing row" and both reach this
  // point. The DB-side UNIQUE constraint on `employees.email` is the real
  // arbiter; we catch the violation here and translate Postgres error
  // 23505 into a friendly message instead of leaking "DB: duplicate key
  // value violates " to the admin.
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

  // 2. Provision the Firebase account + send the invitation email. We DON'T
  //    roll back the row if this fails - the admin can re-send from the row's
  //    overflow menu. But we DO surface the failure to the caller via `warning`.
  let emailWarning: string | undefined;
  try {
    await sendFirebaseInvitation(parsed.email, parsed.name);
  } catch (err) {
    emailWarning = `Created the employee but the invitation email failed: ${firebaseErrorMessage(err)}. Use "Resend invite" to retry.`;
    console.error("[inviteEmployee] Firebase invitation failed", err);
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

  // Self-demote guard - an admin can't strip their own admin role here.
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

  // Build the patch - only include keys that were actually supplied.
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

  // M4 - multi-channel fields.
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

  // NOTE: admin status is derived entirely from the employees row - no
  // auth-provider metadata is written when isAdmin changes.

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
    await sendFirebaseInvitation(emp.email, emp.name);
  } catch (err) {
    return { ok: false, error: firebaseErrorMessage(err) };
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

  // Disable the Firebase user (revokes sessions + blocks sign-in). This also
  // covers invited-but-never-joined accounts: a disabled account can't complete
  // onboarding, so the emailed link stops working. Resolve the uid from the row,
  // or fall back to an email lookup when the row isn't linked yet. Roll back the
  // DB flag if Firebase rejects, so the two systems stay in sync.
  try {
    const uid = await resolveFirebaseUid(emp.firebaseUid, emp.email);
    if (uid) await adminAuth.updateUser(uid, { disabled: true });
  } catch (err) {
    await db
      .update(employees)
      .set({ isActive: true })
      .where(eq(employees.id, emp.id))
      .catch((rollbackErr) => {
        console.error("[deactivateEmployee] rollback failed", rollbackErr);
      });
    return { ok: false, error: `Firebase: ${firebaseErrorMessage(err)}` };
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

  // Re-enable the Firebase user. Roll back the DB flag if Firebase rejects.
  try {
    const uid = await resolveFirebaseUid(emp.firebaseUid, emp.email);
    if (uid) await adminAuth.updateUser(uid, { disabled: false });
  } catch (err) {
    await db
      .update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, emp.id))
      .catch((rollbackErr) => {
        console.error("[reactivateEmployee] rollback failed", rollbackErr);
      });
    return { ok: false, error: `Firebase: ${firebaseErrorMessage(err)}` };
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
// Permanently removes the employees row, the Firebase user, and every row
// that referenced them as doer/initiator/creator/actor. Audit history about
// those tasks is destroyed by design - this is the GDPR right-to-erasure
// shape, NOT the deactivate flow. The deletion itself is logged to
// settings_events under the *deleting admin's* actor_id so the act of
// erasure is preserved even though the erased identity is gone.
//
// Order matters because the schema's RESTRICT FKs block several paths:
//   1. settings_events.actor_id  (RESTRICT)
//   2. employee_events.actor_id  (RESTRICT - employee_id cascades from step 5)
//   3. task_events.actor_id      (RESTRICT - task_id cascades from step 4)
//   4. tasks owned by them       (RESTRICT chain on doer / initiator / created_by)
//   5. employees row             (cascades notifications, push_subs, their own
//                                  lifecycle employee_events)
//   6. Firebase user
// ---------------------------------------------------------------------------

export interface EmployeeDeletionImpact {
  ok: boolean;
  error?: string;
  /** Tasks where this employee is doer / initiator / creator - all deleted. */
  tasks: number;
  /** task_events authored by this employee - deleted. */
  taskEventsAsActor: number;
  /** employee_events lifecycle entries ABOUT them - cascaded. */
  employeeEventsAboutThem: number;
  /** employee_events authored by them - deleted. */
  employeeEventsAsActor: number;
  /** settings_events authored by them - deleted. */
  settingsEventsAsActor: number;
  /** Their own inbox notifications - cascaded. */
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
 * admin to pass `confirmationEmail` exactly equal to the target's email -
 * client-side belt + server-side suspenders for "I really mean it".
 *
 * Returns the destruction counts on success so the caller can surface a
 * confirmation toast ("Deleted Hetesh - 12 tasks, 47 events").
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
    firebaseUid: emp.firebaseUid,
  };

  let counts: {
    tasks: number;
    taskEvents: number;
    employeeEvents: number;
    settingsEvents: number;
  };

  try {
    counts = await db.transaction(async (tx) => {
      // 1. settings_events authored by them - RESTRICT, must precede employees.
      const seDeleted = await tx
        .delete(settingsEvents)
        .where(eq(settingsEvents.actorId, id))
        .returning({ id: settingsEvents.id });

      // 2. employee_events where they're the actor - RESTRICT. The lifecycle
      //    entries ABOUT them (employee_id = id) cascade with step 5.
      const eeDeleted = await tx
        .delete(employeeEvents)
        .where(eq(employeeEvents.actorId, id))
        .returning({ id: employeeEvents.id });

      // 3. task_events authored by them - RESTRICT. Events tied to tasks we
      //    delete in step 4 cascade automatically (task_events.task_id is
      //    ON DELETE CASCADE), so this only catches events on OTHER tasks.
      const teDeleted = await tx
        .delete(taskEvents)
        .where(eq(taskEvents.actorId, id))
        .returning({ id: taskEvents.id });

      // 4. tasks owned by them (RESTRICT chain) - cascades their remaining
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

  // 6. Firebase user. Best-effort - the DB is already consistent, so a
  //    Firebase failure leaves at most an orphan account that can no longer
  //    link to an employees row. Invited-but-never-joined employees have a
  //    Firebase account (created at invite time) but no firebase_uid on the
  //    row yet, so resolve it by email when the link is missing.
  try {
    const uid = await resolveFirebaseUid(snapshot.firebaseUid, snapshot.email);
    if (uid) await adminAuth.deleteUser(uid);
  } catch (err) {
    console.warn(
      `[deleteEmployee] Firebase delete for ${snapshot.email} failed - clean up manually`,
      err,
    );
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
