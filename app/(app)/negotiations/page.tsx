import Link from "next/link";
import { Plus } from "lucide-react";
import {
  NegotiationTable,
  NEW_NEGOTIATION_ROUTE,
} from "@/components/negotiations/negotiation-table";
import { RegisterHeading } from "@/components/registers/register-heading";
import {
  NegotiationBucketStrip,
  buildNegotiationSidebarTiles,
  type NegotiationStripFilters,
} from "@/components/negotiations/negotiation-bucket-strip";
import { requireUser } from "@/lib/auth/current";
import {
  getNegotiationAgeingCounts,
  getNegotiationDashboard,
  listNegotiations,
} from "@/lib/queries/negotiations";
import {
  NEGOTIATION_OPEN_STATUSES,
  NEGOTIATION_OFF_BOARD_STATUSES,
} from "@/lib/negotiations/buckets";
import {
  NEGOTIATION_AGEING_BUCKETS,
  NEGOTIATION_STAGES,
  NEGOTIATION_STAGE_LABELS,
  NEGOTIATION_STATUSES,
  NEGOTIATION_STATUS_LABELS,
  type NegotiationAgeingKey,
  type NegotiationStage,
  type NegotiationStatus,
} from "@/db/enums";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { SidebarBuckets } from "@/components/layout/sidebar-buckets";
import { NegotiationMiniBoard } from "@/components/negotiations/negotiation-mini-board";
import { listNegotiationBoard } from "@/lib/queries/negotiation-board";

export const dynamic = "force-dynamic";

/** The status SET behind an axis tile; undefined = no axis filter. */
function axisStatuses(
  axis: "outcome" | "open" | null,
): readonly NegotiationStatus[] | undefined {
  if (axis === "outcome") return NEGOTIATION_OFF_BOARD_STATUSES;
  if (axis === "open") return NEGOTIATION_OPEN_STATUSES;
  return undefined;
}

interface PageProps {
  searchParams: Promise<{
    status?: string;
    stage?: string;
    axis?: string;
    sent?: string;
    ageing?: string;
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
  const ageing =
    (NEGOTIATION_AGEING_BUCKETS.find((b) => b.key === sp.ageing)?.key as
      | NegotiationAgeingKey
      | undefined) ?? null;

  const active: NegotiationStripFilters = { status, stage, axis, sent, ageing };

  const [dashboard, ageingCounts, boardCards, rows] = await Promise.all([
    getNegotiationDashboard(),
    getNegotiationAgeingCounts(),
    listNegotiationBoard(),
    listNegotiations({
      ageing: ageing ?? undefined,
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
    !status && axis === "outcome" ? "Not on the board" : null,
    !status && axis === "open" ? "In Negotiation" : null,
    stage ? NEGOTIATION_STAGE_LABELS[stage] : null,
    sent === true ? "PI issued" : sent === false ? "No PI issued" : null,
    ageing ? (NEGOTIATION_AGEING_BUCKETS.find((b) => b.key === ageing)?.label ?? null) : null,
  ]
    .filter((v): v is string => v !== null)
    .join(" · ");

  // Same derivation as the header strip — the sidebar just renders it densely.
  const sidebarTiles = buildNegotiationSidebarTiles(dashboard, active, ageingCounts);

  return (
    <EnquiryModuleShell
      title="Negotiation Register"
      userMenu={<UserMenuServer />}
      registerChildren={
        <SidebarBuckets
          tiles={sidebarTiles.filter((t) => t.key !== "all")}
          ariaLabel="Negotiation status distribution"
          unit="negotiation"
          exitsBeforeFlags
        />
      }
      sidebarExtra={<NegotiationMiniBoard cards={boardCards} />}
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <NegotiationBucketStrip
          dashboard={dashboard}
          active={active}
          shownCount={rows.length}
        />

        <NegotiationTable
          rows={rows}
          heading={
            <RegisterHeading
              title="Negotiation Register"
              count={rows.length}
              unit="negotiation"
              filterLabel={filterLabel ? `${filterLabel} of ${dashboard.total}` : null}
            />
          }
          actions={
            <Link
              href={NEW_NEGOTIATION_ROUTE}
              className="inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-[13px] font-extrabold text-white transition-transform hover:-translate-y-px"
              style={{
                background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))",
                boxShadow: "0 4px 12px rgba(63,63,148,0.30)",
              }}
            >
              <Plus size={15} strokeWidth={2.4} />
              New Negotiation
            </Link>
          }
        />
      </div>
    </EnquiryModuleShell>
  );
}
