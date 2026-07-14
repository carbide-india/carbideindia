import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employeeRoles, roles, type Employee } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";

/**
 * Role-based access control (ERP redesign - Phase 1), layered on
 * `lib/auth/current.ts`. ADDITIVE / non-breaking: existing actions still guard
 * with `requireAdmin`; `requireRole` is provided here for the state machine
 * (Phase 8) and any new role-scoped action, but no existing action is
 * retrofitted in this phase.
 *
 * Pre-rollout fallback: an employee with NO rows in `employee_roles` resolves to
 * `["admin"]` when `employee.isAdmin` is true, else `[]` - so the app behaves
 * exactly as before until the data-fill/grants land.
 *
 * `admin` implies every role (see `hasRole` / `requireRole`).
 */

/** The `admin` role short-circuits every check. */
const ADMIN_ROLE = "admin";

/**
 * The employee's granted role names. Falls back to `["admin"]` when the person
 * has no explicit grants and `isAdmin` is set (empty otherwise) so nothing
 * breaks before roles are populated.
 */
export async function userRoles(employee: Employee): Promise<string[]> {
  const rows = await db
    .select({ name: roles.name })
    .from(employeeRoles)
    .innerJoin(roles, eq(employeeRoles.roleId, roles.id))
    .where(eq(employeeRoles.employeeId, employee.id));

  if (rows.length === 0) {
    return employee.isAdmin ? [ADMIN_ROLE] : [];
  }
  return rows.map((r) => r.name);
}

/**
 * True if the employee holds ANY of the named roles. `admin` implies all, so an
 * admin passes every check even for roles they weren't explicitly granted.
 * Called with no roles it returns true (nothing required).
 */
export async function hasRole(
  employee: Employee,
  ...required: string[]
): Promise<boolean> {
  if (required.length === 0) return true;
  const held = await userRoles(employee);
  if (held.includes(ADMIN_ROLE)) return true;
  return required.some((r) => held.includes(r));
}

/**
 * Guard for role-scoped server actions/queries. Resolves the signed-in employee
 * via `requireUser()` (redirects to /login if absent/inactive), then throws the
 * same 403-style Error `requireAdmin` uses if they lack all named roles. `admin`
 * always passes.
 */
export async function requireRole(...required: string[]): Promise<Employee> {
  const employee = await requireUser();
  if (await hasRole(employee, ...required)) return employee;
  throw new Error("Forbidden");
}
