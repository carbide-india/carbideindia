import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/current";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { allowedPermissionKeys } from "@/lib/auth/module-access";
import { IdleTimerClient } from "@/components/auth/idle-timer-client";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { CommandPalette } from "@/components/erp/command-palette";
import { PermissionsProvider } from "@/components/auth/permissions-provider";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  // Resolved once per request and shared by context, so permission-aware chrome
  // (the "Go to next module" button) costs one query, not one per shell.
  // `null` while enforcement is off — see lib/auth/module-access.ts.
  const [settings, permissions] = await Promise.all([
    getOrgSettings(),
    allowedPermissionKeys(),
  ]);
  return (
    <PermissionsProvider value={permissions}>
      <IdleTimerClient timeoutMinutes={settings.idleTimeoutMinutes} />
      <KeyboardShortcuts />
      {/* App-wide ⌘K command palette (ERP Phase 3). Portal-based: renders
          nothing until opened, so existing page output is unchanged. */}
      <CommandPalette />
      {children}
    </PermissionsProvider>
  );
}
