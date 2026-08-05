import "server-only";
import { cache } from "react";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  employees,
  ipAllowlistEntries,
  loginSessions,
  orgSettings,
  settingsEvents,
  type IpAllowlistEntry,
} from "@/db/schema";
import { IP_BYPASS_EMAILS } from "@/lib/ip-gate";
import {
  firstMatchingCidr,
  ipMatchesCidr,
  parseAllowedIpsEnv,
} from "@/lib/access-control-ip";

/** The scope string every Access Control audit row is written under. */
export const ACCESS_CONTROL_SCOPE = "access_control";

export interface IpAllowlistRow extends IpAllowlistEntry {
  createdByName: string | null;
  updatedByName: string | null;
  /** True when the caller's current address falls inside this entry. */
  matchesCallerIp: boolean;
  /** True when this exact value is also present in the ALLOWED_IPS env var. */
  inEnvAllowlist: boolean;
}

/**
 * Every allowlist entry, active first then alphabetical, annotated with who
 * added/last touched it and whether it covers the caller's current address.
 * Inactive rows are returned too — governance here is deactivate-only, so the
 * page has to be able to show and revive them.
 */
export async function listIpAllowlistEntries(
  callerIp: string,
): Promise<IpAllowlistRow[]> {
  const creator = alias(employees, "allowlist_creator");
  const updater = alias(employees, "allowlist_updater");

  const rows = await db
    .select({
      entry: ipAllowlistEntries,
      createdByName: creator.name,
      updatedByName: updater.name,
    })
    .from(ipAllowlistEntries)
    .leftJoin(creator, eq(creator.id, ipAllowlistEntries.createdById))
    .leftJoin(updater, eq(updater.id, ipAllowlistEntries.updatedById))
    .orderBy(
      desc(ipAllowlistEntries.isActive),
      asc(ipAllowlistEntries.label),
      asc(ipAllowlistEntries.cidr),
    );

  const envEntries = new Set(parseAllowedIpsEnv(process.env.ALLOWED_IPS));

  return rows.map(({ entry, createdByName, updatedByName }) => ({
    ...entry,
    createdByName,
    updatedByName,
    matchesCallerIp: callerIp !== "" && ipMatchesCidr(callerIp, entry.cidr),
    inEnvAllowlist: envEntries.has(entry.cidr),
  }));
}

/** Single entry by id — used by the server actions to diff before/after. */
export async function getIpAllowlistEntry(
  id: string,
): Promise<IpAllowlistEntry | null> {
  const row = await db.query.ipAllowlistEntries.findFirst({
    where: eq(ipAllowlistEntries.id, id),
  });
  return row ?? null;
}

// ── Enforcement ────────────────────────────────────────────────────────────
//
// middleware.ts runs on the Vercel edge and cannot reach Postgres, so the env
// var ALLOWED_IPS stays the outer fence. This half is the optional *server-side*
// second fence for protected pages: it is off unless an admin turns
// org_settings.ip_allowlist_enforced on, it reads through a short-lived process
// cache so it never adds a query per request, and it FAILS OPEN — a DB blip must
// degrade to "the env gate alone", never to "nobody can sign in".

interface AllowlistCacheEntry {
  cidrs: string[];
  enforced: boolean;
  bypassEmails: string[];
  expiresAt: number;
}

const ALLOWLIST_TTL_MS = 60_000;
let allowlistCache: AllowlistCacheEntry | null = null;

/**
 * Active allowlist + enforcement policy, cached in-process for 60s. Returns
 * null when the read fails (fail open). Exported so the Access Control page can
 * show the admin exactly how stale the enforcement view can be.
 */
export async function getEnforcementSnapshot(): Promise<AllowlistCacheEntry | null> {
  const now = Date.now();
  if (allowlistCache && allowlistCache.expiresAt > now) return allowlistCache;

  try {
    const [settingsRow] = await db
      .select({
        enforced: orgSettings.ipAllowlistEnforced,
        bypassEmails: orgSettings.ipBypassEmails,
      })
      .from(orgSettings)
      .where(eq(orgSettings.id, 1))
      .limit(1);

    const active = await db
      .select({ cidr: ipAllowlistEntries.cidr })
      .from(ipAllowlistEntries)
      .where(eq(ipAllowlistEntries.isActive, true));

    allowlistCache = {
      cidrs: active.map((r) => r.cidr),
      enforced: settingsRow?.enforced ?? false,
      bypassEmails: settingsRow?.bypassEmails ?? [],
      expiresAt: now + ALLOWLIST_TTL_MS,
    };
    return allowlistCache;
  } catch (err) {
    // Fail OPEN: never let a database outage become a lockout.
    console.error("[access-control] allowlist read failed — failing open", err);
    return null;
  }
}

/** Drop the process cache so an admin edit is visible on the very next request. */
export function invalidateEnforcementSnapshot(): void {
  allowlistCache = null;
}

export type IpAccessReason =
  | "enforcement_off"
  | "no_active_entries"
  | "matched_entry"
  | "bypass_email"
  | "no_match"
  | "unavailable";

export interface IpAccessDecision {
  allowed: boolean;
  reason: IpAccessReason;
  enforced: boolean;
  matchedCidr: string | null;
  /** Active DB entries at decision time (0 when the read failed). */
  activeCount: number;
}

/**
 * Would the DB-backed allowlist admit this request? Pure decision — the caller
 * decides what to do with a `false`. Every failure mode resolves to `allowed`.
 */
export async function evaluateIpAccess(opts: {
  ip: string;
  email?: string | null;
}): Promise<IpAccessDecision> {
  const snapshot = await getEnforcementSnapshot();
  if (!snapshot) {
    return {
      allowed: true,
      reason: "unavailable",
      enforced: false,
      matchedCidr: null,
      activeCount: 0,
    };
  }
  const base = { enforced: snapshot.enforced, activeCount: snapshot.cidrs.length };

  if (!snapshot.enforced) {
    return { allowed: true, reason: "enforcement_off", matchedCidr: null, ...base };
  }
  if (isEffectiveBypassEmail(opts.email, snapshot.bypassEmails)) {
    return { allowed: true, reason: "bypass_email", matchedCidr: null, ...base };
  }
  // An empty register must never mean "deny everyone" — that is exactly the
  // fresh-install case, and it would lock the admin out of the fix.
  if (snapshot.cidrs.length === 0) {
    return { allowed: true, reason: "no_active_entries", matchedCidr: null, ...base };
  }

  const matched = opts.ip === "" ? null : firstMatchingCidr(opts.ip, snapshot.cidrs);
  return matched
    ? { allowed: true, reason: "matched_entry", matchedCidr: matched, ...base }
    : { allowed: false, reason: "no_match", matchedCidr: null, ...base };
}

/**
 * Effective bypass list: the org_settings override when it is non-empty,
 * otherwise the hard-coded IP_BYPASS_EMAILS in lib/ip-gate.ts (the same
 * fallback rule the schema contract specifies).
 */
export function effectiveBypassEmails(dbList: string[]): string[] {
  return dbList.length > 0 ? dbList : [...IP_BYPASS_EMAILS];
}

/** True when this email may reach the app from any network. */
export function isEffectiveBypassEmail(
  email: string | null | undefined,
  dbList: string[],
): boolean {
  if (typeof email !== "string") return false;
  const needle = email.trim().toLowerCase();
  if (needle === "") return false;
  return effectiveBypassEmails(dbList).some((e) => e.toLowerCase() === needle);
}

/**
 * Bump `last_seen_at` on the entry that just admitted somebody, at most once
 * every 15 minutes per entry. Fire-and-forget: a failure here is cosmetic.
 */
const SIGHTING_THROTTLE_MS = 15 * 60_000;

export async function recordAllowlistSighting(
  entryId: string,
  lastSeenAt: Date | null,
): Promise<void> {
  if (lastSeenAt && Date.now() - lastSeenAt.getTime() < SIGHTING_THROTTLE_MS) return;
  try {
    await db
      .update(ipAllowlistEntries)
      .set({ lastSeenAt: new Date() })
      .where(eq(ipAllowlistEntries.id, entryId));
  } catch (err) {
    console.error("[access-control] last-seen bump failed (non-fatal)", err);
  }
}

// ── Supporting reads for the page ──────────────────────────────────────────

export interface AccessControlEvent {
  id: string;
  eventType: string;
  targetId: string | null;
  note: string | null;
  createdAt: Date;
  actorName: string | null;
  fromValue: unknown;
  toValue: unknown;
}

/** Recent Access Control audit rows, newest first. */
export async function listAccessControlEvents(
  limit = 12,
): Promise<AccessControlEvent[]> {
  const rows = await db
    .select({
      id: settingsEvents.id,
      eventType: settingsEvents.eventType,
      targetId: settingsEvents.targetId,
      note: settingsEvents.note,
      createdAt: settingsEvents.createdAt,
      actorName: employees.name,
      fromValue: settingsEvents.fromValue,
      toValue: settingsEvents.toValue,
    })
    .from(settingsEvents)
    .leftJoin(employees, eq(employees.id, settingsEvents.actorId))
    .where(eq(settingsEvents.scope, ACCESS_CONTROL_SCOPE))
    .orderBy(desc(settingsEvents.createdAt))
    .limit(limit);
  return rows;
}

export interface RecentSignInIp {
  ip: string;
  hits: number;
  lastSeenAt: Date;
  people: string[];
  covered: boolean;
}

/**
 * Distinct source addresses seen on recent sign-ins, so an admin can promote a
 * real office IP into the register instead of typing it from memory. Empty on a
 * fresh install (login_sessions only fills once sign-ins are recorded).
 */
export async function listRecentSignInIps(
  activeCidrs: string[],
  limit = 8,
): Promise<RecentSignInIp[]> {
  const rows = await db
    .select({
      ip: loginSessions.ip,
      hits: sql<number>`count(*)::int`,
      lastSeenAt: sql<Date>`max(${loginSessions.lastSeenAt})`,
      employeeIds: sql<string[]>`array_agg(distinct ${loginSessions.employeeId})`,
    })
    .from(loginSessions)
    .where(sql`${loginSessions.ip} is not null and ${loginSessions.ip} <> ''`)
    .groupBy(loginSessions.ip)
    .orderBy(desc(sql`max(${loginSessions.lastSeenAt})`))
    .limit(limit);

  const ids = [...new Set(rows.flatMap((r) => r.employeeIds ?? []))];
  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const people = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(inArray(employees.id, ids));
    for (const p of people) nameById.set(p.id, p.name);
  }

  return rows
    .filter((r): r is typeof r & { ip: string } => typeof r.ip === "string")
    .map((r) => ({
      ip: r.ip,
      hits: r.hits,
      lastSeenAt: new Date(r.lastSeenAt),
      people: (r.employeeIds ?? [])
        .map((id) => nameById.get(id))
        .filter((n): n is string => typeof n === "string"),
      covered: firstMatchingCidr(r.ip, activeCidrs) !== null,
    }));
}

/**
 * React-cached so the page and any component that needs it share one read of
 * the caller-independent parts.
 */
export const getAccessControlCounts = cache(
  async (): Promise<{ total: number; active: number }> => {
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${ipAllowlistEntries.isActive})::int`,
      })
      .from(ipAllowlistEntries);
    return { total: row?.total ?? 0, active: row?.active ?? 0 };
  },
);
