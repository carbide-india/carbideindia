import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { QuotationForm } from "@/components/quotations/quotation-form";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { listInquiryOptions } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { BulkUploadButton } from "@/components/import/bulk-upload-button";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  await requireUser();
  const me = await getCurrentEmployee();
  const [inquiries, employees] = await Promise.all([
    listInquiryOptions(),
    listEmployeeOptions(),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[980px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Sales · Quote Master
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-display-lg text-ink-strong mt-1">New Quotation</h1>
              <p className="text-body-lg text-ink-subtle mt-1">
                Build a quote from an enquiry — pick the SM, then price it, set the
                timeline and validity.
              </p>
            </div>
            {me?.isAdmin && <BulkUploadButton href="/quotations/import" />}
          </div>
        </header>
        <QuotationForm inquiries={inquiries} employees={employees} />
      </main>
      <DashboardFooter />
    </>
  );
}
