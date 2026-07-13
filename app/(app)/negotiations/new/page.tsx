import { NegotiationForm } from "@/components/negotiations/negotiation-form";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { listInquiryOptions } from "@/lib/queries/inquiries";
import { listQuotationOptions } from "@/lib/queries/quotes";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { enforcedNewGuard } from "@/components/workflow/enforced-new-guard";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { negotiationImportSpec } from "@/lib/import/specs/negotiation";
import { commitNegotiationImport } from "@/app/(app)/negotiations/import/actions";
import { BulkImportModal } from "@/components/import/bulk-import-modal";

export const dynamic = "force-dynamic";

export default async function NewNegotiationPage() {
  await requireUser();
  // Phase 8 — when the Quotation flag is ON, sending a quote auto-provisions the
  // negotiation via advanceStage; disable this standalone form to avoid a
  // double-provision. Flag OFF (default) ⇒ no-op, form renders as today.
  await enforcedNewGuard("quotation", "/negotiations");
  const me = await getCurrentEmployee();
  const [inquiries, quotations, employees] = await Promise.all([
    listInquiryOptions(),
    listQuotationOptions(),
    listEmployeeOptions(),
  ]);

  // Admins get a Bulk Upload entry in the sidebar (opens the negotiation import modal).
  const importLookups = me?.isAdmin
    ? await loadLookups(specRefKinds(negotiationImportSpec.fields))
    : null;

  const bulkUpload =
    me?.isAdmin && importLookups ? (
      <BulkImportModal
        spec={negotiationImportSpec}
        lookups={importLookups}
        commit={commitNegotiationImport}
        isAdmin
        triggerClassName="flex h-[44px] w-full items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#3a4152] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
      />
    ) : null;

  return (
    <EnquiryModuleShell
      title="Negotiation"
      userMenu={<UserMenuServer />}
      bulkUpload={bulkUpload}
    >
      <div className="w-full">
        <NegotiationForm
          inquiries={inquiries}
          quotations={quotations}
          employees={employees}
        />
      </div>
    </EnquiryModuleShell>
  );
}
