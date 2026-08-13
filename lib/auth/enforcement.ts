import "server-only";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgSettings } from "@/db/schema";

/**
 * The master switch for permission enforcement — owned by the admin panel, not
 * by code.
 *
 * The 56-key permission catalogue and the role matrix have existed since the
 * admin console build, but nothing consulted them: every page gated on
 * `requireAdmin()`. Turning enforcement on is therefore a real, disruptive
 * event — `employees.is_admin` short-circuits to "has everything", so admins
 * are unaffected, but any employee holding NO role loses access the instant it
 * flips.
 *
 * So the switch lives in Admin → Access Control alongside a readiness check,
 * and it is stored as a flag rather than hard-coded: it can be turned back off
 * from the same screen if a rollout goes wrong, with no deploy.
 *
 * It rides in `org_settings.workflow_flags` (an existing
 * `Record<string, boolean>` used for exactly this kind of admin-owned gate), so
 * no migration is needed. Absent/false = OFF, which is today's behaviour.
 */

/** The flag key. Never rename — it is data, not code. */
export const PERMISSIONS_ENFORCED_FLAG = "permissions_enforced";

/** Is fine-grained permission enforcement switched on? Cached per request. */
export const isPermissionsEnforced = cache(async (): Promise<boolean> => {
  try {
    const [row] = await db
      .select({ flags: orgSettings.workflowFlags })
      .from(orgSettings)
      .where(eq(orgSettings.id, 1))
      .limit(1);
    return row?.flags?.[PERMISSIONS_ENFORCED_FLAG] === true;
  } catch {
    // Fail OPEN. A database hiccup must not lock the whole company out of the
    // app; the pages still run their own requireUser/requireAdmin gates.
    return false;
  }
});

export interface EnforcementReadiness {
  /** Employees who are active, not super-admins, and hold no role at all. */
  employeesWithoutRole: number;
  /** Active employees in total. */
  activeEmployees: number;
  /** Active super admins — unaffected by enforcement either way. */
  superAdmins: number;
  /** Safe to turn on: nobody active would be left with zero access. */
  safeToEnable: boolean;
}

/**
 * Who would lose access if the switch were flipped right now. The admin screen
 * shows this so enforcement is never enabled blind.
 */
export async function getEnforcementReadiness(): Promise<EnforcementReadiness> {
  const rows = (await db.execute(sql`
    select
      count(*) filter (where employees.is_active)::int                        as active_employees,
      count(*) filter (where employees.is_active and employees.is_admin)::int as super_admins,
      count(*) filter (
        where employees.is_active
          and not employees.is_admin
          and not exists (
            select 1 from employee_roles where employee_roles.employee_id = employees.id
          )
      )::int as without_role
    from employees
  `)) as unknown as {
    active_employees: number;
    super_admins: number;
    without_role: number;
  }[];

  const r = rows[0];
  const withoutRole = Number(r?.without_role ?? 0);
  return {
    employeesWithoutRole: withoutRole,
    activeEmployees: Number(r?.active_employees ?? 0),
    superAdmins: Number(r?.super_admins ?? 0),
    safeToEnable: withoutRole === 0,
  };
}
