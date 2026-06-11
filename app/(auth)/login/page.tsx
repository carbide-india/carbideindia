import { redirect } from "next/navigation";
import type { Route } from "next";
import Image from "next/image";
import { SignOutButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { getCurrentEmployee } from "@/lib/auth/current";
import { SignInCard } from "@/components/auth/sign-in-card";
import { DiamondCascade } from "@/components/auth/diamond-cascade";

/**
 * /login — "drawing sheet DWG-002", exaggerated-minimal drafting style.
 *
 * Two columns of one engineering drawing sheet: the brand statement (huge
 * Bricolage 800 headline, spec strip, a dimensioned-circle motif) and the
 * sign-in card framed by red registration marks. Mono DWG labels head each
 * column; SCALE / SHEET close the sheet. Custom Clerk form — email +
 * password only (disable socials in the Clerk dashboard too).
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const NAVY = "#1E2447";
const RED = "#D32F2F";
const MONO = "var(--font-mono-display, ui-monospace, monospace)";

function firstString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function MonoLabel({
  children,
  color = "#A8A29E",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 10.5,
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        fontWeight: 700,
        color,
      }}
    >
      {children}
    </span>
  );
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
    <div className="fixed inset-0 z-50 overflow-y-auto lg:overflow-hidden" style={{ background: "#F4F0E8" }}>
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

      {/* Drafting grid */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(30,36,71,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(30,36,71,0.05) 1px, transparent 1px), linear-gradient(rgba(30,36,71,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(30,36,71,0.025) 1px, transparent 1px)",
          backgroundSize: "96px 96px, 96px 96px, 24px 24px, 24px 24px",
        }}
      />

      {/* The business-card diamond cascade, anchored to the top-left corner
          like the print collateral. Hidden on small screens. */}
      <div className="login-rise pointer-events-none fixed -left-8 -top-8 max-lg:hidden">
        <DiamondCascade />
      </div>

      <main className="relative z-10 mx-auto grid h-full min-h-0 w-full max-w-[1280px] grid-rows-[auto_1fr_auto] px-14 py-7 max-lg:h-auto max-lg:min-h-full max-lg:px-8 max-md:px-5">
        {/* ── Sheet header row (clears the diamond cascade on lg+) ── */}
        <div className="login-rise grid grid-cols-[1fr_minmax(380px,440px)] items-center gap-16 max-lg:grid-cols-1 max-lg:gap-3" style={{ animationDelay: "0.05s" }}>
          <div className="flex items-center gap-4 lg:pl-[340px]">
            <span aria-hidden style={{ width: 40, height: 2, background: RED, display: "inline-block" }} />
            <MonoLabel color={RED}>DWG-001 / Brand</MonoLabel>
            <MonoLabel>· Est. 1998</MonoLabel>
          </div>
          <div className="flex items-center justify-between max-lg:hidden">
            <MonoLabel color={NAVY}>DWG-002 · Sign-in</MonoLabel>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: RED }} />
              <MonoLabel color={RED}>Secure</MonoLabel>
            </span>
          </div>
        </div>

        {/* ── Sheet body ─────────────────────────────────────────── */}
        <section className="grid min-h-0 grid-cols-[1fr_minmax(380px,440px)] items-center gap-16 py-6 max-lg:grid-cols-1 max-lg:gap-10 max-lg:py-8">
          {/* Statement column — the headline tucks in just under the diamond
              field, exactly like the reference render. Logo shows here only
              on small screens (it sits above the card on lg+). */}
          <div className="min-w-0 lg:pt-44">
            <Image
              src="/brand/logo.png"
              alt="Carbide India — Your Tungsten Carbide & Tungsten Copper Partners"
              width={150}
              height={81}
              priority
              className="login-rise lg:hidden"
              style={{ height: "auto", animationDelay: "0.10s" }}
            />
            <h1
              className="login-rise mt-5 lg:mt-0"
              style={{
                animationDelay: "0.18s",
                fontFamily: "var(--font-display), var(--font-sans), sans-serif",
                fontWeight: 800,
                fontSize: "clamp(38px, 4.4vw, 60px)",
                lineHeight: 1.02,
                letterSpacing: "-0.035em",
                color: NAVY,
              }}
            >
              Precision begins
              <br />
              with the <span style={{ color: RED }}>first entry</span>
              <span style={{ color: NAVY }}>.</span>
            </h1>
            <p
              className="login-rise mt-4 max-w-[52ch]"
              style={{ animationDelay: "0.28s", fontSize: 15.5, lineHeight: 1.6, color: "#57534E" }}
            >
              Enquiries, feasibility, costing and quotations — every SM number,
              tracked from first call to sales order. Built for the shop floor,
              engineered like the parts we make.
            </p>

            {/* Spec strip */}
            <div
              className="login-rise mt-6 grid max-w-[540px] grid-cols-3 gap-6 py-3"
              style={{
                animationDelay: "0.38s",
                borderTop: "1px solid rgba(30,36,71,0.25)",
                borderBottom: "1px solid rgba(30,36,71,0.25)",
              }}
            >
              {(
                [
                  ["Output", "25 MT / YR", NAVY],
                  ["Grade", "WC · W-Cu", RED],
                  ["Loc", "NASHIK · IN", NAVY],
                ] as const
              ).map(([k, v, c]) => (
                <div key={k}>
                  <MonoLabel>{k}</MonoLabel>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 13,
                      letterSpacing: "0.14em",
                      fontWeight: 700,
                      color: c,
                      marginTop: 4,
                    }}
                  >
                    {v}
                  </div>
                </div>
              ))}
            </div>

            {/* Dimensioned-circle motif — hidden when the viewport is short
                so it can never crowd the title block. */}
            <div className="login-rise mt-6 hidden max-w-[540px] [@media(min-width:1024px)_and_(min-height:820px)]:block" style={{ animationDelay: "0.48s" }} aria-hidden>
              <svg viewBox="0 0 560 110" width="100%" height="auto" fill="none">
                {/* dimension line with end ticks + arrow stops */}
                <line x1="8" y1="50" x2="552" y2="50" stroke={NAVY} strokeOpacity="0.45" strokeWidth="1" />
                <line x1="8" y1="40" x2="8" y2="60" stroke={NAVY} strokeOpacity="0.6" strokeWidth="1.5" />
                <line x1="552" y1="40" x2="552" y2="60" stroke={NAVY} strokeOpacity="0.6" strokeWidth="1.5" />
                <line x1="280" y1="40" x2="280" y2="60" stroke={NAVY} strokeOpacity="0.35" strokeWidth="1" />
                {/* dashed circle + crosshair, centre-left like the mock */}
                <circle cx="180" cy="50" r="34" stroke={NAVY} strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="5 4" />
                <line x1="180" y1="8" x2="180" y2="92" stroke={NAVY} strokeOpacity="0.3" strokeWidth="0.8" strokeDasharray="2 4" />
                <line x1="134" y1="50" x2="226" y2="50" stroke={NAVY} strokeOpacity="0.3" strokeWidth="0.8" strokeDasharray="2 4" />
                <circle cx="180" cy="50" r="2.2" fill={RED} />
                <text
                  x="180" y="104" textAnchor="middle"
                  style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.18em", fontWeight: 700 }}
                  fill={RED}
                >
                  Ø 12.00 ±0.01
                </text>
              </svg>
            </div>
          </div>

          {/* Sign-in column — logo sits above the card, clearly visible. */}
          <div className="login-rise w-full" style={{ animationDelay: "0.25s" }}>
            <div className="mb-5 flex justify-center max-lg:hidden">
              <Image
                src="/brand/logo.png"
                alt="Carbide India"
                width={168}
                height={91}
                priority
                style={{ height: "auto" }}
              />
            </div>
            <div className="mb-3 hidden items-center justify-between max-lg:flex">
              <MonoLabel color={NAVY}>DWG-002 · Sign-in</MonoLabel>
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: RED }} />
                <MonoLabel color={RED}>Secure</MonoLabel>
              </span>
            </div>

            {reason === "idle" && (
              <div
                role="status"
                className="mb-4 px-4 py-3"
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
                className="p-8 text-center"
                style={{ background: "#FFFFFF", border: "1px solid #E7E2DA", boxShadow: "0 2px 10px rgba(30,36,71,0.06)" }}
              >
                <h2 className="mb-2 text-[17px] font-semibold" style={{ color: NAVY }}>
                  Account not provisioned
                </h2>
                <p className="mb-6 text-[14px] leading-relaxed" style={{ color: "#78716C" }}>
                  You&apos;re signed in, but this account isn&apos;t linked to
                  an active employee. Contact your administrator, or sign out
                  and try a different account.
                </p>
                <SignOutButton redirectUrl="/login">
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90"
                    style={{ background: NAVY }}
                  >
                    Sign out
                  </button>
                </SignOutButton>
              </div>
            ) : (
              <SignInCard />
            )}
          </div>
        </section>

        {/* ── Sheet footer row ───────────────────────────────────── */}
        <div className="login-rise grid grid-cols-[1fr_minmax(380px,440px)] items-center gap-16 max-lg:grid-cols-1 max-lg:gap-2 max-md:pb-6" style={{ animationDelay: "0.55s" }}>
          <div className="flex items-center justify-between gap-6">
            <MonoLabel>W-150(A) MIDC Ambad, Nashik</MonoLabel>
            <MonoLabel>Scale 1:1</MonoLabel>
          </div>
          <div className="flex items-center justify-between">
            <MonoLabel>WMS · {year} · Confidential</MonoLabel>
            <MonoLabel color={NAVY}>Sheet 02 / 02</MonoLabel>
          </div>
        </div>
      </main>
    </div>
  );
}
