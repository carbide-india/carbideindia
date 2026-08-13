"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ipAllowlistEntries, orgSettings, settingsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import {
  PERMISSIONS_ENFORCED_FLAG,
  getEnforcementReadiness,
} from "@/lib/auth/enforcement";
import { recordAudit } from "@/lib/audit/record";
import { clientIpFromHeaders } from "@/lib/ip-gate";
import {
  ipMatchesCidr,
  normalizeEmailList,
  parseAllowedIpsEnv,
  parseCidr,
} from "@/lib/access-control-ip";
import {
  ACCESS_CONTROL_SCOPE,
  effectiveBypassEmails,
  invalidateEnforcementSnapshot,
} from "@/lib/queries/access_control";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

// ── Validation ─────────────────────────────────────────────────────────────
// Server-side only; the browser copies are a convenience, never the gate.

const LabelSchema = z.string().trim().min(2, "Label needs at least 2 characters").max(80);
const NoteSchema = z.string().trim().max(400).optional();
const CidrSchema = z
  .string()
  .trim()
  .min(1, "Enter an IP address or CIDR block")
  .max(64)
  .refine((v) => parseCidr(v) !== null, {
    message: "Not a valid IPv4/IPv6 address or CIDR block",
  });

const CreateEntrySchema = z.object({
  label: LabelSchema,
  cidr: CidrSchema,
  note: NoteSchema,
});

const UpdateEntrySchema = z.object({
  label: LabelSchema.optional(),
  cidr: CidrSchema.optional(),
  note: z.string().trim().max(400).nullable().optional(),
});

const IdSchema = z.string().uuid("Invalid entry id");

const PolicySchema = z.object({
  ipAllowlistEnforced: z.boolean().optional(),
  ipBypassEmails: z
    .array(z.string().trim().email("One of the bypass entries is not an email address"))
    .max(25, "At most 25 bypass emails")
    .optional(),
  idleTimeoutMinutes: z
    .number()
    .int("Idle timeout must be a whole number")
    .min(5, "Idle timeout must be at least 5 minutes")
    .max(60, "Idle timeout cannot exceed 60 minutes")
    .optional(),
  allowSelfRegister: z.boolean().optional(),
});

/** The caller's address as the proxy reports it (same source middleware uses). */
async function callerIp(): Promise<string> {
  const h = await headers();
  return clientIpFromHeaders(h);
}

/** Non-fatal settings_events row so every Access Control change is traceable. */
async function logEvent(input: {
  actorId: string;
  eventType: string;
  targetId?: string | null;
  fromValue?: unknown;
  toValue?: unknown;
  note?: string | null;
}): Promise<void> {
  try {
    await db.insert(settingsEvents).values({
      scope: ACCESS_CONTROL_SCOPE,
      targetId: input.targetId ?? null,
      actorId: input.actorId,
      eventType: input.eventType,
      fromValue: input.fromValue ?? null,
      toValue: input.toValue ?? null,
      note: input.note ?? null,
    });
  } catch (err) {
    console.error("[access-control] settings_events write failed", err);
  }
}

function refresh(): void {
  invalidateEnforcementSnapshot();
  revalidatePath("/admin/access-control");
}

function dbError(err: unknown): { ok: false; error: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("ip_allowlist_entries_cidr_uidx")) {
    return { ok: false, error: "That address or block is already in the register." };
  }
  return { ok: false, error: `DB: ${msg}` };
}

// ── Allowlist entries ──────────────────────────────────────────────────────

export async function createIpAllowlistEntry(input: {
  label: string;
  cidr: string;
  note?: string;
}): Promise<ActionResult<{ id: string; normalized: string; hostBitsCleared: boolean }>> {
  const me = await requireAdmin();

  const parsed = CreateEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const net = parseCidr(parsed.data.cidr);
  if (!net) return { ok: false, error: "Not a valid IPv4/IPv6 address or CIDR block" };

  // Canonicalise before the uniqueness check so "203.0.113.7" and
  // "203.0.113.7/32" cannot both land in the register.
  const existing = await db.query.ipAllowlistEntries.findFirst({
    where: eq(ipAllowlistEntries.cidr, net.normalized),
  });
  if (existing) {
    return {
      ok: false,
      error: existing.isActive
        ? `${net.normalized} is already in the register.`
        : `${net.normalized} exists but is deactivated — reactivate it instead.`,
    };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(ipAllowlistEntries)
      .values({
        label: parsed.data.label,
        cidr: net.normalized,
        note: parsed.data.note && parsed.data.note !== "" ? parsed.data.note : null,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning();
  } catch (err) {
    return dbError(err);
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  await logEvent({
    actorId: me.id,
    eventType: "allowlist_entry_created",
    targetId: inserted.id,
    toValue: { label: inserted.label, cidr: inserted.cidr, isActive: true },
  });
  await recordAudit({
    entityType: "ip_allowlist_entry",
    entityId: inserted.id,
    entityLabel: `${inserted.label} (${inserted.cidr})`,
    action: "create",
    actorId: me.id,
    actorName: me.name,
    summary: `Added ${inserted.cidr} to the IP allowlist`,
  });

  refresh();
  return {
    ok: true,
    id: inserted.id,
    normalized: net.normalized,
    hostBitsCleared: net.hostBitsCleared,
  };
}

export async function updateIpAllowlistEntry(
  entryId: string,
  fields: { label?: string; cidr?: string; note?: string | null },
): Promise<ActionResult<{ normalized: string | null; hostBitsCleared: boolean }>> {
  const me = await requireAdmin();

  const parsedId = IdSchema.safeParse(entryId);
  if (!parsedId.success) return { ok: false, error: "Invalid entry id" };

  const parsed = UpdateEntrySchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await db.query.ipAllowlistEntries.findFirst({
    where: eq(ipAllowlistEntries.id, parsedId.data),
  });
  if (!before) return { ok: false, error: "Entry not found." };

  const patch: Partial<typeof ipAllowlistEntries.$inferInsert> = {
    updatedAt: new Date(),
    updatedById: me.id,
  };
  let normalized: string | null = null;
  let hostBitsCleared = false;

  if (parsed.data.label !== undefined) patch.label = parsed.data.label;
  if (parsed.data.note !== undefined) {
    patch.note = parsed.data.note && parsed.data.note !== "" ? parsed.data.note : null;
  }
  if (parsed.data.cidr !== undefined) {
    const net = parseCidr(parsed.data.cidr);
    if (!net) return { ok: false, error: "Not a valid IPv4/IPv6 address or CIDR block" };
    normalized = net.normalized;
    hostBitsCleared = net.hostBitsCleared;

    // Editing the address of an ACTIVE entry that currently covers the caller is
    // how an admin most easily strands themselves — refuse unless the new value
    // still covers them (or they can get in from anywhere anyway).
    if (before.isActive && net.normalized !== before.cidr) {
      const ip = await callerIp();
      const stillCovered = ip !== "" && ipMatchesCidr(ip, net.normalized);
      const coveredBefore = ip !== "" && ipMatchesCidr(ip, before.cidr);
      if (coveredBefore && !stillCovered) {
        const otherwise = await isCallerCoveredElsewhere(before.id, ip, me.email);
        if (!otherwise) {
          return {
            ok: false,
            error: `This is the only active entry covering your current IP (${ip || "unknown"}). Add the new block as a separate entry first, then retire this one.`,
          };
        }
      }
    }
    patch.cidr = net.normalized;
  }

  if (Object.keys(patch).length <= 2) {
    return { ok: false, error: "No changes to save." };
  }

  try {
    await db
      .update(ipAllowlistEntries)
      .set(patch)
      .where(eq(ipAllowlistEntries.id, before.id));
  } catch (err) {
    return dbError(err);
  }

  const fromValue: Record<string, unknown> = {};
  const toValue: Record<string, unknown> = {};
  if (patch.label !== undefined && patch.label !== before.label) {
    fromValue.label = before.label;
    toValue.label = patch.label;
  }
  if (patch.cidr !== undefined && patch.cidr !== before.cidr) {
    fromValue.cidr = before.cidr;
    toValue.cidr = patch.cidr;
  }
  if (patch.note !== undefined && patch.note !== before.note) {
    fromValue.note = before.note;
    toValue.note = patch.note;
  }
  if (Object.keys(toValue).length > 0) {
    await logEvent({
      actorId: me.id,
      eventType: "allowlist_entry_updated",
      targetId: before.id,
      fromValue,
      toValue,
    });
    await recordAudit({
      entityType: "ip_allowlist_entry",
      entityId: before.id,
      entityLabel: `${patch.label ?? before.label} (${patch.cidr ?? before.cidr})`,
      action: "update",
      actorId: me.id,
      actorName: me.name,
      summary: `Updated IP allowlist entry ${before.cidr}`,
    });
  }

  refresh();
  return { ok: true, normalized, hostBitsCleared };
}

/**
 * Deactivate / reactivate. Deactivating the entry that currently admits the
 * caller needs an explicit `confirm` from the UI, and is refused outright when
 * nothing else would let them back in.
 */
export async function setIpAllowlistEntryActive(
  entryId: string,
  isActive: boolean,
  confirm = false,
): Promise<ActionResult<{ label: string }>> {
  const me = await requireAdmin();

  const parsedId = IdSchema.safeParse(entryId);
  if (!parsedId.success) return { ok: false, error: "Invalid entry id" };

  const before = await db.query.ipAllowlistEntries.findFirst({
    where: eq(ipAllowlistEntries.id, parsedId.data),
  });
  if (!before) return { ok: false, error: "Entry not found." };
  if (before.isActive === isActive) {
    return { ok: false, error: `Entry is already ${isActive ? "active" : "inactive"}.` };
  }

  if (!isActive) {
    const ip = await callerIp();
    const coversCaller = ip !== "" && ipMatchesCidr(ip, before.cidr);
    if (coversCaller) {
      if (!confirm) {
        return {
          ok: false,
          error: `${before.cidr} covers your current IP (${ip}) — confirm the lock-out warning first.`,
        };
      }
      const otherwise = await isCallerCoveredElsewhere(before.id, ip, me.email);
      if (!otherwise) {
        const enforced = await isEnforcementOn();
        if (enforced) {
          return {
            ok: false,
            error: `Refusing: ${before.cidr} is the only active entry covering ${ip} and enforcement is ON — you would lock yourself out. Add a replacement entry first, or turn enforcement off.`,
          };
        }
      }
    }
  }

  try {
    await db
      .update(ipAllowlistEntries)
      .set({ isActive, updatedAt: new Date(), updatedById: me.id })
      .where(eq(ipAllowlistEntries.id, before.id));
  } catch (err) {
    return dbError(err);
  }

  await logEvent({
    actorId: me.id,
    eventType: isActive ? "allowlist_entry_reactivated" : "allowlist_entry_deactivated",
    targetId: before.id,
    fromValue: { isActive: before.isActive },
    toValue: { isActive },
  });
  await recordAudit({
    entityType: "ip_allowlist_entry",
    entityId: before.id,
    entityLabel: `${before.label} (${before.cidr})`,
    action: isActive ? "restore" : "update",
    actorId: me.id,
    actorName: me.name,
    summary: `${isActive ? "Reactivated" : "Deactivated"} IP allowlist entry ${before.cidr}`,
  });

  refresh();
  return { ok: true, label: before.label };
}

/** One-click "add the address I'm sitting on" — no typing, no typos. */
export async function addCallerIpToAllowlist(
  label: string,
): Promise<ActionResult<{ cidr: string }>> {
  const me = await requireAdmin();

  const parsedLabel = LabelSchema.safeParse(label);
  if (!parsedLabel.success) {
    return { ok: false, error: parsedLabel.error.issues[0]?.message ?? "Invalid label" };
  }

  const ip = await callerIp();
  const net = parseCidr(ip);
  if (!net) {
    return {
      ok: false,
      error: `Your address could not be determined from the request headers (${ip || "empty"}). Add it manually.`,
    };
  }

  const existing = await db.query.ipAllowlistEntries.findFirst({
    where: eq(ipAllowlistEntries.cidr, net.normalized),
  });
  if (existing) {
    if (existing.isActive) {
      return { ok: false, error: `${net.normalized} is already in the register.` };
    }
    const revived = await setIpAllowlistEntryActive(existing.id, true);
    if (!revived.ok) return revived;
    return { ok: true, cidr: net.normalized };
  }

  const created = await createIpAllowlistEntry({
    label: parsedLabel.data,
    cidr: net.normalized,
    note: `Captured from ${me.name}'s session`,
  });
  if (!created.ok) return created;
  return { ok: true, cidr: net.normalized };
}

/**
 * Copy whatever ALLOWED_IPS currently holds into the register, so the DB view
 * and the env fence agree. Never removes anything — the env var stays the
 * source of truth for the edge gate.
 */
export async function importEnvAllowedIps(): Promise<
  ActionResult<{ added: number; skipped: number; invalid: string[] }>
> {
  const me = await requireAdmin();

  const raw = parseAllowedIpsEnv(process.env.ALLOWED_IPS);
  if (raw.length === 0) {
    return { ok: false, error: "ALLOWED_IPS is empty — nothing to import." };
  }

  const invalid: string[] = [];
  const wanted = new Map<string, string>(); // normalized → original text
  for (const value of raw) {
    const net = parseCidr(value);
    if (!net) {
      invalid.push(value);
      continue;
    }
    if (!wanted.has(net.normalized)) wanted.set(net.normalized, value);
  }
  if (wanted.size === 0) {
    return { ok: false, error: "No parseable addresses in ALLOWED_IPS." };
  }

  const present = new Set(
    (
      await db
        .select({ cidr: ipAllowlistEntries.cidr })
        .from(ipAllowlistEntries)
    ).map((r) => r.cidr),
  );

  const toInsert = [...wanted.keys()].filter((c) => !present.has(c));
  if (toInsert.length > 0) {
    try {
      await db.insert(ipAllowlistEntries).values(
        toInsert.map((cidr) => ({
          label: "Imported from ALLOWED_IPS",
          cidr,
          note: "Created by the Access Control import; rename it to the site it belongs to.",
          createdById: me.id,
          updatedById: me.id,
        })),
      );
    } catch (err) {
      return dbError(err);
    }
    await logEvent({
      actorId: me.id,
      eventType: "allowlist_env_imported",
      toValue: { imported: toInsert },
    });
    await recordAudit({
      entityType: "ip_allowlist_entry",
      entityId: "bulk",
      entityLabel: "ALLOWED_IPS import",
      action: "create",
      actorId: me.id,
      actorName: me.name,
      summary: `Imported ${toInsert.length} address(es) from ALLOWED_IPS`,
    });
  }

  refresh();
  return {
    ok: true,
    added: toInsert.length,
    skipped: wanted.size - toInsert.length,
    invalid,
  };
}

// ── Policy (org_settings) ──────────────────────────────────────────────────

export async function updateAccessPolicy(input: {
  ipAllowlistEnforced?: boolean;
  ipBypassEmails?: string[];
  idleTimeoutMinutes?: number;
  allowSelfRegister?: boolean;
}): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsed = PolicySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const before = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.id, 1),
  });

  const patch: Partial<typeof orgSettings.$inferInsert> = {
    updatedAt: new Date(),
    updatedById: me.id,
  };

  const bypass =
    parsed.data.ipBypassEmails !== undefined
      ? normalizeEmailList(parsed.data.ipBypassEmails)
      : undefined;
  if (bypass !== undefined) patch.ipBypassEmails = bypass;
  if (parsed.data.idleTimeoutMinutes !== undefined) {
    patch.idleTimeoutMinutes = parsed.data.idleTimeoutMinutes;
  }
  if (parsed.data.allowSelfRegister !== undefined) {
    patch.allowSelfRegister = parsed.data.allowSelfRegister;
  }

  // Turning enforcement ON is the one irreversible-feeling switch on this page:
  // verify from the SERVER's view of the request that the admin doing it will
  // still get in afterwards.
  if (parsed.data.ipAllowlistEnforced !== undefined) {
    if (parsed.data.ipAllowlistEnforced && !before?.ipAllowlistEnforced) {
      const ip = await callerIp();
      const active = await db
        .select({ cidr: ipAllowlistEntries.cidr })
        .from(ipAllowlistEntries)
        .where(eq(ipAllowlistEntries.isActive, true));
      if (active.length === 0) {
        return {
          ok: false,
          error: "Add at least one active allowlist entry before turning enforcement on.",
        };
      }
      const effective = effectiveBypassEmails(bypass ?? before?.ipBypassEmails ?? []);
      const iAmBypassed = effective.some(
        (e) => e.toLowerCase() === me.email.trim().toLowerCase(),
      );
      const covered = ip !== "" && active.some((a) => ipMatchesCidr(ip, a.cidr));
      if (!covered && !iAmBypassed) {
        return {
          ok: false,
          error: `Your current IP (${ip || "unknown"}) is not covered by any active entry, and your email is not on the bypass list. Add it first — otherwise enforcement locks you out.`,
        };
      }
    }
    patch.ipAllowlistEnforced = parsed.data.ipAllowlistEnforced;
  }

  if (Object.keys(patch).length <= 2) {
    return { ok: false, error: "No changes to save." };
  }

  try {
    await db.update(orgSettings).set(patch).where(eq(orgSettings.id, 1));
  } catch (err) {
    return dbError(err);
  }

  const fromValue: Record<string, unknown> = {};
  const toValue: Record<string, unknown> = {};
  for (const key of [
    "ipAllowlistEnforced",
    "ipBypassEmails",
    "idleTimeoutMinutes",
    "allowSelfRegister",
  ] as const) {
    const next = (patch as Record<string, unknown>)[key];
    if (next === undefined) continue;
    fromValue[key] = before ? (before as Record<string, unknown>)[key] : null;
    toValue[key] = next;
  }
  if (Object.keys(toValue).length > 0) {
    await logEvent({
      actorId: me.id,
      eventType: "policy_updated",
      targetId: "1",
      fromValue,
      toValue,
    });
    await recordAudit({
      entityType: "org_settings",
      entityId: "1",
      entityLabel: "Access policy",
      action: "update",
      actorId: me.id,
      actorName: me.name,
      summary: "Updated access-control policy",
    });
  }

  refresh();
  return { ok: true };
}

// ── Internal helpers (not exported — "use server" files export actions only) ──

/** Any OTHER active entry covering `ip`, or a bypass email that makes it moot. */
async function isCallerCoveredElsewhere(
  excludeId: string,
  ip: string,
  email: string,
): Promise<boolean> {
  const [settingsRow] = await db
    .select({ bypassEmails: orgSettings.ipBypassEmails })
    .from(orgSettings)
    .where(eq(orgSettings.id, 1))
    .limit(1);
  const effective = effectiveBypassEmails(settingsRow?.bypassEmails ?? []);
  if (effective.some((e) => e.toLowerCase() === email.trim().toLowerCase())) return true;
  if (ip === "") return false;

  const others = await db
    .select({ id: ipAllowlistEntries.id, cidr: ipAllowlistEntries.cidr })
    .from(ipAllowlistEntries)
    .where(eq(ipAllowlistEntries.isActive, true));
  return others.some((o) => o.id !== excludeId && ipMatchesCidr(ip, o.cidr));
}

async function isEnforcementOn(): Promise<boolean> {
  const [row] = await db
    .select({ enforced: orgSettings.ipAllowlistEnforced })
    .from(orgSettings)
    .where(eq(orgSettings.id, 1))
    .limit(1);
  return row?.enforced ?? false;
}

/**
 * Flip the master permission-enforcement switch (Access Control).
 *
 * Guarded the same way the UI is: enabling is refused while an active non-admin
 * employee holds no role, because that would lock them out of the whole app the
 * instant it flipped. Disabling is ALWAYS allowed — it is the rollback, and it
 * must never be blocked by the same check that guards enabling.
 *
 * Stored in `org_settings.workflow_flags`, the existing admin-owned flag map, so
 * turning it on or off needs no deploy.
 */
export async function setPermissionsEnforced(
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireAdmin();
  if (typeof enabled !== "boolean") return { ok: false, error: "Invalid value." };

  if (enabled) {
    const readiness = await getEnforcementReadiness();
    if (!readiness.safeToEnable) {
      return {
        ok: false,
        error: `${readiness.employeesWithoutRole} active employee(s) hold no role — assign roles before enforcing.`,
      };
    }
  }

  try {
    await db
      .update(orgSettings)
      .set({
        workflowFlags: sql`coalesce(${orgSettings.workflowFlags}, '{}'::jsonb) || ${JSON.stringify(
          { [PERMISSIONS_ENFORCED_FLAG]: enabled },
        )}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(orgSettings.id, 1));
  } catch (err) {
    console.error("[setPermissionsEnforced]", err);
    return { ok: false, error: "Could not update enforcement - please try again." };
  }

  await recordSettingsEvent(me.id, enabled);
  // Enforcement changes what EVERY page may show, so clear the whole app.
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Append-only trail of who flipped the switch and when. */
async function recordSettingsEvent(actorId: string, enabled: boolean): Promise<void> {
  try {
    await db.insert(settingsEvents).values({
      actorId,
      scope: "access_control",
      targetId: PERMISSIONS_ENFORCED_FLAG,
      eventType: enabled ? "permissions_enforced_on" : "permissions_enforced_off",
      fromValue: { enabled: !enabled },
      toValue: { enabled },
      note: `Permission enforcement turned ${enabled ? "ON" : "OFF"}`,
    });
  } catch (err) {
    // The trail is important but must never block the switch itself.
    console.error("[setPermissionsEnforced] audit write failed", err);
  }
}