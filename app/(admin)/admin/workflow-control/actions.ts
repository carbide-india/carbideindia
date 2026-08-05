"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { orgSettings, settingsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import {
  WORKFLOW_FLAG_KEYS,
  WORKFLOW_FLAG_LABELS,
  type WorkflowFlagKey,
} from "@/db/enums";
import { WORKFLOW_GATE_SCOPE } from "@/lib/queries/workflow_control";

/**
 * Workflow Control mutations. The ONLY thing this feature writes is the
 * `org_settings.workflow_flags` jsonb map (merged, never replaced) plus one
 * `settings_events` audit row per gate that actually changed.
 *
 * Two invariants the UI must never be trusted to keep, so they are enforced
 * here: (1) only catalogue keys may be written — a hostile client cannot invent
 * a flag; (2) `enabled` is a real boolean and a value equal to the current one
 * is a no-op, so the audit trail never fills with phantom changes.
 */

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const NoteSchema = z
  .string()
  .trim()
  .max(280, "Reason must be 280 characters or fewer")
  .optional();

const SetGateSchema = z.object({
  key: z.enum(WORKFLOW_FLAG_KEYS),
  enabled: z.boolean(),
  note: NoteSchema,
});

/** Pages whose behaviour changes the moment a gate flips. */
const AFFECTED_PATHS = [
  "/admin/workflow-control",
  "/quotations",
  "/negotiations",
  "/negotiations/new",
  "/sales-orders",
  "/sales-orders/new",
] as const;

function revalidateAffected(): void {
  for (const p of AFFECTED_PATHS) revalidatePath(p);
}

/** Current gate map off the singleton, or null when the row is missing. */
async function readFlags(): Promise<Record<string, boolean> | null> {
  const [row] = await db
    .select({ workflowFlags: orgSettings.workflowFlags })
    .from(orgSettings)
    .where(eq(orgSettings.id, 1))
    .limit(1);
  return row ? (row.workflowFlags ?? {}) : null;
}

/**
 * Flip ONE gate. Merges into the stored map so a concurrent edit to another
 * gate is never clobbered, and refuses when the org_settings singleton has not
 * been seeded (a fresh database) instead of silently updating zero rows.
 */
export async function setWorkflowGateAction(input: {
  key: WorkflowFlagKey;
  enabled: boolean;
  note?: string;
}): Promise<ActionResult<{ changed: boolean }>> {
  const me = await requireAdmin();

  const parsed = SetGateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { key, enabled, note } = parsed.data;

  const current = await readFlags();
  if (current === null) {
    return {
      ok: false,
      error:
        "Organisation settings have not been seeded yet — run pnpm seed:defaults before changing gates.",
    };
  }

  // No-op when nothing actually changes: keeps the audit trail meaningful.
  if ((current[key] === true) === enabled) {
    return { ok: true, changed: false };
  }

  const next = { ...current, [key]: enabled };
  try {
    const updated = await db
      .update(orgSettings)
      .set({ workflowFlags: next, updatedAt: new Date(), updatedById: me.id })
      .where(eq(orgSettings.id, 1))
      .returning({ id: orgSettings.id });
    if (updated.length === 0) {
      return { ok: false, error: "Organisation settings row is missing." };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: WORKFLOW_GATE_SCOPE,
      targetId: key,
      actorId: me.id,
      eventType: enabled ? "enabled" : "disabled",
      fromValue: { [key]: current[key] === true },
      toValue: { [key]: enabled },
      note: note && note.length > 0 ? note : null,
    });
  } catch (err) {
    // Non-fatal: the gate is already flipped; losing the audit row must not
    // leave the caller thinking the change failed.
    console.error("[setWorkflowGateAction] audit write failed", err);
  }

  revalidateAffected();
  return { ok: true, changed: true };
}

const DisableAllSchema = z.object({
  /** Typed by the admin, verified server-side — never trust the button. */
  confirmText: z.literal("DISABLE ALL", {
    message: 'Type DISABLE ALL exactly to confirm',
  }),
  note: NoteSchema,
});

/**
 * Panic switch: turn EVERY gate off in one write, returning the whole app to
 * pre-Phase-8 behaviour. Writes one audit row per gate that was actually ON so
 * the history reads the same as if they had been flipped one by one.
 */
export async function disableAllWorkflowGatesAction(input: {
  confirmText: string;
  note?: string;
}): Promise<ActionResult<{ disabled: string[] }>> {
  const me = await requireAdmin();

  const parsed = DisableAllSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { note } = parsed.data;

  const current = await readFlags();
  if (current === null) {
    return {
      ok: false,
      error:
        "Organisation settings have not been seeded yet — run pnpm seed:defaults before changing gates.",
    };
  }

  const wasOn = WORKFLOW_FLAG_KEYS.filter((k) => current[k] === true);
  if (wasOn.length === 0) return { ok: true, disabled: [] };

  const next: Record<string, boolean> = { ...current };
  for (const k of wasOn) next[k] = false;

  try {
    const updated = await db
      .update(orgSettings)
      .set({ workflowFlags: next, updatedAt: new Date(), updatedById: me.id })
      .where(eq(orgSettings.id, 1))
      .returning({ id: orgSettings.id });
    if (updated.length === 0) {
      return { ok: false, error: "Organisation settings row is missing." };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values(
      wasOn.map((k) => ({
        scope: WORKFLOW_GATE_SCOPE,
        targetId: k,
        actorId: me.id,
        eventType: "disabled",
        fromValue: { [k]: true },
        toValue: { [k]: false },
        note:
          note && note.length > 0
            ? `Disable-all: ${note}`
            : "Disabled by the disable-all-gates control",
      })),
    );
  } catch (err) {
    console.error("[disableAllWorkflowGatesAction] audit write failed", err);
  }

  revalidateAffected();
  return { ok: true, disabled: wasOn.map((k) => WORKFLOW_FLAG_LABELS[k]) };
}
