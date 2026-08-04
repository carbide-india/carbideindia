import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { VendorForm, type VendorFormValues } from "@/components/vendors/vendor-form";
import { requireAdmin } from "@/lib/auth/current";
import { getVendorById } from "@/lib/queries/vendors";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

/**
 * Edit Vendor (Forms module) — admin-only. Loads the stored vendor and maps it
 * onto the shared VendorForm (edit mode) with basePath="/vendors" so it saves
 * via updateVendor and returns to the Forms-module record.
 */
export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const vendor = await getVendorById(id);
  if (!vendor) notFound();

  const initialValues: Partial<VendorFormValues> = {
    name: vendor.name,
    contactPerson: vendor.contactPerson ?? "",
    contactNo: vendor.contactNo ?? "",
    email: vendor.email ?? "",
    address: vendor.address ?? "",
    defaultCreditDays: vendor.defaultCreditDays ?? undefined,
    paymentTerms: vendor.paymentTerms ?? "",
    isGstApplicable: vendor.isGstApplicable,
    notes: vendor.notes ?? "",
  };

  return (
    <EnquiryModuleShell title="Vendors" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[900px]">
        <header className="mb-5">
          <Link
            href={`/vendors/${vendor.id}` as Route}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6b7280] transition-colors hover:text-[#3f3f94]"
          >
            <ArrowLeft size={15} strokeWidth={2.4} />
            {vendor.name}
          </Link>
          <h1 className="mt-2 text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
            Edit Vendor
          </h1>
        </header>

        <VendorForm
          editVendorId={vendor.id}
          vendorCode={vendor.vendorCode}
          initialValues={initialValues}
          basePath="/vendors"
        />
      </div>
    </EnquiryModuleShell>
  );
}
