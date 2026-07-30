"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useQueryState, parseAsString } from "nuqs";
import {
  MoreVertical,
  Eye,
  FileText,
  Pencil,
  Search,
  X,
  SlidersHorizontal,
  Check,
  Paperclip,
  FileCheck2,
  Link2,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  SAMPLE_STATUSES,
  SAMPLE_STATUS_LABELS,
  SAMPLE_STATUS_COLORS,
  STAGE_STATUS_LABELS,
  STAGE_STATUS_COLORS,
  type SampleStatus,
  type StageStatus,
} from "@/db/enums";
import { SampleQuickView } from "@/components/samples/sample-quick-view";
import type { SampleListItem } from "@/lib/queries/samples";
import type { EmployeeOption } from "@/lib/queries/employees";

export const NEW_SAMPLE_ROUTE = "/samples/new" as Route;

interface Props {
  rows: SampleListItem[];
  employees: EmployeeOption[];
}

/** Colour token → hex (shared for sample + stage status dots/chips). */
const TONE: Record<string, string> = {
  slate: "#64748b", blue: "#2563eb", amber: "#d97706", orange: "#ea580c",
  red: "#dc2626", stone: "#78716c", green: "#16a34a", purple: "#7c3aed",
};
const tone = (c: string) => TONE[c] ?? "#64748b";

// ── Frozen columns (Actions · Sample No · Company) ──
const W_ACTIONS = 46;
const W_SAMPLE = 120;
const W_COMPANY = 190;
const LEFT_SAMPLE = W_ACTIONS;
const LEFT_COMPANY = W_ACTIONS + W_SAMPLE;

const dash = <span className="text-[#b3b8c2]">-</span>;

function StatusChip({ status }: { status: SampleStatus }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
      style={{ background: tone(SAMPLE_STATUS_COLORS[status]) }}
    >
      {SAMPLE_STATUS_LABELS[status]}
    </span>
  );
}

function StageChip({ status }: { status: StageStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block size-2 rounded-full" style={{ background: tone(STAGE_STATUS_COLORS[status]) }} />
      <span className="text-[12px] text-[#6b7280]">{STAGE_STATUS_LABELS[status]}</span>
    </span>
  );
}

interface OptCol {
  id: string;
  label: string;
  width: number;
  align?: "right";
  cell: (r: SampleListItem) => React.ReactNode;
}
const OPT_COLUMNS: OptCol[] = [
  { id: "date", label: "Date", width: 110, cell: (r) => <span className="tabular-nums text-[#6b7280]">{formatDate(r.sampleDate)}</span> },
  { id: "location", label: "Location", width: 130, cell: (r) => (r.location ? <span className="text-[#6b7280]">{r.location}</span> : dash) },
  { id: "responsible", label: "Responsible", width: 150, cell: (r) => (r.responsibleName ? <span className="text-[#6b7280]">{r.responsibleName}</span> : dash) },
  { id: "sampleStatus", label: "Sample Status", width: 130, cell: (r) => <StatusChip status={r.sampleStatus} /> },
  { id: "dimension", label: "Dimension", width: 130, cell: (r) => <StageChip status={r.dimensionStatus} /> },
  { id: "chemical", label: "Chemical", width: 130, cell: (r) => <StageChip status={r.chemicalStatus} /> },
  { id: "drawing", label: "Drawing", width: 130, cell: (r) => <StageChip status={r.drawingStatus} /> },
  { id: "costing", label: "Costing", width: 130, cell: (r) => <StageChip status={r.costingStatus} /> },
  {
    id: "reports",
    label: "Reports",
    width: 96,
    align: "right",
    cell: (r) =>
      r.reportCount > 0 ? (
        <span className="inline-flex items-center gap-1 text-[#6b7280]" title={r.reportsUploaded.join(", ")}>
          <FileCheck2 className="h-[13px] w-[13px]" /> {r.reportCount}
        </span>
      ) : (
        dash
      ),
  },
  {
    id: "photos",
    label: "Files",
    width: 80,
    align: "right",
    cell: (r) =>
      r.photoCount > 0 ? (
        <span className="inline-flex items-center gap-1 text-[#6b7280]">
          <Paperclip className="h-[13px] w-[13px]" /> {r.photoCount}
        </span>
      ) : (
        dash
      ),
  },
  {
    id: "inSmFolder",
    label: "In SM Folder",
    width: 108,
    cell: (r) =>
      r.inSmFolder ? (
        <span className="inline-flex items-center rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11px] font-semibold text-[#15803d]">Yes</span>
      ) : (
        <span className="text-[12.5px] text-[#6b7280]">No</span>
      ),
  },
  {
    id: "linked",
    label: "Enquiry",
    width: 96,
    cell: (r) =>
      r.linkedToEnquiry ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3f3f94]">
          <Link2 className="h-[13px] w-[13px]" /> Linked
        </span>
      ) : (
        <span className="text-[12.5px] text-[#6b7280]">-</span>
      ),
  },
  { id: "created", label: "Created", width: 100, cell: (r) => <span className="tabular-nums text-[12.5px] text-[#6b7280]">{formatDate(r.createdAt)}</span> },
];
const COLS_STORAGE_KEY = "carbide.samples.hiddenCols";

/**
 * Sample Register - a dense, Client-Master-grade table: KPI cards that double as
 * quick filters, a one-line filter bar (search / status / responsible / location
 * / enquiry-link), a Columns menu, a heavy bordered table with frozen Sample No +
 * Company, a left-pinned ⋮ row menu, row-click Quick View, and CSV export.
 */
export function SampleRegister({ rows, employees }: Props) {
  const [quickView, setQuickView] = React.useState<SampleListItem | null>(null);

  const stats = React.useMemo(() => {
    const total = rows.length;
    const by = (s: SampleStatus) => rows.filter((r) => r.sampleStatus === s).length;
    const inProcess = by("in_process");
    const needAttention = rows.filter((r) => r.sampleStatus === "need_info" || r.sampleStatus === "need_help").length;
    const onHold = by("on_hold");
    const processed = by("processed");
    return { total, inProcess, needAttention, onHold, processed };
  }, [rows]);

  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [status, setStatus] = useQueryState("status", parseAsString.withDefault(""));
  const [responsible, setResponsible] = useQueryState("resp", parseAsString.withDefault(""));
  const [location, setLocation] = useQueryState("loc", parseAsString.withDefault(""));
  const [linked, setLinked] = useQueryState("linked", parseAsString.withDefault(""));

  const [hiddenCols, setHiddenCols] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_STORAGE_KEY);
      if (raw) setHiddenCols(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);
  React.useEffect(() => {
    try {
      localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(hiddenCols));
    } catch {
      /* ignore */
    }
  }, [hiddenCols]);
  const visibleCols = React.useMemo(() => OPT_COLUMNS.filter((c) => !hiddenCols[c.id]), [hiddenCols]);
  const tableMinWidth = W_ACTIONS + W_SAMPLE + W_COMPANY + visibleCols.reduce((s, c) => s + c.width, 0);

  const locations = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.location) set.add(r.location);
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [rows]);
  const responsibles = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.responsibleId && r.responsibleName) map.set(r.responsibleId, r.responsibleName);
    // Also include all employees so you can filter by someone not yet on a sample.
    for (const e of employees) if (!map.has(e.id)) map.set(e.id, e.name);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, employees]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle) {
        const hay = [r.sampleNo, r.companyName, r.notes, r.location, r.responsibleName].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (status && r.sampleStatus !== status) return false;
      if (responsible && r.responsibleId !== responsible) return false;
      if (location && r.location !== location) return false;
      if (linked === "linked" && !r.linkedToEnquiry) return false;
      if (linked === "unlinked" && r.linkedToEnquiry) return false;
      return true;
    });
  }, [rows, q, status, responsible, location, linked]);

  const hasFilters = Boolean(q) || Boolean(status) || Boolean(responsible) || Boolean(location) || Boolean(linked);
  function clearFilters() {
    setQ("");
    setStatus("");
    setResponsible("");
    setLocation("");
    setLinked("");
  }

  const selectClass =
    "h-8 max-w-[160px] shrink-0 rounded-lg border border-[#dcdce8] bg-white px-2.5 text-[12.5px] font-semibold text-[#3a4152] outline-none focus:border-[#3f3f94]";

  function exportCsv() {
    const cols = ["Sample No", "Company", "Date", "Location", "Responsible", "Sample Status", "Dimension", "Chemical", "Drawing", "Costing", "Reports", "Files", "In SM Folder", "Enquiry", "Created"];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [cols.map(esc).join(",")];
    for (const r of filtered) {
      lines.push(
        [
          r.sampleNo,
          r.companyName ?? "",
          formatDate(r.sampleDate),
          r.location,
          r.responsibleName ?? "",
          SAMPLE_STATUS_LABELS[r.sampleStatus],
          STAGE_STATUS_LABELS[r.dimensionStatus],
          STAGE_STATUS_LABELS[r.chemicalStatus],
          STAGE_STATUS_LABELS[r.drawingStatus],
          STAGE_STATUS_LABELS[r.costingStatus],
          String(r.reportCount),
          String(r.photoCount),
          r.inSmFolder ? "Yes" : "No",
          r.linkedToEnquiry ? "Linked" : "",
          formatDate(r.createdAt),
        ]
          .map((v) => esc(String(v)))
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-register.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* KPI cards - quick filters over sample status --------------------- */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Samples" value={stats.total} accent selected={!hasFilters} onClick={clearFilters} />
        <StatCard label="In Process" value={stats.inProcess} selected={status === "in_process"} onClick={() => setStatus(status === "in_process" ? "" : "in_process")} />
        <StatCard label="Need Attention" value={stats.needAttention} selected={status === "need_info"} onClick={() => setStatus(status === "need_info" ? "" : "need_info")} />
        <StatCard label="On Hold" value={stats.onHold} selected={status === "on_hold"} onClick={() => setStatus(status === "on_hold" ? "" : "on_hold")} />
        <StatCard label="Processed" value={stats.processed} selected={status === "processed"} onClick={() => setStatus(status === "processed" ? "" : "processed")} />
      </div>

      {/* Filter bar ------------------------------------------------------- */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <label className="relative w-[220px] min-w-[180px] flex-1">
          <Search size={14} strokeWidth={2.2} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9aa0ab]" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value || "")}
            placeholder="Search sample no, company, notes…"
            aria-label="Search samples"
            className="h-8 w-full rounded-lg border border-[#dcdce8] bg-white pl-8 pr-7 text-[12.5px] text-[#3a4152] outline-none placeholder:text-[#9aa0ab] focus:border-[#3f3f94]"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9aa0ab] hover:text-[#3a4152]">
              <X size={14} strokeWidth={2.4} />
            </button>
          )}
        </label>

        <select value={status} onChange={(e) => setStatus(e.target.value || "")} aria-label="Sample status" className={selectClass}>
          <option value="">All statuses</option>
          {SAMPLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SAMPLE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <select value={responsible} onChange={(e) => setResponsible(e.target.value || "")} aria-label="Responsible" className={selectClass}>
          <option value="">All responsible</option>
          {responsibles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {locations.length > 0 && (
          <select value={location} onChange={(e) => setLocation(e.target.value || "")} aria-label="Location" className={selectClass}>
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}

        <select value={linked} onChange={(e) => setLinked(e.target.value || "")} aria-label="Enquiry link" className={selectClass}>
          <option value="">All samples</option>
          <option value="linked">Linked to enquiry</option>
          <option value="unlinked">Not linked</option>
        </select>

        <ColumnsMenu hidden={hiddenCols} setHidden={setHiddenCols} />

        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#dcdce8] bg-white px-2.5 text-[12.5px] font-semibold text-[#3a4152] transition hover:border-[#c9c9ea] hover:text-[#3f3f94]"
        >
          <FileText size={13} strokeWidth={2.2} />
          Export
        </button>

        {hasFilters && (
          <button type="button" onClick={clearFilters} className="shrink-0 px-2 py-2 text-[12.5px] font-semibold text-[#6b7280] transition-colors hover:text-[#3a4152]">
            Clear Filters
          </button>
        )}
      </div>

      {/* Table ------------------------------------------------------------ */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#d5d8e2] bg-white px-6 py-14 text-center">
          <p className="text-[15px] font-bold text-[#3a4152]">
            {hasFilters ? "No samples match these filters." : "No samples yet - log the first one."}
          </p>
          <p className="mt-1.5 text-[13px] text-[#6b7280]">
            {hasFilters ? (
              <button type="button" onClick={clearFilters} className="font-semibold text-[#3f3f94] underline underline-offset-2">
                Clear Filters
              </button>
            ) : (
              <Link href={NEW_SAMPLE_ROUTE} className="font-semibold text-[#3f3f94] underline underline-offset-2">
                New Sample
              </Link>
            )}
          </p>
        </div>
      ) : (
        <div className="overflow-auto rounded-2xl border-2 border-[#2b303b] bg-white" style={{ boxShadow: "0 2px 10px rgba(15,23,42,0.08)", maxHeight: "calc(100vh - 300px)" }}>
          <table className="w-full border-separate text-[13.5px] font-medium" style={{ borderSpacing: 0, minWidth: tableMinWidth }}>
            <thead>
              <tr className="text-left text-[11.5px] font-black uppercase tracking-[0.05em] text-[#2b303b]">
                <Th sticky left={0} width={W_ACTIONS} corner>
                  <span className="sr-only">Actions</span>
                </Th>
                <Th sticky left={LEFT_SAMPLE} width={W_SAMPLE} corner>
                  Sample No
                </Th>
                <Th sticky left={LEFT_COMPANY} width={W_COMPANY} corner lastFrozen>
                  Company
                </Th>
                {visibleCols.map((c) => (
                  <Th key={c.id} width={c.width} align={c.align}>
                    {c.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="group/row cursor-pointer" onClick={() => setQuickView(r)}>
                  <Td sticky left={0} width={W_ACTIONS} className="align-top">
                    <div onClick={(e) => e.stopPropagation()}>
                      <RowMenu row={r} onQuickView={() => setQuickView(r)} />
                    </div>
                  </Td>
                  <Td sticky left={LEFT_SAMPLE} width={W_SAMPLE} className="align-top">
                    <span className="font-mono font-bold text-[#1f2430] group-hover/row:text-[#3f3f94]">{r.sampleNo}</span>
                  </Td>
                  <Td sticky left={LEFT_COMPANY} width={W_COMPANY} lastFrozen className="align-top">
                    {r.companyName ? <span className="font-semibold text-[#3a4152]">{r.companyName}</span> : dash}
                  </Td>
                  {visibleCols.map((c) => (
                    <Td key={c.id} width={c.width} align={c.align} className="align-top">
                      {c.cell(r)}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {quickView && (
        <SampleQuickView sampleId={quickView.id} sampleNo={quickView.sampleNo} onClose={() => setQuickView(null)} />
      )}
    </>
  );
}

// ── Columns menu ──
function ColumnsMenu({ hidden, setHidden }: { hidden: Record<string, boolean>; setHidden: React.Dispatch<React.SetStateAction<Record<string, boolean>>> }) {
  const hiddenCount = OPT_COLUMNS.filter((c) => hidden[c.id]).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#dcdce8] bg-white px-2.5 text-[12.5px] font-semibold text-[#3a4152] transition hover:border-[#c9c9ea] hover:text-[#3f3f94]">
          <SlidersHorizontal size={13} strokeWidth={2.2} />
          Columns
          {hiddenCount > 0 && <span className="rounded-full bg-[#3f3f94] px-1.5 text-[10px] font-bold text-white tabular-nums">{hiddenCount}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] overflow-y-auto">
        <DropdownMenuLabel>Show Columns</DropdownMenuLabel>
        {OPT_COLUMNS.map((c) => {
          const visible = !hidden[c.id];
          return (
            <DropdownMenuItem
              key={c.id}
              className="text-[14px]"
              onSelect={(e) => {
                e.preventDefault();
                setHidden((prev) => ({ ...prev, [c.id]: visible }));
              }}
            >
              <span className="inline-flex w-4 justify-center">{visible ? <Check size={14} strokeWidth={2.6} /> : null}</span>
              {c.label}
            </DropdownMenuItem>
          );
        })}
        {hiddenCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[14px]"
              onSelect={(e) => {
                e.preventDefault();
                setHidden({});
              }}
            >
              <span className="inline-flex w-4 justify-center" />
              Show all
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Table primitives (frozen columns) ──
function frozenStyle(left: number, width: number, lastFrozen?: boolean): React.CSSProperties {
  return { position: "sticky", left, width, minWidth: width, maxWidth: width, zIndex: 2, boxShadow: lastFrozen ? "1px 0 0 rgba(15,23,42,0.10)" : undefined };
}
function Th({ children, width, align, sticky, left, corner, lastFrozen }: { children: React.ReactNode; width?: number; align?: "left" | "right"; sticky?: boolean; left?: number; corner?: boolean; lastFrozen?: boolean }) {
  const style: React.CSSProperties = sticky ? { ...frozenStyle(left ?? 0, width ?? 0, lastFrozen), zIndex: corner ? 4 : 3 } : { width, minWidth: width };
  return (
    <th
      className={`sticky top-0 z-[2] whitespace-nowrap px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}
      style={{ background: "#e6e8f2", borderBottom: "2px solid #2b303b", borderRight: "1px solid #c4c9d6", ...style }}
    >
      {children}
    </th>
  );
}
function Td({ children, width, align, sticky, left, lastFrozen, className = "" }: { children: React.ReactNode; width?: number; align?: "left" | "right"; sticky?: boolean; left?: number; lastFrozen?: boolean; className?: string }) {
  const style: React.CSSProperties = sticky ? frozenStyle(left ?? 0, width ?? 0, lastFrozen) : { width, minWidth: width };
  return (
    <td
      className={`break-words border-b border-[#c9cede] px-4 py-3 text-[#3a4152] ${align === "right" ? "text-right" : "text-left"} ${sticky ? "bg-white group-hover/row:bg-[#f2f2fb]" : "group-hover/row:bg-[#f2f2fb]"} ${className}`}
      style={{ whiteSpace: "normal", borderRight: "1px solid #e7e9f1", ...style }}
    >
      {children}
    </td>
  );
}

// ── Row ⋮ menu ──
function RowMenu({ row, onQuickView }: { row: SampleListItem; onQuickView: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${row.sampleNo}`}
          className="grid h-8 w-8 place-items-center rounded-lg text-[#6b7280] transition hover:bg-[#efeffb] hover:text-[#3f3f94] data-[state=open]:bg-[#efeffb] data-[state=open]:text-[#3f3f94]"
        >
          <MoreVertical size={17} strokeWidth={2.2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[11rem]">
        <DropdownMenuItem className="text-[14px]" onSelect={() => onQuickView()}>
          <Eye size={15} strokeWidth={2.2} />
          Quick View
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="text-[14px]">
          <Link href={`/samples/${row.id}` as Route} className="flex items-center gap-2.5">
            <FileText size={15} strokeWidth={2.2} />
            Full Record
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="text-[14px]">
          <Link href={`/samples/${row.id}` as Route} className="flex items-center gap-2.5">
            <Pencil size={15} strokeWidth={2.2} />
            Edit
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatCard({ label, value, accent, selected, onClick }: { label: string; value: number; accent?: boolean; selected?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-2xl border bg-white px-4 py-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-[#c9c9ea] hover:shadow-[0_8px_20px_-10px_rgba(63,63,148,0.4)] ${selected ? "border-[#3f3f94] ring-2 ring-[#3f3f94]/25" : "border-[#e5e7eb]"}`}
      style={{ boxShadow: selected ? undefined : "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.10em] text-[#9aa0ab]">{label}</div>
        {selected && <Check size={14} strokeWidth={3} className="shrink-0 text-[#3f3f94]" />}
      </div>
      <div className="mt-1.5 text-[28px] font-bold leading-none tabular-nums" style={{ color: accent || selected ? "#3f3f94" : "#1f2430" }}>
        {value}
      </div>
    </button>
  );
}
