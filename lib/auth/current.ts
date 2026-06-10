import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { eq, sql } from "drizzle-orm";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";

/**
 * Resolves the signed-in employee row, or null if not signed in.
 * Primary lookup: clerk_user_id. First sign-in after an admin invite:
 * the row exists with email but no clerk_user_id — link it once by
 * verified email and backfill the id.
 */
export const getCurrentEmployee = cache(async (): Promise<Employee | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const byId = await db.query.employees.findFirst({
    where: eq(employees.clerkUserId, userId),
  });
  if (byId) return byId;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email) return null;

  // Case-insensitive — historical imports may have mixed-case emails even
  // though new ones are normalized (same pattern as inviteEmployee's dup check).
  const byEmail = await db.query.employees.findFirst({
    where: sql`lower(${employees.email}) = ${email}`,
  });
  if (!byEmail || byEmail.clerkUserId) return null; // unknown user or already linked elsewhere

  const [linked] = await db
    .update(employees)
    .set({ clerkUserId: userId, joinedAt: byEmail.joinedAt ?? new Date() })
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
