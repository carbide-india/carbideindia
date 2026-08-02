import { CircleCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { listConfirmedFeasibility } from "@/lib/queries/feasibility";
import { ConfirmedFeasibilityTable } from "@/components/feasibility/confirmed-feasibility-table";

export const dynamic = "force-dynamic";

/**
 * Confirmed Feasibility Register — every enquiry whose Primary Feasibility is
 * confirmed (feasibilityStatus = proceed_to_costing) and therefore ready for
 * Costing. Each row links back to its feasibility review.
 */
export default async function ConfirmedFeasibilityPage() {
  await requireUser();
  const rows = await listConfirmedFeasibility();

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f6ee] text-[#16a34a]">
          <CircleCheck className="h-[22px] w-[22px]" strokeWidth={2.1} />
        </span>
        <div>
          <h1 className="text-[24px] font-black leading-none tracking-tight text-[#3f3f94]">
            Confirmed Feasibility Register
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-subtle">
            {rows.length} enquir{rows.length === 1 ? "y" : "ies"} with Feasibility Confirmed — ready for Costing.
          </p>
        </div>
      </header>

      <ConfirmedFeasibilityTable rows={rows} />
    </div>
  );
}
