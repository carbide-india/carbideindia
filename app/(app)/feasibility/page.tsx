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
  const notStarted = n("not_started");
  const inReview = n("in_review");
  const needInfo = n("need_info");
  const approved = n("proceed_to_costing");
  const notFeasible = n("not_feasible");
  const pct = total ? Math.round((approved / total) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5">
        <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">Primary Feasibility</h1>
        <p className="mt-1.5 text-[14px] text-ink-subtle">
          Technical DFM review &amp; sign-off — verify each enquiry can be manufactured before it is costed.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-3 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatMini label="Total Reviews" value={total} accent="#3f3f94" sub={`${pct}% cleared`} />
        <StatMini label="Not Started" value={notStarted} accent="#64748b" />
        <StatMini label="In Review" value={inReview} accent="#2563eb" />
        <StatMini label="Need Info" value={needInfo} accent="#d97706" />
        <StatMini label="Approved · Costing" value={approved} accent="#16a34a" />
        <StatMini label="Not Feasible" value={notFeasible} accent="#dc2626" />
      </div>

      <FeasibilityQueueTable rows={rows} />
    </div>
  );
}

/** A small, text-fitted KPI box: accent number + label (+ optional sub-line). */
function StatMini({ label, value, accent, sub }: { label: string; value: number; accent: string; sub?: string }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface-card px-3 py-2"
      style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
    >
      <span className="font-mono text-[21px] font-black leading-none tabular-nums" style={{ color: accent }}>
        {value}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[11px] font-bold uppercase tracking-[0.03em] text-ink-strong">{label}</div>
        {sub && <div className="text-[10px] font-semibold text-ink-subtle">{sub}</div>}
      </div>
    </div>
  );
}
