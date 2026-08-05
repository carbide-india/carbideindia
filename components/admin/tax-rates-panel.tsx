"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { setDefaultTaxRate, setTaxRateActive } from "@/app/(admin)/admin/tax/actions";
import type { TaxRateRow } from "@/lib/queries/tax";
import {
  TaxRateDialog,
  type TaxRateDialogTarget,
} from "@/components/admin/tax-rate-dialog";
import {
  TaxConfirmDialog,
  type TaxConfirmSpec,
} from "@/components/admin/tax-confirm-dialog";

/** Percentages read better without trailing zeros: 18, 2.5, 0. */
function pctText(n: number): string {
  return `${Number(n.toFixed(3))}%`;
}

export function TaxRatesPanel({ rates }: { rates: TaxRateRow[] }) {
  const router = useRouter();
  const [dialogTarget, setDialogTarget] = useState<TaxRateDialogTarget>(undefined);
  const [confirm, setConfirm] = useState<TaxConfirmSpec | null>(null);

  const defaultRate = rates.find((r) => r.isDefault && r.isActive) ?? null;

  function askSetDefault(row: TaxRateRow) {
    setConfirm({
      title: `Make ${row.label} the default?`,
      body: `Every new quotation and invoice line will start at ${pctText(row.ratePercent)} unless its HSN code maps to something else.${
        defaultRate ? ` ${defaultRate.label} stops being the default.` : ""
      } Documents already raised are untouched.`,
      confirmLabel: "Set as default",
      successMessage: `${row.label} is now the default GST rate.`,
      tone: "brand",
      run: () => setDefaultTaxRate(row.id),
    });
  }

  function askToggleActive(row: TaxRateRow) {
    if (row.isActive) {
      setConfirm({
        title: `Deactivate ${row.label}?`,
        body: `It disappears from every rate picker. ${
          row.hsnCount > 0
            ? `${row.hsnCount} HSN code${row.hsnCount === 1 ? "" : "s"} still map to it and will fall back to the default rate. `
            : ""
        }${
          row.invoiceLineCount > 0
            ? `${row.invoiceLineCount} invoice line${row.invoiceLineCount === 1 ? "" : "s"} keep the rate they were frozen at. `
            : ""
        }Rates are never deleted, so this can be undone.`,
        confirmLabel: "Deactivate",
        successMessage: `${row.label} deactivated.`,
        tone: "danger",
        run: () => setTaxRateActive(row.id, false),
      });
      return;
    }
    setConfirm({
      title: `Reactivate ${row.label}?`,
      body: "It becomes selectable again on new quotation and invoice lines.",
      confirmLabel: "Reactivate",
      successMessage: `${row.label} reactivated.`,
      tone: "brand",
      run: () => setTaxRateActive(row.id, true),
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold text-[#1e2f66]">Rate master</h2>
          <p className="mt-1 text-[13px] text-[#6b7280]">
            {defaultRate ? (
              <>
                New quotation and invoice lines default to{" "}
                <strong className="font-bold text-[#3f3f94] tabular-nums">
                  {defaultRate.label} · {pctText(defaultRate.ratePercent)}
                </strong>
                .
              </>
            ) : (
              <span className="font-semibold text-[#d32f2f]">
                No default rate is set — new lines will have no rate until one is
                chosen.
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogTarget(null)}
          className="inline-flex h-[40px] items-center gap-2 rounded-lg bg-[#3f3f94] px-4 text-[13.5px] font-bold text-white transition hover:bg-[#2f2f6f]"
        >
          <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
          New rate
        </button>
      </div>

      {rates.length === 0 ? (
        <div className="rounded-2xl border border-[#e6e8ec] bg-white px-6 py-14 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <p className="text-[16px] font-extrabold text-[#1e2f66]">
            No GST slabs configured
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-[#6b7280]">
            Running <code className="font-mono text-[12.5px]">pnpm seed:defaults</code>{" "}
            creates the standard 0 / 5 / 12 / 18 / 28 slabs with GST 18% as the
            default. You can also add them by hand with the button above.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e6e8ec] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <table className="w-full min-w-[860px] text-[13.5px]">
            <caption className="sr-only">
              GST rate master with the CGST / SGST / IGST split and usage counts
            </caption>
            <thead>
              <tr className="border-b border-[#eceef2] bg-[#fafbfc] text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[#6b7280]">
                <th scope="col" className="px-4 py-3">
                  Label
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Total
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  CGST
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  SGST
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  IGST
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  HSN
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Inv. lines
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
              {rates.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[#f1f2f5] transition-colors last:border-b-0 hover:bg-[#fafbfc]"
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span
                        className={`font-bold ${r.isActive ? "text-[#1f2430]" : "text-[#a2a8b4]"}`}
                      >
                        {r.label}
                      </span>
                      {r.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#eef1fb] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#3f3f94]">
                          <Check size={11} strokeWidth={3} aria-hidden="true" />
                          Default
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-[#1f2430]">
                    {pctText(r.ratePercent)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#6b7280]">
                    {pctText(r.cgstPercent)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#6b7280]">
                    {pctText(r.sgstPercent)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#6b7280]">
                    {pctText(r.igstPercent)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#6b7280]">
                    {r.hsnCount || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#6b7280]">
                    {r.invoiceLineCount || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                      style={
                        r.isActive
                          ? { background: "#e8f5e9", color: "#2e7d32" }
                          : { background: "rgba(15,23,42,0.05)", color: "#6b7280" }
                      }
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: r.isActive ? "#2e7d32" : "#a2a8b4" }}
                      />
                      {r.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1">
                      {r.isActive && !r.isDefault && (
                        <button
                          type="button"
                          onClick={() => askSetDefault(r)}
                          className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-[#6b7280] transition hover:bg-[#f2f3f6] hover:text-[#3f3f94]"
                        >
                          Make default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDialogTarget(r)}
                        className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-[#6b7280] transition hover:bg-[#f2f3f6] hover:text-[#1f2430]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => askToggleActive(r)}
                        className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-[#6b7280] transition hover:bg-[#f2f3f6] hover:text-[#1f2430]"
                      >
                        {r.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TaxRateDialog
        target={dialogTarget}
        onClose={() => {
          setDialogTarget(undefined);
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
