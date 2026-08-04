import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { EnquiryLaunchpad } from "@/components/enquiries/enquiry-launchpad";

export const metadata: Metadata = {
  title: "New Enquiry Selection - Carbide India",
};

export default async function EnquiriesLaunchpadPage() {
  // The two Feasibility cards are admin-only, so the launchpad needs to know
  // who is looking (the routes themselves are admin-gated regardless).
  const me = await requireUser();
  return <EnquiryLaunchpad isAdmin={me.isAdmin} />;
}
