import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";
import { adminAuth } from "@/lib/firebase/admin";

/**
 * Resolves the signed-in employee row, or null if not signed in.
 *
 * Auth identity is the Firebase session cookie (`__session`, minted by
 * /api/auth/session and verified here with the Admin SDK). Primary lookup:
 * firebase_uid. First sign-in after an admin invite: the row exists with an
 * email but no firebase_uid - link it once by verified email and backfill the
 * uid. (`clerk_user_id` is retained on the row as a dormant rollback path.)
 */
/** Firebase error codes that mean the cookie is genuinely bad → sign out, no retry. */
const INVALID_COOKIE_CODES = new Set([
  "auth/session-cookie-expired",
  "auth/session-cookie-revoked",
  "auth/invalid-session-cookie",
  "auth/argument-error",
]);

/**
 * Verify the session cookie, retrying ONCE on a transient failure. A genuinely
 * expired/revoked/malformed cookie fails fast (returns null → signed out). A
 * transient error (network hiccup fetching Google's signing certs, dev HMR
 * resetting the cert cache) previously bounced the user to /login and tripped
 * the orphaned-session card; the single retry absorbs that blip. Anything that
 * still fails after the retry is logged so it stops being invisible.
 */
async function verifySessionWithRetry(
  session: string,
): Promise<{ uid: string; email: string | null } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // checkRevoked=false: no per-request network call; deactivation is enforced
      // via employees.is_active in requireUser, not via Firebase revocation.
      const decoded = await adminAuth.verifySessionCookie(session, false);
      return {
        uid: decoded.uid,
        email:
          typeof decoded.email === "string" ? decoded.email.toLowerCase() : null,
      };
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: unknown }).code)
          : "";
      if (INVALID_COOKIE_CODES.has(code)) return null; // truly signed out
      if (attempt === 1) {
        console.warn(
          "[auth] session verification failed after retry:",
          code || (err instanceof Error ? err.message : String(err)),
        );
        return null;
      }
      await new Promise((r) => setTimeout(r, 150)); // brief backoff, then retry
    }
  }
  return null;
}

export const getCurrentEmployee = cache(async (): Promise<Employee | null> => {
  const session = (await cookies()).get("__session")?.value;
  if (!session) return null;

  const verified = await verifySessionWithRetry(session);
  if (!verified) return null; // expired / invalid / forged cookie (or transient, logged)
  const { uid, email } = verified;

  const byId = await db.query.employees.findFirst({
    where: eq(employees.firebaseUid, uid),
  });
  if (byId) return byId;

  if (!email) return null;

  // Case-insensitive - historical imports may have mixed-case emails even
  // though new ones are normalized (same pattern as inviteEmployee's dup check).
  const byEmail = await db.query.employees.findFirst({
    where: sql`lower(${employees.email}) = ${email}`,
  });
  if (!byEmail || byEmail.firebaseUid) return null; // unknown user or already linked elsewhere

  const [linked] = await db
    .update(employees)
    .set({ firebaseUid: uid, joinedAt: byEmail.joinedAt ?? new Date() })
    .where(eq(employees.id, byEmail.id))
    .returning();
  return linked ?? null;
});

/**
 * Like getCurrentEmployee but redirects to /login if absent or deactivated.
 * Throws via redirect (Next renders the redirect on the server).
 */
export async function requireUser(): Promise<Employee> {
  const e = await getCurrentEmployee();
  if (!e || !e.isActive) redirect("/login" as Route);
  return e;
}

/**
 * Like requireUser but additionally throws 403 if not admin.
 * Throws an Error so Next renders error.tsx.
 */
export async function requireAdmin(): Promise<Employee> {
  const e = await requireUser();
  if (!e.isAdmin) throw new Error("Forbidden");
  return e;
}
