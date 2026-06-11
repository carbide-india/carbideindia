import { redirect } from "next/navigation";
import type { Route } from "next";
import Image from "next/image";
import { SignIn, SignOutButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { getCurrentEmployee } from "@/lib/auth/current";

/**
 * /login — precision-drawing minimalism, one viewport, no scroll.
 *
 * Carbide India machines tungsten carbide to micron tolerances; the sign-in
 * sheet borrows the language of the engineering drawings their shop floor
 * runs on: warm paper white, a faint millimetre grid, one indigo spine down
 * the left edge (the "I" block of the logo), their actual product spread as
 * "FIG. 01", and a drafting title-block as the footer.
 *
 * Auth is Clerk's embedded <SignIn /> (hash routing keeps the whole flow on
 * /login). Social buttons are hidden here AND should be disabled in the
 * Clerk dashboard (email + password only). Guard: signed-in employees never
 * see this page; a Clerk session without an active employee row gets a
 * dead-end notice with sign-out.
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
  const orphanedSession = Boolean(userId) && (!me || !me.isActive);

  const sp = await searchParams;
  const reason = firstString(sp["reason"]);
  const year = new Date().getFullYear();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto lg:overflow-hidden" style={{ background: "#FBFAF7" }}>
      {/* Staggered reveal — one orchestrated load, nothing after. */}
      <style>{`
        @keyframes loginRise {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        .login-rise { opacity: 0; animation: loginRise 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .login-rise { animation: none; opacity: 1; }
        }
      `}</style>

      {/* Millimetre drafting grid — barely there. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(63,63,148,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(63,63,148,0.045) 1px, transparent 1px), linear-gradient(rgba(63,63,148,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(63,63,148,0.025) 1px, transparent 1px)",
          backgroundSize: "80px 80px, 80px 80px, 16px 16px, 16px 16px",
        }}
      />

      {/* Indigo spine — the "I" of the logo, holding the left edge. */}
      <div
        aria-hidden
        className="fixed left-0 top-0 bottom-0 w-[10px] max-md:h-[10px] max-md:w-full max-md:bottom-auto"
        style={{ background: "#3F3F94" }}
      />
      <div
        aria-hidden
        className="fixed left-[32px] top-1/2 max-xl:hidden select-none"
        style={{
          writingMode: "vertical-rl",
          transform: "translateY(-50%) rotate(180deg)",
          fontSize: 10.5,
          letterSpacing: "0.42em",
          fontWeight: 600,
          color: "rgba(63,63,148,0.38)",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono-display, ui-monospace, monospace)",
        }}
      >
        Your Tungsten Carbide &amp; Tungsten Copper Partners
      </div>

      {/* One-viewport sheet: masthead / body / title-block. */}
      <main className="relative z-10 mx-auto grid h-full min-h-0 w-full max-w-[1180px] grid-rows-[auto_1fr_auto] px-20 max-lg:px-12 max-md:px-6 max-lg:h-auto max-lg:min-h-full">
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <header className="login-rise flex items-end justify-between pt-8 max-md:pt-14" style={{ animationDelay: "0.05s" }}>
          <Image
            src="/brand/logo.png"
            alt="Carbide India"
            width={210}
            height={114}
            priority
            style={{ height: "auto" }}
          />
          <span
            className="pb-2 max-md:hidden"
            style={{
              fontSize: 10.5,
              letterSpacing: "0.30em",
              fontWeight: 600,
              color: "#A8A29E",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono-display, ui-monospace, monospace)",
            }}
          >
            Work Management System
          </span>
        </header>

        {/* ── Sheet body ───────────────────────────────────────────── */}
        <section className="flex min-h-0 items-center py-6 max-lg:py-10">
          <div className="grid w-full grid-cols-[1fr_minmax(360px,420px)] items-center gap-16 max-lg:grid-cols-1 max-lg:gap-10">
            {/* Statement column */}
            <div>
              <p
                className="login-rise"
                style={{
                  animationDelay: "0.15s",
                  fontSize: 11,
                  letterSpacing: "0.34em",
                  fontWeight: 700,
                  color: "#D32F2F",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono-display, ui-monospace, monospace)",
                }}
              >
                Yogeshwar Engineering Pvt Ltd
              </p>
              <h1
                className="login-rise mt-4"
                style={{
                  animationDelay: "0.25s",
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "clamp(32px, 3.6vw, 46px)",
                  lineHeight: 1.06,
                  letterSpacing: "-0.02em",
                  color: "#1C1917",
                }}
              >
                Precision begins
                <br />
                with the first entry.
              </h1>
              <p
                className="login-rise mt-4 max-w-[44ch]"
                style={{
                  animationDelay: "0.35s",
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  color: "#78716C",
                }}
              >
                Enquiries, feasibility, costing and quotations — every SM
                number, tracked from first call to sales order.
              </p>

              {/* FIG. 01 — their actual product spread, framed like a drawing figure */}
              <figure className="login-rise mt-7 max-lg:hidden" style={{ animationDelay: "0.45s" }}>
                <Image
                  src="/brand/slide1.png"
                  alt="Cemented carbide components manufactured at the Ambad works"
                  width={460}
                  height={170}
                  style={{ height: "auto", maxHeight: 170, width: "auto", mixBlendMode: "multiply" }}
                />
                <figcaption
                  className="mt-1 flex items-center gap-3"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.20em",
                    color: "#3F3F94",
                    fontFamily: "var(--font-mono-display, ui-monospace, monospace)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  <span aria-hidden className="inline-flex items-center">
                    <span style={{ width: 1, height: 9, background: "#3F3F94", display: "inline-block" }} />
                    <span style={{ width: 48, height: 1, background: "#3F3F94", display: "inline-block" }} />
                    <span style={{ width: 1, height: 9, background: "#3F3F94", display: "inline-block" }} />
                  </span>
                  Fig. 01 — Cemented carbide components · 25 MT / yr
                </figcaption>
              </figure>
            </div>

            {/* Sign-in column */}
            <div className="login-rise w-full" style={{ animationDelay: "0.30s" }}>
              {reason === "idle" && (
                <div
                  role="status"
                  className="mb-4 rounded-lg px-4 py-3"
                  style={{
                    background: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(180, 120, 10, 0.35)",
                    color: "#92600A",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  You were signed out after a period of inactivity. Please sign
                  in to continue.
                </div>
              )}
              {orphanedSession ? (
                <div
                  className="rounded-2xl p-8 text-center"
                  style={{ background: "#FFFFFF", border: "1px solid #E7E2DA", boxShadow: "0 1px 2px rgba(28,25,23,0.04)" }}
                >
                  <h2 className="mb-2 text-[17px] font-semibold" style={{ color: "#1C1917" }}>
                    Account not provisioned
                  </h2>
                  <p className="mb-6 text-[14px] leading-relaxed" style={{ color: "#78716C" }}>
                    You&apos;re signed in, but this account isn&apos;t linked
                    to an active employee. Contact your administrator, or sign
                    out and try a different account.
                  </p>
                  <SignOutButton redirectUrl="/login">
                    <button
                      type="button"
                      className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
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
                      colorText: "#1C1917",
                      colorTextSecondary: "#78716C",
                      colorBackground: "#FFFFFF",
                      borderRadius: "0.625rem",
                    },
                    elements: {
                      cardBox: {
                        boxShadow: "0 1px 2px rgba(28,25,23,0.05)",
                        border: "1px solid #E7E2DA",
                        width: "100%",
                      },
                      card: { boxShadow: "none" },
                      // Email + password only — socials are hidden here and
                      // should also be switched off in the Clerk dashboard.
                      socialButtons: { display: "none" },
                      socialButtonsRoot: { display: "none" },
                      dividerRow: { display: "none" },
                      formButtonPrimary: {
                        background: "#3F3F94",
                        boxShadow: "none",
                        textTransform: "none",
                        fontSize: "14px",
                        "&:hover": { background: "#2F2F6F" },
                      },
                    },
                  }}
                />
              )}
            </div>
          </div>
        </section>

        {/* ── Title block — like the corner of a technical drawing ── */}
        <footer
          className="login-rise mb-6 grid grid-cols-3 max-md:mb-8 max-md:grid-cols-1"
          style={{
            animationDelay: "0.55s",
            border: "1px solid #E7E2DA",
            background: "#FFFFFF",
            fontFamily: "var(--font-mono-display, ui-monospace, monospace)",
          }}
        >
          {(
            [
              ["Company", "Carbide India"],
              ["Works", "W-150(A) MIDC Ambad, Nashik"],
              ["Sheet", `WMS · ${year} · Confidential`],
            ] as const
          ).map(([k, v], i) => (
            <div
              key={k}
              className="px-5 py-2.5 max-md:border-b max-md:last:border-b-0"
              style={{
                borderLeft: i > 0 ? "1px solid #E7E2DA" : undefined,
                borderColor: "#E7E2DA",
              }}
            >
              <div style={{ fontSize: 9, letterSpacing: "0.26em", color: "#A8A29E", textTransform: "uppercase", fontWeight: 600 }}>
                {k}
              </div>
              <div style={{ fontSize: 12, color: "#44403C", marginTop: 2, fontWeight: 600 }}>
                {v}
              </div>
            </div>
          ))}
        </footer>
      </main>
    </div>
  );
}
