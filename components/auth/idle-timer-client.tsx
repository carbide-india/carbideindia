"use client";
import { useCallback } from "react";
import { signOutEverywhere } from "@/lib/firebase/session-client";
import { IdleTimer } from "@/components/auth/idle-timer";

/** Never auto-sign-out sooner than this, whatever the stored setting says — a
 *  too-low value (or a different environment's DB) shouldn't log people out fast.
 *  Higher configured values are respected as-is. */
const MIN_IDLE_MINUTES = 10;

export function IdleTimerClient({ timeoutMinutes }: { timeoutMinutes: number }) {
  // Stable callback so IdleTimer doesn't tear down listeners every render.
  const onTimeout = useCallback(async () => {
    try {
      await signOutEverywhere();
    } catch {
      // Best-effort; middleware bounces unauthenticated requests anyway.
      window.location.replace("/login?reason=idle");
    }
  }, []);
  const minutes = Math.max(
    Number.isFinite(timeoutMinutes) ? timeoutMinutes : 0,
    MIN_IDLE_MINUTES,
  );
  return <IdleTimer timeoutMs={minutes * 60_000} onTimeout={onTimeout} />;
}
