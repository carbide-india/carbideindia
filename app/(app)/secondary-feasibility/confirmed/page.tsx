import { CircleCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { listConfirmedFeasibility } from "@/lib/queries/feasibility";
import { FEASIBILITY_STATUS_LABELS } from "@/db/enums";
import { ConfirmedFeasibilityTable } from "@/components/feasibility/confirmed-feasibility-table";

export const dynamic = "force-dynamic";

/**
 * Confirmed Feasibility Register — every enquiry whose feasibility is confirmed
 * (feasibilityStatus = proceed_to_costing) and therefore ready for Costing.
 * It lives in the Secondary Feasibility module because marking a line's
 * Secondary / Technical Feasibility done IS what confirms it. Each row links
 * back to its feasibility review.
 */
export default async function ConfirmedFeasibilityPage() {
  await requireAdmin();
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
            {rows.length} enquir{rows.length === 1 ? "y" : "ies"} at{" "}
            {FEASIBILITY_STATUS_LABELS.proceed_to_costing} — ready for Costing.
          </p>
        </div>
      </header>

      <ConfirmedFeasibilityTable rows={rows} />
    </div>
  );
}
