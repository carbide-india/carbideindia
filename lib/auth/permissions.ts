import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employeeRoles,
  permissions,
  rolePermissions,
  type Employee,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";

/**
 * Permission-based access control (Admin Console — Roles & Permissions),
 * layered ON TOP of `lib/auth/current.ts` (isAdmin) and `lib/auth/roles.ts`
 * (role names). ADDITIVE / non-breaking: nothing in the app is retrofitted onto
 * it yet — every existing server action keeps `requireAdmin()`. This is the
 * resolver the migration onto fine-grained grants will move to, one action at a
 * time.
 *
 * Resolution: employee → employee_roles → role_permissions → permissions.key,
 * restricted to `permissions.is_active`. `employees.is_admin` short-circuits to
 * "has everything" — exactly like the `admin` role does in lib/auth/roles.ts —
 * so a fresh database (zero grants) behaves precisely as it does today.
 *
 * Governance: there is deliberately no `*.delete` key in the catalogue; the
 * destructive verb is always deactivation.
 */

/** Reads the distinct, active permission keys granted through an employee's roles. */
const grantedKeysFor = cache(async (employeeId: string): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ key: permissions.key })
    .from(employeeRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, employeeRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(
      and(
        eq(employeeRoles.employeeId, employeeId),
        eq(permissions.isActive, true),
      ),
    );
  return rows.map((r) => r.key);
});

/** Every active key in the catalogue — what an `is_admin` employee effectively holds. */
const allActiveKeys = cache(async (): Promise<string[]> => {
  const rows = await db
    .select({ key: permissions.key })
    .from(permissions)
    .where(eq(permissions.isActive, true));
  return rows.map((r) => r.key);
});

export interface EffectivePermissions {
  /** The keys this employee can act on. For a super admin: the whole catalogue. */
  keys: Set<string>;
  /** True when `employees.is_admin` is set — implies every key, present or future. */
  isSuperAdmin: boolean;
}

/**
 * The employee's effective permission set. Super admins resolve to the full
 * active catalogue so a UI can render "everything" without special-casing, but
 * `hasPermission` never depends on that list being complete.
 */
export async function getEffectivePermissions(
  employee: Employee,
): Promise<EffectivePermissions> {
  if (employee.isAdmin) {
    return { keys: new Set(await allActiveKeys()), isSuperAdmin: true };
  }
  return { keys: new Set(await grantedKeysFor(employee.id)), isSuperAdmin: false };
}

/**
 * True if the employee holds ANY of the named permission keys. Called with no
 * keys it returns true (nothing required). `is_admin` always passes.
 */
export async function hasPermission(
  employee: Employee,
  ...required: string[]
): Promise<boolean> {
  if (required.length === 0) return true;
  if (employee.isAdmin) return true;
  const held = await grantedKeysFor(employee.id);
  return required.some((k) => held.includes(k));
}

/** Like `hasPermission` but every named key must be held. */
export async function hasEveryPermission(
  employee: Employee,
  ...required: string[]
): Promise<boolean> {
  if (required.length === 0) return true;
  if (employee.isAdmin) return true;
  const held = await grantedKeysFor(employee.id);
  return required.every((k) => held.includes(k));
}

/**
 * Guard for permission-scoped server actions/queries. Resolves the signed-in
 * employee via `requireUser()` (redirects to /login if absent/inactive), then
 * throws the same 403-style Error `requireAdmin` uses if they hold none of the
 * named keys. `is_admin` always passes.
 */
export async function requirePermission(
  ...required: string[]
): Promise<Employee> {
  const employee = await requireUser();
  if (await hasPermission(employee, ...required)) return employee;
  throw new Error("Forbidden");
}

/** The signed-in employee's effective permissions (for rendering nav/actions). */
export async function currentPermissions(): Promise<EffectivePermissions> {
  return getEffectivePermissions(await requireUser());
}
