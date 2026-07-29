import type { ReactNode } from "react";
import { getCurrentEmployee } from "@/lib/auth/current";
import { getNavCounts } from "@/lib/queries/nav-counts";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { NewTaskTrigger } from "@/components/header/new-task-trigger";
import { WmsModuleShell } from "./wms-module-shell";

/**
 * Server wrapper for the WMS module shell: resolves the active-tasks badge
 * count + admin flag and injects the server-rendered slots (New Task trigger,
 * user menu). Each WMS page renders its content inside this instead of the old
 * top DashboardHeader.
 */
export async function WmsShellServer({ children }: { children: ReactNode }) {
  const me = await getCurrentEmployee();
  const isAdmin = me?.isAdmin ?? false;
  const { activeTasks } = await getNavCounts(
    me
      ? { userId: me.id, isAdmin: me.isAdmin, inboxSince: me.lastInboxVisitAt }
      : undefined,
  );

  return (
    <WmsModuleShell
      activeTasks={activeTasks}
      isAdmin={isAdmin}
      userMenu={<UserMenuServer />}
      newTask={<NewTaskTrigger />}
    >
      {children}
    </WmsModuleShell>
  );
}
