import { requireUser } from "@/lib/auth/current";
import { listCustomerPoRegister } from "@/lib/queries/proforma-invoices";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { CustomerPoRegisterTable } from "@/components/negotiations/customer-po-register-table";

export const dynamic = "force-dynamic";

/**
 * Customer PO Register — a central view of every incoming customer purchase
 * order, linked to its SM number and the proforma invoice(s) issued for the
 * negotiation. Rendered inside the shared Enquiries module shell; on
 * /negotiations routes the shell's sidebar reads as the Negotiation family and
 * surfaces this register in its records group.
 */
export default async function CustomerPoRegisterPage() {
  await requireUser();

  const rows = await listCustomerPoRegister();

  return (
    <EnquiryModuleShell
      title="Customer PO Register"
      userMenu={<UserMenuServer />}
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Customer PO Register
            </h1>
            <p className="mt-1.5 text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
              {rows.length} {rows.length === 1 ? "customer PO" : "customer POs"}
            </p>
          </div>
        </header>

        <CustomerPoRegisterTable rows={rows} />
      </div>
    </EnquiryModuleShell>
  );
}
