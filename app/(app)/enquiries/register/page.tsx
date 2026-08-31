import Link from "next/link";
import type { Route } from "next";
import { Plus } from "lucide-react";
import { InquiryTable } from "@/components/inquiries/inquiry-table";
import { RegisterHeading } from "@/components/registers/register-heading";
import { requireUser } from "@/lib/auth/current";
import { listInquiries } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";

export const dynamic = "force-dynamic";

/**
 * Enquiry Register - the SM-number register, now rendered inside the Enquiries
 * module shell (sidebar + header) rather than the standalone WMS layout. The
 * advanced table owns search / filtering / sorting client-side, so the page
 * just loads the full register set and the employee options for the filters.
 */
export default async function EnquiryRegisterPage() {
  await requireUser();

  const [rows, employees] = await Promise.all([
    listInquiries({}),
    listEmployeeOptions(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <InquiryTable
        rows={rows}
        employees={employees}
        heading={
          <RegisterHeading title="Enquiry Register" count={rows.length} unit="enquiry" />
        }
        actions={
          <Link
            href={"/enquiries/new" as Route}
            className="inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-[13px] font-extrabold text-white transition-transform hover:-translate-y-px"
            style={{
              background: "#454595",
              boxShadow: "0 4px 12px rgba(63,63,148,0.30)",
            }}
          >
            <Plus size={15} strokeWidth={2.4} />
            New Enquiry
          </Link>
        }
      />
    </div>
  );
}
