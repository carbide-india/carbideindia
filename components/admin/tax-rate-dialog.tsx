"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { fireToast } from "@/lib/toast";
import { deriveSplit } from "@/lib/validators/tax";
import { createTaxRate, updateTaxRate } from "@/app/(admin)/admin/tax/actions";
import type { TaxRateRow } from "@/lib/queries/tax";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

/** `null` = create mode, a row = edit mode, `undefined` = closed. */
export type TaxRateDialogTarget = TaxRateRow | null | undefined;

interface FormState {
  label: string;
  ratePercent: string;
  cgstPercent: string;
  sgstPercent: string;
  igstPercent: string;
  sortOrder: string;
}

const BLANK: FormState = {
  label: "",
  ratePercent: "18",
  cgstPercent: "9",
  sgstPercent: "9",
  igstPercent: "18",
  sortOrder: "100",
};

function fromRow(row: TaxRateRow): FormState {
  return {
    label: row.label,
    ratePercent: String(row.ratePercent),
    cgstPercent: String(row.cgstPercent),
    sgstPercent: String(row.sgstPercent),
    igstPercent: String(row.igstPercent),
    sortOrder: String(row.sortOrder),
  };
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

const FIELD_CLASS =
  "h-[42px] w-full rounded-lg border border-[#dfe1e6] bg-white px-3.5 text-[14px] text-[#1f2430] outline-none transition placeholder:text-[#adb2bd] focus:border-[#3f3f94] focus:ring-2 focus:ring-[#3f3f94]/15";

/**
 * Create / edit a GST slab.  The form body is a separate component keyed by the
 * target row, so opening a different rate remounts it with fresh initial state
 * instead of syncing through an effect.
 */
export function TaxRateDialog({
  target,
  onClose,
}: {
  target: TaxRateDialogTarget;
  onClose: () => void;
}) {
  const isOpen = target !== undefined;
  const editing = target ?? null;
  // Mirrored from the form so a submit in flight can't be dismissed by Esc.
  const [busy, setBusy] = useState(false);

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] max-h-[calc(100dvh-32px)] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg">
          {isOpen && (
            <RateForm
              key={editing?.id ?? "new"}
              editing={editing}
              onBusyChange={setBusy}
              onClose={onClose}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RateForm({
  editing,
  onBusyChange,
  onClose,
}: {
  editing: TaxRateRow | null;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() =>
    editing ? fromRow(editing) : BLANK,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Typing a total rate re-derives the statutory split (half CGST, half SGST,
  // full IGST); the three fields stay editable for the rare cess-style rate.
  function setRate(value: string) {
    const parsed = num(value);
    if (!Number.isFinite(parsed)) {
      set("ratePercent", value);
      return;
    }
    const split = deriveSplit(parsed);
    setForm((prev) => ({
      ...prev,
      ratePercent: value,
      cgstPercent: String(split.cgstPercent),
      sgstPercent: String(split.sgstPercent),
      igstPercent: String(split.igstPercent),
    }));
  }

  const rate = num(form.ratePercent);
  const cgst = num(form.cgstPercent);
  const sgst = num(form.sgstPercent);
  const igst = num(form.igstPercent);
  const splitOk =
    Number.isFinite(rate) &&
    Number.isFinite(cgst) &&
    Number.isFinite(sgst) &&
    Math.abs(cgst + sgst - rate) < 0.005;
  const igstOk =
    Number.isFinite(rate) && Number.isFinite(igst) && Math.abs(igst - rate) < 0.005;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const sortOrder = num(form.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setError("Sort order must be a whole number.");
      return;
    }
    const payload = {
      label: form.label.trim(),
      ratePercent: rate,
      cgstPercent: cgst,
      sgstPercent: sgst,
      igstPercent: igst,
      sortOrder,
    };

    onBusyChange(true);
    startTransition(async () => {
      const res = editing
        ? await updateTaxRate(editing.id, payload)
        : await createTaxRate(payload);
      onBusyChange(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({
        message: editing
          ? `${payload.label} updated.`
          : `${payload.label} added to the tax master.`,
      });
      onClose();
    });
  }

  return (
    <>
      <Dialog.Title className="text-[18px] font-extrabold text-[#1e2f66]">
        {editing ? "Edit tax rate" : "New tax rate"}
      </Dialog.Title>
      <Dialog.Description className="mt-1 text-[13.5px] text-[#6b7280]">
        {editing
          ? "Invoices already raised keep the rate they were frozen at — this only affects new documents."
          : "The standard Indian slabs are 0, 5, 12, 18 and 28 percent."}
      </Dialog.Description>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-bold text-[#3a4152]">Label</span>
          <input
            required
            autoFocus
            value={form.label}
            onChange={(e) => set("label", e.target.value)}
            maxLength={48}
            placeholder="GST 18%"
            className={FIELD_CLASS}
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-bold text-[#3a4152]">Total rate %</span>
            <input
              required
              type="number"
              step="0.01"
              min={0}
              max={100}
              inputMode="decimal"
              value={form.ratePercent}
              onChange={(e) => setRate(e.target.value)}
              className={`${FIELD_CLASS} tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-bold text-[#3a4152]">Sort order</span>
            <input
              required
              type="number"
              min={0}
              max={9999}
              value={form.sortOrder}
              onChange={(e) => set("sortOrder", e.target.value)}
              className={`${FIELD_CLASS} tabular-nums`}
            />
          </label>
        </div>

        <fieldset className="rounded-lg border border-[#e6e8ec] p-4">
          <legend className="px-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#a2a8b4]">
            Statutory split
          </legend>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["cgstPercent", "CGST %"],
                ["sgstPercent", "SGST %"],
                ["igstPercent", "IGST %"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-bold text-[#3a4152]">{label}</span>
                <input
                  required
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  inputMode="decimal"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  className={`${FIELD_CLASS} tabular-nums`}
                />
              </label>
            ))}
          </div>
          <p
            className="mt-3 text-[12.5px] font-semibold tabular-nums"
            style={{ color: splitOk && igstOk ? "#2e7d32" : "#d32f2f" }}
          >
            {splitOk && igstOk
              ? `Intra-state ${cgst}% + ${sgst}% · Inter-state ${igst}% IGST`
              : !splitOk
                ? "CGST + SGST must add up to the total rate."
                : "IGST must equal the total rate."}
          </p>
        </fieldset>

        {error && (
          <AdminInlineError>
            {error}
          </AdminInlineError>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Dialog.Close asChild>
            <button
              type="button"
              disabled={pending}
              className="rounded-lg px-4 py-2.5 text-[13.5px] font-semibold text-[#6b7280] transition hover:text-[#3a4152] disabled:opacity-50"
            >
              Cancel
            </button>
          </Dialog.Close>
          <button
            type="submit"
            disabled={pending || !splitOk || !igstOk}
            className="rounded-lg bg-[#3f3f94] px-5 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-[#2f2f6f] disabled:opacity-50"
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Add rate"}
          </button>
        </div>
      </form>
    </>
  );
}
