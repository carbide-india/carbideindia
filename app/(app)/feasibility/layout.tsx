import type { ReactNode } from "react";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

// Primary Feasibility lives inside the Forms module — it renders in the shared
// Enquiry/Forms shell (sidebar + Back to Forms) rather than a standalone module.
export default function FeasibilityModuleLayout({ children }: { children: ReactNode }) {
  return <EnquiryModuleShell userMenu={<UserMenuServer />}>{children}</EnquiryModuleShell>;
}
