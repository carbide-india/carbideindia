import { notFound } from "next/navigation";
import { CostingForm } from "@/components/costings/costing-form";
import { requireUser } from "@/lib/auth/current";
import { getInquiryItemCaption } from "@/lib/queries/costings";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewCostingPage({ searchParams }: PageProps) {
  await requireUser();
  const sp = await searchParams;

  const inquiryItemId = typeof sp.inquiryItemId === "string" ? sp.inquiryItemId : "";
  const inquiryId = typeof sp.inquiryId === "string" ? sp.inquiryId : "";

  // Both UUIDs are required — without them we cannot save a costing.
  if (!UUID_RE.test(inquiryItemId) || !UUID_RE.test(inquiryId)) {
    notFound();
  }

  const productCaption = await getInquiryItemCaption(inquiryItemId);

  return (
    <EnquiryModuleShell title="Costing Sheet" userMenu={<UserMenuServer />}>
      <div className="w-full">
        <CostingForm
          inquiryItemId={inquiryItemId}
          inquiryId={inquiryId}
          productCaption={productCaption}
        />
      </div>
    </EnquiryModuleShell>
  );
}
