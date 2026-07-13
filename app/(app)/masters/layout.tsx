import type { ReactNode } from "react";
import { MastersModuleShell } from "@/components/masters/masters-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export default function MastersModuleLayout({ children }: { children: ReactNode }) {
  return <MastersModuleShell userMenu={<UserMenuServer />}>{children}</MastersModuleShell>;
}
