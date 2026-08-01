"use client";

import * as React from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import {
  signInWithPassword,
  isPasswordlessEmail,
  sendOwnerSignInLink,
} from "@/lib/firebase/session-client";

const NAVY = "#1E2447";
const RED = "#D32F2F";
const PAPER_LINE = "#E7E2DA";

type Mode = "signin" | "linksent";

/**
 * Map a Firebase Auth error to a friendly, non-leaky message. Bad credentials
 * (wrong password / unknown user / invalid email) all collapse to one line so
 * we never reveal whether an address exists.
 */
function firebaseErrorMessage(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  switch (code) {
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-credential":
    case "auth/invalid-email":
      return "Incorrect email or password.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact your administrator.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default: {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
      return message || "Something went wrong. Please try again.";
    }
  }
}

/**
 * Custom sign-in card on Firebase Auth - drafting-sheet styling the prebuilt
 * widgets can't do (numbered mono field labels, registration marks). Email +
 * password establishes the session cookie via signInWithPassword, then lands
 * on "/". Owner accounts (alok@ / altus@) additionally get a passwordless
 * "email me a sign-in link" action; non-owner emails never see it.
 */
export function SignInCard() {
  const [mode, setMode] = React.useState<Mode>("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [linkPending, setLinkPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ownerEmail = isPasswordlessEmail(email);

  async function submitSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      await signInWithPassword(email.trim(), password);
      // Hard navigation so the new session cookie is picked up by the server
      // on the very next request (middleware + RSC read __session fresh).
      // /hub is the post-login home (the launchpad), matching the login page's
      // own redirect for already-signed-in users.
      window.location.href = "/hub";
    } catch (err) {
      setError(firebaseErrorMessage(err));
      setPending(false);
    }
  }

  async function sendLink() {
    if (linkPending || !ownerEmail) return;
    setError(null);
    setLinkPending(true);
    try {
      await sendOwnerSignInLink(email.trim());
      setMode("linksent");
    } catch (err) {
      setError(firebaseErrorMessage(err));
    } finally {
      setLinkPending(false);
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
          ) : (
            <>Check your <span style={{ color: RED }}>email</span></>
          )}
        </h2>
        <p className="mt-1.5 text-[14px]" style={{ color: "#78716C" }}>
          {mode === "signin"
            ? "Welcome back. Please sign in to continue."
            : `We sent a one-time sign-in link to ${email.trim()}. Open it on this device to continue.`}
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
              disabled={pending}
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

            {/* Owner-only passwordless option. Only alok@ / altus@ ever see this. */}
            {ownerEmail && (
              <button
                type="button"
                onClick={sendLink}
                disabled={linkPending}
                className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg px-5 text-[12px] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ ...mono, background: "#F7F5F1", border: `1px solid ${PAPER_LINE}`, color: NAVY }}
              >
                {linkPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Mail size={15} style={{ color: RED }} />
                )}
                <span>{linkPending ? "Sending link" : "Email me a sign-in link"}</span>
              </button>
            )}

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

        {/* ── Link sent: passwordless confirmation ────────────────── */}
        {mode === "linksent" && (
          <div className="mt-6 flex flex-col gap-5">
            <div
              className="flex items-center gap-3 rounded-lg px-4 py-3.5"
              style={{ background: "#F7F5F1", border: `1px solid ${PAPER_LINE}` }}
            >
              <Mail size={18} style={{ color: RED }} />
              <span className="text-[13px]" style={{ color: "#57534E" }}>
                The link expires shortly. If it doesn&apos;t arrive, check spam
                or send it again.
              </span>
            </div>
            <button
              type="button"
              onClick={sendLink}
              disabled={linkPending}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg px-5 text-[12px] text-white transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ ...mono, background: NAVY }}
            >
              <span>{linkPending ? "Sending" : "Resend link"}</span>
              {linkPending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            </button>
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(null); }}
              className="cursor-pointer text-center text-[10.5px] underline underline-offset-4 transition-opacity duration-200 hover:opacity-70"
              style={{ ...mono, color: "#78716C" }}
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
