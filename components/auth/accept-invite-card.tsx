"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { verifyPasswordResetCode } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { completeOnboarding } from "@/lib/firebase/session-client";
import { ArrowRight, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

const NAVY = "#1E2447";
const RED = "#D32F2F";
const PAPER_LINE = "#E7E2DA";

/** Map Firebase auth errors (and anything else) to a human message. */
function firebaseErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  switch (e?.code) {
    case "auth/expired-action-code":
      return "This invitation link has expired. Ask an admin to resend your invite.";
    case "auth/invalid-action-code":
      return "This invitation link is invalid or has already been used. Ask an admin to resend your invite.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact an administrator.";
    case "auth/user-not-found":
      return "We couldn't find an account for this invitation. Ask an admin to resend your invite.";
    case "auth/weak-password":
      return "That password is too weak. Please use at least 8 characters.";
    default:
      return e?.message ?? "Something went wrong. Please try again.";
  }
}

/**
 * Invitation acceptance card — the landing for a Firebase onboarding link.
 *
 * The invite email links the employee here with an `oobCode` query param (a
 * Firebase password-reset/onboarding action code). On mount we verify the code
 * (`verifyPasswordResetCode`) to resolve the invited email and catch a bad /
 * expired link early. The employee then picks a password (with confirmation)
 * and `completeOnboarding(oobCode, password)` sets it, signs them in, and mints
 * the `__session` cookie — dropping them straight into an active session.
 *
 * Mirrors the drafting-sheet styling of <SignInCard>.
 */
export function AcceptInviteCard({ oobCode }: { oobCode?: string }) {
  const router = useRouter();

  // "validating" = verifying the code; "set" = ready for a password;
  // "fatal" = the link is missing/bad/expired and there's nothing to do here.
  const [phase, setPhase] = React.useState<"validating" | "set" | "fatal">(
    oobCode ? "validating" : "fatal",
  );
  const [email, setEmail] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    oobCode ? null : "This invitation link is missing its code. Ask an admin to resend your invite.",
  );

  // Verify the code exactly once, as soon as the card mounts. The ref guard
  // survives the double-invoke of React 19 strict-mode effects.
  const verified = React.useRef(false);
  React.useEffect(() => {
    if (!oobCode || verified.current) return;
    verified.current = true;
    (async () => {
      try {
        const resolvedEmail = await verifyPasswordResetCode(firebaseAuth, oobCode);
        setEmail(resolvedEmail);
        setPhase("set");
      } catch (err) {
        setError(firebaseErrorMessage(err));
        setPhase("fatal");
      }
    })();
  }, [oobCode]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!oobCode || pending) return;
    setError(null);
    if (password !== confirm) {
      setError("Those passwords don't match. Please re-enter them.");
      return;
    }
    setPending(true);
    try {
      await completeOnboarding(oobCode, password);
      router.push("/hub");
      router.refresh();
    } catch (err) {
      const message = firebaseErrorMessage(err);
      setError(message);
      // An expired/invalid code can't be retried — send them back to sign in.
      const code = (err as { code?: string })?.code;
      if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
        setPhase("fatal");
      }
    } finally {
      setPending(false);
    }
  }

  const mono: React.CSSProperties = {
    fontFamily: "var(--font-mono-display, ui-monospace, monospace)",
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    fontWeight: 700,
  };

  return (
    <div className="relative">
      {/* Registration marks - red crop corners, like a print sheet. */}
      {(
        [
          { top: -1, left: -1, bt: true, bl: true },
          { top: -1, right: -1, bt: true, br: true },
          { bottom: -1, left: -1, bb: true, bl: true },
          { bottom: -1, right: -1, bb: true, br: true },
        ] as const
      ).map((m, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute h-5 w-5"
          style={{
            top: "top" in m ? m.top : undefined,
            bottom: "bottom" in m ? m.bottom : undefined,
            left: "left" in m ? m.left : undefined,
            right: "right" in m ? m.right : undefined,
            borderTop: "bt" in m && m.bt ? `2px solid ${RED}` : undefined,
            borderBottom: "bb" in m && m.bb ? `2px solid ${RED}` : undefined,
            borderLeft: "bl" in m && m.bl ? `2px solid ${RED}` : undefined,
            borderRight: "br" in m && m.br ? `2px solid ${RED}` : undefined,
          }}
        />
      ))}

      <div
        className="bg-white px-9 py-8 max-md:px-6"
        style={{ border: `1px solid ${PAPER_LINE}`, boxShadow: "0 2px 10px rgba(30,36,71,0.06)" }}
      >
        <h2
          className="text-[24px] font-bold leading-tight"
          style={{ color: NAVY, fontFamily: "var(--font-display), var(--font-sans), sans-serif" }}
        >
          {phase === "fatal" ? (
            <>Invitation <span style={{ color: RED }}>problem</span></>
          ) : (
            <>Set your <span style={{ color: RED }}>password</span></>
          )}
        </h2>
        <p className="mt-1.5 text-[14px]" style={{ color: "#78716C" }}>
          {phase === "validating"
            ? "Checking your invitation"
            : phase === "fatal"
              ? "This invite link can't be used."
              : email
                ? `Welcome to Carbide India WMS. Create a password for ${email} and you'll be signed in.`
                : "Create a password to finish setting up your account."}
        </p>

        {error && (
          <div
            role="alert"
            className="mt-4 px-3.5 py-2.5 text-[13px] leading-relaxed"
            style={{ background: "rgba(211,47,47,0.06)", border: `1px solid rgba(211,47,47,0.35)`, color: "#9B1C1C" }}
          >
            {error}
          </div>
        )}

        {/* ── Validating the code ─────────────────────────────────── */}
        {phase === "validating" && (
          <div className="mt-8 flex items-center gap-3 text-[14px]" style={{ color: "#57534E" }}>
            <Loader2 size={18} className="animate-spin" style={{ color: NAVY }} />
            One moment
          </div>
        )}

        {/* ── Fatal: missing / bad / expired code ─────────────────── */}
        {phase === "fatal" && (
          <a
            href="/login"
            className="mt-7 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg px-5 text-[12px] text-white transition-opacity duration-200 hover:opacity-90"
            style={{ ...mono, background: NAVY }}
          >
            Go to sign in
            <ArrowRight size={16} />
          </a>
        )}

        {/* ── Set password ────────────────────────────────────────── */}
        {phase === "set" && (
          <form onSubmit={submitPassword} className="mt-6 flex flex-col gap-5">
            {email && (
              <div>
                <label className="block text-[10.5px]" style={mono}>
                  <span style={{ color: RED }}>01 /</span>{" "}
                  <span style={{ color: "#57534E" }}>Email</span>
                </label>
                <div
                  className="mt-2 flex h-12 w-full items-center gap-2 rounded-lg px-4 text-[15px]"
                  style={{ background: "#F2F0EA", border: `1px solid ${PAPER_LINE}`, color: "#78716C" }}
                >
                  <ShieldCheck size={16} style={{ color: "#3F3F94" }} />
                  {email}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="ai-password" className="block text-[10.5px]" style={mono}>
                <span style={{ color: RED }}>02 /</span>{" "}
                <span style={{ color: "#57534E" }}>Create password</span>
              </label>
              <div className="relative mt-2">
                <input
                  id="ai-password"
                  type={showPw ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="h-12 w-full rounded-lg px-4 pr-12 text-[15px] outline-none transition-all duration-200"
                  style={{ background: "#F7F5F1", border: `1px solid ${PAPER_LINE}`, color: NAVY }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#3F3F94"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(63,63,148,0.15)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = PAPER_LINE; e.currentTarget.style.boxShadow = "none"; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer p-1.5 transition-colors duration-200"
                  style={{ color: "#A8A29E" }}
                >
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="ai-confirm" className="block text-[10.5px]" style={mono}>
                <span style={{ color: RED }}>03 /</span>{" "}
                <span style={{ color: "#57534E" }}>Confirm password</span>
              </label>
              <input
                id="ai-confirm"
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
                className="mt-2 h-12 w-full rounded-lg px-4 text-[15px] outline-none transition-all duration-200"
                style={{ background: "#F7F5F1", border: `1px solid ${PAPER_LINE}`, color: NAVY }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#3F3F94"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(63,63,148,0.15)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = PAPER_LINE; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="group relative flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg px-5 text-[12px] text-white transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ ...mono, background: NAVY }}
            >
              <span>{pending ? "Setting up" : "Set password & continue"}</span>
              <span className="absolute right-5 top-1/2 -translate-y-1/2 inline-flex">
                {pending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
                )}
              </span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
