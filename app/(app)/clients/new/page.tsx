import { KycForm, type KycFormValues } from "@/components/clients/kyc-form";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { getFormDraft } from "@/lib/queries/form-drafts";
import { listMasterOptions } from "@/lib/queries/masters";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listCustomOptionsMap } from "@/lib/queries/custom-lists";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { kycImportSpec } from "@/lib/import/specs/kyc";
import { commitKycImport } from "@/app/(app)/clients/import/actions";
import { BulkImportModal } from "@/components/import/bulk-import-modal";

export const dynamic = "force-dynamic";

/**
 * Client KYC - the onboarding form, now rendered inside the shared Enquiries
 * module shell (logo sidebar + indigo header) in the clean enquiry-form style,
 * rather than the old standalone Client-Master chrome. It is one of the forms
 * on the Enquiries launchpad.
 */
export default async function NewClientKycPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  await requireUser();
  const me = await getCurrentEmployee();
  const sp = await searchParams;
  const draftParam = typeof sp.draft === "string" ? sp.draft : undefined;
  const draftPayload = draftParam ? await getFormDraft("kyc", draftParam) : null;
  const [customerTypes, industryTypes, productTypes, departments, employees, kycLists] =
    await Promise.all([
      listMasterOptions("customer_type"),
      listMasterOptions("industry_type"),
      listMasterOptions("product_type"),
      listMasterOptions("department"),
      listEmployeeOptions(),
      listCustomOptionsMap("kyc"),
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
          paymentTermsOptions={kycLists["payment_terms"]}
          freightOptions={kycLists["freight_charges"]}
          creditDaysOptions={kycLists["credit_days"]}
          creditLimitOptions={kycLists["credit_limit"]}
          qtyDeviationOptions={kycLists["qty_deviation"]}
          transporterOptions={kycLists["transporter"]}
          bankOptions={kycLists["bank_name"]}
          accountTypeOptions={kycLists["account_type"]}
          stateOptions={kycLists["state"]}
          enableDrafts
          resumeDraftId={draftPayload ? draftParam : undefined}
          initialValues={draftPayload ? (draftPayload as Partial<KycFormValues>) : undefined}
        />
      </div>
    </EnquiryModuleShell>
  );
}
