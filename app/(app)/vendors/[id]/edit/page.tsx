import { notFound } from "next/navigation";
import { VendorForm, type VendorFormValues } from "@/components/vendors/vendor-form";
import { requireAdmin } from "@/lib/auth/current";
import { getVendorById } from "@/lib/queries/vendors";
import { listMasterOptions } from "@/lib/queries/masters";
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
  const [vendor, paymentTerms] = await Promise.all([
    getVendorById(id),
    listMasterOptions("payment_term"),
  ]);
  if (!vendor) notFound();

  const paymentTermsOptions = paymentTerms.map((o) => ({
    value: o.name,
    label: o.name,
  }));

  const initialValues: Partial<VendorFormValues> = {
    name: vendor.name,
    contactPerson: vendor.contactPerson ?? "",
    contactNo: vendor.contactNo ?? "",
    email: vendor.email ?? "",
    address: vendor.address ?? "",
    addressLine1: vendor.addressLine1 ?? "",
    addressLine2: vendor.addressLine2 ?? "",
    addressLine3: vendor.addressLine3 ?? "",
    addressLine4: vendor.addressLine4 ?? "",
    city: vendor.city ?? "",
    state: vendor.state ?? "",
    pinCode: vendor.pinCode ?? "",
    defaultCreditDays: vendor.defaultCreditDays ?? undefined,
    paymentTerms: vendor.paymentTerms ?? "",
    isGstApplicable: vendor.isGstApplicable,
    gstin: vendor.gstin ?? "",
    website: vendor.website ?? "",
    notes: vendor.notes ?? "",
  };

  return (
    <EnquiryModuleShell title="Vendors" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[900px]">
        <header className="mb-5">
          <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
            Edit Vendor
          </h1>
        </header>

        <VendorForm
          editVendorId={vendor.id}
          vendorCode={vendor.vendorCode}
          initialValues={initialValues}
          basePath="/vendors"
          paymentTermsOptions={paymentTermsOptions}
        />
      </div>
    </EnquiryModuleShell>
  );
}
