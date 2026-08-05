import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  loginSessions,
  orgSettings,
  pushSubscriptions,
} from "@/db/schema";
import { adminAuth } from "@/lib/firebase/admin";
import {
  isLiveSession,
  parseUserAgent,
  sessionState,
  type SessionState,
} from "@/lib/sessions/user-agent";

/**
 * Read model for /admin/sessions.
 *
 * Three genuinely observable sources are stitched together per employee - and
 * nothing else is shown, because nothing else is knowable:
 *
 *  1. `login_sessions` - OUR record of a Firebase session cookie (written by
 *     lib/sessions/record.ts). Carries IP, user-agent, first/last seen.
 *  2. Firebase Auth user metadata - `lastSignInTime` / `lastRefreshTime` /
 *     `tokensValidAfterTime`, fetched with the Admin SDK. Firebase has no
 *     "list sessions" API, so this is per-USER truth, not per-device.
 *  3. `push_subscriptions` - browsers that registered for web-push. A proxy for
 *     "devices this person has actually used", independent of session rows.
 */

export interface SessionPolicy {
  idleTimeoutMinutes: number;
  sessionMaxHours: number;
}

export interface SessionDeviceRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
  startedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  revokedByName: string | null;
  revokeReason: string | null;
  state: SessionState;
  /** True when this row is the session the viewing admin is using right now. */
  isCurrent: boolean;
}

export interface PushDeviceRow {
  id: string;
  /** Host of the push endpoint (fcm.googleapis.com, ...) - the full URL is a secret-ish token. */
  endpointHost: string;
  userAgent: string | null;
  deviceLabel: string | null;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface FirebaseUserInfo {
  lastSignInAt: Date | null;
  lastRefreshAt: Date | null;
  /** Tokens issued before this instant are rejected by Firebase (revokeRefreshTokens). */
  tokensValidAfterAt: Date | null;
  disabled: boolean;
}

export interface SessionEmployeeRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  department: string | null;
  designation: string | null;
  isActive: boolean;
  isAdmin: boolean;
  hasFirebaseUid: boolean;
  sessions: SessionDeviceRow[];
  pushDevices: PushDeviceRow[];
  liveSessionCount: number;
  onlineSessionCount: number;
  /** Newest lastSeenAt across non-revoked session rows, or null when we've never seen one. */
  lastSeenAt: Date | null;
  lastIp: string | null;
  lastDeviceLabel: string | null;
  firebase: FirebaseUserInfo | null;
}

export interface SessionOverview {
  policy: SessionPolicy;
  rows: SessionEmployeeRow[];
  /** False when the Firebase Admin SDK could not be reached - the UI says so. */
  firebaseAvailable: boolean;
  firebaseError: string | null;
  /** Session rows recorded at all, including revoked/expired. */
  totalSessionRows: number;
  generatedAt: Date;
}

/** Org session policy, falling back to the column defaults on a fresh DB. */
export async function getSessionPolicy(): Promise<SessionPolicy> {
  const [row] = await db
    .select({
      idleTimeoutMinutes: orgSettings.idleTimeoutMinutes,
      sessionMaxHours: orgSettings.sessionMaxHours,
    })
    .from(orgSettings)
    .where(eq(orgSettings.id, 1))
    .limit(1);
  return {
    idleTimeoutMinutes: row?.idleTimeoutMinutes ?? 10,
    sessionMaxHours: row?.sessionMaxHours ?? 12,
  };
}

/** Endpoint URLs are bearer-ish; only the host is safe to display. */
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "unknown host";
  }
}

function toDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Firebase user metadata keyed by uid. Returns `null` for `map` when the Admin
 * SDK is unconfigured or unreachable so the page can say "Firebase metadata
 * unavailable" instead of rendering blanks that look like "never signed in".
 */
async function fetchFirebaseUsers(
  uids: string[],
): Promise<{ map: Map<string, FirebaseUserInfo> | null; error: string | null }> {
  if (uids.length === 0) return { map: new Map(), error: null };
  const map = new Map<string, FirebaseUserInfo>();
  try {
    // getUsers accepts at most 100 identifiers per call.
    for (let i = 0; i < uids.length; i += 100) {
      const chunk = uids.slice(i, i + 100).map((uid) => ({ uid }));
      const res = await adminAuth.getUsers(chunk);
      for (const user of res.users) {
        map.set(user.uid, {
          lastSignInAt: toDate(user.metadata.lastSignInTime ?? undefined),
          lastRefreshAt: toDate(user.metadata.lastRefreshTime ?? undefined),
          tokensValidAfterAt: toDate(user.tokensValidAfterTime),
          disabled: user.disabled,
        });
      }
    }
    return { map, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sessions] Firebase user lookup failed", err);
    return { map: null, error: msg };
  }
}

/**
 * Everything /admin/sessions renders. Employees with no session rows are still
 * returned (a fresh install has none) so the page is a full roster, not an
 * empty table.
 *
 * @param currentSessionKey hashed cookie of the viewing admin, used to flag
 *        "this device". Pass null when unknown.
 */
export async function getSessionOverview(
  currentSessionKey: string | null,
): Promise<SessionOverview> {
  const now = new Date();
  const [policy, staff, sessionRows, pushRows] = await Promise.all([
    getSessionPolicy(),
    db
      .select({
        id: employees.id,
        name: employees.name,
        email: employees.email,
        avatarUrl: employees.avatarUrl,
        department: employees.department,
        designation: employees.designation,
        isActive: employees.isActive,
        isAdmin: employees.isAdmin,
        firebaseUid: employees.firebaseUid,
      })
      .from(employees)
      .orderBy(asc(employees.name)),
    db
      .select({
        id: loginSessions.id,
        employeeId: loginSessions.employeeId,
        sessionKey: loginSessions.sessionKey,
        ip: loginSessions.ip,
        userAgent: loginSessions.userAgent,
        startedAt: loginSessions.startedAt,
        lastSeenAt: loginSessions.lastSeenAt,
        revokedAt: loginSessions.revokedAt,
        revokedById: loginSessions.revokedById,
        revokeReason: loginSessions.revokeReason,
      })
      .from(loginSessions)
      .orderBy(desc(loginSessions.lastSeenAt)),
    db
      .select({
        id: pushSubscriptions.id,
        userId: pushSubscriptions.userId,
        endpoint: pushSubscriptions.endpoint,
        userAgent: pushSubscriptions.userAgent,
        createdAt: pushSubscriptions.createdAt,
        lastSeenAt: pushSubscriptions.lastSeenAt,
      })
      .from(pushSubscriptions)
      .orderBy(desc(pushSubscriptions.lastSeenAt)),
  ]);

  const nameById = new Map(staff.map((s) => [s.id, s.name]));

  const uids = staff
    .map((s) => s.firebaseUid)
    .filter((uid): uid is string => typeof uid === "string" && uid.length > 0);
  const { map: firebaseMap, error: firebaseError } =
    await fetchFirebaseUsers(uids);

  const sessionsByEmployee = new Map<string, SessionDeviceRow[]>();
  for (const r of sessionRows) {
    const state = sessionState(r, policy, now);
    const list = sessionsByEmployee.get(r.employeeId) ?? [];
    list.push({
      id: r.id,
      ip: r.ip,
      userAgent: r.userAgent,
      deviceLabel: parseUserAgent(r.userAgent).label,
      startedAt: r.startedAt,
      lastSeenAt: r.lastSeenAt,
      revokedAt: r.revokedAt,
      revokedByName: r.revokedById ? (nameById.get(r.revokedById) ?? null) : null,
      revokeReason: r.revokeReason,
      state,
      isCurrent:
        currentSessionKey !== null && r.sessionKey === currentSessionKey,
    });
    sessionsByEmployee.set(r.employeeId, list);
  }

  const pushByEmployee = new Map<string, PushDeviceRow[]>();
  for (const p of pushRows) {
    const list = pushByEmployee.get(p.userId) ?? [];
    list.push({
      id: p.id,
      endpointHost: endpointHost(p.endpoint),
      userAgent: p.userAgent,
      deviceLabel: parseUserAgent(p.userAgent).label,
      createdAt: p.createdAt,
      lastSeenAt: p.lastSeenAt,
    });
    pushByEmployee.set(p.userId, list);
  }

  const rows: SessionEmployeeRow[] = staff.map((s) => {
    const sessions = sessionsByEmployee.get(s.id) ?? [];
    const live = sessions.filter((x) => isLiveSession(x.state));
    const newest = live[0] ?? sessions[0] ?? null;
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      avatarUrl: s.avatarUrl,
      department: s.department,
      designation: s.designation,
      isActive: s.isActive,
      isAdmin: s.isAdmin,
      hasFirebaseUid: Boolean(s.firebaseUid),
      sessions,
      pushDevices: pushByEmployee.get(s.id) ?? [],
      liveSessionCount: live.length,
      onlineSessionCount: sessions.filter((x) => x.state === "online").length,
      lastSeenAt: newest ? newest.lastSeenAt : null,
      lastIp: newest ? newest.ip : null,
      lastDeviceLabel: newest ? newest.deviceLabel : null,
      firebase:
        firebaseMap && s.firebaseUid
          ? (firebaseMap.get(s.firebaseUid) ?? null)
          : null,
    };
  });

  return {
    policy,
    rows,
    firebaseAvailable: firebaseMap !== null,
    firebaseError,
    totalSessionRows: sessionRows.length,
    generatedAt: now,
  };
}
