"use client";
import { useCallback } from "react";
import { signOutEverywhere } from "@/lib/firebase/session-client";
import { IdleTimer } from "@/components/auth/idle-timer";

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
  return <IdleTimer timeoutMs={timeoutMinutes * 60_000} onTimeout={onTimeout} />;
}
