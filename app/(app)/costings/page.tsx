import Link from "next/link";
import type { Route } from "next";
import { Plus } from "lucide-react";
import { CostingTable } from "@/components/costings/costing-table";
import { requireUser } from "@/lib/auth/current";
import { listCostingRegister } from "@/lib/queries/costings";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { BucketStrip, type BucketTile } from "@/components/feasibility/bucket-strip";
import { CostingSidebarBuckets } from "@/components/costings/costing-sidebar-buckets";
import {
  COSTING_DONE_STATUS_COLORS,
  COSTING_DONE_STATUS_LABELS,
  COSTING_STAGE_BUCKETS,
} from "@/db/enums";
import { parseCostingBucket } from "@/lib/costing/buckets";

export const dynamic = "force-dynamic";

/** `?overdue=1` — the cross-bucket view of everything past its target date. */
const OVERDUE_PARAM = "1";

/**
 * Costing Register — the "what is LEFT" dashboard, not a list of cost sheets.
 *
 * Manan's headline complaint at the 2026-08 review was that this page could only
 * ever show work that had already been done: "20 costings show up, I costed 3 —
 * 17 costings are NOT DONE. I need to see the Not Done." So the register's unit
 * is the PRODUCT LINE. Every line whose feasibility is confirmed (the gate the
 * save actions actually enforce) is a row here whether or not anyone has costed
 * it, and a line with no cost sheet sits in the Not Started bucket.
 *
 * The bucket strip is the house one (Not Started → Draft → Need Info → Pending
 * Approval → Costing Approved), rendered by the same shared component the two
 * feasibility stages use, with tones taken from COSTING_DONE_STATUS_COLORS —
 * never a hardcoded colour. Every tile links back as `?bucket=…` so a number is
 * always clickable through to the rows behind it, and the bucket tiles sum
 * exactly to the register total (legacy In Process / Done rows fold onto the
 * bucket that superseded them, so nothing is silently dropped).
 */
export default async function CostingsPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string; overdue?: string }>;
}) {
  await requireUser();
  const all = await listCostingRegister();

  const sp = await searchParams;
  const overdueOnly = sp.overdue === OVERDUE_PARAM;
  const activeBucket = overdueOnly ? null : parseCostingBucket(sp.bucket);

  const countIn = (bucket: string) =>
    all.reduce((n, r) => (r.bucket === bucket ? n + 1 : n), 0);

  const overdueRows = all.filter((r) => r.overdue);
  const rows = overdueOnly
    ? overdueRows
    : activeBucket
      ? all.filter((r) => r.bucket === activeBucket)
      : all;

  // Not Started splits two ways and the difference matters to him: lines with no
  // cost sheet at ALL (the 17) versus sheets explicitly parked back at not-done.
  const noSheet = all.reduce((n, r) => (r.costingId == null ? n + 1 : n), 0);

  const href = (qs: string) => (qs ? `/costings?${qs}` : "/costings");

  const tiles: BucketTile[] = [
    {
      key: "all",
      label: "Costable Lines",
      tone: "slate",
      count: all.length,
      href: href(""),
      active: !activeBucket && !overdueOnly,
      sub: "feasibility confirmed",
      hint: "Every product line on a live enquiry whose feasibility is confirmed (so it can be costed), plus any line that already carries a cost sheet. Archived enquiries are excluded.",
    },
    ...COSTING_STAGE_BUCKETS.map<BucketTile>((b) => ({
      key: b,
      label: COSTING_DONE_STATUS_LABELS[b],
      tone: COSTING_DONE_STATUS_COLORS[b],
      count: countIn(b),
      href: href(`bucket=${b}`),
      active: activeBucket === b,
      sub: b === "not_done" && noSheet > 0 ? `${noSheet} not costed yet` : undefined,
      hint:
        b === "not_done"
          ? "Costable lines with no cost sheet yet, plus sheets explicitly set back to Not Started — the work still outstanding."
          : `Product lines whose costing is ${COSTING_DONE_STATUS_LABELS[b]}.`,
    })),
    {
      key: "overdue",
      label: "Overdue",
      tone: "red",
      count: overdueRows.length,
      href: href(`overdue=${OVERDUE_PARAM}`),
      active: overdueOnly,
      sub: "past target date",
      hint: "Cost sheets whose target date is before today and which are not yet approved. Un-dated costings are never counted here.",
    },
  ];

  const heading = overdueOnly
    ? "Overdue"
    : activeBucket
      ? COSTING_DONE_STATUS_LABELS[activeBucket]
      : null;

  return (
    <EnquiryModuleShell
      title="Costing Register"
      userMenu={<UserMenuServer />}
      sidebarExtra={<CostingSidebarBuckets tiles={tiles} />}
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Costing Register
              {heading && (
                <span className="ml-2 text-[16px] font-bold text-ink-subtle">· {heading}</span>
              )}
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-subtle">
              {heading && (
                <span className="font-semibold text-ink-soft">Showing {rows.length} of </span>
              )}
              {all.length} costable product line{all.length === 1 ? "" : "s"} on live
              enquiries
              {noSheet > 0 && (
                <span className="font-semibold text-ink-soft">
                  {" "}
                  · {noSheet} still to cost
                </span>
              )}
              .
            </p>
          </div>
          <Link
            href={"/costings/new" as Route}
            className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] text-white transition-transform hover:-translate-y-px"
            style={{
              background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
              boxShadow: "0 6px 16px rgba(63,63,148,0.32)",
              fontWeight: 800,
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Costing
          </Link>
        </header>

        <BucketStrip tiles={tiles} ariaLabel="Costing buckets" />

        <CostingTable rows={rows} />
      </div>
    </EnquiryModuleShell>
  );
}
