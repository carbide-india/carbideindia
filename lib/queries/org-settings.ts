import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgSettings, type OrgSettings } from "@/db/schema";

/**
 * The single-row `org_settings` table has `id = 1` as the only valid row.
 * The seed migration inserts it; we never insert from app code.  If the
 * row is somehow missing (fresh DB without migrations), we fall back to
 * the schema defaults so the caller never has to null-check.
 */
const DEFAULTS: OrgSettings = {
  id: 1,
  companyName: "Carbide India",
  logoUrl: null,
  digestHourIst: 9,
  idleTimeoutMinutes: 10,
  workingDays: [1, 2, 3, 4, 5],
  timezone: "Asia/Kolkata",
  allowSelfRegister: false,
  notificationMatrix: {
    task_assigned:  ["email", "push"],
    task_initiated: ["email", "push"],
    status_changed: ["email", "push"],
    approved:       ["email", "push"],
    declined:       ["email", "push"],
    reassigned:     ["email", "push"],
    transferred:    ["email", "push"],
    cancelled:      ["email", "push"],
    commented:      ["email", "push"],
    overdue_digest: ["email"],
  },
  boardColumnOrder: null,
  workflowFlags: {},
  updatedAt: new Date(0),
  updatedById: null,
};

export async function getOrgSettings(): Promise<OrgSettings> {
  const [row] = await db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.id, 1))
    .limit(1);
  return row ?? DEFAULTS;
}
