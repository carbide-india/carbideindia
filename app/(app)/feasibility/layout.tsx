import type { ReactNode } from "react";
import { FeasibilityModuleShell } from "@/components/feasibility/feasibility-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export default function FeasibilityModuleLayout({ children }: { children: ReactNode }) {
  return <FeasibilityModuleShell userMenu={<UserMenuServer />}>{children}</FeasibilityModuleShell>;
}
