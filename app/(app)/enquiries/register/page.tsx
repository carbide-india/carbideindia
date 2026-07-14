import Link from "next/link";
import type { Route } from "next";
import { Plus } from "lucide-react";
import { InquiryTable } from "@/components/inquiries/inquiry-table";
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
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
          Enquiry Register
        </h1>
        <Link
          href={"/enquiries/new" as Route}
          className="inline-flex items-center gap-2 rounded-chip px-6 py-3 text-white transition-transform hover:-translate-y-px"
          style={{
            background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
            boxShadow: "0 6px 16px rgba(63,63,148,0.32)",
            fontWeight: 800,
          }}
        >
          <Plus size={16} strokeWidth={2.4} />
          New Enquiry
        </Link>
      </header>

      <InquiryTable rows={rows} employees={employees} />
    </div>
  );
}
