import Link from "next/link";
import { Plus } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { MeetingTable } from "@/components/meetings/meeting-table";
import { requireUser } from "@/lib/auth/current";
import { listClientMeetings } from "@/lib/queries/client-meetings";
import { listEmployeeOptions } from "@/lib/queries/employees";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  await requireUser();

  // The advanced table owns search / filtering / sorting client-side, so the
  // page just loads the full register set plus the sales-person options.
  const [rows, employees] = await Promise.all([
    listClientMeetings({}),
    listEmployeeOptions(),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-10 pb-20">
        <header className="mb-8 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
              Sales · Daily Meetings
            </div>
            <h1
              className="mt-1 text-ink-strong"
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: 44,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              Client Meetings
            </h1>
            <p className="text-body-lg text-ink-subtle mt-2 tabular-nums">
              {rows.length} {rows.length === 1 ? "meeting" : "meetings"} —
              daily client-visit log with sales, contact and outcome details.
            </p>
          </div>
          <Link
            href="/meetings/new"
            className="inline-flex items-center gap-2 text-cta text-white px-6 py-3 rounded-chip transition-transform hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
              boxShadow: "0 6px 16px rgba(63, 63, 148, 0.32)",
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Meeting
          </Link>
        </header>
        <MeetingTable rows={rows} employees={employees} />
      </main>
      <DashboardFooter />
    </>
  );
}
