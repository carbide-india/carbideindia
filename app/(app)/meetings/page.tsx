import Link from "next/link";
import type { Route } from "next";
import { Plus, Upload } from "lucide-react";
import { MeetingTable } from "@/components/meetings/meeting-table";
import { requireUser } from "@/lib/auth/current";
import { listClientMeetings } from "@/lib/queries/client-meetings";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { RegisterHeading } from "@/components/registers/register-heading";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const me = await requireUser();

  // The advanced table owns search / filtering / sorting client-side, so the
  // page just loads the full register set plus the sales-person options.
  const [rows, employees] = await Promise.all([
    listClientMeetings({}),
    listEmployeeOptions(),
  ]);

  // Admins get a Bulk Upload entry in the sidebar (meeting import).
  const bulkUpload = me?.isAdmin ? (
    <Link
      href={"/meetings/import" as Route}
      className="flex h-[44px] w-full items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#3a4152] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
    >
      <Upload className="h-[19px] w-[19px]" />
      Bulk Upload
    </Link>
  ) : null;

  return (
    <EnquiryModuleShell
      title="Meeting Register"
      userMenu={<UserMenuServer />}
      bulkUpload={bulkUpload}
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <MeetingTable
          rows={rows}
          employees={employees}
          heading={
            <RegisterHeading title="Meeting Register" count={rows.length} unit="meeting" />
          }
          actions={
            <Link
              href={"/meetings/new" as Route}
              className="inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-[13px] font-extrabold text-white transition-transform hover:-translate-y-px"
              style={{
                background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
                boxShadow: "0 4px 12px rgba(63,63,148,0.30)",
              }}
            >
              <Plus size={15} strokeWidth={2.4} />
              New Meeting
            </Link>
          }
        />
      </div>
    </EnquiryModuleShell>
  );
}
