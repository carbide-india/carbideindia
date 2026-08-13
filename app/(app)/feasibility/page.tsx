import { requireAdmin } from "@/lib/auth/current";
import { listFeasibilityQueue, type FeasibilityQueueItem } from "@/lib/queries/feasibility";
import { FeasibilityQueueTable } from "@/components/feasibility/feasibility-queue-table";
import { BucketStrip, type BucketTile } from "@/components/feasibility/bucket-strip";
import {
  FEASIBILITY_STAGE_BUCKETS,
  FEASIBILITY_STATUS_COLORS,
  FEASIBILITY_STATUS_LABELS,
} from "@/db/enums";
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
  await requireAdmin();
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

  const href = (qs: string) => (qs ? `/feasibility?${qs}` : "/feasibility");

  const tiles: BucketTile[] = [
    {
      key: "all",
      group: "all",
      label: "All Enquiries",
      tone: "slate",
      count: all.length,
      href: href(""),
      active: !activeBucket && !varianceOnly,
      sub: "live, not archived",
      hint: "Every live (non-archived) enquiry — a fresh enquiry starts at Not Started.",
    },
    ...FEASIBILITY_STAGE_BUCKETS.map<BucketTile>((b) => ({
      key: b,
      label: FEASIBILITY_STATUS_LABELS[b],
      tone: FEASIBILITY_STATUS_COLORS[b],
      count: countIn(b),
      href: href(`status=${b}`),
      active: activeBucket === b,
      hint: `Enquiries whose Primary Feasibility status is ${FEASIBILITY_STATUS_LABELS[b]}.`,
    })),
  ];

  // Legacy tile — only rendered when rows actually sit on a deprecated status
  // that has no house bucket, so the strip still sums to the total.
  const legacyCount = countIn(LEGACY_BUCKET);
  if (legacyCount > 0) {
    tiles.push({
      key: LEGACY_BUCKET,
      label: "Legacy Status",
      tone: "stone",
      count: legacyCount,
      href: href(`status=${LEGACY_BUCKET}`),
      active: activeBucket === LEGACY_BUCKET,
      sub: "no house bucket",
      hint: "Rows still on Need Help / Primary Feasibility Done — set a house status on them.",
    });
  }

  tiles.push({
    key: "variance",
    group: "flag",
    label: "Spec Variance",
    tone: "amber",
    count: varianceSms.length,
    href: href(`variance=${VARIANCE_PARAM}`),
    active: varianceOnly,
    sub: `${varianceLineTotal} of ${comparableLineTotal} line${comparableLineTotal === 1 ? "" : "s"}`,
    hint: "Enquiries with ≥1 product line whose spec differs from the frozen Primary baseline.",
  });

  const heading = varianceOnly
    ? "Spec Variance"
    : activeBucket
      ? (BUCKET_LABEL[activeBucket] ?? null)
      : null;

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5">
        <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
          Primary Feasibility
          {heading && <span className="ml-2 text-[16px] font-bold text-ink-subtle">· {heading}</span>}
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-subtle">
          {heading && (
            <span className="font-semibold text-ink-soft">Showing {rows.length} of </span>
          )}
          {all.length} enquir{all.length === 1 ? "y" : "ies"} in Primary Feasibility.
          {varianceOnly && comparableLineTotal === 0 && (
            <span className="ml-1 font-semibold text-ink-soft">
              No line has a frozen Primary baseline yet, so nothing is comparable.
            </span>
          )}
        </p>
      </header>

      <BucketStrip tiles={tiles} ariaLabel="Primary Feasibility buckets" />

      <FeasibilityQueueTable rows={rows} />
    </div>
  );
}
