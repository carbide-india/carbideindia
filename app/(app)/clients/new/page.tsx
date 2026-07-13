import { KycForm } from "@/components/clients/kyc-form";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { listMasterOptions } from "@/lib/queries/masters";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { kycImportSpec } from "@/lib/import/specs/kyc";
import { commitKycImport } from "@/app/(app)/clients/import/actions";
import { BulkImportModal } from "@/components/import/bulk-import-modal";

export const dynamic = "force-dynamic";

/**
 * Client KYC — the onboarding form, now rendered inside the shared Enquiries
 * module shell (logo sidebar + indigo header) in the clean enquiry-form style,
 * rather than the old standalone Client-Master chrome. It is one of the forms
 * on the Enquiries launchpad.
 */
export default async function NewClientKycPage() {
  await requireUser();
  const me = await getCurrentEmployee();
  const [customerTypes, industryTypes, productTypes, departments, employees] =
    await Promise.all([
      listMasterOptions("customer_type"),
      listMasterOptions("industry_type"),
      listMasterOptions("product_type"),
      listMasterOptions("department"),
      listEmployeeOptions(),
    ]);

  // Admins get a Bulk Upload entry in the sidebar (opens the client import modal).
  const importLookups = me?.isAdmin
    ? await loadLookups(specRefKinds(kycImportSpec.fields))
    : null;
  const bulkUpload =
    me?.isAdmin && importLookups ? (
      <BulkImportModal
        spec={kycImportSpec}
        lookups={importLookups}
        commit={commitKycImport}
        isAdmin
        triggerClassName="flex h-[44px] w-full items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#3a4152] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
      />
    ) : null;

  return (
    <EnquiryModuleShell
      title="Client KYC"
      userMenu={<UserMenuServer />}
      bulkUpload={bulkUpload}
    >
      <div className="w-full">
        <KycForm
          customerTypes={customerTypes}
          industryTypes={industryTypes}
          productTypes={productTypes}
          departments={departments}
          employees={employees}
        />
      </div>
    </EnquiryModuleShell>
  );
}
