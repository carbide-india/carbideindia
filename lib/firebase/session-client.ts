"use client";

import {
  signInWithEmailAndPassword,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";

/**
 * Client-side auth actions for the Firebase session-cookie flow. Every path that
 * establishes a session ends by POSTing the fresh ID token to /api/auth/session,
 * which mints the httpOnly `__session` cookie the server verifies. Sign-out
 * clears it. UI components must use these helpers rather than calling the
 * Firebase SDK directly, so the cookie stays in lockstep with the client session.
 */

/** Emails allowed to use passwordless email-link sign-in (owners only). */
export const PASSWORDLESS_EMAILS = [
  "alok@carbideindia.com",
  "altus@carbideindia.com",
] as const;

export function isPasswordlessEmail(email: string): boolean {
  return PASSWORDLESS_EMAILS.includes(
    email.trim().toLowerCase() as (typeof PASSWORDLESS_EMAILS)[number],
  );
}

const LINK_EMAIL_KEY = "carbide.emailForSignIn";

async function mintSessionCookie(idToken: string): Promise<void> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error("Could not establish session. Please try again.");
}

/** Email + password → session cookie. */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const cred = await signInWithEmailAndPassword(
    firebaseAuth,
    email.trim(),
    password,
  );
  const idToken = await cred.user.getIdToken();
  await mintSessionCookie(idToken);
}

/** Send a passwordless sign-in link (owners only — caller should gate on isPasswordlessEmail). */
export async function sendOwnerSignInLink(email: string): Promise<void> {
  const url = `${window.location.origin}/login/finish`;
  await sendSignInLinkToEmail(firebaseAuth, email.trim(), {
    url,
    handleCodeInApp: true,
  });
  window.localStorage.setItem(LINK_EMAIL_KEY, email.trim());
}

/** True when the current URL is a Firebase email-link sign-in landing. */
export function isEmailSignInLink(href: string): boolean {
  return isSignInWithEmailLink(firebaseAuth, href);
}

/** Complete an email-link sign-in from the landing URL → session cookie. Returns the signed-in email. */
export async function completeEmailLinkSignIn(href: string): Promise<string> {
  let email = window.localStorage.getItem(LINK_EMAIL_KEY);
  if (!email) {
    // Opened on a different device/browser — ask for the email to confirm.
    email = window.prompt("Confirm your email to finish signing in") ?? "";
  }
  const cred = await signInWithEmailLink(firebaseAuth, email.trim(), href);
  window.localStorage.removeItem(LINK_EMAIL_KEY);
  const idToken = await cred.user.getIdToken();
  await mintSessionCookie(idToken);
  return cred.user.email ?? email;
}

/**
 * Onboarding: consume a password-reset/onboarding oobCode, set the new password,
 * then sign in → session cookie. Returns the account email.
 */
export async function completeOnboarding(
  oobCode: string,
  newPassword: string,
): Promise<string> {
  const email = await verifyPasswordResetCode(firebaseAuth, oobCode);
  await confirmPasswordReset(firebaseAuth, oobCode, newPassword);
  await signInWithPassword(email, newPassword);
  return email;
}

/** Clear the Firebase client session AND the server cookie, then hard-navigate to /login. */
export async function signOutEverywhere(): Promise<void> {
  try {
    await signOut(firebaseAuth);
  } catch {
    /* ignore — clear the cookie regardless */
  }
  try {
    await fetch("/api/auth/session", { method: "DELETE" });
  } finally {
    window.location.href = "/login";
  }
}
