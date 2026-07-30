"use client";

import * as React from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Browser-style Back / Forward control for the app header.
 *
 * It mirrors the real history stack but tracks our own *depth index* so the two
 * buttons enable/disable exactly like a browser's chrome: Back is live only when
 * there's an earlier in-app entry, Forward only after you've gone back (and dies
 * the moment you navigate somewhere new, because a push truncates the forward
 * tail). The actual motion uses `router.back()` / `router.forward()`, so it walks
 * the genuine history entries — this component only decides when each arrow is
 * available and keeps the index in sync across pushes and pop (browser
 * back/forward or these buttons).
 */
export function HistoryNav({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const idxRef = React.useRef(0); // where we are in the stack
  const maxRef = React.useRef(0); // furthest entry reached (forward tail end)
  const poppedRef = React.useRef(false); // set by popstate so the nav effect skips
  const [canBack, setCanBack] = React.useState(false);
  const [canFwd, setCanFwd] = React.useState(false);

  const sync = React.useCallback(() => {
    setCanBack(idxRef.current > 0);
    setCanFwd(idxRef.current < maxRef.current);
  }, []);

  // Seed our index into the current history entry once, on mount.
  React.useEffect(() => {
    const st = window.history.state as { __navIdx?: number } | null;
    if (st && typeof st.__navIdx === "number") {
      idxRef.current = st.__navIdx;
      maxRef.current = Math.max(maxRef.current, st.__navIdx);
    } else {
      window.history.replaceState(
        { ...window.history.state, __navIdx: 0 },
        "",
      );
      idxRef.current = 0;
      maxRef.current = 0;
    }
    sync();

    const onPop = () => {
      const s = window.history.state as { __navIdx?: number } | null;
      idxRef.current = typeof s?.__navIdx === "number" ? s.__navIdx : 0;
      poppedRef.current = true; // the pathname effect that follows is a pop, not a push
      sync();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [sync]);

  // Every route change lands here. A pop was already accounted for above; a real
  // push (Link click / router.push) advances the index and stamps it onto the
  // freshly-pushed entry, truncating any forward tail.
  React.useEffect(() => {
    if (poppedRef.current) {
      poppedRef.current = false;
      return;
    }
    const nextIdx = idxRef.current + 1;
    window.history.replaceState(
      { ...window.history.state, __navIdx: nextIdx },
      "",
    );
    idxRef.current = nextIdx;
    maxRef.current = nextIdx; // a new push kills the forward entries
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);

  const btn =
    "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#4b5563] transition hover:bg-[#efeffb] hover:text-[#3f3f94] active:scale-90 disabled:pointer-events-none disabled:opacity-35";

  return (
    <div className={"flex items-center gap-0.5 " + (className ?? "")}>
      <button
        type="button"
        onClick={() => router.back()}
        disabled={!canBack}
        aria-label="Go back"
        title="Back"
        className={btn}
      >
        <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.4} />
      </button>
      <button
        type="button"
        onClick={() => router.forward()}
        disabled={!canFwd}
        aria-label="Go forward"
        title="Forward"
        className={btn}
      >
        <ChevronRight className="h-[20px] w-[20px]" strokeWidth={2.4} />
      </button>
    </div>
  );
}
