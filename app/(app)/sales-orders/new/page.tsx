import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { SoForm } from "@/components/sales-orders/so-form";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { listInquiryOptions } from "@/lib/queries/inquiries";
import { listQuotationOptions } from "@/lib/queries/quotes";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { BulkUploadButton } from "@/components/import/bulk-upload-button";

export const dynamic = "force-dynamic";

export default async function NewSalesOrderPage() {
  await requireUser();
  const me = await getCurrentEmployee();
  const [inquiries, quotations, employees] = await Promise.all([
    listInquiryOptions(),
    listQuotationOptions(),
    listEmployeeOptions(),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[980px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Sales · Sales Order
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-display-lg text-ink-strong mt-1">New Sales Order</h1>
              <p className="text-body-lg text-ink-subtle mt-1">
                Record the customer PO and SO documents against an enquiry — pick the
                SM, link the quotation to pull its pricing, then log the PO details.
              </p>
            </div>
            {me?.isAdmin && <BulkUploadButton href="/sales-orders/import" />}
          </div>
        </header>
        <SoForm
          inquiries={inquiries}
          quotations={quotations}
          employees={employees}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
