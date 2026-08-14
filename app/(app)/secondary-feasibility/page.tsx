import { requireUser } from "@/lib/auth/current";
import {
  listSecondaryFeasibilityQueue,
  type SecondaryFeasibilityQueueRow,
} from "@/lib/queries/feasibility";
import { SecondaryFeasibilityQueueTable } from "@/components/feasibility/secondary-feasibility-queue-table";
import { RegisterHeading } from "@/components/registers/register-heading";
import {
  SECONDARY_FEASIBILITY_STAGE_BUCKETS,
  SECONDARY_FEASIBILITY_STATUS_COLORS,
  SECONDARY_FEASIBILITY_STATUS_LABELS,
} from "@/db/enums";
import { resolveSecondaryFilter } from "@/lib/feasibility/stage-buckets";

export const dynamic = "force-dynamic";

/** The `?variance=1` view: lines whose spec differs from the Primary baseline. */
const VARIANCE_PARAM = "1";

/**
 * Secondary / Technical Feasibility queue — every product LINE whose parent
 * enquiry has cleared Primary Feasibility, fronted by the SAME house bucket
 * strip as Primary (Not Started → Draft → Need Info → Pending Approval →
 * Secondary Feasibility Approved, plus Not Feasible). Secondary is a per-LINE
 * stage, so its counts are lines, not SMs — Primary counts enquiries.
 *
 * Every tile links back as `?status=<bucket>` (or `?variance=1`), and the
 * bucket tiles sum to the queue total because `bucket` is a total function over
 * every row (legacy `secondary_feasibility_done` stamps are folded in at read
 * time — migration 0072 added the column with no backfill).
 */
export default async function SecondaryFeasibilityPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; variance?: string }>;
}) {
  await requireUser();
  const all = await listSecondaryFeasibilityQueue();

  const sp = await searchParams;
  const varianceOnly = sp.variance === VARIANCE_PARAM;
  const selected = varianceOnly ? null : resolveSecondaryFilter(sp.status);

  const varianceLines = all.filter((r) => r.varianceCount > 0);
  const comparableLines = all.filter((r) => r.hasBaseline).length;

  const rows: SecondaryFeasibilityQueueRow[] = varianceOnly
    ? varianceLines
    : selected
      ? all.filter((r) => selected.includes(r.bucket))
      : all;

  const heading = varianceOnly
    ? "Spec Variance"
    : selected?.length === 1 && selected[0]
      ? SECONDARY_FEASIBILITY_STATUS_LABELS[selected[0]]
      : selected
        ? "Pending"
        : null;

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <SecondaryFeasibilityQueueTable
        rows={rows}
        heading={
          <RegisterHeading
            title="Secondary Feasibility"
            count={rows.length}
            unit="line"
            filterLabel={heading}
          />
        }
      />
      {varianceOnly && comparableLines === 0 && (
        <p className="mt-3 text-[13px] font-semibold text-ink-soft">
          No line has a frozen Primary baseline yet, so nothing is comparable.
        </p>
      )}
    </div>
  );
}
