import { redirect } from "next/navigation";
import type { Route } from "next";
import { auth } from "@clerk/nextjs/server";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Only accept same-origin paths starting with `/` (and not `//` which would
 * be protocol-relative). Anything else falls back to `/`.
 */
function sanitizeNext(v: string | string[] | undefined): string {
  const raw = Array.isArray(v) ? v[0] : v;
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  return raw;
}

/**
 * The post-login welcome/celebration screen was removed (2026-06-09) — every
 * sign-in now lands the user straight on their destination. This route is kept
 * only as a transparent redirect so any in-flight invite links that still
 * point at /welcome don't 404: signed-in users go to their `next` (default
 * the dashboard), signed-out users go to /login.
 */
export default async function WelcomePage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/login" as Route);
  const sp = await searchParams;
  redirect(sanitizeNext(sp["next"]) as Route);
}
