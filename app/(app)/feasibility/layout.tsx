import type { ReactNode } from "react";
import { FeasibilityModuleShell } from "@/components/feasibility/feasibility-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

// Primary Feasibility is its own module (own shell + status sidebar + Kanban),
// reached from the Forms launchpad card and the enquiry sidebar cross-link.
export default function FeasibilityModuleLayout({ children }: { children: ReactNode }) {
  return <FeasibilityModuleShell userMenu={<UserMenuServer />}>{children}</FeasibilityModuleShell>;
}
