import { InquiryTable } from "@/components/inquiries/inquiry-table";
import { requireUser } from "@/lib/auth/current";
import { listInquiries } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";

export const dynamic = "force-dynamic";

/**
 * Primary Feasibility queue — the same enquiry set, focused on the feasibility
 * stage. Each row deep-links to its SM workspace Feasibility tab so the user
 * runs the shape / grade / tolerance / condition / quantity check here, kept
 * separate from the plain Enquiry Register.
 */
export default async function PrimaryFeasibilityPage() {
  await requireUser();

  const [rows, employees] = await Promise.all([
    listInquiries({}),
    listEmployeeOptions(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5">
        <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
          Primary Feasibility
        </h1>
        <p className="mt-1.5 text-[14px] text-ink-subtle">
          Pick an enquiry to verify shape, grade, tolerance, condition &amp; quantity before costing.
        </p>
      </header>

      <InquiryTable rows={rows} employees={employees} variant="feasibility" />
    </div>
  );
}
