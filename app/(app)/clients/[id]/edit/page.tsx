import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current";
import { listMasterOptions } from "@/lib/queries/masters";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getClientForEdit } from "@/lib/queries/clients";
import { getClientDocuments } from "@/lib/queries/client-documents";
import { listCustomOptionsMap } from "@/lib/queries/custom-lists";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { KycForm } from "@/components/clients/kyc-form";
import { BackLink } from "@/components/ui/back-link";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditClientPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  const [client, customerTypes, industryTypes, productTypes, departments, employees, documents, kycLists] =
    await Promise.all([
      getClientForEdit(id),
      listMasterOptions("customer_type"),
      listMasterOptions("industry_type"),
      listMasterOptions("product_type"),
      listMasterOptions("department"),
      listEmployeeOptions(),
      getClientDocuments(id),
      listCustomOptionsMap("kyc"),
    ]);

  if (!client) notFound();

  // clientCode is now returned by getClientForEdit (read-only display only).
  const clientCode = client.clientCode;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[980px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <div className="mb-4">
            <BackLink href="/clients" label="Client Master" />
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Client Master &middot; Edit
          </div>
          <h1 className="text-display-lg text-ink-strong mt-1">{client.name}</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            Edit every detail of this client — company, contact, meeting and
            business cards. Option lists are managed in Admin &#8594; Masters.
          </p>
        </header>
        <KycForm
          customerTypes={customerTypes}
          industryTypes={industryTypes}
          productTypes={productTypes}
          departments={departments}
          employees={employees}
          editClientId={id}
          initialValues={client}
          clientCode={clientCode}
          documents={documents}
          paymentTermsOptions={kycLists["payment_terms"]}
          freightOptions={kycLists["freight_charges"]}
          creditDaysOptions={kycLists["credit_days"]}
          creditLimitOptions={kycLists["credit_limit"]}
          qtyDeviationOptions={kycLists["qty_deviation"]}
          transporterOptions={kycLists["transporter"]}
          bankOptions={kycLists["bank_name"]}
          accountTypeOptions={kycLists["account_type"]}
          stateOptions={kycLists["state"]}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
