import { Layers } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import {
  listSecondaryFeasibilityQueue,
  type SecondaryFeasibilityQueueRow,
} from "@/lib/queries/feasibility";
import { SecondaryFeasibilityQueueTable } from "@/components/feasibility/secondary-feasibility-queue-table";
import { BucketStrip, type BucketTile } from "@/components/feasibility/bucket-strip";
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

  const href = (qs: string) => (qs ? `/secondary-feasibility?${qs}` : "/secondary-feasibility");

  const tiles: BucketTile[] = [
    {
      key: "all",
      label: "All Lines",
      tone: "slate",
      count: all.length,
      href: href(""),
      active: !selected && !varianceOnly,
      sub: "past Primary",
      hint: "Every product line whose enquiry has started or cleared Primary Feasibility.",
    },
    ...SECONDARY_FEASIBILITY_STAGE_BUCKETS.map<BucketTile>((b) => ({
      key: b,
      label: SECONDARY_FEASIBILITY_STATUS_LABELS[b],
      tone: SECONDARY_FEASIBILITY_STATUS_COLORS[b],
      count: all.reduce((n, r) => (r.bucket === b ? n + 1 : n), 0),
      href: href(`status=${b}`),
      active: selected?.length === 1 && selected[0] === b,
      hint: `Product lines whose Secondary Feasibility is ${SECONDARY_FEASIBILITY_STATUS_LABELS[b]}.`,
    })),
    {
      key: "variance",
      label: "Spec Variance",
      tone: "amber",
      count: varianceLines.length,
      href: href(`variance=${VARIANCE_PARAM}`),
      active: varianceOnly,
      sub: `of ${comparableLines} comparable`,
      hint: "Lines whose current spec differs from the frozen Primary Feasibility baseline. Open the row's Variance button to see exactly what differed.",
    },
  ];

  const heading = varianceOnly
    ? "Spec Variance"
    : selected?.length === 1 && selected[0]
      ? SECONDARY_FEASIBILITY_STATUS_LABELS[selected[0]]
      : selected
        ? "Pending"
        : null;

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef2ff] text-[#3f3f94]">
          <Layers className="h-[22px] w-[22px]" strokeWidth={2.1} />
        </span>
        <div>
          <h1 className="text-[24px] font-black leading-none tracking-tight text-[#3f3f94]">
            Secondary Feasibility
            {heading && <span className="ml-2 text-[16px] font-bold text-ink-subtle">· {heading}</span>}
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-subtle">
            {heading && <span className="font-semibold text-ink-soft">Showing {rows.length} of </span>}
            {all.length} product line{all.length === 1 ? "" : "s"} whose enquiry has started or
            cleared Primary Feasibility.
            {varianceOnly && comparableLines === 0 && (
              <span className="ml-1 font-semibold text-ink-soft">
                No line has a frozen Primary baseline yet, so nothing is comparable.
              </span>
            )}
          </p>
        </div>
      </header>

      <BucketStrip tiles={tiles} ariaLabel="Secondary Feasibility buckets" />

      <SecondaryFeasibilityQueueTable rows={rows} />
    </div>
  );
}
