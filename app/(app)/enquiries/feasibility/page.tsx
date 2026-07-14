import { ClipboardCheck, Clock, Loader2, CheckCircle2, ArrowRightCircle } from "lucide-react";
import { InquiryTable } from "@/components/inquiries/inquiry-table";
import { requireUser } from "@/lib/auth/current";
import { listInquiries } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";

export const dynamic = "force-dynamic";

/**
 * Primary Feasibility queue — the enquiry set focused on the feasibility stage,
 * fronted by a pipeline KPI strip. Each row deep-links to its dedicated
 * feasibility page.
 */
export default async function PrimaryFeasibilityPage() {
  await requireUser();

  const [rows, employees] = await Promise.all([
    listInquiries({}),
    listEmployeeOptions(),
  ]);

  const n = (...s: string[]) =>
    rows.filter((r) => s.includes(r.feasibilityStatus)).length;
  const total = rows.length;
  const awaiting = n("not_started");
  const inProgress = n("initiated", "need_info", "need_help");
  const done = n("primary_feasibility_done");
  const ready = n("proceed_to_costing");
  const pct = total ? Math.round(((done + ready) / total) * 100) : 0;

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

      {/* Pipeline KPI strip. */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-white"
          style={{
            background: "linear-gradient(135deg,#4a4ab5 0%,#2f2f6f 100%)",
            boxShadow: "0 10px 26px -10px rgba(63,63,148,0.55)",
          }}
        >
          <ClipboardCheck className="absolute -right-3 -top-3 h-20 w-20 opacity-15" strokeWidth={1.5} />
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-85">
            Total Enquiries
          </div>
          <div className="mt-1 font-mono text-[34px] font-black leading-none tabular-nums">
            {total}
          </div>
          <div className="mt-3 text-[11px] font-semibold opacity-85">
            {pct}% cleared for costing
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white/90" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <StatCard label="Awaiting Check" value={awaiting} accent="#64748b" Icon={Clock} />
        <StatCard label="In Progress" value={inProgress} accent="#f59e0b" Icon={Loader2} />
        <StatCard label="Feasibility Done" value={done} accent="#8b5cf6" Icon={CheckCircle2} />
        <StatCard label="Ready to Cost" value={ready} accent="#16a34a" Icon={ArrowRightCircle} />
      </div>

      <InquiryTable rows={rows} employees={employees} variant="feasibility" />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  Icon,
}: {
  label: string;
  value: number;
  accent: string;
  Icon: typeof Clock;
}) {
  return (
    <div
      className="group flex items-center gap-3.5 rounded-2xl border border-hairline bg-surface-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-10px_rgba(15,23,42,0.25)]"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-110"
        style={{ background: `${accent}1a`, color: accent }}
      >
        <Icon className="h-[22px] w-[22px]" strokeWidth={2.1} />
      </span>
      <div className="min-w-0">
        <div className="font-mono text-[26px] font-black leading-none tabular-nums text-ink-strong">
          {value}
        </div>
        <div className="mt-1 truncate text-[12px] font-semibold text-ink-subtle">{label}</div>
      </div>
    </div>
  );
}
