// Firebase session-cookie endpoint.
//
// POST { idToken } -> verify + mint a 14-day session cookie ("__session").
// DELETE          -> clear the session cookie (sign-out).
//
// Runs on the Node runtime because firebase-admin is not Edge-compatible.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { adminAuth } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const SESSION_COOKIE = "__session";
// 14 days.
const EXPIRES_IN_MS = 14 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const { idToken } = (await request.json()) as { idToken?: string };
    if (!idToken) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Verify the ID token before minting a session cookie.
    await adminAuth.verifyIdToken(idToken);

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: EXPIRES_IN_MS,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: EXPIRES_IN_MS / 1000,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
