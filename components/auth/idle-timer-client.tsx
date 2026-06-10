"use client";
import { useCallback } from "react";
import { useClerk } from "@clerk/nextjs";
import { IdleTimer } from "@/components/auth/idle-timer";

export function IdleTimerClient({ timeoutMinutes }: { timeoutMinutes: number }) {
  const { signOut } = useClerk();
  // Stable callback so IdleTimer doesn't tear down listeners every render.
  const onTimeout = useCallback(async () => {
    try {
      await signOut({ redirectUrl: "/login?reason=idle" });
    } catch {
      // Best-effort; middleware bounces unauthenticated requests anyway.
      window.location.replace("/login?reason=idle");
    }
  }, [signOut]);
  return <IdleTimer timeoutMs={timeoutMinutes * 60_000} onTimeout={onTimeout} />;
}
