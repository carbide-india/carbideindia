import "server-only";
import { and, asc, desc, eq, notExists, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employeeRoles,
  employees,
  permissions,
  rolePermissions,
  roles,
  settingsEvents,
  type Permission,
  type Role,
} from "@/db/schema";
import {
  PERMISSION_MODULES,
  PERMISSION_MODULE_LABELS,
  type PermissionModule,
} from "@/db/enums";
import { ADMIN_ROLE_NAME } from "@/lib/roles/canonical";

/**
 * Reads for /admin/roles (Roles & Permissions). Counts come from separate
 * grouped queries folded into maps rather than joins, so the member count and
 * the grant count can't fan each other out. (They were correlated sub-selects
 * built with the `sql` template, but Drizzle renders columns UNQUALIFIED inside
 * a sub-select, so `join employees … where role_id = id` hit a genuinely
 * ambiguous `"id"` at runtime. Grouped queries + maps is the pattern the rest
 * of lib/queries already uses — see listFeasibilityQueue.)
 */

export interface RoleWithCounts extends Role {
  /** Rows in employee_roles for this role, including deactivated people. */
  memberCount: number;
  /** Members whose employee row is still active — the number that matters. */
  activeMemberCount: number;
  /** Rows in role_permissions, including grants on retired permissions. */
  permissionCount: number;
}

export async function listRolesWithCounts(): Promise<RoleWithCounts[]> {
  const [rows, members, grants] = await Promise.all([
    db.select().from(roles).orderBy(asc(roles.sortOrder), asc(roles.label)),
    // One grouped pass over the join table gives BOTH member counts: total, and
    // the subset whose employee row is still active.
    db
      .select({
        roleId: employeeRoles.roleId,
        total: sql<number>`count(*)::int`,
        active: sql<number>`(count(*) filter (where ${employees.isActive}))::int`,
      })
      .from(employeeRoles)
      .leftJoin(employees, eq(employees.id, employeeRoles.employeeId))
      .groupBy(employeeRoles.roleId),
    db
      .select({ roleId: rolePermissions.roleId, total: sql<number>`count(*)::int` })
      .from(rolePermissions)
      .groupBy(rolePermissions.roleId),
  ]);

  const memberBy = new Map(members.map((m) => [m.roleId, m]));
  const grantBy = new Map(grants.map((g) => [g.roleId, g.total]));

  return rows.map((r) => ({
    ...r,
    memberCount: memberBy.get(r.id)?.total ?? 0,
    activeMemberCount: memberBy.get(r.id)?.active ?? 0,
    permissionCount: grantBy.get(r.id) ?? 0,
  }));
}

export interface RolesOverview {
  /** Active rows in the permission catalogue — the matrix denominator. */
  catalogueSize: number;
  /** Total role_permissions rows across every role. */
  grantCount: number;
  /** Active employees holding at least one explicit role. */
  peopleWithRoles: number;
  /**
   * Active `is_admin` employees with NO explicit role rows. `userRoles()` falls
   * back to ["admin"] for them, so they are effectively admins the roles table
   * doesn't show — the page surfaces them rather than hiding the fallback.
   */
  implicitAdmins: number;
  /** Active employee rows, for the "N of M people" sub-line. */
  activeEmployees: number;
}

export async function getRolesOverview(): Promise<RolesOverview> {
  // One round-trip of five scalar sub-selects — cheaper than five awaits and
  // the numbers stay mutually consistent.
  //
  // Every column inside these sub-selects is written out with an explicit table
  // qualifier via sql.raw. Interpolating a Drizzle column (`${employees.id}`)
  // inside a sub-select renders it UNQUALIFIED, which either crashes on an
  // ambiguous name or — worse, as in the `not exists` arm below — silently
  // compares the wrong two columns and returns a plausible but wrong number.
  const rows = (await db.execute(sql`
    select
      (select count(*)::int from permissions where permissions.is_active) as catalogue_size,
      (select count(*)::int from role_permissions) as grant_count,
      (
        select count(distinct employee_roles.employee_id)::int
        from employee_roles
        join employees on employees.id = employee_roles.employee_id
        where employees.is_active
      ) as people_with_roles,
      (
        select count(*)::int from employees
        where employees.is_active and employees.is_admin
          and not exists (
            select 1 from employee_roles
            where employee_roles.employee_id = employees.id
          )
      ) as implicit_admins,
      (select count(*)::int from employees where employees.is_active) as active_employees
  `)) as unknown as {
    catalogue_size: number;
    grant_count: number;
    people_with_roles: number;
    implicit_admins: number;
    active_employees: number;
  }[];
  const row = rows[0];
  return {
    catalogueSize: row?.catalogue_size ?? 0,
    grantCount: row?.grant_count ?? 0,
    peopleWithRoles: row?.people_with_roles ?? 0,
    implicitAdmins: row?.implicit_admins ?? 0,
    activeEmployees: row?.active_employees ?? 0,
  };
}

/** One section of the permission matrix — a module bucket with its rows. */
export interface PermissionGroup {
  module: PermissionModule;
  label: string;
  items: Permission[];
}

/**
 * Active catalogue rows grouped into module sections, in PERMISSION_MODULES
 * order. Empty modules are dropped so a partially-seeded database renders
 * only what exists.
 */
export async function listPermissionGroups(): Promise<PermissionGroup[]> {
  const rows = await db
    .select()
    .from(permissions)
    .where(eq(permissions.isActive, true))
    .orderBy(asc(permissions.sortOrder), asc(permissions.key));

  return PERMISSION_MODULES.map((m) => ({
    module: m,
    label: PERMISSION_MODULE_LABELS[m],
    items: rows.filter((p) => p.module === m),
  })).filter((g) => g.items.length > 0);
}

export interface RoleMember {
  employeeId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isActive: boolean;
  isAdmin: boolean;
  designation: string | null;
  grantedAt: Date;
}

export interface RetiredGrant {
  permissionId: string;
  key: string;
  label: string;
}

export interface RoleDetail {
  role: Role;
  /** Permission ids granted to this role, active catalogue rows only. */
  grantedPermissionIds: string[];
  /** Grants pointing at deactivated catalogue rows — revocable, never grantable. */
  retiredGrants: RetiredGrant[];
  members: RoleMember[];
}

export async function getRoleDetail(roleId: string): Promise<RoleDetail | null> {
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role) return null;

  const [grantRows, memberRows] = await Promise.all([
    db
      .select({
        permissionId: rolePermissions.permissionId,
        key: permissions.key,
        label: permissions.label,
        isActive: permissions.isActive,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, role.id))
      .orderBy(asc(permissions.sortOrder), asc(permissions.key)),
    db
      .select({
        employeeId: employees.id,
        name: employees.name,
        email: employees.email,
        avatarUrl: employees.avatarUrl,
        isActive: employees.isActive,
        isAdmin: employees.isAdmin,
        designation: employees.designation,
        grantedAt: employeeRoles.createdAt,
      })
      .from(employeeRoles)
      .innerJoin(employees, eq(employees.id, employeeRoles.employeeId))
      .where(eq(employeeRoles.roleId, role.id))
      .orderBy(desc(employees.isActive), asc(employees.name)),
  ]);

  return {
    role,
    grantedPermissionIds: grantRows.filter((g) => g.isActive).map((g) => g.permissionId),
    retiredGrants: grantRows
      .filter((g) => !g.isActive)
      .map((g) => ({ permissionId: g.permissionId, key: g.key, label: g.label })),
    members: memberRows,
  };
}

export interface AssignableEmployee {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  designation: string | null;
}

/** Active employees, for the "add member" picker on a role. */
export async function listAssignableEmployees(): Promise<AssignableEmployee[]> {
  return db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      isAdmin: employees.isAdmin,
      designation: employees.designation,
    })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));
}

/**
 * Active `is_admin` employees with no explicit role rows at all. They resolve
 * to ["admin"] through the pre-rollout fallback in lib/auth/roles.ts, so the
 * admin role page lists them separately with a one-click "make it explicit".
 */
export async function listImplicitAdmins(): Promise<AssignableEmployee[]> {
  return db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      isAdmin: employees.isAdmin,
      designation: employees.designation,
    })
    .from(employees)
    .where(
      and(
        eq(employees.isActive, true),
        eq(employees.isAdmin, true),
        notExists(
          db
            .select({ one: sql`1` })
            .from(employeeRoles)
            .where(eq(employeeRoles.employeeId, employees.id)),
        ),
      ),
    )
    .orderBy(asc(employees.name));
}

export interface RoleActivityEntry {
  id: string;
  eventType: string;
  note: string | null;
  createdAt: Date;
  actorName: string | null;
}

/** The settings_events trail for one role, newest first. */
export async function listRoleActivity(
  roleId: string,
  limit = 12,
): Promise<RoleActivityEntry[]> {
  return db
    .select({
      id: settingsEvents.id,
      eventType: settingsEvents.eventType,
      note: settingsEvents.note,
      createdAt: settingsEvents.createdAt,
      actorName: employees.name,
    })
    .from(settingsEvents)
    .leftJoin(employees, eq(employees.id, settingsEvents.actorId))
    .where(
      and(eq(settingsEvents.scope, "role"), eq(settingsEvents.targetId, roleId)),
    )
    .orderBy(desc(settingsEvents.createdAt))
    .limit(limit);
}

/**
 * How many ACTIVE employees still hold the `admin` role explicitly, excluding
 * one employee id. The last-admin guard in the server actions calls this before
 * revoking, so an admin can't lock the whole organisation out of the console.
 */
export async function countOtherActiveAdminRoleHolders(
  excludeEmployeeId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(employeeRoles)
    .innerJoin(roles, eq(roles.id, employeeRoles.roleId))
    .innerJoin(employees, eq(employees.id, employeeRoles.employeeId))
    .where(
      and(
        eq(roles.name, ADMIN_ROLE_NAME),
        eq(employees.isActive, true),
        sql`${employeeRoles.employeeId} <> ${excludeEmployeeId}`,
      ),
    );
  return row?.n ?? 0;
}
