import type { Metadata } from "next";
import { EnquiryLaunchpad } from "@/components/enquiries/enquiry-launchpad";

export const metadata: Metadata = {
  title: "New Enquiry Selection — Carbide India",
};

export default function EnquiriesLaunchpadPage() {
  return <EnquiryLaunchpad />;
}
