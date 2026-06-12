import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { NegotiationForm } from "@/components/negotiations/negotiation-form";
import { requireUser } from "@/lib/auth/current";
import { listInquiryOptions } from "@/lib/queries/inquiries";
import { listQuotationOptions } from "@/lib/queries/quotes";
import { listEmployeeOptions } from "@/lib/queries/employees";

export const dynamic = "force-dynamic";

export default async function NewNegotiationPage() {
  await requireUser();
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
            Sales · Negotiation
          </div>
          <h1 className="text-display-lg text-ink-strong mt-1">New Negotiation</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            Track a price negotiation from an enquiry — pick the SM, optionally
            link a quotation to pull its pricing, then log the status.
          </p>
        </header>
        <NegotiationForm
          inquiries={inquiries}
          quotations={quotations}
          employees={employees}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
