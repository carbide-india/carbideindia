import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/current";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { IdleTimerClient } from "@/components/auth/idle-timer-client";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { CommandPalette } from "@/components/erp/command-palette";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  const settings = await getOrgSettings();
  return (
    <>
      <IdleTimerClient timeoutMinutes={settings.idleTimeoutMinutes} />
      <KeyboardShortcuts />
      {/* App-wide ⌘K command palette (ERP Phase 3). Portal-based: renders
          nothing until opened, so existing page output is unchanged. */}
      <CommandPalette />
      {children}
    </>
  );
}
