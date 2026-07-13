"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ArrowLeft,
  ChevronDown,
  PlusCircle,
  Download,
  History,
  ArrowUpDown,
  Search,
  Pencil,
  Trash2,
  Check,
  X,
  ListPlus,
  SlidersHorizontal,
  Eye,
  EyeOff,
  RotateCcw,
  Info,
} from "lucide-react";
import type { MasterOption } from "@/db/schema";
import type { MasterKind } from "@/db/enums";
import {
  createMasterOption,
  updateMasterOption,
  deleteMasterOption,
  createMasterOptionsBulk,
} from "@/app/(admin)/admin/masters/actions";
import { fireToast } from "@/lib/toast";

const MONO = "var(--font-mono-display)";
type FilterMode = "all" | "active" | "inactive";

function csvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function MasterKindWorkbench({
  kind,
  label,
  description,
  options,
}: {
  kind: MasterKind;
  label: string;
  description: string;
  options: MasterOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  // New-form card
  const [formOpen, setFormOpen] = React.useState(true);
  const [name, setName] = React.useState("");
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkText, setBulkText] = React.useState("");

  // Table controls
  const [search, setSearch] = React.useState("");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [filter, setFilter] = React.useState<FilterMode>("all");
  const [advOpen, setAdvOpen] = React.useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  // Row interaction
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const singular = label.endsWith("s") ? label.slice(0, -1) : label;

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return options
      .filter((o) =>
        filter === "all" ? true : filter === "active" ? o.isActive : !o.isActive,
      )
      .filter((o) => (q ? o.name.toLowerCase().includes(q) : true))
      .slice()
      .sort((a, b) =>
        sortDir === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name),
      );
  }, [options, filter, search, sortDir]);

  const activeCount = options.filter((o) => o.isActive).length;

  // ── mutations ───────────────────────────────────────────────
  function afterWrite(ok: boolean, error: string | undefined, successMsg: string) {
    if (ok) {
      fireToast({ message: successMsg, type: "success" });
      router.refresh();
    } else {
      fireToast({ message: error ?? "Something went wrong.", type: "error" });
    }
  }

  function handleCreate() {
    const value = name.trim();
    if (!value) {
      fireToast({ message: "Enter a name first.", type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await createMasterOption({ kind, name: value });
      if (res.ok) setName("");
      afterWrite(res.ok, res.ok ? undefined : res.error, `"${value}" added.`);
    });
  }

  function handleBulk() {
    const names = bulkText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (names.length === 0) {
      fireToast({ message: "Paste at least one value.", type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await createMasterOptionsBulk({ kind, names });
      if (res.ok) {
        setBulkText("");
        setBulkOpen(false);
        fireToast({
          message: `Added ${res.created}${res.skipped ? `, skipped ${res.skipped} duplicate(s)` : ""}.`,
          type: "success",
        });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  function saveEdit(id: string) {
    const value = editName.trim();
    if (!value) {
      fireToast({ message: "Name cannot be empty.", type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await updateMasterOption(id, { name: value });
      if (res.ok) setEditingId(null);
      afterWrite(res.ok, res.ok ? undefined : res.error, "Renamed.");
    });
  }

  function toggleActive(o: MasterOption) {
    startTransition(async () => {
      const res = await updateMasterOption(o.id, { isActive: !o.isActive });
      afterWrite(
        res.ok,
        res.ok ? undefined : res.error,
        o.isActive ? "Deactivated." : "Reactivated.",
      );
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteMasterOption(id);
      if (res.ok) {
        setConfirmDeleteId(null);
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
      afterWrite(res.ok, res.ok ? undefined : res.error, "Deleted.");
    });
  }

  function bulkDeactivate() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkMenuOpen(false);
    startTransition(async () => {
      let ok = 0;
      let fail = 0;
      for (const id of ids) {
        const res = await updateMasterOption(id, { isActive: false });
        if (res.ok) ok++;
        else fail++;
      }
      setSelected(new Set());
      fireToast({
        message: `Deactivated ${ok}${fail ? `, ${fail} failed` : ""}.`,
        type: fail ? "error" : "success",
      });
      router.refresh();
    });
  }

  function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkMenuOpen(false);
    startTransition(async () => {
      let ok = 0;
      let fail = 0;
      for (const id of ids) {
        const res = await deleteMasterOption(id);
        if (res.ok) ok++;
        else fail++;
      }
      setSelected(new Set());
      fireToast({
        message: `Deleted ${ok}${fail ? `, ${fail} in use / failed` : ""}.`,
        type: fail ? "error" : "success",
      });
      router.refresh();
    });
  }

  function exportCsv() {
    const hasCode = kind === "size" || kind === "shape";
    const header = ["Name", ...(hasCode ? ["Code"] : []), "Active", "Sort Order"];
    const lines = [header.map(csvCell).join(",")];
    for (const o of options) {
      const cells = [
        o.name,
        ...(hasCode ? [o.code ?? ""] : []),
        o.isActive ? "yes" : "no",
        String(o.sortOrder),
      ];
      lines.push(cells.map((c) => csvCell(c)).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}-masters.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    fireToast({ message: "Export downloaded.", type: "success" });
  }

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((o) => selected.has(o.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const o of filtered) next.delete(o.id);
        return next;
      }
      const next = new Set(prev);
      for (const o of filtered) next.add(o.id);
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto w-full max-w-[980px]">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes mstRowIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes mstPop { from { opacity: 0; transform: translateY(-4px) scale(.98) } to { opacity: 1; transform: none } }
        @keyframes mstHead { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        @keyframes mstReveal { from { opacity: 0; transform: translateY(12px) scale(.98) } to { opacity: 1; transform: none } }
        @keyframes mstShimmer { from { background-position: 0% 50% } to { background-position: 220% 50% } }
        @keyframes mstLine { from { width: 0 } to { width: 190px } }
        .mst-row { animation: mstRowIn .34s cubic-bezier(.22,.61,.36,1) both; }
        .mst-pop { animation: mstPop .16s ease-out both; }
        .mst-head { animation: mstHead .5s cubic-bezier(.22,.61,.36,1) both; }
        .mst-title {
          font-family: var(--font-display), ui-sans-serif, system-ui, sans-serif;
          font-weight: 800; font-size: clamp(30px, 4.2vw, 42px);
          letter-spacing: -0.025em; line-height: 1.05; text-align: center;
          background: linear-gradient(100deg, #3F3F94 0%, #7b6cf0 45%, #3F3F94 90%);
          background-size: 220% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: mstReveal .6s cubic-bezier(.22,.61,.36,1) both, mstShimmer 6.5s linear infinite;
          position: relative; padding-bottom: 12px;
        }
        .mst-title::after {
          content: ""; position: absolute; left: 50%; bottom: 0; height: 3px; width: 0;
          transform: translateX(-50%); border-radius: 999px;
          background: linear-gradient(90deg, transparent, #7b6cf0, #3F3F94, transparent);
          animation: mstLine .85s .35s cubic-bezier(.22,.61,.36,1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .mst-row, .mst-pop, .mst-head, .mst-title { animation: none }
          .mst-title::after { animation: none; width: 190px }
        }
      `,
        }}
      />

      {/* Actions row — title now lives in the module header. */}
      <div className="mst-head relative mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-[#e6e8ec] bg-white px-3.5 text-[13px] font-semibold text-[#3a4152] transition hover:border-[#c9c9ea] hover:text-[#3f3f94]"
          >
            <History className="h-[16px] w-[16px]" />
            History / Logs
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-[#e6e8ec] bg-white px-3.5 text-[13px] font-semibold text-[#3a4152] transition hover:border-[#c9c9ea] hover:text-[#3f3f94]"
          >
            <Download className="h-[16px] w-[16px]" />
            Export
            <ChevronDown className="h-[14px] w-[14px] opacity-60" />
          </button>

          {historyOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setHistoryOpen(false)} />
              <div className="mst-pop absolute right-0 top-[46px] z-30 w-[280px] rounded-xl border border-[#e6e8ec] bg-white p-4 shadow-[0_16px_40px_rgba(63,63,148,0.16)]">
                <div className="flex items-center gap-2 text-[13px] font-bold text-[#3f3f94]">
                  <Info className="h-4 w-4" />
                  Change history
                </div>
                <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-[#6b7280]">
                  Every create, rename, activate and delete is already recorded to
                  the settings audit log. A visual timeline for this master lands in
                  the next iteration.
                </p>
              </div>
            </>
          )}
      </div>

      {/* ── New form card ───────────────────────────────────────── */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-[#e6e8ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <span className="inline-flex items-center gap-2.5 text-[15px] font-extrabold text-[#3f3f94]">
            <PlusCircle className="h-[19px] w-[19px] text-[#3f3f94]" />
            New {singular}
          </span>
          <ChevronDown
            className={`h-5 w-5 text-[#9aa0ab] transition-transform duration-300 ${
              formOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        <div
          className="grid transition-all duration-300 ease-out"
          style={{
            gridTemplateRows: formOpen ? "1fr" : "0fr",
            opacity: formOpen ? 1 : 0,
          }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-[#eef0f3] px-5 py-5">
              <label
                className="mb-1.5 block text-[11px] font-bold tracking-[0.14em] text-[#8a90a0]"
                style={{ fontFamily: MONO }}
              >
                NAME
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                  placeholder={`Enter ${singular} name`}
                  className="h-[42px] min-w-[240px] flex-1 rounded-lg border border-[#dfe1e6] bg-white px-3.5 text-[14px] text-[#3f3f94] outline-none transition placeholder:text-[#adb2bd] focus:border-[#3f3f94] focus:ring-2 focus:ring-[#3f3f94]/20"
                />
                <button
                  type="button"
                  onClick={() => setName("")}
                  className="h-[42px] rounded-lg border border-[#dfe1e6] bg-white px-4 text-[13px] font-semibold text-[#6b7280] transition hover:bg-[#f5f6f8]"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleCreate}
                  className="inline-flex h-[42px] items-center gap-2 rounded-lg bg-[#3f3f94] px-5 text-[13px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#2f2f6f] hover:shadow-[0_8px_20px_rgba(63,63,148,0.28)] disabled:translate-y-0 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setBulkOpen((v) => !v)}
                  className="inline-flex h-[42px] items-center gap-2 rounded-lg border border-[#dfe1e6] bg-white px-4 text-[13px] font-semibold text-[#3a4152] transition hover:border-[#c9c9ea] hover:text-[#3f3f94]"
                >
                  <ListPlus className="h-[16px] w-[16px]" />
                  Bulk add
                </button>
              </div>

              {bulkOpen && (
                <div className="mst-pop mt-4 rounded-xl border border-[#eef0f3] bg-[#fafbfc] p-4">
                  <label
                    className="mb-1.5 block text-[11px] font-bold tracking-[0.14em] text-[#8a90a0]"
                    style={{ fontFamily: MONO }}
                  >
                    PASTE MANY — ONE PER LINE
                  </label>
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    rows={5}
                    placeholder={`Value one\nValue two\nValue three`}
                    className="w-full resize-y rounded-lg border border-[#dfe1e6] bg-white px-3.5 py-2.5 text-[14px] text-[#3f3f94] outline-none transition placeholder:text-[#adb2bd] focus:border-[#3f3f94] focus:ring-2 focus:ring-[#3f3f94]/20"
                  />
                  <div className="mt-3 flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={handleBulk}
                      className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-[#3f3f94] px-4 text-[13px] font-bold text-white transition hover:bg-[#2f2f6f] disabled:opacity-50"
                    >
                      <ListPlus className="h-4 w-4" />
                      Add all
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkText("");
                        setBulkOpen(false);
                      }}
                      className="h-[38px] rounded-lg border border-[#dfe1e6] bg-white px-4 text-[13px] font-semibold text-[#6b7280] transition hover:bg-[#f5f6f8]"
                    >
                      Cancel
                    </button>
                    <span className="text-[12px] font-medium text-[#9aa0ab]">
                      {bulkText.split("\n").filter((s) => s.trim()).length} value(s)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Data Table ──────────────────────────────────────────── */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-[#e6e8ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f3] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-extrabold text-[#3f3f94]">Data Table</h2>
            <p className="text-[12.5px] font-medium text-[#8a90a0] tabular-nums">
              {options.length} option{options.length === 1 ? "" : "s"} total ·{" "}
              {activeCount} active
            </p>
          </div>
          <div className="relative flex items-center gap-2">
            {/* Advanced filter */}
            <button
              type="button"
              onClick={() => {
                setAdvOpen((v) => !v);
                setBulkMenuOpen(false);
              }}
              className={`inline-flex h-[36px] items-center gap-2 rounded-lg border px-3 text-[12.5px] font-semibold transition ${
                filter !== "all"
                  ? "border-[#c9c9ea] bg-[#eeeefb] text-[#3f3f94]"
                  : "border-[#e6e8ec] bg-white text-[#3a4152] hover:border-[#c9c9ea] hover:text-[#3f3f94]"
              }`}
            >
              <SlidersHorizontal className="h-[15px] w-[15px]" />
              Advanced Filter
              {filter !== "all" && (
                <span className="rounded-full bg-[#3f3f94] px-1.5 text-[10px] font-bold text-white">
                  {filter}
                </span>
              )}
            </button>
            {advOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setAdvOpen(false)} />
                <div className="mst-pop absolute right-[120px] top-[42px] z-30 w-[190px] rounded-xl border border-[#e6e8ec] bg-white p-2 shadow-[0_16px_40px_rgba(63,63,148,0.16)]">
                  <span
                    className="block px-2 pb-1 pt-1 text-[10px] font-bold tracking-[0.14em] text-[#a2a8b4]"
                    style={{ fontFamily: MONO }}
                  >
                    STATUS
                  </span>
                  {(["all", "active", "inactive"] as FilterMode[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        setFilter(f);
                        setAdvOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-[13px] font-semibold capitalize transition ${
                        filter === f
                          ? "bg-[#eeeefb] text-[#3f3f94]"
                          : "text-[#3a4152] hover:bg-[#f5f6f8]"
                      }`}
                    >
                      {f}
                      {filter === f && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Bulk actions */}
            <button
              type="button"
              onClick={() => {
                setBulkMenuOpen((v) => !v);
                setAdvOpen(false);
              }}
              className="inline-flex h-[36px] items-center gap-2 rounded-lg border border-[#e6e8ec] bg-white px-3 text-[12.5px] font-semibold text-[#3a4152] transition hover:border-[#c9c9ea] hover:text-[#3f3f94]"
            >
              Bulk Actions
              {selected.size > 0 && (
                <span className="rounded-full bg-[#3f3f94] px-1.5 text-[10px] font-bold text-white tabular-nums">
                  {selected.size}
                </span>
              )}
              <ChevronDown className="h-[14px] w-[14px] opacity-60" />
            </button>
            {bulkMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setBulkMenuOpen(false)} />
                <div className="mst-pop absolute right-0 top-[42px] z-30 w-[210px] rounded-xl border border-[#e6e8ec] bg-white p-2 shadow-[0_16px_40px_rgba(63,63,148,0.16)]">
                  <button
                    type="button"
                    onClick={() => {
                      toggleSelectAll();
                      setBulkMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-semibold text-[#3a4152] transition hover:bg-[#f5f6f8]"
                  >
                    <Check className="h-4 w-4" />
                    {allVisibleSelected ? "Clear selection" : "Select all shown"}
                  </button>
                  <button
                    type="button"
                    disabled={selected.size === 0}
                    onClick={bulkDeactivate}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-semibold text-[#3a4152] transition hover:bg-[#f5f6f8] disabled:opacity-40"
                  >
                    <EyeOff className="h-4 w-4" />
                    Deactivate selected
                  </button>
                  <button
                    type="button"
                    disabled={selected.size === 0}
                    onClick={bulkDelete}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-semibold text-[#d32f2f] transition hover:bg-[#fdf3f3] disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete selected
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-[#eef0f3] px-5 py-3">
          <div className="flex h-[40px] items-center gap-2.5 rounded-lg border border-[#e6e8ec] bg-[#fafbfc] px-3 transition focus-within:border-[#3f3f94] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#3f3f94]/15">
            <Search className="h-[17px] w-[17px] shrink-0 text-[#9aa0ab]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-[#3f3f94] outline-none placeholder:text-[#adb2bd]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-[#9aa0ab] transition hover:text-[#3f3f94]"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Table header */}
        <div className="flex items-center gap-3 border-b border-[#eef0f3] bg-[#fafbfc] px-5 py-2.5">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAll}
            className="h-4 w-4 shrink-0 accent-[#3f3f94]"
            aria-label="Select all shown"
          />
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] text-[#8a90a0] transition hover:text-[#3f3f94]"
            style={{ fontFamily: MONO }}
          >
            NAME
            <ArrowUpDown className="h-[13px] w-[13px]" />
            <span className="text-[9px] font-bold text-[#adb2bd]">
              {sortDir === "asc" ? "A→Z" : "Z→A"}
            </span>
          </button>
          <span
            className="ml-auto text-[11px] font-bold tracking-[0.12em] text-[#8a90a0]"
            style={{ fontFamily: MONO }}
          >
            ACTIONS
          </span>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[14px] font-semibold text-[#8a90a0]">
              {options.length === 0
                ? `No ${label.toLowerCase()} options yet — add your first one above.`
                : "No options match your search / filter."}
            </p>
          </div>
        ) : (
          <ul>
            {filtered.map((o, i) => {
              const isEditing = editingId === o.id;
              const isConfirming = confirmDeleteId === o.id;
              const isSelected = selected.has(o.id);
              return (
                <li
                  key={o.id}
                  className="mst-row flex items-center gap-3 border-b border-[#f2f3f5] px-5 py-3 transition-colors last:border-b-0 hover:bg-[#fafbfc]"
                  style={{ animationDelay: `${Math.min(i * 0.025, 0.4)}s` }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleRow(o.id)}
                    className="h-4 w-4 shrink-0 accent-[#3f3f94]"
                    aria-label={`Select ${o.name}`}
                  />

                  {isEditing ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(o.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="h-[36px] min-w-0 flex-1 rounded-lg border border-[#3f3f94] bg-white px-3 text-[14px] font-semibold text-[#3f3f94] outline-none ring-2 ring-[#3f3f94]/20"
                    />
                  ) : (
                    <span
                      className={`min-w-0 flex-1 truncate text-[14px] font-semibold ${
                        o.isActive ? "text-[#3f3f94]" : "text-[#adb2bd] line-through"
                      }`}
                      title={o.name}
                    >
                      {o.name}
                      {(kind === "size" || kind === "shape") && o.code && (
                        <span className="ml-2 rounded bg-[#eeeefb] px-1.5 py-0.5 text-[10.5px] font-bold text-[#3f3f94]">
                          {o.code}
                        </span>
                      )}
                      {!o.isActive && (
                        <span className="ml-2 rounded-full bg-[#f2f3f5] px-2 py-0.5 text-[10.5px] font-bold text-[#9aa0ab] no-underline">
                          inactive
                        </span>
                      )}
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => saveEdit(o.id)}
                          className="grid h-[34px] w-[34px] place-items-center rounded-lg bg-[#3f3f94] text-white transition hover:bg-[#2f2f6f] disabled:opacity-50"
                          aria-label="Save"
                        >
                          <Check className="h-[16px] w-[16px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-[#e6e8ec] text-[#6b7280] transition hover:bg-[#f5f6f8]"
                          aria-label="Cancel"
                        >
                          <X className="h-[16px] w-[16px]" />
                        </button>
                      </>
                    ) : isConfirming ? (
                      <>
                        <span className="text-[12px] font-bold text-[#6b7280]">Delete?</span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleDelete(o.id)}
                          className="inline-flex h-[34px] items-center gap-1 rounded-lg bg-[#d32f2f] px-3 text-[12.5px] font-bold text-white transition hover:bg-[#b52626] disabled:opacity-50"
                        >
                          <Check className="h-[15px] w-[15px]" /> Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-[#e6e8ec] text-[#6b7280] transition hover:bg-[#f5f6f8]"
                          aria-label="Cancel delete"
                        >
                          <X className="h-[16px] w-[16px]" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleActive(o)}
                          title={o.isActive ? "Deactivate" : "Reactivate"}
                          className={`grid h-[34px] w-[34px] place-items-center rounded-lg border transition ${
                            o.isActive
                              ? "border-[#e6e8ec] text-[#6b7280] hover:border-[#c9c9ea] hover:text-[#3f3f94]"
                              : "border-[#cfe3d4] bg-[#f2faf4] text-[#2e9e5b] hover:bg-[#e7f6ec]"
                          }`}
                          aria-label={o.isActive ? "Deactivate" : "Reactivate"}
                        >
                          {o.isActive ? (
                            <Eye className="h-[16px] w-[16px]" />
                          ) : (
                            <RotateCcw className="h-[16px] w-[16px]" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(o.id);
                            setEditName(o.name);
                          }}
                          className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-[#e6e8ec] text-[#6b7280] transition hover:border-[#c9c9ea] hover:text-[#3f3f94]"
                          aria-label="Edit"
                        >
                          <Pencil className="h-[15px] w-[15px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(o.id)}
                          className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-[#e6e8ec] text-[#9aa0ab] transition hover:border-[#f0b4b4] hover:bg-[#fdf3f3] hover:text-[#d32f2f]"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-[15px] w-[15px]" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
