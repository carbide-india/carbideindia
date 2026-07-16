import { ClipboardCheck, Loader2, Clock3, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { listFeasibilityQueue } from "@/lib/queries/feasibility";
import { FeasibilityQueueTable } from "@/components/feasibility/feasibility-queue-table";

export const dynamic = "force-dynamic";

/**
 * Primary Feasibility dashboard — the review queue fronted by a pipeline KPI
 * strip. Each row opens its DFM review workspace.
 */
export default async function FeasibilityDashboardPage() {
  await requireUser();
  const rows = await listFeasibilityQueue();

  const n = (...s: string[]) => rows.filter((r) => s.includes(r.status)).length;
  const total = rows.length;
  const inReview = n("in_review");
  const pending = n("pending_approval");
  const approved = n("proceed_to_costing");
  const notFeasible = n("not_feasible");
  const blocked = rows.filter((r) => r.blockerCount > 0).length;
  const pct = total ? Math.round((approved / total) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5">
        <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">Primary Feasibility</h1>
        <p className="mt-1.5 text-[14px] text-ink-subtle">
          Technical DFM review &amp; sign-off — verify each enquiry can be manufactured before it is costed.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-white"
          style={{ background: "linear-gradient(135deg,#4a4ab5 0%,#2f2f6f 100%)", boxShadow: "0 10px 26px -10px rgba(63,63,148,0.55)" }}
        >
          <ClipboardCheck className="absolute -right-3 -top-3 h-20 w-20 opacity-15" strokeWidth={1.5} />
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-85">Total Reviews</div>
          <div className="mt-1 font-mono text-[34px] font-black leading-none tabular-nums">{total}</div>
          <div className="mt-3 text-[11px] font-semibold opacity-85">{pct}% approved for costing</div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white/90" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <StatCard label="In Review" value={inReview} accent="#2563eb" Icon={Loader2} />
        <StatCard label="Pending Approval" value={pending} accent="#7c3aed" Icon={Clock3} />
        <StatCard label="Approved · Costing" value={approved} accent="#16a34a" Icon={CheckCircle2} />
        <StatCard label="Not Feasible" value={notFeasible} accent="#dc2626" Icon={XCircle} />
        <StatCard label="Blocked" value={blocked} accent="#dc2626" Icon={ShieldAlert} />
      </div>

      <FeasibilityQueueTable rows={rows} />
    </div>
  );
}

function StatCard({ label, value, accent, Icon }: { label: string; value: number; accent: string; Icon: typeof Clock3 }) {
  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-10px_rgba(15,23,42,0.25)]" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-110" style={{ background: `${accent}1a`, color: accent }}>
        <Icon className="h-[20px] w-[20px]" strokeWidth={2.1} />
      </span>
      <div className="min-w-0">
        <div className="font-mono text-[24px] font-black leading-none tabular-nums text-ink-strong">{value}</div>
        <div className="mt-1 truncate text-[12px] font-semibold text-ink-subtle">{label}</div>
      </div>
    </div>
  );
}
