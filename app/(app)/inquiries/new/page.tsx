import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { InquiryForm } from "@/components/inquiries/inquiry-form";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { listClientOptions } from "@/lib/queries/clients";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listMasterOptions } from "@/lib/queries/masters";
import { BulkUploadButton } from "@/components/import/bulk-upload-button";

export const dynamic = "force-dynamic";

export default async function NewInquiryPage() {
  const me = await requireUser();
  const currentEmployee = await getCurrentEmployee();
  const [clients, employees, grades, tolerances, conditions] =
    await Promise.all([
      listClientOptions(),
      listEmployeeOptions(),
      listMasterOptions("internal_grade"),
      listMasterOptions("tolerance"),
      listMasterOptions("condition"),
    ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[980px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Sales · Enquiry Register
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-display-lg text-ink-strong mt-1">New Enquiry</h1>
              <p className="text-body-lg text-ink-subtle mt-1">
                Capture the enquiry exactly as it came in — the SM number is
                assigned automatically on save.
              </p>
            </div>
            {currentEmployee?.isAdmin && (
              <BulkUploadButton href="/inquiries/import" />
            )}
          </div>
        </header>
        <InquiryForm
          clients={clients}
          employees={employees}
          grades={grades}
          tolerances={tolerances}
          conditions={conditions}
          defaultSalesPersonId={me.id}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
