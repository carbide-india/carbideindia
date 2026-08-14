import { MeetingForm } from "@/components/meetings/meeting-form";
import type { MeetingFormValues } from "@/components/meetings/meeting-form";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listClientOptions } from "@/lib/queries/clients";
import { listMasterOptions } from "@/lib/queries/masters";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { meetingImportSpec } from "@/lib/import/specs/meeting";
import { commitMeetingImport } from "@/app/(app)/meetings/import/actions";
import { BulkImportModal } from "@/components/import/bulk-import-modal";
import { resolveDraftToResume } from "@/lib/queries/form-drafts";
import { ResumedDraftNote } from "@/components/drafts/resumed-draft-note";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ draft?: string; fresh?: string }>;
}

export default async function NewMeetingPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const currentEmployee = await getCurrentEmployee();
  const sp = await searchParams;
  const resume = await resolveDraftToResume(
    "meeting",
    typeof sp.draft === "string" ? sp.draft : undefined,
    sp.fresh === "1",
  );
  const [employees, clients, customerTypes] = await Promise.all([
    listEmployeeOptions(),
    listClientOptions(),
    listMasterOptions("customer_type"),
  ]);

  const importLookups = currentEmployee?.isAdmin
    ? await loadLookups(specRefKinds(meetingImportSpec.fields))
    : null;

  // Admins get a Bulk Upload entry in the sidebar (opens the meeting import modal).
  const bulkUpload =
    currentEmployee?.isAdmin && importLookups ? (
      <BulkImportModal
        spec={meetingImportSpec}
        lookups={importLookups}
        commit={commitMeetingImport}
        isAdmin
        triggerClassName="flex h-[44px] w-full items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#3a4152] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
      />
    ) : null;

  return (
    <EnquiryModuleShell
      title="Client Meeting"
      userMenu={<UserMenuServer />}
      bulkUpload={bulkUpload}
    >
      <div className="w-full">
        {resume && <ResumedDraftNote updatedAt={resume.updatedAt} newRoute="/meetings/new" />}
        <MeetingForm
          defaultSalesPersonId={me.id}
          defaultSalesName={me.name}
          defaultSalesEmail={me.email}
          employees={employees}
          clients={clients}
          customerTypes={customerTypes}
          enableDrafts
          resumeDraftId={resume?.id}
          initialValues={resume?.payload as Partial<MeetingFormValues> | undefined}
        />
      </div>
    </EnquiryModuleShell>
  );
}
