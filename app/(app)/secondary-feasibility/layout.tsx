import type { ReactNode } from "react";
import { SecondaryFeasibilityModuleShell } from "@/components/feasibility/secondary-feasibility-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { getSecondaryFeasibilityBucketCounts } from "@/lib/queries/feasibility";

// Secondary Feasibility is its own module (own shell + Pending/Done sidebar),
// reached from its own Forms launchpad card — it no longer nests inside the
// Primary Feasibility module.
export default async function SecondaryFeasibilityModuleLayout({
  children,
}: {
  children: ReactNode;
}) {
  const counts = await getSecondaryFeasibilityBucketCounts();
  return (
    <SecondaryFeasibilityModuleShell userMenu={<UserMenuServer />} counts={counts}>
      {children}
    </SecondaryFeasibilityModuleShell>
  );
}
