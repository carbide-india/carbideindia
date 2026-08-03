import { Layers } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { listSecondaryFeasibilityQueue } from "@/lib/queries/feasibility";
import { SecondaryFeasibilityQueueTable } from "@/components/feasibility/secondary-feasibility-queue-table";

export const dynamic = "force-dynamic";

/**
 * Secondary / Technical Feasibility queue — every product LINE whose parent
 * enquiry has cleared Primary Feasibility and therefore needs (or already has)
 * its detailed Secondary/Technical Feasibility done. Each row links back to its
 * enquiry's feasibility review, where the Secondary section lives.
 */
export default async function SecondaryFeasibilityPage() {
  await requireUser();
  const rows = await listSecondaryFeasibilityQueue();

  const done = rows.filter((r) => r.secondaryDone).length;
  const pending = rows.length - done;

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef2ff] text-[#3f3f94]">
          <Layers className="h-[22px] w-[22px]" strokeWidth={2.1} />
        </span>
        <div>
          <h1 className="text-[24px] font-black leading-none tracking-tight text-[#3f3f94]">
            Secondary Feasibility
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-subtle">
            {rows.length} product line{rows.length === 1 ? "" : "s"} past Primary · {pending} pending · {done} done.
          </p>
        </div>
      </header>

      <SecondaryFeasibilityQueueTable rows={rows} />
    </div>
  );
}
