"use client";

import { useMemo, useState } from "react";
import { Select } from "@/components/ui/select";
import { GST_STATE_NAMES } from "@/lib/data/gst";
import { computeGst } from "@/lib/gst/compute";
import { SELLER_STATE, GST_SUPPLY_TYPE_LABELS } from "@/db/enums";
import type { TaxRateRow } from "@/lib/queries/tax";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const FIELD_CLASS =
  "h-[42px] w-full rounded-lg border border-[#dfe1e6] bg-white px-3.5 text-[14px] tabular-nums text-[#1f2430] outline-none transition focus:border-[#3f3f94] focus:ring-2 focus:ring-[#3f3f94]/15";

/**
 * The CGST/SGST vs IGST question in one screen.  It is not a toy: it calls the
 * same `computeGst` that invoices and credit notes use, so whatever this shows
 * is exactly what a document raised on those inputs will carry.  Place of
 * supply is the customer's state; the pivot is the seller state (Maharashtra).
 */
export function TaxSplitExplainer({ rates }: { rates: TaxRateRow[] }) {
  const activeRates = useMemo(() => rates.filter((r) => r.isActive), [rates]);
  const initialRate =
    activeRates.find((r) => r.isDefault)?.id ?? activeRates[0]?.id ?? "";

  const [rateId, setRateId] = useState(initialRate);
  const [customerState, setCustomerState] = useState<string>(SELLER_STATE);
  const [isExport, setIsExport] = useState(false);
  const [amountText, setAmountText] = useState("100000");

  const rate = activeRates.find((r) => r.id === rateId) ?? null;
  const amount = Number(amountText);
  const taxable = Number.isFinite(amount) && amount >= 0 ? amount : 0;

  const split = computeGst({
    taxableAmount: taxable,
    ratePct: rate?.ratePercent ?? 0,
    placeOfSupply: customerState,
    isExport,
  });

  const stateOptions = useMemo(
    () => GST_STATE_NAMES.map((s) => ({ value: s, label: s })),
    [],
  );
  const rateOptions = useMemo(
    () =>
      activeRates.map((r) => ({
        value: r.id,
        label: `${r.label} · ${Number(r.ratePercent.toFixed(3))}%`,
      })),
    [activeRates],
  );

  const lines: Array<{ label: string; rate: number; amount: number; muted: boolean }> = [
    { label: "CGST", rate: split.cgstRate, amount: split.cgstAmount, muted: split.cgstAmount === 0 },
    { label: "SGST", rate: split.sgstRate, amount: split.sgstAmount, muted: split.sgstAmount === 0 },
    { label: "IGST", rate: split.igstRate, amount: split.igstAmount, muted: split.igstAmount === 0 },
  ];

  const verdict = isExport
    ? "Export / SEZ supply — zero-rated under LUT or bond. No GST is charged, but the invoice must say so."
    : split.isInterState
      ? `Place of supply is ${customerState}, outside ${SELLER_STATE} — the whole rate goes to IGST.`
      : `Place of supply is ${customerState}, the same state as the seller — the rate splits half into CGST and half into SGST.`;

  return (
    <section className="rounded-2xl border border-[#e6e8ec] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-4">
        <h2 className="text-[15px] font-extrabold text-[#1e2f66]">
          CGST + SGST or IGST?
        </h2>
        <p className="mt-1 text-[12.5px] text-[#6b7280]">
          Driven by the customer&rsquo;s state against ours. Uses the same
          calculation as real invoices.
        </p>
      </div>

      {activeRates.length === 0 ? (
        <p className="rounded-lg border border-[#f2d8a8] bg-[#fffaf0] px-4 py-3 text-[13px] font-semibold text-[#8a6a1f]">
          Add at least one active tax rate to try the split.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="tax-explainer-amount"
                className="text-[12.5px] font-bold text-[#3a4152]"
              >
                Taxable value
              </label>
              <input
                id="tax-explainer-amount"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-bold text-[#3a4152]">GST rate</span>
              <Select
                options={rateOptions}
                value={rateId}
                onValueChange={setRateId}
                ariaLabel="GST rate"
                placeholder="Pick a rate"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-bold text-[#3a4152]">
                Customer state (place of supply)
              </span>
              <Select
                options={stateOptions}
                value={customerState}
                onValueChange={setCustomerState}
                searchable
                disabled={isExport}
                ariaLabel="Customer state / place of supply"
                placeholder="Pick a state"
              />
            </div>
          </div>

          <label className="mt-4 inline-flex items-center gap-2.5 text-[13px] font-semibold text-[#3a4152]">
            <input
              type="checkbox"
              checked={isExport}
              onChange={(e) => setIsExport(e.target.checked)}
              className="size-4 accent-[#3f3f94]"
            />
            Export / SEZ customer (zero-rated)
          </label>

          <div className="mt-5 overflow-hidden rounded-xl border border-[#eceef2]">
            <table className="w-full text-[13.5px]">
              <caption className="sr-only">
                GST split for the entered taxable value
              </caption>
              <tbody>
                <tr className="border-b border-[#f1f2f5] bg-[#fafbfc]">
                  <th scope="row" className="px-4 py-2.5 text-left font-bold text-[#6b7280]">
                    Supply type
                  </th>
                  <td className="px-4 py-2.5 text-right font-bold text-[#3f3f94]">
                    {GST_SUPPLY_TYPE_LABELS[split.supplyType]}
                  </td>
                </tr>
                <tr className="border-b border-[#f1f2f5]">
                  <th scope="row" className="px-4 py-2.5 text-left font-semibold text-[#6b7280]">
                    Taxable value
                  </th>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#1f2430]">
                    {inr.format(split.taxableAmount)}
                  </td>
                </tr>
                {lines.map((l) => (
                  <tr key={l.label} className="border-b border-[#f1f2f5]">
                    <th
                      scope="row"
                      className={`px-4 py-2.5 text-left font-semibold tabular-nums ${l.muted ? "text-[#c2c7d0]" : "text-[#6b7280]"}`}
                    >
                      {l.label} @ {Number(l.rate.toFixed(3))}%
                    </th>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${l.muted ? "text-[#c2c7d0]" : "font-semibold text-[#1f2430]"}`}
                    >
                      {inr.format(l.amount)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#fafbfc]">
                  <th scope="row" className="px-4 py-3 text-left font-extrabold text-[#1e2f66]">
                    Invoice total
                  </th>
                  <td className="px-4 py-3 text-right text-[15px] font-extrabold tabular-nums text-[#1e2f66]">
                    {inr.format(split.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p
            aria-live="polite"
            className="mt-3 text-[12.5px] leading-relaxed text-[#6b7280]"
          >
            {verdict}
          </p>
        </>
      )}
    </section>
  );
}
