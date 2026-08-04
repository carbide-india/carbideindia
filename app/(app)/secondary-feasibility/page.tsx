import { Layers } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import {
  listSecondaryFeasibilityQueue,
  type SecondaryFeasibilityQueueRow,
} from "@/lib/queries/feasibility";
import { SecondaryFeasibilityQueueTable } from "@/components/feasibility/secondary-feasibility-queue-table";

export const dynamic = "force-dynamic";

/**
 * The sidebar's status filters, mapped onto what a Secondary LINE carries. Same
 * five slots as the Primary queue; each is a filter, not a partition (a line can
 * be both "Not Started" and "Pending", exactly like the Primary sidebar).
 */
const SECONDARY_FILTERS = {
  not_started: {
    label: "Not Started",
    match: (r: SecondaryFeasibilityQueueRow) => !r.secondaryDone && !r.secVerdict,
  },
  need_info: {
    label: "Need Info",
    match: (r: SecondaryFeasibilityQueueRow) => r.secVerdict === "needs_info",
  },
  not_feasible: {
    label: "Not Feasible",
    match: (r: SecondaryFeasibilityQueueRow) => r.secVerdict === "not_feasible",
  },
  pending: {
    label: "Pending",
    match: (r: SecondaryFeasibilityQueueRow) => !r.secondaryDone,
  },
  done: {
    label: "Done",
    match: (r: SecondaryFeasibilityQueueRow) => r.secondaryDone,
  },
} as const;

type SecondaryFilter = keyof typeof SECONDARY_FILTERS;

const isFilter = (v: string | undefined): v is SecondaryFilter =>
  v != null && Object.hasOwn(SECONDARY_FILTERS, v);

/**
 * Secondary / Technical Feasibility queue — every product LINE whose parent
 * enquiry has cleared Primary Feasibility and therefore needs (or already has)
 * its detailed Secondary/Technical Feasibility done. Each row opens that line's
 * Secondary review. The sidebar filters the queue via `?status=pending|done`.
 */
export default async function SecondaryFeasibilityPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const all = await listSecondaryFeasibilityQueue();

  const sp = await searchParams;
  const activeStatus = isFilter(sp.status) ? sp.status : null;
  const rows = activeStatus ? all.filter(SECONDARY_FILTERS[activeStatus].match) : all;

  const done = all.filter((r) => r.secondaryDone).length;
  const pending = all.length - done;

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef2ff] text-[#3f3f94]">
          <Layers className="h-[22px] w-[22px]" strokeWidth={2.1} />
        </span>
        <div>
          <h1 className="text-[24px] font-black leading-none tracking-tight text-[#3f3f94]">
            Secondary Feasibility
            {activeStatus && (
              <span className="ml-2 text-[16px] font-bold text-ink-subtle">
                · {SECONDARY_FILTERS[activeStatus].label}
              </span>
            )}
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-subtle">
            {activeStatus && (
              <span className="font-semibold text-ink-soft">
                Showing {rows.length} of{" "}
              </span>
            )}
            {all.length} product line{all.length === 1 ? "" : "s"} past Primary · {pending} pending · {done} done.
          </p>
        </div>
      </header>

      <SecondaryFeasibilityQueueTable rows={rows} />
    </div>
  );
}
