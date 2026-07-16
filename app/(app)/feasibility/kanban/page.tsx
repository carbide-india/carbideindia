import { requireUser } from "@/lib/auth/current";
import { listFeasibilityQueue } from "@/lib/queries/feasibility";
import { FeasibilityKanban } from "@/components/feasibility/feasibility-kanban";

export const dynamic = "force-dynamic";

/**
 * Primary Feasibility Kanban — the review pipeline as a drag-and-drop board
 * across the five status columns.
 */
export default async function FeasibilityKanbanPage() {
  await requireUser();
  const rows = await listFeasibilityQueue();

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5">
        <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
          Feasibility Board
        </h1>
        <p className="mt-1.5 text-[14px] text-ink-subtle">
          Drag a review between columns to change its feasibility status.
        </p>
      </header>

      <FeasibilityKanban rows={rows} />
    </div>
  );
}
