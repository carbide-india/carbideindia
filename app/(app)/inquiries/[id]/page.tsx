import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Legacy enquiry-detail route. The SM Workspace now lives inside the Enquiries
 * module at `/enquiries/register/[id]` (rendered within the module shell), so
 * this route is a permanent redirect to preserve any old links.
 */
export default async function InquiryDetailPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/enquiries/register/${id}` as Route);
}
