"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  employeeRoles,
  employees,
  permissions,
  rolePermissions,
  roles,
  settingsEvents,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { recordAudit } from "@/lib/audit/record";
import { countOtherActiveAdminRoleHolders } from "@/lib/queries/roles";
import {
  ADMIN_ROLE_NAME,
  ROLE_NAME_HINT,
  ROLE_NAME_PATTERN,
  isCanonicalRoleName,
  normalizeRoleName,
} from "@/lib/roles/canonical";

/**
 * Mutations for /admin/roles (Roles & Permissions).
 *
 * Every export is `requireAdmin()`-gated: this build manages grants, it does
 * NOT yet enforce them (see lib/auth/permissions.ts). Every mutation writes
 * `settings_events` (scope "role") and the append-only `audit_log`, so the
 * grant history survives even though role_permissions rows themselves are
 * deleted on revoke — presence of the row IS the grant.
 */

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const RoleIdSchema = z.string().uuid("Invalid role id");
const EmployeeIdSchema = z.string().uuid("Invalid employee id");

const LabelSchema = z
  .string()
  .trim()
  .min(2, "Display name is required")
  .max(60, "Display name is too long");

const NameSchema = z
  .string()
  .trim()
  .transform(normalizeRoleName)
  .refine((v) => ROLE_NAME_PATTERN.test(v), ROLE_NAME_HINT);

const SortOrderSchema = z.number().int().min(0).max(9999);

const CreateRoleSchema = z.object({
  name: NameSchema,
  label: LabelSchema,
  sortOrder: SortOrderSchema.optional(),
});
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;

const UpdateRoleSchema = z
  .object({
    name: NameSchema.optional(),
    label: LabelSchema.optional(),
    sortOrder: SortOrderSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

const SetPermissionsSchema = z.object({
  roleId: RoleIdSchema,
  permissionIds: z.array(z.string().uuid()).max(500),
});
export type SetRolePermissionsInput = z.infer<typeof SetPermissionsSchema>;

/** Refresh every surface a role/grant change is visible on. */
function revalidateRoles(roleId?: string): void {
  revalidatePath("/admin/roles");
  if (roleId) revalidatePath(`/admin/roles/${roleId}`);
  revalidatePath("/admin/employees");
}

/** settings_events writer — never throws into the caller (same as recordAudit). */
async function logRoleEvent(input: {
  roleId: string;
  actorId: string;
  eventType: string;
  fromValue?: Record<string, unknown> | null;
  toValue?: Record<string, unknown> | null;
  note?: string | null;
}): Promise<void> {
  try {
    await db.insert(settingsEvents).values({
      scope: "role",
      targetId: input.roleId,
      actorId: input.actorId,
      eventType: input.eventType,
      fromValue: input.fromValue ?? null,
      toValue: input.toValue ?? null,
      note: input.note ?? null,
    });
  } catch (err) {
    console.error("[roles] settings_events write failed", err);
  }
}

export async function createRole(
  input: CreateRoleInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();

  const parsed = CreateRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, label } = parsed.data;
  const sortOrder = parsed.data.sortOrder ?? 100;

  const existing = await db.query.roles.findFirst({ where: eq(roles.name, name) });
  if (existing) {
    return { ok: false, error: `A role named "${name}" already exists.` };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(roles)
      .values({ name, label, sortOrder })
      .returning();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  await logRoleEvent({
    roleId: inserted.id,
    actorId: me.id,
    eventType: "created",
    toValue: { name, label, sortOrder },
  });
  await recordAudit({
    entityType: "role",
    entityId: inserted.id,
    entityLabel: label,
    action: "create",
    actorId: me.id,
    actorName: me.name,
    summary: `Created role ${label} (${name})`,
  });

  revalidateRoles(inserted.id);
  return { ok: true, id: inserted.id };
}

export async function updateRole(
  roleId: string,
  fields: UpdateRoleInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = RoleIdSchema.safeParse(roleId);
  if (!parsedId.success) return { ok: false, error: "Invalid role id" };

  const parsed = UpdateRoleSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const role = await db.query.roles.findFirst({ where: eq(roles.id, parsedId.data) });
  if (!role) return { ok: false, error: "Role not found" };

  // `name` is a code identifier: lib/auth/roles.ts and every requireRole() call
  // site quote the seeded names, so renaming one silently revokes access.
  if (parsed.data.name !== undefined && parsed.data.name !== role.name) {
    if (isCanonicalRoleName(role.name)) {
      return {
        ok: false,
        error: `"${role.name}" is referenced by name in code and cannot be renamed. Edit its display name instead.`,
      };
    }
    const clash = await db.query.roles.findFirst({
      where: eq(roles.name, parsed.data.name),
    });
    if (clash) {
      return { ok: false, error: `A role named "${parsed.data.name}" already exists.` };
    }
  }

  const patch: Partial<typeof roles.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.label !== undefined) patch.label = parsed.data.label;
  if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;

  try {
    await db.update(roles).set(patch).where(eq(roles.id, role.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("roles_name_unique")) {
      return { ok: false, error: "A role with this name already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

  const fromValue: Record<string, unknown> = {};
  const toValue: Record<string, unknown> = {};
  for (const key of ["name", "label", "sortOrder"] as const) {
    const next = parsed.data[key];
    if (next !== undefined && next !== role[key]) {
      fromValue[key] = role[key];
      toValue[key] = next;
    }
  }
  if (Object.keys(toValue).length > 0) {
    await logRoleEvent({
      roleId: role.id,
      actorId: me.id,
      eventType: "updated",
      fromValue,
      toValue,
    });
    await recordAudit({
      entityType: "role",
      entityId: role.id,
      entityLabel: parsed.data.label ?? role.label,
      action: "update",
      actorId: me.id,
      actorName: me.name,
      changes: Object.keys(toValue).map((f) => ({
        field: f,
        old: fromValue[f] ?? null,
        new: toValue[f] ?? null,
      })),
      summary: `Updated role ${role.name}`,
    });
  }

  revalidateRoles(role.id);
  return { ok: true };
}

/**
 * Move a role one place up or down in the display order. Rewrites the whole
 * ladder to 10, 20, 30 … so hand-edited sort_order values converge instead of
 * accumulating ties.
 */
export async function moveRole(
  roleId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = RoleIdSchema.safeParse(roleId);
  if (!parsedId.success) return { ok: false, error: "Invalid role id" };
  if (direction !== "up" && direction !== "down") {
    return { ok: false, error: "Invalid direction" };
  }

  const ordered = await db
    .select({ id: roles.id, name: roles.name, label: roles.label })
    .from(roles)
    .orderBy(asc(roles.sortOrder), asc(roles.label));

  const index = ordered.findIndex((r) => r.id === parsedId.data);
  if (index < 0) return { ok: false, error: "Role not found" };
  const target = index + (direction === "up" ? -1 : 1);
  if (target < 0 || target >= ordered.length) {
    return { ok: false, error: "Already at the end of the list." };
  }

  const next = [...ordered];
  const moved = next[index];
  const displaced = next[target];
  if (!moved || !displaced) return { ok: false, error: "Role not found" };
  next[index] = displaced;
  next[target] = moved;

  try {
    await db.transaction(async (tx) => {
      for (const [i, r] of next.entries()) {
        await tx
          .update(roles)
          .set({ sortOrder: (i + 1) * 10, updatedAt: new Date() })
          .where(eq(roles.id, r.id));
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await logRoleEvent({
    roleId: moved.id,
    actorId: me.id,
    eventType: "reordered",
    fromValue: { position: index + 1 },
    toValue: { position: target + 1, order: next.map((r) => r.name) },
  });

  revalidateRoles(moved.id);
  return { ok: true };
}

/**
 * Replace a role's grants with exactly `permissionIds` (active catalogue rows
 * only). Grants pointing at deactivated permissions are left alone — they are
 * revoked one by one from the "retired grants" strip so a catalogue cleanup
 * can never silently wipe history.
 */
export async function setRolePermissions(
  input: SetRolePermissionsInput,
): Promise<ActionResult<{ granted: number; revoked: number }>> {
  const me = await requireAdmin();

  const parsed = SetPermissionsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { roleId, permissionIds } = parsed.data;

  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role) return { ok: false, error: "Role not found" };

  const activeRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(eq(permissions.isActive, true));
  const activeById = new Map(activeRows.map((p) => [p.id, p.key]));

  const wanted = new Set(permissionIds);
  for (const id of wanted) {
    if (!activeById.has(id)) {
      // Hostile or stale client: an id that isn't a live catalogue row.
      return { ok: false, error: "Unknown or retired permission in selection." };
    }
  }

  const currentRows = await db
    .select({ permissionId: rolePermissions.permissionId })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, role.id));
  const current = new Set(currentRows.map((r) => r.permissionId));

  const toAdd = [...wanted].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => activeById.has(id) && !wanted.has(id));

  if (toAdd.length === 0 && toRemove.length === 0) {
    return { ok: true, granted: 0, revoked: 0 };
  }

  try {
    await db.transaction(async (tx) => {
      if (toRemove.length > 0) {
        await tx
          .delete(rolePermissions)
          .where(
            and(
              eq(rolePermissions.roleId, role.id),
              inArray(rolePermissions.permissionId, toRemove),
            ),
          );
      }
      if (toAdd.length > 0) {
        await tx
          .insert(rolePermissions)
          .values(
            toAdd.map((permissionId) => ({
              roleId: role.id,
              permissionId,
              grantedById: me.id,
            })),
          )
          .onConflictDoNothing();
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  const addedKeys = toAdd.map((id) => activeById.get(id) ?? id).sort();
  const removedKeys = toRemove.map((id) => activeById.get(id) ?? id).sort();
  await logRoleEvent({
    roleId: role.id,
    actorId: me.id,
    eventType: "permissions_updated",
    fromValue: { revoked: removedKeys },
    toValue: { granted: addedKeys, total: wanted.size },
    note: `+${addedKeys.length} / -${removedKeys.length}`,
  });
  await recordAudit({
    entityType: "role",
    entityId: role.id,
    entityLabel: role.label,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    changes: [
      { field: "permissions.granted", old: null, new: addedKeys },
      { field: "permissions.revoked", old: removedKeys, new: null },
    ],
    summary: `${role.label}: granted ${addedKeys.length}, revoked ${removedKeys.length} permission(s)`,
  });

  revalidateRoles(role.id);
  return { ok: true, granted: toAdd.length, revoked: toRemove.length };
}

/**
 * Revoke a single grant by permission id. Used by the "retired grants" strip
 * (deactivated catalogue rows the matrix can't represent).
 */
export async function revokeRolePermission(
  roleId: string,
  permissionId: string,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedRole = RoleIdSchema.safeParse(roleId);
  const parsedPermission = z.string().uuid().safeParse(permissionId);
  if (!parsedRole.success || !parsedPermission.success) {
    return { ok: false, error: "Invalid input" };
  }

  const role = await db.query.roles.findFirst({ where: eq(roles.id, parsedRole.data) });
  if (!role) return { ok: false, error: "Role not found" };

  const [permission] = await db
    .select({ key: permissions.key })
    .from(permissions)
    .where(eq(permissions.id, parsedPermission.data));

  const deleted = await db
    .delete(rolePermissions)
    .where(
      and(
        eq(rolePermissions.roleId, role.id),
        eq(rolePermissions.permissionId, parsedPermission.data),
      ),
    )
    .returning({ id: rolePermissions.id });
  if (deleted.length === 0) {
    return { ok: false, error: "That grant no longer exists." };
  }

  await logRoleEvent({
    roleId: role.id,
    actorId: me.id,
    eventType: "permissions_updated",
    fromValue: { revoked: [permission?.key ?? parsedPermission.data] },
    toValue: null,
    note: "retired grant revoked",
  });
  await recordAudit({
    entityType: "role",
    entityId: role.id,
    entityLabel: role.label,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    summary: `${role.label}: revoked retired permission ${permission?.key ?? ""}`.trim(),
  });

  revalidateRoles(role.id);
  return { ok: true };
}

export async function assignRoleToEmployee(
  roleId: string,
  employeeId: string,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedRole = RoleIdSchema.safeParse(roleId);
  const parsedEmployee = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedRole.success || !parsedEmployee.success) {
    return { ok: false, error: "Invalid input" };
  }

  const [role, employee] = await Promise.all([
    db.query.roles.findFirst({ where: eq(roles.id, parsedRole.data) }),
    db.query.employees.findFirst({ where: eq(employees.id, parsedEmployee.data) }),
  ]);
  if (!role) return { ok: false, error: "Role not found" };
  if (!employee) return { ok: false, error: "Employee not found" };
  if (!employee.isActive) {
    return { ok: false, error: `${employee.name} is deactivated — reactivate them first.` };
  }

  try {
    await db
      .insert(employeeRoles)
      .values({ employeeId: employee.id, roleId: role.id })
      .onConflictDoNothing();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await logRoleEvent({
    roleId: role.id,
    actorId: me.id,
    eventType: "member_added",
    toValue: { employeeId: employee.id, employee: employee.name },
  });
  await recordAudit({
    entityType: "employee",
    entityId: employee.id,
    entityLabel: employee.name,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    changes: [{ field: "roles", old: null, new: role.name }],
    summary: `Granted role ${role.label} to ${employee.name}`,
  });

  revalidateRoles(role.id);
  return { ok: true };
}

export async function removeRoleFromEmployee(
  roleId: string,
  employeeId: string,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedRole = RoleIdSchema.safeParse(roleId);
  const parsedEmployee = EmployeeIdSchema.safeParse(employeeId);
  if (!parsedRole.success || !parsedEmployee.success) {
    return { ok: false, error: "Invalid input" };
  }

  const [role, employee] = await Promise.all([
    db.query.roles.findFirst({ where: eq(roles.id, parsedRole.data) }),
    db.query.employees.findFirst({ where: eq(employees.id, parsedEmployee.data) }),
  ]);
  if (!role) return { ok: false, error: "Role not found" };
  if (!employee) return { ok: false, error: "Employee not found" };

  // Last-admin guard: `admin` implies every role and every permission, so the
  // console must never end up with zero active explicit holders.
  if (role.name === ADMIN_ROLE_NAME && employee.isActive) {
    const others = await countOtherActiveAdminRoleHolders(employee.id);
    if (others === 0) {
      return {
        ok: false,
        error: `${employee.name} is the last active holder of the admin role — grant it to someone else first.`,
      };
    }
  }

  const deleted = await db
    .delete(employeeRoles)
    .where(
      and(
        eq(employeeRoles.roleId, role.id),
        eq(employeeRoles.employeeId, employee.id),
      ),
    )
    .returning({ id: employeeRoles.id });
  if (deleted.length === 0) {
    return { ok: false, error: `${employee.name} no longer holds this role.` };
  }

  await logRoleEvent({
    roleId: role.id,
    actorId: me.id,
    eventType: "member_removed",
    fromValue: { employeeId: employee.id, employee: employee.name },
  });
  await recordAudit({
    entityType: "employee",
    entityId: employee.id,
    entityLabel: employee.name,
    action: "update",
    actorId: me.id,
    actorName: me.name,
    changes: [{ field: "roles", old: role.name, new: null }],
    summary: `Revoked role ${role.label} from ${employee.name}`,
  });

  revalidateRoles(role.id);
  return { ok: true };
}

/**
 * Remove a CUSTOM, EMPTY role. Governance here is deliberately narrow because
 * `roles` has no `is_active` column to deactivate into (see the report): a role
 * can only go when it is not one of the code-referenced canonical seven, holds
 * no members, and the admin retypes its name. Its grants go with it (they are
 * listed into the audit trail first, which is append-only).
 */
export async function deleteRole(
  roleId: string,
  confirmName: string,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = RoleIdSchema.safeParse(roleId);
  if (!parsedId.success) return { ok: false, error: "Invalid role id" };

  const role = await db.query.roles.findFirst({ where: eq(roles.id, parsedId.data) });
  if (!role) return { ok: false, error: "Role not found" };

  if (isCanonicalRoleName(role.name)) {
    return {
      ok: false,
      error: `"${role.name}" is one of the built-in pipeline roles and is referenced by name in code — it cannot be removed.`,
    };
  }
  if (confirmName.trim().toLowerCase() !== role.name) {
    return { ok: false, error: `Type "${role.name}" exactly to confirm.` };
  }

  const [memberRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(employeeRoles)
    .where(eq(employeeRoles.roleId, role.id));
  if ((memberRow?.n ?? 0) > 0) {
    return {
      ok: false,
      error: `${role.label} still has ${memberRow?.n} member(s). Revoke them first.`,
    };
  }

  const grantRows = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, role.id));
  const grantedKeys = grantRows.map((g) => g.key).sort();

  // settings_events.target_id is free text, so the trail survives the row.
  await logRoleEvent({
    roleId: role.id,
    actorId: me.id,
    eventType: "deleted",
    fromValue: {
      name: role.name,
      label: role.label,
      sortOrder: role.sortOrder,
      permissions: grantedKeys,
    },
    note: "custom role removed (no members)",
  });
  await recordAudit({
    entityType: "role",
    entityId: role.id,
    entityLabel: role.label,
    action: "delete",
    actorId: me.id,
    actorName: me.name,
    changes: [{ field: "permissions", old: grantedKeys, new: null }],
    summary: `Deleted custom role ${role.label} (${role.name}) with ${grantedKeys.length} grant(s)`,
  });

  try {
    await db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
      await tx.delete(roles).where(eq(roles.id, role.id));
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidateRoles();
  return { ok: true };
}
