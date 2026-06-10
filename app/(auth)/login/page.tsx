import { redirect } from "next/navigation";
import type { Route } from "next";
import { SignIn, SignOutButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { AnimatedBrandBackdrop } from "@/components/auth/animated-brand-backdrop";
import { getCurrentEmployee } from "@/lib/auth/current";

/**
 * /login — the founder's first impression.
 *
 * Layer stack (back-to-front):
 *   1. Warm-dark canvas with a red radial glow in the lower-right
 *   2. Fine dot grid + SVG noise for atmosphere
 *   3. AnimatedBrandBackdrop — the looping logo + wordmark "video"
 *   4. Clerk's <SignIn /> widget inside the glass plate
 *
 * Auth itself is Clerk-hosted: the embedded <SignIn /> component handles
 * credentials, forgot-password, and MFA. `routing="hash"` keeps the whole
 * flow on /login (no catch-all segment needed).
 *
 * Guard: signed-in employees are redirected to the dashboard so a
 * bookmarked /login never serves them a stale form.
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  const me = await getCurrentEmployee();
  if (me && me.isActive) {
    redirect("/" as Route);
  }

  // Signed into Clerk but no usable employee row (unknown email, or the
  // account was deactivated). Rendering <SignIn /> here would bounce the
  // active session straight back to "/" and loop — show a dead-end notice
  // with a sign-out escape hatch instead.
  const orphanedSession = Boolean(userId) && (!me || !me.isActive);

  const sp = await searchParams;
  const reason = firstString(sp["reason"]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden">
      {/* ── Layer 1 — warm-dark canvas with red radial ── */}
      <div
        aria-hidden
        className="fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 75% 95%, rgba(225, 6, 0, 0.55), transparent 55%), radial-gradient(ellipse 60% 60% at 20% 10%, rgba(168, 4, 0, 0.25), transparent 60%), linear-gradient(135deg, #0E0B0A 0%, #1A0F0C 50%, #0B0708 100%)",
        }}
      />
      {/* Layer 2a — fine dot grid */}
      <div
        aria-hidden
        className="fixed inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Layer 2b — subtle film grain */}
      <div
        aria-hidden
        className="fixed inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* ── Layer 3 — animated brand backdrop ── */}
      <AnimatedBrandBackdrop />

      {/* ── Layer 4 — the glass plate carrying Clerk's SignIn ── */}
      <main className="relative z-20 flex min-h-full w-full items-center justify-center px-6 py-16 max-md:px-4 max-md:py-10">
        <div
          className="w-fit max-w-full p-8 max-md:p-4"
          style={{
            background: "rgba(255, 255, 255, 0.06)",
            backdropFilter: "blur(28px) saturate(180%)",
            WebkitBackdropFilter: "blur(28px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.10)",
            borderRadius: 24,
            boxShadow:
              "0 40px 100px -20px rgba(0, 0, 0, 0.60), 0 1px 0 rgba(255, 255, 255, 0.10) inset, 0 -28px 80px -40px rgba(225, 6, 0, 0.30) inset",
          }}
        >
          {reason === "idle" && (
            <div
              role="status"
              className="mb-5 rounded-lg px-4 py-3"
              style={{
                background: "rgba(245, 158, 11, 0.10)",
                border: "1px solid rgba(245, 158, 11, 0.40)",
                color: "#FDE68A",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              You were signed out after a period of inactivity. Please sign in
              to continue.
            </div>
          )}
          {orphanedSession ? (
            <div
              className="max-w-md text-center"
              style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 1.6 }}
            >
              <h1 className="mb-2 text-lg font-semibold text-white">
                Account not provisioned
              </h1>
              <p className="mb-5" style={{ color: "rgba(255,255,255,0.65)" }}>
                You're signed in, but this account isn't linked to an active
                employee. Contact your administrator, or sign out and try a
                different account.
              </p>
              <SignOutButton redirectUrl="/login">
                <button
                  type="button"
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                  style={{ background: "#3F3F94" }}
                >
                  Sign out
                </button>
              </SignOutButton>
            </div>
          ) : (
            <SignIn
              routing="hash"
              forceRedirectUrl="/"
              appearance={{
                variables: {
                  colorPrimary: "#3F3F94",
                  borderRadius: "0.75rem",
                },
              }}
            />
          )}
        </div>
      </main>

      {/* Bottom signature */}
      <div
        aria-hidden
        className="fixed bottom-5 left-0 right-0 z-10 text-center pointer-events-none"
        style={{
          fontSize: 10,
          letterSpacing: "0.24em",
          color: "rgba(255,255,255,0.30)",
          fontFamily: "var(--font-mono-display)",
          fontWeight: 600,
        }}
      >
        © {new Date().getFullYear()} CARBIDE INDIA · CONFIDENTIAL
      </div>
    </div>
  );
}
