import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/current";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { allowedPermissionKeys } from "@/lib/auth/module-access";
import { IdleTimerClient } from "@/components/auth/idle-timer-client";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { CommandPalette } from "@/components/erp/command-palette";
import { PermissionsProvider } from "@/components/auth/permissions-provider";
import { AdminProvider } from "@/components/auth/admin-provider";
import { ModuleTitleProvider } from "@/components/shell/module-title";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await requireUser();
  // Resolved once per request and shared by context, so permission-aware chrome
  // (the "Go to next module" button) costs one query, not one per shell.
  // `null` while enforcement is off — see lib/auth/module-access.ts.
  const [settings, permissions] = await Promise.all([
    getOrgSettings(),
    allowedPermissionKeys(),
  ]);
  return (
    <PermissionsProvider value={permissions}>
      <AdminProvider isAdmin={me.isAdmin}>
        <IdleTimerClient timeoutMinutes={settings.idleTimeoutMinutes} />
        <KeyboardShortcuts />
        {/* App-wide ⌘K command palette (ERP Phase 3). Portal-based: renders
            nothing until opened, so existing page output is unchanged. */}
        <CommandPalette />
        {/* Lets each page publish its own name into the module header (see
            components/shell/module-title.tsx) — one provider for every shell. */}
        <ModuleTitleProvider>{children}</ModuleTitleProvider>
      </AdminProvider>
    </PermissionsProvider>
  );
}
