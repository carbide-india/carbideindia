"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Calculator, CircleDot, Trash2 } from "lucide-react";
import {
  COSTING_ROUTE_LABELS,
  COSTING_DONE_STATUS_LABELS,
  COSTING_DONE_STATUS_COLORS,
  COSTING_STAGE_BUCKETS,
} from "@/db/enums";
import { formatInr, formatDate } from "@/lib/format";
import { Chip } from "@/components/inquiries/chip";
import {
  RegisterDataTable,
  type RegisterColumn,
  type FilterConfig,
  type RowMenuItem,
} from "@/components/registers/register-data-table";
import { fireToast } from "@/lib/toast";
import {
  deleteCosting,
  deleteCostingsBulk,
  setCostingStatus,
  setCostingStatusBulk,
} from "@/app/(app)/costings/actions";

/** Buckets offered on the row menu — mirrors the chip's inline-settable set. */
const ROW_MENU_STATUSES = ["not_done", "draft", "pending_approval"] as const;
import { costingRevisionLabel } from "@/lib/costing/buckets";
import { CostingStatusCell } from "./costing-status-cell";
import type { CostingRegisterRow } from "@/lib/queries/costings";

interface Props {
  rows: CostingRegisterRow[];
}

/** Deleting a costing is admin-only (`requireAdmin` throws for everyone else). */
const FORBIDDEN_MESSAGE = "Admins only - ask an admin to delete this costing.";

/** Filter labels for the target-date column (kept out of the render loop). */
const TARGET_OVERDUE = "Overdue";
const TARGET_DUE_SOON = "Due in 7 days";
const TARGET_SET = "On track";
const TARGET_NONE = "No target date";

function moneyText(value: string | null): string {
  if (value == null || value === "") return "-";
  const n = Number(value);
  return Number.isFinite(n) ? formatInr(n) : "-";
}

function moneyNumber(value: string | null): number {
  if (value == null || value === "") return -Infinity;
  const n = Number(value);
  return Number.isFinite(n) ? n : -Infinity;
}

/** The Costing Master link for a line — where an un-costed line gets started. */
function costingMasterHref(r: CostingRegisterRow): Route {
  return `/costings/new?inquiryItemId=${r.inquiryItemId}&inquiryId=${r.inquiryId}` as Route;
}

function targetBand(r: CostingRegisterRow): string {
  if (r.targetDate == null) return TARGET_NONE;
  if (r.overdue) return TARGET_OVERDUE;
  if (r.daysToTarget != null && r.daysToTarget >= 0 && r.daysToTarget <= 7) {
    return TARGET_DUE_SOON;
  }
  return TARGET_SET;
}

/**
 * Costing register table — a thin config wrapper over RegisterDataTable.
 *
 * One row = one PRODUCT LINE, costed or not. A line with no costing sheet at all
 * is a real row here (status "Not Started"), which is the only way the register
 * can answer Manan's question — "20 are costable, I costed 3, where are the 17?".
 * The expanded panel behind each row lists every cost sheet on the line: both
 * routes, every revision (Costing 1 / 2 / 3), oldest first.
 */
export function CostingTable({ rows }: Props) {
  const router = useRouter();

  // Selection ids are inquiry_item ids (the row unit), but every write below
  // targets a `costings` row — map through the rows we already hold rather than
  // re-resolving server-side, and drop lines that have nothing to act on.
  const costingIdsFor = React.useCallback(
    (lineIds: string[]): string[] => {
      const wanted = new Set(lineIds);
      return rows
        .filter((r) => wanted.has(r.id) && r.costingId != null)
        .map((r) => r.costingId as string);
    },
    [rows],
  );

  const rowMenu = React.useCallback(
    (r: CostingRegisterRow): RowMenuItem<CostingRegisterRow>[] => {
      const items: RowMenuItem<CostingRegisterRow>[] = [];
      if (r.costingId) {
        items.push({
          key: "open",
          label: "Open cost sheet",
          Icon: ArrowUpRight,
          href: `/costings/${r.costingId}` as Route,
        });
      }
      items.push({
        key: "cost",
        label: r.costingId ? "Re-cost in Costing Master" : "Start costing",
        Icon: Calculator,
        href: costingMasterHref(r),
      });

      // Move the bucket straight from the row menu. Only offered on a real,
      // unlocked cost sheet: a line with no sheet has nothing to update, and a
      // locked (approved) one must be reopened through the sheet so the audit
      // trail stays honest. Need Info is absent on purpose — it carries a note,
      // so it routes to the sheet via the status chip instead.
      if (r.costingId && !r.isLocked) {
        const current = r.status ?? r.bucket;
        for (const s of ROW_MENU_STATUSES) {
          if (s === current) continue;
          items.push({
            key: `status-${s}`,
            label: `Mark ${COSTING_DONE_STATUS_LABELS[s]}`,
            Icon: CircleDot,
            onSelect: async (row) => {
              if (!row.costingId) return;
              const res = await setCostingStatus({ costingId: row.costingId, status: s });
              if (res.ok) {
                fireToast({ message: `Moved to ${COSTING_DONE_STATUS_LABELS[s]}.` });
                router.refresh();
              } else {
                fireToast({ message: res.error, type: "error" });
              }
            },
          });
        }
      }
      if (r.costingId) {
        items.push({
          key: "delete",
          label: "Delete latest cost sheet",
          Icon: Trash2,
          danger: true,
          onSelect: async (row) => {
            const id = row.costingId;
            if (!id) return;
            const name = row.smNumber ?? row.custProductName ?? "this line";
            if (
              !window.confirm(
                `Delete the latest cost sheet for ${name}? Earlier revisions are kept. This can't be undone.`,
              )
            ) {
              return;
            }
            try {
              const res = await deleteCosting(id);
              if (res.ok) {
                fireToast({ message: `Deleted the cost sheet for ${name}.` });
                router.refresh();
              } else {
                fireToast({ message: res.error, type: "error" });
              }
            } catch {
              // requireAdmin throws for non-admins; the menu handler is
              // fire-and-forget, so swallow it into an honest toast.
              fireToast({ message: FORBIDDEN_MESSAGE, type: "error" });
            }
          },
        });
      }
      return items;
    },
    [router],
  );

  // Bulk delete. Lines with no cost sheet are not deletable and are counted as
  // skipped, and a PARTIAL outcome (rows the server guard refused) is reported
  // with the real split - never the bar's default toast, which counts the
  // SELECTION and would claim rows the guard actually kept.
  const onBulkDelete = React.useCallback(
    async (
      ids: string[],
    ): Promise<{ ok: boolean; error?: string; message?: string }> => {
      const costingIds = costingIdsFor(ids);
      const notCosted = ids.length - costingIds.length;
      if (costingIds.length === 0) {
        return { ok: false, error: "None of the selected lines has a cost sheet yet." };
      }
      let res: Awaited<ReturnType<typeof deleteCostingsBulk>>;
      try {
        res = await deleteCostingsBulk(costingIds);
      } catch {
        return { ok: false, error: FORBIDDEN_MESSAGE };
      }
      if (!res.ok) return { ok: false, error: res.error };
      const why = "skipped (approved & locked, used by a production order, or not costed yet)";
      const failed = res.failed + notCosted;
      if (failed > 0) {
        return res.deleted === 0
          ? { ok: false, error: `Nothing deleted - ${failed} ${why}.` }
          : { ok: true, message: `${res.deleted} deleted, ${failed} ${why}.` };
      }
      return { ok: true };
    },
    [costingIdsFor],
  );

  // Bulk bucket move. Need Info is intentionally absent - it demands a per-row
  // note ("what exactly is missing?"), which a bulk control cannot supply.
  const onBulkStatus = React.useCallback(
    async (ids: string[], value: string): Promise<{ ok: boolean; error?: string }> => {
      const costingIds = costingIdsFor(ids);
      if (costingIds.length === 0) {
        return { ok: false, error: "None of the selected lines has a cost sheet yet." };
      }
      const res = await setCostingStatusBulk(costingIds, value);
      if (!res.ok) return { ok: false, error: res.error };
      if (res.updated === 0) {
        return { ok: false, error: "Nothing updated - every selected cost sheet is locked." };
      }
      return { ok: true };
    },
    [costingIdsFor],
  );

  const columns = React.useMemo<RegisterColumn<CostingRegisterRow>[]>(
    () => [
      {
        id: "smNumber",
        header: "SM",
        searchable: true,
        pinnedLeft: true,
        sortValue: (r) => r.smNumber ?? "",
        exportValue: (r) => r.smNumber ?? "",
        cell: (r) => (
          <Link
            href={r.costingId ? (`/costings/${r.costingId}` as Route) : costingMasterHref(r)}
            className="font-semibold text-ink-strong hover:underline"
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          >
            {r.smNumber ?? "-"}
          </Link>
        ),
      },
      {
        id: "custProductName",
        header: "Product",
        searchable: true,
        truncate: true,
        sortValue: (r) => r.custProductName ?? "",
        exportValue: (r) => r.custProductName ?? "",
        cell: (r) => (
          <span
            className="block max-w-[240px] truncate text-ink-soft"
            title={r.custProductName ?? undefined}
          >
            {r.custProductName ?? "-"}
          </span>
        ),
      },
      {
        id: "companyName",
        header: "Company",
        searchable: true,
        sortValue: (r) => r.companyName ?? "",
        exportValue: (r) => r.companyName ?? "",
        cell: (r) => <span className="text-ink-soft">{r.companyName ?? "-"}</span>,
      },
      {
        id: "bucket",
        header: "Status",
        sortValue: (r) => COSTING_STAGE_BUCKETS.indexOf(r.bucket),
        exportValue: (r) => COSTING_DONE_STATUS_LABELS[r.status ?? r.bucket],
        // Editable in place: the chip IS the control. It shows the row's REAL
        // stored status (a legacy value like In Process / Done still counts
        // under the bucket that superseded it) and offers the inline-settable
        // buckets; Need Info routes to the sheet because it carries a note.
        cell: (r) => (
          <CostingStatusCell
            costingId={r.costingId}
            inquiryItemId={r.inquiryItemId}
            status={r.status}
            bucket={r.bucket}
            isLocked={r.isLocked}
          />
        ),
      },
      {
        id: "targetDate",
        header: "Target",
        // Un-dated rows sort last in both directions rather than pretending to
        // be the epoch.
        sortValue: (r) => (r.targetDate ? r.targetDate.getTime() : Number.MAX_SAFE_INTEGER),
        exportValue: (r) => (r.targetDate ? formatDate(r.targetDate) : null),
        cell: (r) => {
          if (!r.targetDate) return <span className="text-ink-subtle">-</span>;
          if (!r.overdue) {
            return (
              <span className="tabular-nums text-ink-soft">{formatDate(r.targetDate)}</span>
            );
          }
          const late = r.daysToTarget != null ? Math.abs(r.daysToTarget) : null;
          return (
            <span
              className="inline-flex items-center gap-1 font-bold tabular-nums"
              style={{ color: "var(--color-red-deep)" }}
              title={late != null ? `${late} day${late === 1 ? "" : "s"} overdue` : "Overdue"}
            >
              <AlertTriangle size={13} strokeWidth={2.6} />
              {formatDate(r.targetDate)}
            </span>
          );
        },
      },
      {
        id: "costingType",
        header: "Route",
        sortValue: (r) => (r.costingType ? COSTING_ROUTE_LABELS[r.costingType] : ""),
        exportValue: (r) => (r.costingType ? COSTING_ROUTE_LABELS[r.costingType] : null),
        cell: (r) => (
          <span className="text-[13px] font-medium text-ink-soft">
            {r.costingType ? COSTING_ROUTE_LABELS[r.costingType] : "-"}
          </span>
        ),
      },
      {
        id: "revision",
        header: "Rev",
        sortValue: (r) => r.revisionCount,
        exportValue: (r) => (r.revisionNo > 0 ? r.revisionNo : null),
        cell: (r) =>
          r.revisionNo > 0 ? (
            <span
              className="tabular-nums text-[12.5px] font-semibold text-ink-soft"
              title={`${costingRevisionLabel(r.revisionNo - 1)} of ${r.revisionCount} on this route`}
            >
              {r.revisionNo}
              {r.revisionCount > 1 && (
                <span className="text-ink-subtle"> / {r.revisionCount}</span>
              )}
            </span>
          ) : (
            <span className="text-ink-subtle">-</span>
          ),
      },
      {
        id: "finalCostPerPiece",
        header: "Final Cost / pc",
        align: "right",
        sortValue: (r) => moneyNumber(r.finalCostPerPiece),
        exportValue: (r) =>
          r.finalCostPerPiece == null ? null : Number(r.finalCostPerPiece),
        cell: (r) => (
          <span className="tabular-nums font-semibold text-ink-strong">
            {moneyText(r.finalCostPerPiece)}
          </span>
        ),
      },
      {
        id: "quoteValue",
        header: "Quote Value",
        align: "right",
        sortValue: (r) => moneyNumber(r.quoteValue),
        exportValue: (r) => (r.quoteValue == null ? null : Number(r.quoteValue)),
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">{moneyText(r.quoteValue)}</span>
        ),
      },
      {
        id: "quantityNos",
        header: "Qty",
        align: "right",
        defaultHidden: true,
        sortValue: (r) => moneyNumber(r.quantityNos),
        exportValue: (r) => (r.quantityNos == null ? null : Number(r.quantityNos)),
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">
            {r.quantityNos ?? "-"}
            {r.quantityNos && r.quantityUom ? ` ${r.quantityUom}` : ""}
          </span>
        ),
      },
      {
        id: "needInfoNote",
        header: "Info Needed",
        defaultHidden: true,
        searchable: true,
        sortValue: (r) => r.needInfoNote ?? "",
        exportValue: (r) => r.needInfoNote ?? null,
        cell: (r) => (
          <span
            className="block max-w-[280px] truncate text-ink-soft"
            title={r.needInfoNote ?? undefined}
          >
            {r.needInfoNote ?? "-"}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: "Date",
        sortValue: (r) => r.createdAt,
        cell: (r) => (
          <span className="tabular-nums text-ink-soft">{formatDate(r.createdAt)}</span>
        ),
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterConfig<CostingRegisterRow>[]>(
    () => [
      {
        id: "bucket",
        label: "Status",
        type: "select",
        // Iterates the house bucket array, so a deprecated value can never
        // reappear in the picker while still rendering on its row.
        options: COSTING_STAGE_BUCKETS.map((b) => ({
          value: COSTING_DONE_STATUS_LABELS[b],
          label: COSTING_DONE_STATUS_LABELS[b],
        })),
        accessor: (r) => COSTING_DONE_STATUS_LABELS[r.bucket],
      },
      {
        id: "costingType",
        label: "Route",
        type: "select",
        options: (["inhouse", "bought_out"] as const).map((r) => ({
          value: COSTING_ROUTE_LABELS[r],
          label: COSTING_ROUTE_LABELS[r],
        })),
        accessor: (r) => (r.costingType ? COSTING_ROUTE_LABELS[r.costingType] : ""),
      },
      {
        id: "target",
        label: "Target",
        type: "select",
        options: [TARGET_OVERDUE, TARGET_DUE_SOON, TARGET_SET, TARGET_NONE].map((v) => ({
          value: v,
          label: v,
        })),
        accessor: targetBand,
      },
      {
        id: "createdAt",
        label: "Date",
        type: "dateRange",
        accessor: (r) => r.createdAt,
      },
    ],
    [],
  );

  return (
    <RegisterDataTable<CostingRegisterRow>
      tableKey="costings"
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      getOpenHref={(r) =>
        r.costingId ? (`/costings/${r.costingId}` as Route) : costingMasterHref(r)
      }
      filters={filters}
      exportFilename="costings"
      rowMenu={rowMenu}
      renderExpanded={(r) => <CostingLinePanel row={r} />}
      bulkActions={[
        {
          label: "Set status",
          options: [
            { value: "draft", label: COSTING_DONE_STATUS_LABELS.draft },
            {
              value: "pending_approval",
              label: COSTING_DONE_STATUS_LABELS.pending_approval,
            },
            { value: "not_done", label: COSTING_DONE_STATUS_LABELS.not_done },
          ],
          onApply: onBulkStatus,
        },
      ]}
      bulkDelete={{
        noun: { one: "cost sheet", many: "cost sheets" },
        onDelete: onBulkDelete,
      }}
      emptyTitle="Nothing is costable yet."
      emptyHint="A product line appears here the moment its feasibility is confirmed - costed or not - so the work still outstanding is always visible."
    />
  );
}

/**
 * The expanded row: every cost sheet on this product line, oldest first, across
 * both routes and all revisions. Earlier revisions are retained forever, so this
 * is the register's window onto the full history without cluttering the table.
 */
function CostingLinePanel({ row }: { row: CostingRegisterRow }) {
  if (row.costings.length === 0) {
    return (
      <div className="px-4 py-3 text-[13px]">
        <p className="font-semibold text-ink-strong">No cost sheet on this line yet.</p>
        <p className="mt-0.5 text-ink-soft">
          Feasibility is confirmed, so it is costable — this is one of the lines still
          outstanding.
        </p>
        <Link
          href={costingMasterHref(row)}
          className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand hover:underline"
        >
          <Calculator size={14} strokeWidth={2.4} />
          Start costing
        </Link>
      </div>
    );
  }

  // Group by route so "Costing 1 / 2 / 3" is numbered within its own revision
  // chain, exactly as the register's Rev column reports it.
  const byRoute = (["inhouse", "bought_out"] as const)
    .map((route) => ({
      route,
      sheets: row.costings.filter((c) => c.costingType === route),
    }))
    .filter((g) => g.sheets.length > 0);

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {row.needInfoNote && (
        <div
          className="rounded-lg px-3 py-2 text-[12.5px]"
          style={{
            background: "color-mix(in srgb, var(--color-amber) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-amber) 30%, transparent)",
            color: "var(--color-amber-deep)",
          }}
        >
          <span className="font-black uppercase tracking-[0.08em]">Information needed</span>
          <p className="mt-0.5 font-medium">{row.needInfoNote}</p>
        </div>
      )}

      {byRoute.map((g) => (
        <div key={g.route}>
          <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-ink-subtle">
            {COSTING_ROUTE_LABELS[g.route]}
          </p>
          <ul className="flex flex-col gap-1">
            {g.sheets.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <Link
                  href={`/costings/${c.id}` as Route}
                  className="font-bold text-brand hover:underline"
                >
                  {costingRevisionLabel(i)}
                </Link>
                <Chip
                  label={COSTING_DONE_STATUS_LABELS[c.status]}
                  tone={COSTING_DONE_STATUS_COLORS[c.status]}
                />
                <span className="tabular-nums text-ink-soft">
                  {moneyText(c.finalCostPerPiece)} / pc
                </span>
                <span className="text-ink-subtle">{formatDate(c.createdAt)}</span>
                {c.isChosen && (
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                    chosen
                  </span>
                )}
                {c.isLatestRevision && g.sheets.length > 1 && (
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                    latest
                  </span>
                )}
                {c.revisionReason && (
                  <span className="text-ink-soft" title={c.revisionReason}>
                    · {c.revisionReason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
