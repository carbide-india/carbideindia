import { SoForm } from "@/components/sales-orders/so-form";
import type { SoFormValues } from "@/components/sales-orders/so-form";
import { resolveDraftToResume } from "@/lib/queries/form-drafts";
import { ResumedDraftNote } from "@/components/drafts/resumed-draft-note";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { listInquiryOptions } from "@/lib/queries/inquiries";
import { listQuotationOptions } from "@/lib/queries/quotes";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { enforcedNewGuard } from "@/components/workflow/enforced-new-guard";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { salesOrderImportSpec } from "@/lib/import/specs/sales-order";
import { commitSalesOrderImport } from "@/app/(app)/sales-orders/import/actions";
import { BulkImportModal } from "@/components/import/bulk-import-modal";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ draft?: string; fresh?: string }>;
}

export default async function NewSalesOrderPage({ searchParams }: PageProps) {
  await requireUser();
  const sp = await searchParams;
  // Phase 8 - when the Negotiation flag is ON, order_won auto-provisions the SO
  // via advanceStage; disable this standalone form to avoid a double-provision.
  // Flag OFF (default) ⇒ no-op, form renders as today.
  await enforcedNewGuard("negotiation", "/sales-orders");
  const me = await getCurrentEmployee();
  const [inquiries, quotations, employees] = await Promise.all([
    listInquiryOptions(),
    listQuotationOptions(),
    listEmployeeOptions(),
  ]);

  const importLookups = me?.isAdmin
    ? await loadLookups(specRefKinds(salesOrderImportSpec.fields))
    : null;

  const resume = await resolveDraftToResume(
    "sales-order",
    typeof sp.draft === "string" ? sp.draft : undefined,
    sp.fresh === "1",
  );

  // Admins get a Bulk Upload entry in the sidebar (opens the sales-order import modal).
  const bulkUpload =
    me?.isAdmin && importLookups ? (
      <BulkImportModal
        spec={salesOrderImportSpec}
        lookups={importLookups}
        commit={commitSalesOrderImport}
        isAdmin
        triggerClassName="flex h-[44px] w-full items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#3a4152] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
      />
    ) : null;

  return (
    <EnquiryModuleShell
      title="Sales Order"
      userMenu={<UserMenuServer />}
      bulkUpload={bulkUpload}
    >
      <div className="w-full">
        {resume && (
          <ResumedDraftNote updatedAt={resume.updatedAt} newRoute="/sales-orders/new" />
        )}
        <SoForm
          inquiries={inquiries}
          quotations={quotations}
          employees={employees}
          enableDrafts
          resumeDraftId={resume?.id}
          initialValues={resume?.payload as Partial<SoFormValues> | undefined}
        />
      </div>
    </EnquiryModuleShell>
  );
}
