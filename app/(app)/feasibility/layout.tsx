import type { ReactNode } from "react";
import { FeasibilityModuleShell } from "@/components/feasibility/feasibility-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { getFeasibilityBucketCounts } from "@/lib/queries/feasibility";

// Primary Feasibility is its own module (own shell + status sidebar + Kanban),
// reached from the Forms launchpad card and the enquiry sidebar cross-link.
export default async function FeasibilityModuleLayout({ children }: { children: ReactNode }) {
  // Counts live here rather than on the queue page because the SIDEBAR is what
  // shows them, and the sidebar renders on every route in the module.
  const counts = await getFeasibilityBucketCounts();
  return (
    <FeasibilityModuleShell userMenu={<UserMenuServer />} counts={counts}>
      {children}
    </FeasibilityModuleShell>
  );
}
