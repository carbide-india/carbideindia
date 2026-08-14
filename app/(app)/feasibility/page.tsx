import { requireUser } from "@/lib/auth/current";
import { listFeasibilityQueue, type FeasibilityQueueItem } from "@/lib/queries/feasibility";
import { FeasibilityQueueTable } from "@/components/feasibility/feasibility-queue-table";
import { RegisterHeading } from "@/components/registers/register-heading";
import { FEASIBILITY_STAGE_BUCKETS, FEASIBILITY_STATUS_LABELS } from "@/db/enums";
import { LEGACY_BUCKET, feasibilityBucketOf } from "@/lib/feasibility/stage-buckets";

export const dynamic = "force-dynamic";

/** The `?variance=1` view: SMs with at least one line off its Primary baseline. */
const VARIANCE_PARAM = "1";

/**
 * Primary Feasibility dashboard — the review queue fronted by the house bucket
 * strip (Not Started → Draft → Need Info → Pending Approval → Feasibility
 * Approved, plus Not Feasible, which only feasibility may use). Secondary
 * Feasibility renders the identical strip off its own bucket array.
 *
 * Every tile links back into this page as `?status=<bucket>` (or `?variance=1`)
 * so a number is always clickable through to the rows behind it. The tiles sum
 * to the queue total: rows on a deprecated status are folded onto the bucket
 * that superseded them, and the two with no agreed home (`need_help`,
 * `primary_feasibility_done`) land in a Legacy tile that only appears when it
 * is non-empty — nothing is silently dropped from a count.
 */
export default async function FeasibilityDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; variance?: string }>;
}) {
  await requireUser();
  const all = await listFeasibilityQueue();

  const sp = await searchParams;
  const varianceOnly = sp.variance === VARIANCE_PARAM;

  // Bucket every row exactly once, so the strip's counts add up to `all.length`.
  const bucketOf = new Map<string, string>(all.map((r) => [r.id, feasibilityBucketOf(r.status)]));
  const countIn = (bucket: string) =>
    all.reduce((n, r) => (bucketOf.get(r.id) === bucket ? n + 1 : n), 0);

  // Bucket id → tile heading. The Legacy pseudo-bucket is named here because it
  // has no enum label of its own.
  const BUCKET_LABEL: Record<string, string> = {
    ...Object.fromEntries(FEASIBILITY_STAGE_BUCKETS.map((b) => [b, FEASIBILITY_STATUS_LABELS[b]])),
    [LEGACY_BUCKET]: "Legacy Status",
  };
  // `Object.hasOwn`, not `in` — an inherited key ("toString") must not pass as
  // a bucket and silently empty the queue.
  const activeBucket =
    !varianceOnly && sp.status != null && Object.hasOwn(BUCKET_LABEL, sp.status)
      ? sp.status
      : null;

  const varianceSms = all.filter((r) => r.varianceLines > 0);
  const varianceLineTotal = all.reduce((n, r) => n + r.varianceLines, 0);
  const comparableLineTotal = all.reduce((n, r) => n + r.comparableLines, 0);

  const rows: FeasibilityQueueItem[] = varianceOnly
    ? varianceSms
    : activeBucket
      ? all.filter((r) => bucketOf.get(r.id) === activeBucket)
      : all;

  const heading = varianceOnly
    ? "Spec Variance"
    : activeBucket
      ? (BUCKET_LABEL[activeBucket] ?? null)
      : null;

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      {/* The name + count ride INSIDE the toolbar row (see RegisterHeading) —
          the stacked header they used to sit in cost ~70px of the fold before
          a single record was visible. */}
      <FeasibilityQueueTable
        rows={rows}
        heading={
          <RegisterHeading
            title="Primary Feasibility"
            count={rows.length}
            unit="enquiry"
            filterLabel={heading}
          />
        }
      />
      {varianceOnly && comparableLineTotal === 0 && (
        <p className="mt-3 text-[13px] font-semibold text-ink-soft">
          No line has a frozen Primary baseline yet, so nothing is comparable.
        </p>
      )}
    </div>
  );
}
