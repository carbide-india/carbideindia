import Link from "next/link";
import { Plus } from "lucide-react";
import {
  NegotiationTable,
  NEW_NEGOTIATION_ROUTE,
} from "@/components/negotiations/negotiation-table";
import {
  NegotiationBucketStrip,
  buildNegotiationSidebarTiles,
  type NegotiationStripFilters,
} from "@/components/negotiations/negotiation-bucket-strip";
import { requireUser } from "@/lib/auth/current";
import { getNegotiationDashboard, listNegotiations } from "@/lib/queries/negotiations";
import {
  NEGOTIATION_OPEN_STATUSES,
  NEGOTIATION_OUTCOMES,
} from "@/lib/negotiations/buckets";
import {
  NEGOTIATION_STAGES,
  NEGOTIATION_STAGE_LABELS,
  NEGOTIATION_STATUSES,
  NEGOTIATION_STATUS_LABELS,
  type NegotiationStage,
  type NegotiationStatus,
} from "@/db/enums";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { SidebarBuckets } from "@/components/layout/sidebar-buckets";

export const dynamic = "force-dynamic";

/** The status SET behind an axis tile; undefined = no axis filter. */
function axisStatuses(
  axis: "outcome" | "open" | null,
): readonly NegotiationStatus[] | undefined {
  if (axis === "outcome") return NEGOTIATION_OUTCOMES;
  if (axis === "open") return NEGOTIATION_OPEN_STATUSES;
  return undefined;
}

interface PageProps {
  searchParams: Promise<{
    status?: string;
    stage?: string;
    axis?: string;
    sent?: string;
  }>;
}

/**
 * Negotiation Register - price negotiation tracked from a quote to won, lost or
 * abandoned, rendered inside the shared Enquiries module shell (logo sidebar +
 * indigo header). On /negotiations routes the shell's sidebar reads as the
 * register family automatically, so no custom nav is passed.
 *
 * The header now carries the stage dashboard (NegotiationBucketStrip): the five
 * house buckets with live counts, the volume tiles ("this much I've sent, this
 * much is still in negotiation") and the two secondary axes. Its counts are
 * computed over the WHOLE register in one grouped query — never over the
 * filtered slice — and every tile drills into this same page via `?status=` /
 * `?stage=` / `?axis=` / `?sent=`. Within the resulting slice the advanced table
 * still owns search / sorting / column filters client-side.
 */
export default async function NegotiationsPage({ searchParams }: PageProps) {
  await requireUser();

  const sp = await searchParams;
  // Narrow every URL parameter against its enum — an unknown value is ignored
  // (shows everything) rather than silently returning an empty register.
  const status = NEGOTIATION_STATUSES.includes(sp.status as NegotiationStatus)
    ? (sp.status as NegotiationStatus)
    : null;
  const stage = NEGOTIATION_STAGES.includes(sp.stage as NegotiationStage)
    ? (sp.stage as NegotiationStage)
    : null;
  const axis =
    sp.axis === "outcome" || sp.axis === "open" ? (sp.axis as "outcome" | "open") : null;
  const sent = sp.sent === "1" ? true : sp.sent === "0" ? false : null;

  const active: NegotiationStripFilters = { status, stage, axis, sent };

  const [dashboard, rows] = await Promise.all([
    getNegotiationDashboard(),
    listNegotiations({
      status: status ?? undefined,
      // The Outcome / In-Negotiation tiles are SETS of statuses, so they drill
      // through statusIn. An explicit ?status= always wins over the axis filter.
      statusIn: status ? undefined : axisStatuses(axis),
      stage: stage ?? undefined,
      piSent: sent ?? undefined,
    }),
  ]);

  const filterLabel = [
    status ? NEGOTIATION_STATUS_LABELS[status] : null,
    !status && axis === "outcome" ? "Commercial Outcome" : null,
    !status && axis === "open" ? "In Negotiation" : null,
    stage ? NEGOTIATION_STAGE_LABELS[stage] : null,
    sent === true ? "PI issued" : sent === false ? "No PI issued" : null,
  ]
    .filter((v): v is string => v !== null)
    .join(" · ");

  // Same derivation as the header strip — the sidebar just renders it densely.
  const sidebarTiles = buildNegotiationSidebarTiles(dashboard, active);

  return (
    <EnquiryModuleShell
      title="Negotiation Register"
      userMenu={<UserMenuServer />}
      registerChildren={
        <SidebarBuckets
          tiles={sidebarTiles.filter((t) => t.key !== "all")}
          ariaLabel="Negotiation status distribution"
          unit="negotiation"
        />
      }
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Negotiation Register
              {filterLabel && (
                <span className="ml-2 text-[16px] font-bold text-ink-subtle">
                  · {filterLabel}
                </span>
              )}
            </h1>
            <p className="mt-1.5 text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
              {filterLabel
                ? `${rows.length} of ${dashboard.total} ${dashboard.total === 1 ? "negotiation" : "negotiations"}`
                : `${rows.length} ${rows.length === 1 ? "negotiation" : "negotiations"}`}
            </p>
          </div>
          <Link
            href={NEW_NEGOTIATION_ROUTE}
            className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] text-white transition-transform hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
              boxShadow: "0 6px 16px rgba(63,63,148,0.32)",
              fontWeight: 800,
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Negotiation
          </Link>
        </header>

        <NegotiationBucketStrip
          dashboard={dashboard}
          active={active}
          shownCount={rows.length}
        />

        <NegotiationTable rows={rows} />
      </div>
    </EnquiryModuleShell>
  );
}
