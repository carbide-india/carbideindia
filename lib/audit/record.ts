import "server-only";
import { db } from "@/lib/db";
import { auditLog } from "@/db/schema";
import type { AuditAction } from "@/db/enums";
import type { FieldChange } from "./diff";
export interface RecordAuditInput {
  entityType: string; entityId: string; entityLabel?: string | null;
  action: AuditAction; actorId?: string | null; actorName?: string | null;
  changes?: FieldChange[]; summary?: string | null;
}
/** Append an audit row. FIRE-AND-FORGET: never throws into the caller. */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      entityType: input.entityType, entityId: input.entityId, entityLabel: input.entityLabel ?? null,
      action: input.action, actorId: input.actorId ?? null, actorName: input.actorName ?? null,
      changes: input.changes && input.changes.length ? input.changes : null,
      summary: input.summary ?? null,
    });
  } catch (err) {
    console.error("[recordAudit] failed (non-fatal)", err);
  }
}
