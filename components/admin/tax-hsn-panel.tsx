"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { Plus, Search, TriangleAlert } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { adoptItemHsnCode, setHsnCodeActive } from "@/app/(admin)/admin/tax/actions";
import type { HsnCodeRow, TaxRateRow, UnmappedHsnRow } from "@/lib/queries/tax";
import {
  TaxHsnDialog,
  type HsnDialogTarget,
} from "@/components/admin/tax-hsn-dialog";
import {
  TaxConfirmDialog,
  type TaxConfirmSpec,
} from "@/components/admin/tax-confirm-dialog";

interface Props {
  codes: HsnCodeRow[];
  rates: TaxRateRow[];
  unmapped: UnmappedHsnRow[];
  defaultRateLabel: string | null;
}

export function TaxHsnPanel({ codes, rates, unmapped, defaultRateLabel }: Props) {
  const router = useRouter();
  const [query, setQuery] = useQueryState("hsn", { defaultValue: "" });
  const [dialogTarget, setDialogTarget] = useState<HsnDialogTarget>(undefined);
  const [presetCode, setPresetCode] = useState<string | undefined>(undefined);
  const [confirm, setConfirm] = useState<TaxConfirmSpec | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return codes;
    return codes.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q) ||
        (c.taxRateLabel ?? "").toLowerCase().includes(q),
    );
  }, [codes, query]);

  function askToggleActive(row: HsnCodeRow) {
    if (row.isActive) {
      setConfirm({
        title: `Deactivate HSN ${row.code}?`,
        body: `Lines carrying this code stop resolving ${
          row.taxRateLabel ? `${row.taxRateLabel} ` : "a mapped rate "
        }and fall back to ${defaultRateLabel ?? "no rate at all"}.${
          row.itemCount > 0
            ? ` ${row.itemCount} Item Master row${row.itemCount === 1 ? "" : "s"} still carry it.`
            : ""
        }`,
        confirmLabel: "Deactivate",
        successMessage: `HSN ${row.code} deactivated.`,
        tone: "danger",
        run: () => setHsnCodeActive(row.id, false),
      });
      return;
    }
    setConfirm({
      title: `Reactivate HSN ${row.code}?`,
      body: "It resumes resolving its mapped GST rate on new document lines.",
      confirmLabel: "Reactivate",
      successMessage: `HSN ${row.code} reactivated.`,
      tone: "brand",
      run: () => setHsnCodeActive(row.id, true),
    });
  }

  return (
    <section className="flex flex-col gap-5">
      {unmapped.length > 0 && (
        <UnmappedPanel
          rows={unmapped}
          rates={rates}
          onAdded={() => router.refresh()}
          onOpenFull={(code) => {
            setPresetCode(code);
            setDialogTarget(null);
          }}
        />
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold text-[#1e2f66]">HSN / SAC master</h2>
          <p className="mt-1 text-[13px] text-[#6b7280] tabular-nums">
            {codes.length} code{codes.length === 1 ? "" : "s"} ·{" "}
            {codes.filter((c) => c.taxRateId).length} mapped to a rate ·{" "}
            {unmapped.length} seen on items but not in the master
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={15}
              strokeWidth={2.2}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a2a8b4]"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => void setQuery(e.target.value || null)}
              placeholder="Search code or description"
              aria-label="Search HSN codes"
              className="h-[40px] w-[260px] rounded-lg border border-[#dfe1e6] bg-white pl-9 pr-3 text-[13.5px] text-[#1f2430] outline-none transition placeholder:text-[#adb2bd] focus:border-[#3f3f94] focus:ring-2 focus:ring-[#3f3f94]/15 max-sm:w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setPresetCode(undefined);
              setDialogTarget(null);
            }}
            className="inline-flex h-[40px] items-center gap-2 rounded-lg bg-[#3f3f94] px-4 text-[13.5px] font-bold text-white transition hover:bg-[#2f2f6f]"
          >
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
            New code
          </button>
        </div>
      </div>

      {codes.length === 0 ? (
        <div className="rounded-2xl border border-[#e6e8ec] bg-white px-6 py-14 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <p className="text-[16px] font-extrabold text-[#1e2f66]">
            No HSN codes mapped yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-[#6b7280]">
            Until a code is mapped, every line falls back to the default GST
            rate. Carbide India&rsquo;s carbide tooling normally sits under 8209
            and 8207.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#e6e8ec] bg-white px-6 py-12 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <p className="text-[14px] font-bold text-[#1e2f66]">
            No code matches &ldquo;{query}&rdquo;
          </p>
          <button
            type="button"
            onClick={() => void setQuery(null)}
            className="mt-2 text-[13px] font-semibold text-[#3f3f94] transition hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e6e8ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <table className="w-full min-w-[820px] text-[13.5px]">
            <caption className="sr-only">
              HSN / SAC codes and the GST rate each resolves to
            </caption>
            <thead>
              <tr className="border-b border-[#eceef2] bg-[#fafbfc] text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[#6b7280]">
                <th scope="col" className="px-4 py-3">
                  Code
                </th>
                <th scope="col" className="px-4 py-3">
                  Description
                </th>
                <th scope="col" className="px-4 py-3">
                  GST rate
                </th>
                <th scope="col" className="px-4 py-3">
                  Unit
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Items
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[#f1f2f5] transition-colors last:border-b-0 hover:bg-[#fafbfc]"
                >
                  <td
                    className={`px-4 py-3 font-bold tabular-nums ${c.isActive ? "text-[#1f2430]" : "text-[#a2a8b4]"}`}
                  >
                    {c.code}
                  </td>
                  <td className="max-w-[320px] truncate px-4 py-3 text-[#6b7280]">
                    {c.description || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.taxRateId ? (
                      <span className="font-semibold tabular-nums text-[#1f2430]">
                        {c.taxRateLabel}
                        {c.taxRatePercent !== null && (
                          <span className="text-[#6b7280]">
                            {" "}
                            · {Number(c.taxRatePercent.toFixed(3))}%
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[12.5px] font-semibold text-[#b48200]">
                        Falls back to {defaultRateLabel ?? "no default"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#6b7280]">{c.defaultUom || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#6b7280]">
                    {c.itemCount || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                      style={
                        c.isActive
                          ? { background: "#e8f5e9", color: "#2e7d32" }
                          : { background: "rgba(15,23,42,0.05)", color: "#6b7280" }
                      }
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: c.isActive ? "#2e7d32" : "#a2a8b4" }}
                      />
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPresetCode(undefined);
                          setDialogTarget(c);
                        }}
                        className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-[#6b7280] transition hover:bg-[#f2f3f6] hover:text-[#1f2430]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => askToggleActive(c)}
                        className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-[#6b7280] transition hover:bg-[#f2f3f6] hover:text-[#1f2430]"
                      >
                        {c.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TaxHsnDialog
        target={dialogTarget}
        rates={rates}
        presetCode={presetCode}
        onClose={() => {
          setDialogTarget(undefined);
          setPresetCode(undefined);
          router.refresh();
        }}
      />
      <TaxConfirmDialog
        spec={confirm}
        onClose={() => setConfirm(null)}
        onDone={(message) => {
          fireToast({ message });
          router.refresh();
        }}
      />
    </section>
  );
}

/**
 * Codes the Item Master already uses that have no master row — the gap that
 * silently makes an invoice line fall back to the default rate.  Each row can
 * be adopted straight into the master with a rate in one click.
 */
function UnmappedPanel({
  rows,
  rates,
  onAdded,
  onOpenFull,
}: {
  rows: UnmappedHsnRow[];
  rates: TaxRateRow[];
  onAdded: () => void;
  onOpenFull: (code: string) => void;
}) {
  const activeRates = rates.filter((r) => r.isActive);
  const suggested =
    activeRates.find((r) => r.isDefault) ?? activeRates[0] ?? null;
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function adopt(code: string) {
    if (!suggested) {
      fireToast({
        message: "Add a tax rate first — there is nothing to map to.",
        type: "error",
      });
      return;
    }
    setPendingCode(code);
    startTransition(async () => {
      const res = await adoptItemHsnCode(code, suggested.id);
      setPendingCode(null);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `HSN ${code} added at ${suggested.label}.` });
      onAdded();
    });
  }

  return (
    <div className="rounded-2xl border border-[#f2d8a8] bg-[#fffaf0] p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#fdf0d5] text-[#b48200]">
          <TriangleAlert className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-extrabold text-[#7a5800]">
            {rows.length} HSN code{rows.length === 1 ? "" : "s"} on items are not
            in the master
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#8a6a1f]">
            Lines using these codes cannot resolve their own GST rate and will
            silently fall back to the default. Adopt them
            {suggested ? ` at ${suggested.label}` : ""}, or open the full form to
            set a different rate.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {rows.slice(0, 12).map((r) => (
              <li
                key={r.code}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/70 px-3 py-2"
              >
                <span className="font-bold tabular-nums text-[#1f2430]">
                  {r.code}
                </span>
                <span className="text-[12.5px] tabular-nums text-[#6b7280]">
                  {r.itemCount} item{r.itemCount === 1 ? "" : "s"}
                  {r.sampleItemCode ? ` · e.g. ${r.sampleItemCode}` : ""}
                </span>
                <span className="ml-auto inline-flex items-center gap-1">
                  <button
                    type="button"
                    disabled={pendingCode === r.code || !suggested}
                    onClick={() => adopt(r.code)}
                    className="rounded-md px-2.5 py-1 text-[12.5px] font-bold text-[#3f3f94] transition hover:bg-[#eef1fb] disabled:opacity-50"
                  >
                    {pendingCode === r.code ? "Adding…" : "Add to master"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenFull(r.code)}
                    className="rounded-md px-2.5 py-1 text-[12.5px] font-semibold text-[#6b7280] transition hover:bg-[#f2f3f6] hover:text-[#1f2430]"
                  >
                    Full form
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {rows.length > 12 && (
            <p className="mt-2 text-[12px] tabular-nums text-[#8a6a1f]">
              + {rows.length - 12} more
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
