import { NextResponse } from "next/server";
import { getCurrentEmployee } from "@/lib/auth/current";
import { recordCurrentSession } from "@/lib/sessions/record";

/**
 * Activity ping - POST /admin/sessions/ping
 *
 * Upserts the caller's row in `login_sessions` (see lib/sessions/record.ts) so
 * /admin/sessions has something real to show. Deliberately open to EVERY signed-in
 * employee, not just admins: the point is to observe non-admin sign-ins.
 *
 * The app shell should call this once per page load / on a slow interval. Until
 * that central wiring exists, the only writer is the Sessions page itself, which
 * records the viewing admin's own session on every visit.
 *
 * Node runtime: Drizzle + firebase-admin are not Edge-compatible.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const me = await getCurrentEmployee();
  if (!me || !me.isActive) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const recorded = await recordCurrentSession(me.id);
  return NextResponse.json({
    ok: true,
    recorded: recorded !== null,
    // Advisory only: the Firebase cookie stays valid until it expires, so a
    // client seeing `revoked: true` should sign itself out rather than assume
    // the server will refuse it.
    revoked: recorded?.revokedAt != null,
  });
}
