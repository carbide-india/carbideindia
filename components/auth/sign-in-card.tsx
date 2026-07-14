"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

const NAVY = "#1E2447";
const RED = "#D32F2F";
const PAPER_LINE = "#E7E2DA";

type Mode = "signin" | "forgot" | "reset" | "trust";

function clerkErrorMessage(err: unknown): string {
  const e = err as {
    message?: string;
    errors?: Array<{ longMessage?: string; message?: string }>;
  };
  return (
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    e?.message ??
    "Something went wrong. Please try again."
  );
}

/**
 * Custom sign-in card on Clerk's headless API - drafting-sheet styling the
 * prebuilt widget can't do (numbered mono field labels, registration marks).
 * Email + password only; FORGOT? runs Clerk's reset-password-email-code flow
 * in the same card (send code → code + new password).
 */
export function SignInCard() {
  const router = useRouter();
  const { signIn } = useSignIn();

  const [mode, setMode] = React.useState<Mode>("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // Clerk v7 "future" sign-in API: methods return { error } values (no
  // throwing), and finalize() activates the created session.
  async function submitSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || pending) return;
    setError(null);
    setPending(true);
    try {
      const { error: pwError } = await signIn.password({
        identifier: email.trim(),
        password,
      });
      if (pwError) {
        setError(clerkErrorMessage(pwError));
        return;
      }
      // password() succeeded - try to activate the session. finalize()
      // THROWS (not a returned error) when no session exists yet, which is
      // what Client Trust looks like: the password was right but the new
      // browser must be verified by email code first.
      let finalizeProblem: string | null = null;
      try {
        const { error: finError } = await signIn.finalize();
        if (!finError) {
          router.push("/hub");
          router.refresh();
          return;
        }
        finalizeProblem = clerkErrorMessage(finError);
      } catch (err) {
        finalizeProblem = clerkErrorMessage(err);
      }
      try {
        const { error: mfaError } = await signIn.mfa.sendEmailCode();
        if (!mfaError) {
          setNotice(`New device - we emailed a verification code to ${email.trim()}.`);
          setCode("");
          setMode("trust");
          return;
        }
      } catch {
        // fall through to the finalize error below
      }
      setError(finalizeProblem);
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || pending) return;
    setError(null);
    setPending(true);
    try {
      const { error: createError } = await signIn.create({ identifier: email.trim() });
      if (createError) {
        setError(clerkErrorMessage(createError));
        return;
      }
      const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) {
        setError(clerkErrorMessage(sendError));
        return;
      }
      setNotice(`A 6-digit code was sent to ${email.trim()}.`);
      setMode("reset");
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || pending) return;
    setError(null);
    setPending(true);
    try {
      const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({
        code: code.trim(),
      });
      if (verifyError) {
        setError(clerkErrorMessage(verifyError));
        return;
      }
      const { error: submitError } = await signIn.resetPasswordEmailCode.submitPassword({
        password: newPassword,
      });
      if (submitError) {
        setError(clerkErrorMessage(submitError));
        return;
      }
      const { error: finError } = await signIn.finalize();
      if (finError) {
        setError(clerkErrorMessage(finError));
        return;
      }
      router.push("/hub");
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function submitTrust(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || pending) return;
    setError(null);
    setPending(true);
    try {
      const { error: verifyError } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (verifyError) {
        setError(clerkErrorMessage(verifyError));
        return;
      }
      const { error: finError } = await signIn.finalize();
      if (finError) {
        setError(clerkErrorMessage(finError));
        return;
      }
      router.push("/hub");
      router.refresh();
    } catch (err) {
      setError(clerkErrorMessage(err));
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
        {/* Heading */}
        <h2
          className="text-[24px] font-bold leading-tight"
          style={{ color: NAVY, fontFamily: "var(--font-display), var(--font-sans), sans-serif" }}
        >
          {mode === "signin" ? (
            <>Sign in to <span style={{ color: RED }}>WMS</span></>
          ) : mode === "forgot" ? (
            <>Reset <span style={{ color: RED }}>password</span></>
          ) : mode === "trust" ? (
            <>Verify this <span style={{ color: RED }}>device</span></>
          ) : (
            <>Check your <span style={{ color: RED }}>email</span></>
          )}
        </h2>
        <p className="mt-1.5 text-[14px]" style={{ color: "#78716C" }}>
          {mode === "signin"
            ? "Welcome back. Please sign in to continue."
            : mode === "forgot"
              ? "Enter your email and we'll send a reset code."
              : notice ?? "Enter the code and your new password."}
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

        {/* ── Sign in ─────────────────────────────────────────────── */}
        {mode === "signin" && (
          <form onSubmit={submitSignIn} className="mt-6 flex flex-col gap-5">
            <div>
              <label htmlFor="si-email" className="block text-[10.5px]" style={mono}>
                <span style={{ color: RED }}>01 /</span>{" "}
                <span style={{ color: "#57534E" }}>Email</span>
              </label>
              <input
                id="si-email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@carbideindia.com"
                className="mt-2 h-12 w-full rounded-lg px-4 text-[15px] outline-none transition-all duration-200"
                style={{
                  background: "#F7F5F1",
                  border: `1px solid ${PAPER_LINE}`,
                  color: NAVY,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#3F3F94"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(63,63,148,0.15)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = PAPER_LINE; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="si-password" className="block text-[10.5px]" style={mono}>
                  <span style={{ color: RED }}>02 /</span>{" "}
                  <span style={{ color: "#57534E" }}>Password</span>
                </label>
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setError(null); }}
                  className="cursor-pointer text-[10.5px] transition-colors duration-200 hover:opacity-70"
                  style={{ ...mono, color: RED }}
                >
                  Forgot?
                </button>
              </div>
              <div className="relative mt-2">
                <input
                  id="si-password"
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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

            <button
              type="submit"
              disabled={pending || !signIn}
              className="group relative flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg px-5 text-[12px] text-white transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ ...mono, background: NAVY }}
            >
              {/* Label dead-centre; arrow pinned to the right edge. */}
              <span>{pending ? "Signing in" : "Sign in"}</span>
              <span className="absolute right-5 top-1/2 -translate-y-1/2 inline-flex">
                {pending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
                )}
              </span>
            </button>

            <p className="text-center text-[10.5px]" style={{ ...mono, color: "#78716C" }}>
              No account?{" "}
              <a
                href="mailto:altus@carbideindia.com?subject=WMS%20access%20request"
                className="cursor-pointer underline underline-offset-4 transition-opacity duration-200 hover:opacity-70"
                style={{ color: RED }}
              >
                Request access
              </a>
            </p>
          </form>
        )}

        {/* ── Forgot: send code ───────────────────────────────────── */}
        {mode === "forgot" && (
          <form onSubmit={submitForgot} className="mt-6 flex flex-col gap-5">
            <div>
              <label htmlFor="fp-email" className="block text-[10.5px]" style={mono}>
                <span style={{ color: RED }}>01 /</span>{" "}
                <span style={{ color: "#57534E" }}>Email</span>
              </label>
              <input
                id="fp-email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@carbideindia.com"
                className="mt-2 h-12 w-full rounded-lg px-4 text-[15px] outline-none transition-all duration-200"
                style={{ background: "#F7F5F1", border: `1px solid ${PAPER_LINE}`, color: NAVY }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#3F3F94"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(63,63,148,0.15)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = PAPER_LINE; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
            <button
              type="submit"
              disabled={pending || !signIn}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg px-5 text-[12px] text-white transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ ...mono, background: NAVY }}
            >
              <span>{pending ? "Sending" : "Send reset code"}</span>
              {pending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            </button>
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(null); }}
              className="cursor-pointer text-center text-[10.5px] underline underline-offset-4 transition-opacity duration-200 hover:opacity-70"
              style={{ ...mono, color: "#78716C" }}
            >
              Back to sign in
            </button>
          </form>
        )}

        {/* ── Reset: code + new password ──────────────────────────── */}
        {mode === "reset" && (
          <form onSubmit={submitReset} className="mt-6 flex flex-col gap-5">
            <div>
              <label htmlFor="rp-code" className="block text-[10.5px]" style={mono}>
                <span style={{ color: RED }}>01 /</span>{" "}
                <span style={{ color: "#57534E" }}>Reset code</span>
              </label>
              <input
                id="rp-code"
                inputMode="numeric"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="mt-2 h-12 w-full rounded-lg px-4 text-[15px] tracking-[0.3em] outline-none transition-all duration-200"
                style={{ background: "#F7F5F1", border: `1px solid ${PAPER_LINE}`, color: NAVY }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#3F3F94"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(63,63,148,0.15)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = PAPER_LINE; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
            <div>
              <label htmlFor="rp-password" className="block text-[10.5px]" style={mono}>
                <span style={{ color: RED }}>02 /</span>{" "}
                <span style={{ color: "#57534E" }}>New password</span>
              </label>
              <input
                id="rp-password"
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-2 h-12 w-full rounded-lg px-4 text-[15px] outline-none transition-all duration-200"
                style={{ background: "#F7F5F1", border: `1px solid ${PAPER_LINE}`, color: NAVY }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#3F3F94"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(63,63,148,0.15)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = PAPER_LINE; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
            <button
              type="submit"
              disabled={pending || !signIn}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg px-5 text-[12px] text-white transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ ...mono, background: NAVY }}
            >
              <span>{pending ? "Resetting" : "Reset & sign in"}</span>
              {pending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            </button>
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(null); setNotice(null); }}
              className="cursor-pointer text-center text-[10.5px] underline underline-offset-4 transition-opacity duration-200 hover:opacity-70"
              style={{ ...mono, color: "#78716C" }}
            >
              Back to sign in
            </button>
          </form>
        )}

        {/* ── Client Trust: verify a new device by email code ─────── */}
        {mode === "trust" && (
          <form onSubmit={submitTrust} className="mt-6 flex flex-col gap-5">
            <div>
              <label htmlFor="ct-code" className="block text-[10.5px]" style={mono}>
                <span style={{ color: RED }}>01 /</span>{" "}
                <span style={{ color: "#57534E" }}>Verification code</span>
              </label>
              <input
                id="ct-code"
                inputMode="numeric"
                required
                autoFocus
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="mt-2 h-12 w-full rounded-lg px-4 text-[15px] tracking-[0.3em] outline-none transition-all duration-200"
                style={{ background: "#F7F5F1", border: `1px solid ${PAPER_LINE}`, color: NAVY }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#3F3F94"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(63,63,148,0.15)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = PAPER_LINE; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
            <button
              type="submit"
              disabled={pending || !signIn}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg px-5 text-[12px] text-white transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ ...mono, background: NAVY }}
            >
              <span>{pending ? "Verifying" : "Verify device"}</span>
              {pending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            </button>
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(null); setNotice(null); }}
              className="cursor-pointer text-center text-[10.5px] underline underline-offset-4 transition-opacity duration-200 hover:opacity-70"
              style={{ ...mono, color: "#78716C" }}
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
