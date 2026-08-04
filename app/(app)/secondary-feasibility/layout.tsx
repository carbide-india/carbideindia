import type { ReactNode } from "react";
import { SecondaryFeasibilityModuleShell } from "@/components/feasibility/secondary-feasibility-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

// Secondary Feasibility is its own module (own shell + Pending/Done sidebar),
// reached from its own Forms launchpad card — it no longer nests inside the
// Primary Feasibility module.
export default function SecondaryFeasibilityModuleLayout({ children }: { children: ReactNode }) {
  return <SecondaryFeasibilityModuleShell userMenu={<UserMenuServer />}>{children}</SecondaryFeasibilityModuleShell>;
}
