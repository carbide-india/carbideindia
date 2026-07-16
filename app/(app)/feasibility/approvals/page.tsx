import { BadgeCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { listFeasibilityReviews } from "@/lib/queries/feasibility";
import { FeasibilityQueueTable } from "@/components/feasibility/feasibility-queue-table";

export const dynamic = "force-dynamic";

/**
 * Approvals inbox — reviews an engineer has submitted, awaiting an admin's
 * sign-off (approve → proceed to costing, or reject → not feasible).
 */
export default async function FeasibilityApprovalsPage() {
  await requireUser();
  const rows = (await listFeasibilityReviews()).filter((r) => r.status === "pending_approval");

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#efeffb] text-[#3f3f94]">
          <BadgeCheck className="h-[22px] w-[22px]" strokeWidth={2.1} />
        </span>
        <div>
          <h1 className="text-[24px] font-black leading-none tracking-tight text-[#3f3f94]">Approvals</h1>
          <p className="mt-1.5 text-[13px] text-ink-subtle">
            {rows.length} review{rows.length === 1 ? "" : "s"} awaiting sign-off. Open one to approve or reject.
          </p>
        </div>
      </header>

      <FeasibilityQueueTable rows={rows} />
    </div>
  );
}
