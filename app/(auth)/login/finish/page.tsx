"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, ArrowRight } from "lucide-react";
import {
  isEmailSignInLink,
  completeEmailLinkSignIn,
} from "@/lib/firebase/session-client";

const NAVY = "#1E2447";
const RED = "#D32F2F";
const PAPER_LINE = "#E7E2DA";
const MONO = "var(--font-mono-display, ui-monospace, monospace)";

const mono: React.CSSProperties = {
  fontFamily: MONO,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  fontWeight: 700,
};

type Status = "working" | "error";

/**
 * /login/finish - passwordless email-link landing. Firebase appends its
 * sign-in params to this URL; on mount we complete the sign-in (which mints
 * the __session cookie) and hard-navigate to "/". On failure we surface the
 * reason with a route back to /login. Matches the /login drafting-sheet shell.
 */
export default function FinishSignInPage() {
  const [status, setStatus] = React.useState<Status>("working");
  const [message, setMessage] = React.useState<string>("");

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      const href = window.location.href;
      if (!isEmailSignInLink(href)) {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          "This sign-in link is invalid or has already been used. Please request a new one.",
        );
        return;
      }
      try {
        await completeEmailLinkSignIn(href);
        if (cancelled) return;
        // Hard navigation so the server sees the fresh __session cookie.
        window.location.href = "/hub";
      } catch (err) {
        if (cancelled) return;
        const msg =
          typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "";
        setStatus("error");
        setMessage(
          msg ||
            "We couldn't finish signing you in. The link may have expired. Please request a new one.",
        );
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-5"
      style={{ background: "#F4F0E8" }}
    >
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

      <div className="relative z-10 w-full max-w-[440px]">
        <div className="mb-5 flex justify-center">
          <Image
            src="/brand/logo.png"
            alt="Carbide India"
            width={168}
            height={91}
            priority
            style={{ height: "auto" }}
          />
        </div>

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
              {status === "working" ? (
                <>Signing you <span style={{ color: RED }}>in</span></>
              ) : (
                <>Sign-in <span style={{ color: RED }}>link failed</span></>
              )}
            </h2>
            <p className="mt-1.5 text-[14px]" style={{ color: "#78716C" }}>
              {status === "working"
                ? "Verifying your sign-in link. This only takes a moment."
                : message}
            </p>

            {status === "working" ? (
              <div className="mt-7 flex items-center justify-center py-2">
                <Loader2 size={22} className="animate-spin" style={{ color: NAVY }} />
              </div>
            ) : (
              <Link
                href="/login"
                className="group relative mt-6 flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg px-5 text-[12px] text-white transition-colors duration-200"
                style={{ ...mono, background: NAVY }}
              >
                <span>Back to sign in</span>
                <span className="absolute right-5 top-1/2 -translate-y-1/2 inline-flex">
                  <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
