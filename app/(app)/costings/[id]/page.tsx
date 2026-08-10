import * as React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import {
  getCostingById,
  getCostingLineIdentity,
  getCostingRevisionsForItem,
} from "@/lib/queries/costings";
import { getInquiryVarianceRows } from "@/lib/queries/feasibility";
import { formatDate, formatInr } from "@/lib/format";
import {
  COSTING_ROUTE_LABELS,
  COSTING_LOGIC_LABELS,
  COSTING_DONE_STATUS_LABELS,
} from "@/db/enums";
import { CostingStagePanel } from "@/components/costings/costing-stage-panel";
import {
  CostingRevisionsPanel,
  type CostingRevisionSheet,
} from "@/components/costings/costing-revisions-panel";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Costing -- Carbide India" };
  const row = await getCostingById(id);
  if (!row) return { title: "Costing -- Carbide India" };
  return { title: `Costing ${COSTING_ROUTE_LABELS[row.costingType]} -- Carbide India` };
}

export default async function CostingDetailPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const row = await getCostingById(id);
  if (!row) notFound();

  const isInhouse = row.costingType === "inhouse";

  // Stage + history context. `getInquiryVarianceRows` is the SAME PF-vs-Costing
  // engine the Costing Master form uses (lib/feasibility/spec-variance.ts) —
  // Manan asked for that view "there AND here", so the saved costing shows it
  // read-only rather than only the entry form having it.
  const [identity, allRevisions, varianceByItem] = await Promise.all([
    getCostingLineIdentity(row.inquiryItemId),
    getCostingRevisionsForItem(row.inquiryItemId),
    getInquiryVarianceRows(row.inquiryId),
  ]);

  // Revisions are numbered within their own route chain (an in-house sheet and a
  // bought-out sheet are alternatives, not successive revisions of each other).
  const revisions: CostingRevisionSheet[] = allRevisions
    .filter((r) => r.costingType === row.costingType)
    .map((r) => ({
      id: r.id,
      route: r.costingType,
      status: r.costingDoneStatus,
      isChosen: r.isChosen,
      isLatestRevision: r.isLatestRevision,
      isLocked: r.isLocked,
      revisionReason: r.revisionReason,
      createdAt: r.createdAt,
      // The diffable costing numbers (see lib/costing/costing-variance.ts).
      costingType: r.costingType,
      costingLogic: r.costingLogic,
      qty: r.qty,
      blockWtPerPiece: r.blockWtPerPiece,
      blockWtOrderKg: r.blockWtOrderKg,
      directWtPerPiece: r.directWtPerPiece,
      directWtOrderKg: r.directWtOrderKg,
      totalWtOrderKg: r.totalWtOrderKg,
      pressingWt: r.pressingWt,
      theoreticalWt: r.theoreticalWt,
      blockWt: r.blockWt,
      lossPct: r.lossPct,
      rmPricePerKg: r.rmPricePerKg,
      vaPct: r.vaPct,
      shapingRatePerMin: r.shapingRatePerMin,
      shapingMins: r.shapingMins,
      machiningRate: r.machiningRate,
      overheadPct: r.overheadPct,
      negotiationPct: r.negotiationPct,
      toolFlatCost: r.toolFlatCost,
      toolPerPieceCost: r.toolPerPieceCost,
      developmentCost: r.developmentCost,
      outsourcedVendorCost: r.outsourcedVendorCost,
      vendorOhPct: r.vendorOhPct,
      sinteredPricePerPiece: r.sinteredPricePerPiece,
      shapingCostPerPiece: r.shapingCostPerPiece,
      machiningCostPerPiece: r.machiningCostPerPiece,
      costAfterMachining: r.costAfterMachining,
      finalCostPerPiece: r.finalCostPerPiece,
      quoteValue: r.quoteValue,
      paymentTerms: r.paymentTerms,
      deliveryTime: r.deliveryTime,
      validity: r.validity,
    }));

  const specVariance = varianceByItem[row.inquiryItemId] ?? null;
  const specChanged = specVariance?.filter((v) => v.changed) ?? [];

  function money(v: string | null): string {
    if (!v) return "--";
    const n = Number(v);
    return Number.isFinite(n) ? formatInr(n) : "--";
  }

  function num(v: string | null, decimals = 4): string {
    if (!v) return "--";
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(decimals) : "--";
  }

  function pct(v: string | null): string {
    if (!v) return "--";
    const n = Number(v);
    return Number.isFinite(n) ? (n * 100).toFixed(1) + "%" : "--";
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
          <Link
            href={"/costings" as Route}
            className="inline-flex items-center gap-1.5 font-semibold text-ink-muted hover:text-ink-strong transition-colors"
          >
            <ArrowLeft size={14} strokeWidth={2.4} />
            Costing Register
          </Link>
          <span className="text-ink-subtle">/</span>
          <span className="font-mono text-ink-subtle text-[12px]">{id.slice(0, 8)}&hellip;</span>
        </nav>

        {/* Header */}
        <header>
          <p className="text-[12px] uppercase tracking-[0.18em] font-bold text-ink-subtle">
            Costing &middot; {COSTING_ROUTE_LABELS[row.costingType]}
          </p>
          <h1 className="text-[32px] font-black leading-tight tracking-tight text-ink-strong mt-1">
            {isInhouse ? "In-house" : "Bought-Out"} Cost Sheet
          </h1>
          {identity && (
            <p className="text-[14px] font-semibold text-ink-soft mt-1">
              {identity.smNumber ?? "-"}
              {identity.custProductName && (
                <>
                  <span className="mx-2 text-ink-subtle">&#183;</span>
                  {identity.custProductName}
                </>
              )}
              {identity.companyName && (
                <>
                  <span className="mx-2 text-ink-subtle">&#183;</span>
                  {identity.companyName}
                </>
              )}
            </p>
          )}
          <p className="text-[15px] text-ink-muted mt-1">
            {COSTING_DONE_STATUS_LABELS[row.costingDoneStatus]}
            {row.qty && (
              <>
                <span className="mx-2 text-ink-subtle">&#183;</span>
                Qty {row.qty}
              </>
            )}
            <span className="mx-2 text-ink-subtle">&#183;</span>
            {formatDate(row.createdAt)}
          </p>
        </header>

        {/* Results highlight */}
        <section
          className="rounded-section border-2 p-6"
          style={{
            background: "linear-gradient(135deg, #F8F7FF 0%, #EEEEFF 100%)",
            borderColor: "var(--color-brand)",
            boxShadow: "0 4px 24px -8px rgba(63,63,148,0.18)",
          }}
        >
          <p className="mb-4 text-[11px] uppercase tracking-[0.16em] font-bold" style={{ color: "var(--color-brand)" }}>
            Computed Outputs
          </p>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: "var(--color-brand)" }}>
                Final Cost / Piece
              </span>
              <span
                className="tabular-nums font-black"
                style={{ fontSize: 32, lineHeight: 1, color: "var(--color-brand)" }}
              >
                {money(row.finalCostPerPiece)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
                Quote Value
              </span>
              <span className="tabular-nums text-[22px] font-bold text-ink-strong">
                {money(row.quoteValue)}
              </span>
            </div>
            {isInhouse && row.costAfterMachining && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-ink-subtle">
                  Cost After Machining
                </span>
                <span className="tabular-nums text-[18px] font-semibold text-ink-strong">
                  {money(row.costAfterMachining)}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Stage buckets: status, Need Info note, target date */}
        <CostingStagePanel
          costingId={row.id}
          status={row.costingDoneStatus}
          needInfoNote={row.needInfoNote}
          targetDate={row.targetDate}
          isLocked={row.isLocked}
        />

        {/* Costing 1 / 2 / 3 + the difference between any two */}
        <CostingRevisionsPanel currentId={row.id} revisions={revisions} />

        {/* PF-vs-Costing spec variance — the same report the Costing Master form
            shows while editing, kept visible on the saved sheet. */}
        {specVariance && specVariance.length > 0 && (
          <ReadCard title="Variance · Primary Feasibility vs Costing">
            <p className="mb-3 text-[13px] font-bold text-ink-soft">
              {specChanged.length === 0
                ? "No spec has moved since the Primary Feasibility baseline was frozen."
                : `${specChanged.length} spec field${specChanged.length === 1 ? "" : "s"} changed since the Primary Feasibility baseline.`}
            </p>
            {specChanged.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-hairline">
                <table className="w-full border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="bg-surface-soft text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle">
                      <th scope="col" className="px-3 py-2">Field</th>
                      <th scope="col" className="px-3 py-2">Feasibility (PF)</th>
                      <th scope="col" className="px-3 py-2">Costing (C)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {specChanged.map((v) => (
                      <tr key={v.field}>
                        <td className="px-3 py-2 font-bold text-ink-strong">{v.label}</td>
                        <td className="px-3 py-2 tabular-nums text-ink-soft">
                          {v.feasibilityValue}
                        </td>
                        <td
                          className="px-3 py-2 tabular-nums"
                          style={{ color: "var(--color-amber-deep)", fontWeight: 800 }}
                        >
                          {v.costingValue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReadCard>
        )}

        {/* In-house breakdown cards */}
        {isInhouse && (
          <>
            <ReadCard title="Intermediate Outputs">
              <InfoGrid
                rows={[
                  ["Loss Wt (kg)", num(row.lossWt, 6)],
                  ["RM / gm", num(row.rmPerGm)],
                  ["VA / gm", num(row.vaPerGm)],
                  ["Sintered Cost / gm", num(row.sinteredCostPerGm)],
                  ["Sintered Price / pc", money(row.sinteredPricePerPiece)],
                  ["Shaping Cost / pc", money(row.shapingCostPerPiece)],
                  ["Machining Cost / pc", money(row.machiningCostPerPiece)],
                  ["Negotiation Amount", money(row.negotiationAmount)],
                ]}
              />
            </ReadCard>

            <ReadCard title="Weights">
              <InfoGrid
                rows={[
                  ["Weight Used", row.weightUsed ?? null],
                  ["Block Wt (gms)", num(row.blockWt, 2)],
                  ["Theoretical Wt (gms)", num(row.theoreticalWt, 2)],
                  ["Pressing Wt (gms)", num(row.pressingWt, 2)],
                  ["Loss %", pct(row.lossPct)],
                ]}
              />
            </ReadCard>

            <ReadCard title="Raw Material and Value Addition">
              <InfoGrid
                rows={[
                  ["RM Price / kg", money(row.rmPricePerKg)],
                  ["VA %", pct(row.vaPct)],
                  ["VA Floor / kg", money(row.vaFloorPerKg)],
                ]}
              />
            </ReadCard>

            <ReadCard title="Tooling">
              <InfoGrid
                rows={[
                  ["Tool Type", row.toolType ?? null],
                  ["Cost Method", row.toolCostMethod ?? null],
                  ["Flat Tool Cost", money(row.toolFlatCost)],
                ]}
              />
            </ReadCard>

            <ReadCard title="Shaping">
              <InfoGrid
                rows={[
                  ["Shaping (mins)", num(row.shapingMins, 1)],
                  ["Rate / min", money(row.shapingRatePerMin)],
                ]}
              />
            </ReadCard>

            <ReadCard title="Machining">
              <InfoGrid
                rows={[
                  ["Machining Type", row.machiningType ?? null],
                  ["Machining Rate", money(row.machiningRate)],
                  ["Overhead %", pct(row.overheadPct)],
                ]}
              />
            </ReadCard>

            <ReadCard title="Negotiation">
              <InfoGrid
                rows={[["Negotiation %", pct(row.negotiationPct)]]}
              />
            </ReadCard>
          </>
        )}

        {/* Bought-out cards */}
        {!isInhouse && (
          <>
            <ReadCard title="Vendor">
              <InfoGrid
                rows={[
                  ["Vendor Cost / pc", money(row.outsourcedVendorCost)],
                  ["Vendor OH %", pct(row.vendorOhPct)],
                  ["Vendor Notes", row.vendorNotes ?? null],
                ]}
              />
            </ReadCard>

            <ReadCard title="Development">
              <InfoGrid
                rows={[
                  ["Development Cost", money(row.developmentCost)],
                  ["Development Notes", row.developmentNotes ?? null],
                  ["Technical Notes", row.technicalNotes ?? null],
                ]}
              />
            </ReadCard>
          </>
        )}

        {/* Identity */}
        <ReadCard title="Identity">
          <InfoGrid
            rows={[
              ["Route", COSTING_ROUTE_LABELS[row.costingType]],
              [
                "Costing Logic",
                row.costingLogic
                  ? COSTING_LOGIC_LABELS[row.costingLogic]
                  : null,
              ],
              ["Quantity", row.qty ?? null],
              ["Status", COSTING_DONE_STATUS_LABELS[row.costingDoneStatus]],
            ]}
          />
        </ReadCard>

        {/* Timeline */}
        <ReadCard title="Timeline and Validity">
          <InfoGrid
            rows={[
              ["Development Time", row.developmentTime ?? null],
              ["Delivery Time", row.deliveryTime ?? null],
              ["Validity", row.validity ?? null],
            ]}
          />
        </ReadCard>

        {/* Record info */}
        <ReadCard title="Record Info">
          <InfoGrid
            rows={[
              ["Created", formatDate(row.createdAt)],
              ["Last Updated", formatDate(row.updatedAt)],
            ]}
          />
        </ReadCard>
      </div>
    </main>
  );
}

/* ── Read-only building blocks (mirroring item-detail.tsx) ───────────────── */

function ReadCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="bg-surface-card rounded-section border border-hairline p-6"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <h2 className="mb-4 text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoGrid({
  rows,
}: {
  rows: ReadonlyArray<readonly [string, string | null | undefined]>;
}) {
  const visible = rows.filter(
    ([, v]) => v !== null && v !== undefined && v !== "" && v !== "--",
  );
  if (visible.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
      {visible.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <dt className="text-[12px] font-bold text-ink-subtle">{label}</dt>
          <dd className="text-[14px] text-ink-strong break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
