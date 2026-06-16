import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { KycForm } from "@/components/clients/kyc-form";
import { requireUser, getCurrentEmployee } from "@/lib/auth/current";
import { listMasterOptions } from "@/lib/queries/masters";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { BulkUploadButton } from "@/components/import/bulk-upload-button";

export const dynamic = "force-dynamic";

export default async function NewClientKycPage() {
  await requireUser();
  const me = await getCurrentEmployee();
  const [customerTypes, industryTypes, productTypes, employees] =
    await Promise.all([
      listMasterOptions("customer_type"),
      listMasterOptions("industry_type"),
      listMasterOptions("product_type"),
      listEmployeeOptions(),
    ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[980px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Sales · Client KYC
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-display-lg text-ink-strong mt-1">Client KYC</h1>
              <p className="text-body-lg text-ink-subtle mt-1">
                Onboard a client — option lists are managed in Admin → Masters.
              </p>
            </div>
            {me?.isAdmin && <BulkUploadButton href="/clients/import" />}
          </div>
        </header>
        <KycForm
          customerTypes={customerTypes}
          industryTypes={industryTypes}
          productTypes={productTypes}
          employees={employees}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
