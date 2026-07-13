import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

/**
 * The New Enquiry form now lives in the Forms module shell at
 * `/enquiries/new`. This legacy WMS-chrome route just redirects there so any
 * old link (client record, hub, bookmarks) lands on the redesigned form. The
 * `draft` param is preserved for resume.
 */
export default async function LegacyNewInquiryRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const draft = typeof sp.draft === "string" ? `?draft=${encodeURIComponent(sp.draft)}` : "";
  redirect(`/enquiries/new${draft}` as Route);
}
