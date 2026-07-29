"use client";

import { useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";

const NAVY = "#1E2447";

/**
 * Shown on /login when Clerk reports a signed-in user that has NO active
 * employee row (a mismatched / unprovisioned session — e.g. a dev-instance
 * account, or an email already linked to a different Clerk id).
 *
 * The old version was a dead-end: a Clerk <SignOutButton> that soft-navigates
 * to /login, so the browser could re-render this very card from cache and the
 * user appeared "still signed in" no matter how many times they clicked. This
 * version signs out AND does a HARD document navigation (window.location) so
 * the server re-renders /login against the freshly-cleared session — the user
 * always lands on a working sign-in form, never a loop.
 */
export function OrphanedSessionCard() {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);

  async function clearAndReload() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } catch {
      /* ignore — the hard reload below re-reads the (now cleared) session */
    } finally {
      // HARD navigation, not router.push: guarantees a fresh server render of
      // /login with the cleared cookie, bypassing any client router cache.
      window.location.assign("/login");
    }
  }

  // Safety net: if this card somehow renders again right after a reload (the
  // session genuinely didn't clear), don't silently trap — surface the manual
  // control. We only auto-clear once per browser session to avoid any loop.
  useEffect(() => {
    try {
      const KEY = "carbide_orphan_autoclear";
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, "1");
        void clearAndReload();
      }
    } catch {
      /* sessionStorage unavailable — user can still use the button */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="p-8 text-center"
      style={{ background: "#FFFFFF", border: "1px solid #E7E2DA", boxShadow: "0 2px 10px rgba(30,36,71,0.06)" }}
    >
      <h2 className="mb-2 text-[17px] font-semibold" style={{ color: NAVY }}>
        Signing you out…
      </h2>
      <p className="mb-6 text-[14px] leading-relaxed" style={{ color: "#78716C" }}>
        This session isn&apos;t linked to an active employee on this environment.
        We&apos;re clearing it so you can sign in with the correct account. If
        this doesn&apos;t happen automatically, use the button below.
      </p>
      <button
        type="button"
        onClick={clearAndReload}
        disabled={busy}
        className="cursor-pointer rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-60"
        style={{ background: NAVY }}
      >
        {busy ? "Signing out…" : "Sign out & sign in as a different account"}
      </button>
    </div>
  );
}
