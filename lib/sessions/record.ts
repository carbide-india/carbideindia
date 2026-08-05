import "server-only";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { loginSessions } from "@/db/schema";
import { clientIpFromHeaders } from "@/lib/ip-gate";

/**
 * Writing OUR view of a Firebase session into `login_sessions`.
 *
 * Firebase owns the real credential (the `__session` cookie verified in
 * lib/auth/current.ts); the Admin SDK has no "list active sessions" API, so the
 * only way an admin can see who is signed in from where is if the app records
 * it. This module is that recorder: call `recordCurrentSession()` from any
 * server context that already knows the employee, and the row for the caller's
 * cookie is created or its `last_seen_at` bumped.
 *
 * SECURITY: `session_key` stores a SHA-256 of the cookie, never the cookie
 * itself - the table must not be a credential store.
 */

/** Stable, non-reversible identifier for a session cookie. */
export function hashSessionCookie(cookie: string): string {
  return createHash("sha256").update(cookie).digest("hex");
}

export interface RecordedSession {
  /** The hashed key, so a UI can mark "this device". */
  sessionKey: string;
  /** True when this request created the row rather than bumping it. */
  created: boolean;
  /** Set when an admin has already revoked this session row. */
  revokedAt: Date | null;
}

/**
 * Upsert the caller's session row. Returns null when there is no session cookie
 * (nothing observable) or when the write fails - recording is telemetry and
 * must never break the page that called it.
 *
 * A revoked row is NOT resurrected: `revoked_at` is left alone so "revoked but
 * still being used" stays visible rather than being silently papered over.
 */
export async function recordCurrentSession(
  employeeId: string,
): Promise<RecordedSession | null> {
  let cookie: string | undefined;
  let ip = "";
  let userAgent: string | null = null;
  try {
    cookie = (await cookies()).get("__session")?.value;
    const h = await headers();
    ip = clientIpFromHeaders(h);
    userAgent = h.get("user-agent");
  } catch {
    return null; // no request context (build-time render) - nothing to record
  }
  if (!cookie) return null;

  const sessionKey = hashSessionCookie(cookie);
  const now = new Date();

  try {
    const [row] = await db
      .insert(loginSessions)
      .values({
        employeeId,
        sessionKey,
        ip: ip || null,
        userAgent,
        startedAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: loginSessions.sessionKey,
        set: { lastSeenAt: now, ip: ip || null, userAgent, employeeId },
      })
      .returning({
        startedAt: loginSessions.startedAt,
        revokedAt: loginSessions.revokedAt,
      });
    if (!row) return null;
    return {
      sessionKey,
      created: row.startedAt.getTime() === now.getTime(),
      revokedAt: row.revokedAt,
    };
  } catch (err) {
    console.error("[recordCurrentSession] failed (non-fatal)", err);
    return null;
  }
}
