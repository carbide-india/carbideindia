import type { ReactNode } from "react";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { AdminModuleShell } from "@/components/admin/admin-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { IdleTimerClient } from "@/components/auth/idle-timer-client";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Admin-only gate - kept exactly as before.
  await requireAdmin();
  const settings = await getOrgSettings();
  return (
    <>
      <IdleTimerClient timeoutMinutes={settings.idleTimeoutMinutes} />
      {/* Suspense guards the shell's useSearchParams() (tab-aware active state). */}
      <Suspense fallback={null}>
        <AdminModuleShell userMenu={<UserMenuServer />}>{children}</AdminModuleShell>
      </Suspense>
    </>
  );
}
