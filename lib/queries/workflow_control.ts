import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, orgSettings, settingsEvents } from "@/db/schema";
import { WORKFLOW_FLAG_KEYS, type WorkflowFlagKey } from "@/db/enums";
import { normaliseGateFlags } from "@/lib/workflow-control-catalogue";

/**
 * Reads for /admin/workflow-control. The gate state itself lives on the
 * `org_settings` singleton (`workflow_flags` jsonb); the change history is the
 * `settings_events` rows this scope writes. Both are read-only here — every
 * write goes through the colocated server actions.
 */

/** The scope every workflow-gate audit row carries in `settings_events`. */
export const WORKFLOW_GATE_SCOPE = "workflow_flags";

export interface WorkflowGateState {
  /** Every catalogue key, defaulted OFF exactly like lib/workflow/flags.ts. */
  flags: Record<WorkflowFlagKey, boolean>;
  enabledCount: number;
  /** Keys stored in the jsonb that are no longer in the catalogue. */
  orphanKeys: string[];
  /** False on a fresh database — org_settings row 1 has not been seeded. */
  settingsRowExists: boolean;
  updatedAt: Date | null;
  updatedByName: string | null;
}

/**
 * The current gate map plus who last touched org_settings. Falls back to an
 * all-OFF map when the singleton row is missing so a fresh install still
 * renders (the actions refuse to write in that case and say why).
 */
export async function getWorkflowGateState(): Promise<WorkflowGateState> {
  const [row] = await db
    .select({
      workflowFlags: orgSettings.workflowFlags,
      updatedAt: orgSettings.updatedAt,
      updatedByName: employees.name,
    })
    .from(orgSettings)
    .leftJoin(employees, eq(employees.id, orgSettings.updatedById))
    .where(eq(orgSettings.id, 1))
    .limit(1);

  const raw = row?.workflowFlags ?? {};
  const flags = normaliseGateFlags(raw);
  const known = new Set<string>(WORKFLOW_FLAG_KEYS);

  return {
    flags,
    enabledCount: WORKFLOW_FLAG_KEYS.filter((k) => flags[k]).length,
    orphanKeys: Object.keys(raw).filter((k) => !known.has(k)),
    settingsRowExists: row !== undefined,
    updatedAt: row?.updatedAt ?? null,
    updatedByName: row?.updatedByName ?? null,
  };
}

export interface WorkflowGateEvent {
  id: string;
  /** The gate key this row is about (null for whole-map events). */
  targetId: string | null;
  eventType: string;
  note: string | null;
  createdAt: Date;
  actorName: string | null;
}

/**
 * The gate change history, newest first. Reads only rows this feature writes
 * (scope `workflow_flags`), so it stays a clean per-gate audit trail even
 * though `settings_events` is shared by every admin surface.
 */
export async function listWorkflowGateEvents(
  limit = 25,
): Promise<WorkflowGateEvent[]> {
  const capped = Math.min(Math.max(Math.trunc(limit), 1), 200);
  return db
    .select({
      id: settingsEvents.id,
      targetId: settingsEvents.targetId,
      eventType: settingsEvents.eventType,
      note: settingsEvents.note,
      createdAt: settingsEvents.createdAt,
      actorName: employees.name,
    })
    .from(settingsEvents)
    .leftJoin(employees, eq(employees.id, settingsEvents.actorId))
    .where(eq(settingsEvents.scope, WORKFLOW_GATE_SCOPE))
    .orderBy(desc(settingsEvents.createdAt))
    .limit(capped);
}
