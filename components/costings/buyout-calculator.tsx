"use client";

import * as React from "react";
import { Check, Gauge, History, Plus, Trash2, Truck, Wallet, X } from "lucide-react";
import type { VendorOption, VendorHistory } from "@/lib/queries/vendors";
import { compareVendors, type VendorQuoteLike, type CriterionRank } from "@/lib/costing/compare";
import { Select, type SelectOption } from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/money-input";
import { Field, GroupHeader, Segmented } from "@/components/inquiries/form-field";
import { VendorQuickCreateModal } from "@/components/costings/vendor-quick-create-modal";
import { useKeyboardForm } from "@/components/forms/use-keyboard-form";
import { cn } from "@/lib/utils";

/**
 * Buy-Out (bought-out) costing calculator — self-contained, fully controlled.
 *
 * Single-vendor is the PRIMARY flow; a multi-vendor comparison layer (up to 5
 * competing quotes) sits on top. Each competing vendor now carries its OWN set of
 * commercial terms (Quantity Tolerance, Payment Terms, Delivery Time, Price
 * Validity) — captured on the vendor's input card and persisted per quote. A
 * prominent decision panel ranks the vendors on three business scenarios —
 * Standard (lowest landed cost), Urgency (fastest lead) and Cash Crunch (best
 * credit) — each with a one-click "Use this vendor". Because the vendor is chosen
 * LAST, that decision panel ({@link BuyoutDecisionPanel}) is rendered at the very
 * bottom of the Bought-Out flow (after the input cards + shared notes), not the
 * top. The comparison + ranking is delegated to the pure `compareVendors` engine
 * (lib/costing/compare.ts), the single source of truth for the landed-cost
 * formula:  landed = unitPrice + unitPrice·OH + dev (+ freight/qty; no freight
 * input here, so that term is 0).
 *
 * Per spec §8 the vendor's FINAL cost that feeds the quotation is
 *   Final = Vendor Cost/piece + OH% + Development Cost/piece   (no OH on dev).
 * Sintered price is NEVER used for a bought-out / traded item.
 *
 * Pure UI: this component never touches saveCosting / the schema / any route. It
 * exposes a clean {@link BuyoutValue} + `onChange` contract; the parent maps it
 * onto the persisted vendorQuotes array.
 *
 * Keyboard-first: Enter advances to the next field (useKeyboardForm), every
 * control is reachable and operable from the keyboard, and the quick-create modal
 * traps focus.
 */

const BORDER = "#b7bcd2";
const DIVIDE = "#c6cbdd";
const INDIGO = "#3f3f94";

/** Sentinel option value: opening the "+ New Vendor" quick-create modal. */
const NEW_VENDOR = "__new_vendor__";

/** Hard cap on competing vendor quotes (spec §8: "up to 5 vendors"). */
export const MAX_BUYOUT_VENDORS = 5;

/** days / weeks unit choices for the per-vendor duration fields. */
const DURATION_UNITS: readonly { value: DurationUnit; label: string }[] = [
  { value: "days", label: "days" },
  { value: "weeks", label: "weeks" },
];
type DurationUnit = "days" | "weeks";

/**
 * A machining-option (Admin Master) shaped for a picker. Accepted as a prop for
 * contract symmetry with the In-House calculator; Buy-Out itself does not machine
 * in-house, so this component does not consume it.
 */
export interface MachiningOption {
  id: string;
  label: string;
}

/** An Admin-Master option (Payment Terms / Quantity Tolerance) shaped for a picker. */
export interface CommercialMasterOption {
  id: string;
  name: string;
}

/**
 * One competing vendor row. Numeric fields are held as raw input STRINGS (""
 * = empty) so each control stays fully controlled; `vendorOhPct` is a PERCENT
 * (e.g. "35" ⇒ 35%), converted to a fraction only at compute time.
 */
export interface BuyoutVendorRow {
  /** Stable client-generated key — React identity + selection handle. */
  key: string;
  /** Vendor Master id once picked; null while unset. */
  vendorId: string | null;
  /** Snapshot of the vendor's display name at pick time. */
  vendorName: string;
  /** Vendor code (VN-####) autofilled from the master; null until picked. */
  vendorCode: string | null;
  /** Vendor Cost per piece (₹). */
  unitPrice: string;
  /** Vendor Overhead as a PERCENT (e.g. "35" = 35%). No OH is applied to dev. */
  vendorOhPct: string;
  /** Development Cost per piece (₹) — levied without overhead. */
  developmentCost: string;
  /** Lead time in days. */
  leadTimeDays: string;
  /** Credit period in days (autofilled from the vendor's default). */
  creditPeriodDays: string;
  /** Payment terms label autofilled from the master (carried for the quote). */
  paymentTerms: string | null;
  /** Payment Terms master-option id (per-vendor commercial term); "" = unset. */
  paymentTermsId: string;
  /** Quantity Tolerance master-option id (per-vendor commercial term); "" = unset. */
  quantityToleranceId: string;
  /** Delivery time amount (raw string); pairs with {@link deliveryTimeUnit}. */
  deliveryTime: string;
  /** Delivery time unit. */
  deliveryTimeUnit: DurationUnit;
  /** Price-validity amount (raw string); pairs with {@link validityUnit}. */
  validity: string;
  /** Price-validity unit. */
  validityUnit: DurationUnit;
  /** URL to the vendor's uploaded quote. */
  quoteLink: string;
  /** Free-text notes for this quote. */
  notes: string;
}

/** The Buy-Out calculator's full controlled value. */
export interface BuyoutValue {
  /** Competing vendor rows (1–5). */
  vendors: BuyoutVendorRow[];
  /** `key` of the selected vendor whose Final cost feeds the quotation; null = none. */
  selectedKey: string | null;
}

interface Props {
  value: BuyoutValue;
  onChange: (value: BuyoutValue) => void;
  /** Active vendors from the Vendor Master (drives every row's picker). */
  vendorOptions: VendorOption[];
  /** Admin-Master machining options — accepted for contract symmetry, unused here. */
  machiningOptions?: MachiningOption[];
  /** Payment Terms master options for the per-vendor dropdown. */
  paymentTermOptions?: CommercialMasterOption[];
  /** Quantity Tolerance master options for the per-vendor dropdown. */
  quantityToleranceOptions?: CommercialMasterOption[];
}

let rowSeq = 0;
/** A fresh, stable-enough key for a new row (crypto.randomUUID when available). */
function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  rowSeq += 1;
  return `bo-${Date.now()}-${rowSeq}`;
}

/** A blank vendor row (a fresh, empty per-vendor commercial-terms set included). */
export function emptyBuyoutVendorRow(): BuyoutVendorRow {
  return {
    key: newKey(),
    vendorId: null,
    vendorName: "",
    vendorCode: null,
    unitPrice: "",
    vendorOhPct: "",
    developmentCost: "",
    leadTimeDays: "",
    creditPeriodDays: "",
    paymentTerms: null,
    paymentTermsId: "",
    quantityToleranceId: "",
    deliveryTime: "",
    deliveryTimeUnit: "days",
    validity: "",
    validityUnit: "days",
    quoteLink: "",
    notes: "",
  };
}

/** A one-row starter value. */
export function emptyBuyoutValue(): BuyoutValue {
  const row = emptyBuyoutVendorRow();
  return { vendors: [row], selectedKey: row.key };
}

/** Parse a raw input string to a finite number, else 0. */
function n(v: string): number {
  if (v.trim() === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Parse an integer-day field to number | null (null when blank/invalid). */
function intOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? Math.trunc(x) : null;
}

/** Final Cost per piece (spec §8) = unitPrice + unitPrice·(OH%/100) + dev. */
export function buyoutFinalCost(row: BuyoutVendorRow): number {
  const unit = n(row.unitPrice);
  const oh = n(row.vendorOhPct) / 100;
  const dev = n(row.developmentCost);
  return unit + unit * oh + dev;
}

/** True when the row carries a real vendor cost (blank rows drop out of ranking). */
function hasCost(row: BuyoutVendorRow): boolean {
  return row.unitPrice.trim() !== "" && Number.isFinite(Number(row.unitPrice));
}

const money = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v)
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(v);

/** Per-rank chip styling. L1 = indigo solid, L2 = indigo tint, L3 = subtle outline. */
const RANK_CHIP: Record<1 | 2 | 3, string> = {
  1: "bg-[#3f3f94] text-white",
  2: "bg-[#e7e9f6] text-[#3f3f94]",
  3: "border border-[#c6cbdd] text-ink-subtle",
};

/**
 * A tiny L1/L2/L3 tag marking a vendor's top-3 placement on one criterion.
 * Renders nothing when the vendor is outside that criterion's top 3.
 */
function RankChip({ rank }: { rank: CriterionRank }) {
  if (rank == null) return null;
  return (
    <span
      className={cn(
        "ml-1 inline-flex items-center rounded px-1 py-px align-middle text-[9.5px] font-bold leading-none tabular-nums",
        RANK_CHIP[rank],
      )}
      title={`Ranks L${rank} on this criterion`}
    >
      L{rank}
    </span>
  );
}

/**
 * Per-vendor composite badge: "N/3" = how many of the three criteria (cost /
 * delivery / credit) the vendor places top-3 in. 3/3 is a strong all-round pick
 * (green), 2/3 is notable (amber); 0–1/3 is hidden to avoid clutter. Decision
 * support only — it never changes the auto-suggested (cheapest) pick.
 */
function CompositeBadge({ score }: { score: number }) {
  if (score >= 3) {
    return (
      <span className="inline-flex items-center rounded-full bg-[#e3f4e8] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#2e7d46]">
        3/3 · all-round
      </span>
    );
  }
  if (score === 2) {
    return (
      <span className="inline-flex items-center rounded-full bg-[#fdf1dd] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#9a6a12]">
        2/3
      </span>
    );
  }
  return null;
}

/**
 * Build the pure-engine quote shape from the controlled rows. freight has no
 * input here, so qty is immaterial — callers pass 1. Rows without a vendor cost
 * are excluded from the cheapest axis by compareVendors itself.
 */
function toQuotes(vendors: BuyoutVendorRow[]): VendorQuoteLike[] {
  return vendors.map((r) => ({
    id: r.key,
    unitPrice: hasCost(r) ? n(r.unitPrice) : null,
    vendorOhPct: n(r.vendorOhPct) / 100,
    developmentCost: n(r.developmentCost),
    leadTimeDays: intOrNull(r.leadTimeDays),
    creditPeriodDays: intOrNull(r.creditPeriodDays),
  }));
}

/**
 * The Buy-Out INPUT surface: the per-vendor cards (each with its own commercial
 * terms) + the Add-vendor button + the vendor quick-create modal. The ranking /
 * decision UI is a separate {@link BuyoutDecisionPanel} rendered at the bottom of
 * the flow — the vendor is chosen LAST.
 */
export function BuyoutCalculator({
  value,
  onChange,
  vendorOptions,
  paymentTermOptions = [],
  quantityToleranceOptions = [],
}: Props) {
  const { vendors, selectedKey } = value;

  // Vendors created inline via the quick-create modal — merged into the picker
  // options so a freshly-added vendor is pickable in every row.
  const [extraVendors, setExtraVendors] = React.useState<VendorOption[]>([]);
  // Which row's picker opened the modal (so onCreated targets the right row).
  const [modalRowKey, setModalRowKey] = React.useState<string | null>(null);

  const allVendorOptions = React.useMemo(() => {
    const seen = new Set(vendorOptions.map((v) => v.id));
    return [...vendorOptions, ...extraVendors.filter((v) => !seen.has(v.id))];
  }, [vendorOptions, extraVendors]);

  const vendorById = React.useMemo(() => {
    const m = new Map<string, VendorOption>();
    for (const v of allVendorOptions) m.set(v.id, v);
    return m;
  }, [allVendorOptions]);

  const pickerOptions: SelectOption[] = React.useMemo(
    () => [
      ...allVendorOptions.map((v) => ({
        value: v.id,
        label: v.vendorCode ? `${v.name} · ${v.vendorCode}` : v.name,
      })),
      { value: NEW_VENDOR, label: "+ New Vendor" },
    ],
    [allVendorOptions],
  );

  const paymentTermSelect: SelectOption[] = React.useMemo(
    () => paymentTermOptions.map((o) => ({ value: o.id, label: o.name })),
    [paymentTermOptions],
  );
  const quantityToleranceSelect: SelectOption[] = React.useMemo(
    () => quantityToleranceOptions.map((o) => ({ value: o.id, label: o.name })),
    [quantityToleranceOptions],
  );
  // Vendor's default payment-terms LABEL → master-option id, for the prefill.
  const paymentTermIdByLabel = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const o of paymentTermOptions) m.set(o.name.trim().toLowerCase(), o.id);
    return m;
  }, [paymentTermOptions]);

  // ── mutations ────────────────────────────────────────────────────────────
  const patchRow = (key: string, patch: Partial<BuyoutVendorRow>) => {
    onChange({
      ...value,
      vendors: vendors.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    });
  };

  const addRow = () => {
    if (vendors.length >= MAX_BUYOUT_VENDORS) return;
    const row = emptyBuyoutVendorRow();
    onChange({
      vendors: [...vendors, row],
      selectedKey: selectedKey ?? row.key,
    });
  };

  const removeRow = (key: string) => {
    if (vendors.length <= 1) return;
    const next = vendors.filter((r) => r.key !== key);
    onChange({
      vendors: next,
      selectedKey: selectedKey === key ? (next[0]?.key ?? null) : selectedKey,
    });
  };

  const selectRow = (key: string) => onChange({ ...value, selectedKey: key });

  /** Autofill a row from a picked vendor (code / credit / terms + payment-terms prefill). */
  const applyVendor = (key: string, v: VendorOption) => {
    const patch: Partial<BuyoutVendorRow> = {
      vendorId: v.id,
      vendorName: v.name,
      vendorCode: v.vendorCode,
      creditPeriodDays: v.defaultCreditDays != null ? String(v.defaultCreditDays) : "",
      paymentTerms: v.paymentTerms,
    };
    // Nice-to-have: prefill the Payment Terms dropdown from the vendor's default
    // when that default matches a master option (only when we find a match, so a
    // user's own selection is never cleared).
    const ptId = v.paymentTerms
      ? paymentTermIdByLabel.get(v.paymentTerms.trim().toLowerCase())
      : undefined;
    if (ptId) patch.paymentTermsId = ptId;
    patchRow(key, patch);
  };

  const onPickVendor = (key: string, optionValue: string) => {
    if (optionValue === NEW_VENDOR) {
      setModalRowKey(key);
      return;
    }
    const v = vendorById.get(optionValue);
    if (v) applyVendor(key, v);
  };

  const onVendorCreated = (v: VendorOption) => {
    setExtraVendors((prev) => (prev.some((p) => p.id === v.id) ? prev : [...prev, v]));
    if (modalRowKey) applyVendor(modalRowKey, v);
    setModalRowKey(null);
  };

  const { containerProps } = useKeyboardForm();

  return (
    <div className="flex flex-col gap-4" {...containerProps}>
      {/* ── Per-vendor input cards (each with its own commercial terms) ──── */}
      {vendors.map((r, i) => {
        const isSel = selectedKey === r.key;
        return (
          <section
            key={r.key}
            className="rounded-section border-2 bg-surface-card p-5"
            style={{ borderColor: isSel ? INDIGO : BORDER }}
          >
            <GroupHeader
              n={i + 1}
              label={r.vendorName || `Vendor ${i + 1}`}
              leftAction={
                isSel ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                    style={{ background: INDIGO }}
                  >
                    <Check size={11} strokeWidth={3} /> Selected
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => selectRow(r.key)}
                    className="rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold text-ink-muted transition-colors hover:border-[#3f3f94] hover:text-[#3f3f94]"
                    style={{ borderColor: DIVIDE }}
                  >
                    Use this vendor
                  </button>
                )
              }
              action={
                vendors.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(r.key)}
                    aria-label={`Remove ${r.vendorName || `Vendor ${i + 1}`}`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-[#fdeaea] hover:text-[#D32F2F]"
                  >
                    <Trash2 size={16} strokeWidth={2.1} />
                  </button>
                ) : undefined
              }
            />

            <div className="mt-4 flex flex-col gap-4">
              {/* Vendor picker + code */}
              <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                <Field id={`bo-vendor-${r.key}`} label="Vendor" labelOnly>
                  <Select
                    id={`bo-vendor-${r.key}`}
                    value={r.vendorId ?? ""}
                    onValueChange={(v) => onPickVendor(r.key, v)}
                    options={pickerOptions}
                    placeholder="Select or add a vendor"
                    ariaLabel="Vendor"
                  />
                </Field>
                <Field id={`bo-code-${r.key}`} label="Vendor Code">
                  <input
                    id={`bo-code-${r.key}`}
                    type="text"
                    readOnly
                    value={r.vendorCode ?? ""}
                    placeholder="Auto (VN-####)"
                    className="nt-input bg-[#f6f7fb] text-ink-muted"
                    aria-label="Vendor code"
                  />
                </Field>
              </div>

              {/* Historical quoting metrics for the picked vendor (derived from
                  past BO quotes; hidden when the vendor is new / unquoted). */}
              {r.vendorId && (
                <VendorHistoryLine
                  history={vendorById.get(r.vendorId)?.history ?? null}
                />
              )}

              {/* Cost / OH / Dev / Lead / Credit / Quote — dense single line */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 max-md:grid-cols-1">
                <Field id={`bo-unit-${r.key}`} label="Vendor Cost / piece" required>
                  <MoneyInput
                    id={`bo-unit-${r.key}`}
                    value={r.unitPrice}
                    onChange={(e) => patchRow(r.key, { unitPrice: e.target.value })}
                  />
                </Field>
                <Field id={`bo-oh-${r.key}`} label="Vendor Overhead %">
                  <div className="relative w-full">
                    <input
                      id={`bo-oh-${r.key}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={r.vendorOhPct}
                      onChange={(e) => patchRow(r.key, { vendorOhPct: e.target.value })}
                      placeholder="e.g. 35"
                      className="nt-input w-full tabular-nums"
                      style={{ paddingRight: 30 }}
                    />
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink-subtle">
                      %
                    </span>
                  </div>
                </Field>
                <Field id={`bo-dev-${r.key}`} label="Development Cost / piece">
                  <MoneyInput
                    id={`bo-dev-${r.key}`}
                    value={r.developmentCost}
                    onChange={(e) => patchRow(r.key, { developmentCost: e.target.value })}
                  />
                </Field>
                <Field id={`bo-lead-${r.key}`} label="Lead Time (days)">
                  <input
                    id={`bo-lead-${r.key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={r.leadTimeDays}
                    onChange={(e) => patchRow(r.key, { leadTimeDays: e.target.value })}
                    placeholder="e.g. 30"
                    className="nt-input w-full tabular-nums"
                  />
                </Field>
                <Field id={`bo-credit-${r.key}`} label="Credit Period (days)">
                  <input
                    id={`bo-credit-${r.key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={r.creditPeriodDays}
                    onChange={(e) => patchRow(r.key, { creditPeriodDays: e.target.value })}
                    placeholder="e.g. 45"
                    className="nt-input w-full tabular-nums"
                  />
                </Field>
                <Field id={`bo-link-${r.key}`} label="Vendor Quote Link">
                  <input
                    id={`bo-link-${r.key}`}
                    type="url"
                    value={r.quoteLink}
                    onChange={(e) => patchRow(r.key, { quoteLink: e.target.value })}
                    placeholder="https://"
                    className="nt-input w-full"
                  />
                </Field>
              </div>

              {/* Per-vendor COMMERCIAL TERMS — each competing vendor has its own. */}
              <div
                className="flex flex-col gap-3 rounded-[12px] px-4 py-3.5"
                style={{ border: `1.5px dashed ${DIVIDE}`, background: "#fafbff" }}
              >
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                  Commercial Terms · for this vendor
                </span>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 max-md:grid-cols-1">
                  <Field id={`bo-qtol-${r.key}`} label="Quantity Tolerance" labelOnly>
                    <Select
                      ariaLabel="Quantity tolerance"
                      value={r.quantityToleranceId}
                      onValueChange={(v) => patchRow(r.key, { quantityToleranceId: v })}
                      options={quantityToleranceSelect}
                      placeholder={
                        quantityToleranceSelect.length === 0
                          ? "No options in master"
                          : "Select tolerance"
                      }
                      disabled={quantityToleranceSelect.length === 0}
                    />
                  </Field>
                  <Field id={`bo-pterm-${r.key}`} label="Payment Terms" labelOnly>
                    <Select
                      ariaLabel="Payment terms"
                      value={r.paymentTermsId}
                      onValueChange={(v) => patchRow(r.key, { paymentTermsId: v })}
                      options={paymentTermSelect}
                      placeholder={
                        paymentTermSelect.length === 0
                          ? "No options in master"
                          : "Select payment terms"
                      }
                      disabled={paymentTermSelect.length === 0}
                      searchable
                      searchPlaceholder="Search payment terms"
                    />
                  </Field>
                  <VendorDurationField
                    label="Delivery Time"
                    idBase={`bo-deliv-${r.key}`}
                    amount={r.deliveryTime}
                    unit={r.deliveryTimeUnit}
                    onAmount={(deliveryTime) => patchRow(r.key, { deliveryTime })}
                    onUnit={(deliveryTimeUnit) => patchRow(r.key, { deliveryTimeUnit })}
                  />
                  <VendorDurationField
                    label="Price Validity"
                    idBase={`bo-valid-${r.key}`}
                    amount={r.validity}
                    unit={r.validityUnit}
                    onAmount={(validity) => patchRow(r.key, { validity })}
                    onUnit={(validityUnit) => patchRow(r.key, { validityUnit })}
                  />
                </div>
              </div>

              {/* Per-vendor final cost. Notes live once per costing at the
                  bottom (shared Technical + Commercial), not per vendor. */}
              <div
                className="flex flex-col justify-center rounded-[12px] px-4 py-3 sm:w-[240px]"
                style={{
                  border: `2px solid ${INDIGO}`,
                  background: hasCost(r)
                    ? "#FFFFFF"
                    : "#f4f6fd",
                  boxShadow: hasCost(r)
                    ? "0 6px 18px -8px rgba(63,63,148,0.5)"
                    : "none",
                }}
              >
                <span
                  className="text-[11px] font-black uppercase tracking-[0.07em]"
                  style={{ color: INDIGO }}
                >
                  Final Cost / piece
                </span>
                <span
                  className="mt-1 font-mono text-[22px] font-black tabular-nums"
                  style={{ color: INDIGO }}
                >
                  {hasCost(r) ? money(buyoutFinalCost(r)) : "—"}
                </span>
              </div>
            </div>
          </section>
        );
      })}

      {vendors.length < MAX_BUYOUT_VENDORS && (
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center justify-center gap-1.5 self-start rounded-pill border-2 border-dashed px-4 py-2.5 text-[13.5px] font-bold text-ink-muted transition-colors hover:border-[#3f3f94] hover:text-[#3f3f94]"
          style={{ borderColor: DIVIDE }}
        >
          <Plus size={16} strokeWidth={2.4} /> Add vendor ({vendors.length}/{MAX_BUYOUT_VENDORS})
        </button>
      )}

      <VendorQuickCreateModal
        open={modalRowKey !== null}
        onClose={() => setModalRowKey(null)}
        onCreated={onVendorCreated}
      />
    </div>
  );
}

/**
 * The "WHICH VENDOR?" decision panel — the three scenario tiles (Standard /
 * Urgency / Cash Crunch), the live landed-cost comparison table (L1–L3 ranks,
 * N/3 composite badge, cheapest / fastest / best-credit) and the Selected Final
 * Cost readout. Rendered at the BOTTOM of the Bought-Out flow, after the vendor
 * input cards and the shared notes, since the vendor is chosen last. Operates on
 * the same controlled {@link BuyoutValue} as {@link BuyoutCalculator}.
 */
export function BuyoutDecisionPanel({
  value,
  onChange,
}: {
  value: BuyoutValue;
  onChange: (value: BuyoutValue) => void;
}) {
  const { vendors, selectedKey } = value;

  const quotes = React.useMemo(() => toQuotes(vendors), [vendors]);
  const comparison = React.useMemo(() => compareVendors(quotes, 1), [quotes]);

  const rowByKey = React.useCallback(
    (k: string | null) => (k ? vendors.find((r) => r.key === k) ?? null : null),
    [vendors],
  );
  const selectRow = (key: string) => onChange({ ...value, selectedKey: key });

  const selectedRow = rowByKey(selectedKey);
  const selectedFinal = selectedRow ? buyoutFinalCost(selectedRow) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Scenario dashboard ─────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-section border-2 border-[#b7bcd2] bg-surface-card">
        <div
          className="flex items-center gap-2.5 px-4 py-2.5"
          style={{ borderBottom: `1px solid ${DIVIDE}`, background: "#e7e9f6" }}
        >
          <span className="h-3.5 w-1.5 shrink-0 rounded-full" style={{ background: INDIGO }} />
          <span
            className="text-[12px] font-black uppercase tracking-[0.1em]"
            style={{ color: INDIGO }}
          >
            Which vendor?
          </span>
          <span className="ml-auto text-[12px] font-semibold text-ink-subtle">
            {vendors.length} of {MAX_BUYOUT_VENDORS} vendors
          </span>
        </div>
        <div className="grid grid-cols-1 divide-y divide-[#c6cbdd] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <ScenarioChip
            icon={<Gauge size={15} strokeWidth={2.3} />}
            title="Standard"
            subtitle="Lowest cost"
            row={rowByKey(comparison.cheapestId)}
            metric={
              comparison.cheapestId != null
                ? money(comparison.byId[comparison.cheapestId])
                : null
            }
            metricLabel="landed / pc"
            selected={selectedKey === comparison.cheapestId}
            onUse={comparison.cheapestId ? () => selectRow(comparison.cheapestId!) : undefined}
          />
          <ScenarioChip
            icon={<Truck size={15} strokeWidth={2.3} />}
            title="Urgency"
            subtitle="Fastest lead time"
            row={rowByKey(comparison.fastestId)}
            metric={
              comparison.fastestId != null
                ? `${intOrNull(rowByKey(comparison.fastestId)?.leadTimeDays ?? "")} days`
                : null
            }
            metricLabel="lead time"
            selected={selectedKey === comparison.fastestId}
            onUse={comparison.fastestId ? () => selectRow(comparison.fastestId!) : undefined}
          />
          <ScenarioChip
            icon={<Wallet size={15} strokeWidth={2.3} />}
            title="Cash Crunch"
            subtitle="Best credit"
            row={rowByKey(comparison.bestCreditId)}
            metric={
              comparison.bestCreditId != null
                ? `${intOrNull(rowByKey(comparison.bestCreditId)?.creditPeriodDays ?? "")} days`
                : null
            }
            metricLabel="credit"
            selected={selectedKey === comparison.bestCreditId}
            onUse={
              comparison.bestCreditId ? () => selectRow(comparison.bestCreditId!) : undefined
            }
          />
        </div>
      </div>

      {/* ── Live landed-cost table ─────────────────────────────────────── */}
      <div className="overflow-hidden rounded-section border-2 border-[#b7bcd2] bg-surface-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr
                className="text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle"
                style={{ background: "#f3f4fb", borderBottom: `1px solid ${DIVIDE}` }}
              >
                <th className="px-3 py-2.5 font-bold">Use</th>
                <th className="px-3 py-2.5 font-bold">Vendor</th>
                <th className="px-3 py-2.5 text-right font-bold">Cost / pc</th>
                <th className="px-3 py-2.5 text-right font-bold">OH %</th>
                <th className="px-3 py-2.5 text-right font-bold">Dev / pc</th>
                <th className="px-3 py-2.5 text-right font-bold">Landed / pc</th>
                <th className="px-3 py-2.5 text-right font-bold">Lead</th>
                <th className="px-3 py-2.5 text-right font-bold">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c6cbdd]">
              {vendors.map((r, i) => {
                const landed = comparison.byId[r.key];
                const cheapest = comparison.cheapestId === r.key;
                const isSel = selectedKey === r.key;
                const ranks = comparison.ranks[r.key];
                const score = comparison.topThreeScore[r.key] ?? 0;
                return (
                  <tr
                    key={r.key}
                    className={cn("transition-colors", isSel && "bg-[#eef7f0]")}
                  >
                    <td className="px-3 py-2.5">
                      <label className="flex cursor-pointer items-center">
                        <input
                          type="radio"
                          name="buyout-selected"
                          checked={isSel}
                          onChange={() => selectRow(r.key)}
                          aria-label={`Use ${r.vendorName || `Vendor ${i + 1}`}`}
                          className="h-4 w-4 accent-[#3f3f94]"
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-ink-strong">
                          {r.vendorName || `Vendor ${i + 1}`}
                        </span>
                        {cheapest && hasCost(r) && (
                          <span className="rounded-full bg-[#e3f4e8] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#2e7d46]">
                            Cheapest
                          </span>
                        )}
                        <CompositeBadge score={score} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-strong">
                      {hasCost(r) ? money(n(r.unitPrice)) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                      {r.vendorOhPct.trim() === "" ? "—" : `${n(r.vendorOhPct)}%`}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                      {r.developmentCost.trim() === "" ? "—" : money(n(r.developmentCost))}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-mono font-bold tabular-nums",
                        cheapest && hasCost(r) ? "text-[#2e7d46]" : "text-ink-strong",
                      )}
                    >
                      <span className="whitespace-nowrap">
                        {hasCost(r) ? money(landed) : "—"}
                        <RankChip rank={ranks?.costRank ?? null} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                      <span className="whitespace-nowrap">
                        {intOrNull(r.leadTimeDays) == null ? "—" : `${intOrNull(r.leadTimeDays)}d`}
                        <RankChip rank={ranks?.deliveryRank ?? null} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                      <span className="whitespace-nowrap">
                        {intOrNull(r.creditPeriodDays) == null
                          ? "—"
                          : `${intOrNull(r.creditPeriodDays)}d`}
                        <RankChip rank={ranks?.creditRank ?? null} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Selected Final Cost readout — the number that feeds the quotation. */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          style={{ borderTop: `1px solid ${DIVIDE}`, background: "#f8f9fd" }}
        >
          <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
            Selected Final Cost
            <span className="ml-1.5 font-normal normal-case tracking-normal text-ink-subtle">
              (Vendor Cost + OH% + Dev)
            </span>
          </span>
          <span className="font-mono text-[20px] font-bold tabular-nums" style={{ color: INDIGO }}>
            {selectedFinal != null ? `${money(selectedFinal)} / pc` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** A number box + a days/weeks unit segmented control, for a per-vendor duration. */
function VendorDurationField({
  label,
  idBase,
  amount,
  unit,
  onAmount,
  onUnit,
}: {
  label: string;
  idBase: string;
  amount: string;
  unit: DurationUnit;
  onAmount: (v: string) => void;
  onUnit: (v: DurationUnit) => void;
}) {
  return (
    <Field id={idBase} label={label} labelOnly>
      {/* Number on top, a full-width days/weeks toggle below — stacked so the
          unit control never wraps and spills out of a narrow grid column. */}
      <div className="flex flex-col gap-1.5">
        <input
          id={idBase}
          type="number"
          inputMode="numeric"
          min={0}
          step="any"
          className="nt-input w-full min-w-0 tabular-nums"
          placeholder="0"
          aria-label={`${label} amount`}
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
        />
        <Segmented
          options={DURATION_UNITS}
          value={unit}
          onChange={(v) => v && onUnit(v)}
          allowClear={false}
          ariaLabel={`${label} unit`}
          size="lg"
          activeTone="brand"
        />
      </div>
    </Field>
  );
}

/**
 * Subtle one-line history readout for a picked vendor — "Quoted N× · last ₹X ·
 * avg ₹Y", derived up front from past BO quotes (VendorOption.history). Renders
 * nothing when there's no history yet, so it never clutters a first-time vendor.
 */
function VendorHistoryLine({ history }: { history: VendorHistory | null }) {
  if (!history || history.timesQuoted <= 0) return null;
  const { timesQuoted, lastUnitPrice, avgUnitPrice } = history;
  return (
    <div className="-mt-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-subtle">
      <History size={12} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
      <span className="tabular-nums">
        Quoted{" "}
        <span className="font-semibold text-ink-muted">
          {timesQuoted}
          {"×"}
        </span>
        {lastUnitPrice != null && (
          <>
            {" · last "}
            <span className="font-semibold text-ink-muted">{money(lastUnitPrice)}</span>
          </>
        )}
        {avgUnitPrice != null && (
          <>
            {" · avg "}
            <span className="font-semibold text-ink-muted">{money(avgUnitPrice)}</span>
          </>
        )}
      </span>
    </div>
  );
}

/** One scenario tile in the decision-panel dashboard. */
function ScenarioChip({
  icon,
  title,
  subtitle,
  row,
  metric,
  metricLabel,
  selected,
  onUse,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  row: BuyoutVendorRow | null;
  metric: string | null;
  metricLabel: string;
  selected: boolean;
  onUse?: () => void;
}) {
  const has = row != null && metric != null;
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
          style={{ background: "#454595" }}
        >
          {icon}
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-extrabold tracking-tight text-ink-strong">
            {title}
          </span>
          <span className="text-[11px] font-semibold text-ink-subtle">{subtitle}</span>
        </div>
      </div>

      {has ? (
        <>
          <div className="flex flex-col">
            <span className="truncate text-[14px] font-bold text-ink-strong">
              {row.vendorName || "Unnamed vendor"}
            </span>
            <span className="font-mono text-[15px] font-bold tabular-nums" style={{ color: INDIGO }}>
              {metric}
              <span className="ml-1 font-sans text-[11px] font-medium text-ink-subtle">
                {metricLabel}
              </span>
            </span>
          </div>
          {selected ? (
            <span
              className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white"
              style={{ background: INDIGO }}
            >
              <Check size={13} strokeWidth={3} /> In use
            </span>
          ) : (
            <button
              type="button"
              onClick={onUse}
              className="inline-flex items-center justify-center rounded-lg border-[1.5px] px-3 py-1.5 text-[12px] font-bold text-[#3f3f94] transition-colors hover:bg-[#efeffb]"
              style={{ borderColor: INDIGO }}
            >
              Use this vendor
            </button>
          )}
        </>
      ) : (
        <div className="flex items-center gap-1.5 py-1 text-[12.5px] text-ink-subtle">
          <X size={13} strokeWidth={2.2} /> No vendor qualifies yet
        </div>
      )}
    </div>
  );
}
