import { BadgeCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { listFeasibilityQueue } from "@/lib/queries/feasibility";
import { FeasibilityQueueTable } from "@/components/feasibility/feasibility-queue-table";

export const dynamic = "force-dynamic";

/**
 * Approvals inbox — enquiries awaiting a feasibility decision (in review or
 * submitted for sign-off). Open one to set its status (proceed to costing,
 * need info, or not feasible).
 */
export default async function FeasibilityApprovalsPage() {
  await requireUser();
  const rows = (await listFeasibilityQueue()).filter(
    (r) => r.status === "pending_approval" || r.status === "in_review",
  );

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#efeffb] text-[#3f3f94]">
          <BadgeCheck className="h-[22px] w-[22px]" strokeWidth={2.1} />
        </span>
        <div>
          <h1 className="text-[24px] font-black leading-none tracking-tight text-[#3f3f94]">
            Approvals — awaiting a feasibility decision
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-subtle">
            {rows.length} enquir{rows.length === 1 ? "y" : "ies"} awaiting a decision. Open one to set its status.
          </p>
        </div>
      </header>

      <FeasibilityQueueTable rows={rows} />
    </div>
  );
}
