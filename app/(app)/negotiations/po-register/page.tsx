import { requireUser } from "@/lib/auth/current";
import { listCustomerPoRegister } from "@/lib/queries/proforma-invoices";
import { RegisterHeading } from "@/components/registers/register-heading";
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
        <CustomerPoRegisterTable
          rows={rows}
          heading={
            <RegisterHeading
              title="Customer PO Register"
              count={rows.length}
              unit="customer PO"
            />
          }
        />
      </div>
    </EnquiryModuleShell>
  );
}
