"use client";

import { useRef, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { fireToast } from "@/lib/toast";
import {
  createCurrency,
  updateCurrency,
} from "@/app/(admin)/admin/currency/actions";
import type { CurrencyRow } from "@/lib/queries/currency";
import type { UpdateCurrencyInput } from "@/lib/validators/currency";
import {
  CurrencyField,
  CurrencyInput,
  CurrencyPrimaryButton,
} from "./currency-primitives";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

interface Props {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required in edit mode; ignored when creating. */
  row?: CurrencyRow | null;
  baseCode: string;
}

interface FormState {
  code: string;
  name: string;
  symbol: string;
  rate: string;
  sortOrder: string;
}

const BLANK: FormState = {
  code: "",
  name: "",
  symbol: "",
  rate: "",
  sortOrder: "100",
};

function stateFor(row: CurrencyRow | null | undefined): FormState {
  if (!row) return BLANK;
  return {
    code: row.code,
    name: row.name,
    symbol: row.symbol,
    rate: row.exchangeRateRaw,
    sortOrder: String(row.sortOrder),
  };
}

/**
 * Add / edit a currency. The code is immutable once any enquiry or client
 * references it (it is stored as plain text on those rows, so a rename would
 * orphan them) — the server enforces that; here the field is simply disabled.
 *
 * Mounted only while open (see currency-table.tsx) so the form state resets by
 * unmounting rather than by re-syncing inside an effect.
 */
export function CurrencyFormDialog({ mode, open, onOpenChange, row, baseCode }: Props) {
  const [form, setForm] = useState<FormState>(() => stateFor(row));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const isEdit = mode === "edit";
  const codeLocked = isEdit && (row?.isBase === true || (row?.usage.total ?? 0) > 0);
  const rateLocked = isEdit && row?.isBase === true;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const sortOrder = Number(form.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
      setError("Sort order must be a whole number between 0 and 9999.");
      return;
    }

    if (!isEdit) {
      startTransition(async () => {
        const res = await createCurrency({
          code: form.code,
          name: form.name,
          symbol: form.symbol,
          exchangeRateToInr: form.rate,
          sortOrder,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        fireToast({ message: `${form.code.trim().toUpperCase()} added.` });
        onOpenChange(false);
      });
      return;
    }

    if (!row) return;
    const patch: UpdateCurrencyInput = {};
    if (!codeLocked && form.code.trim().toUpperCase() !== row.code) {
      patch.code = form.code;
    }
    if (form.name.trim() !== row.name) patch.name = form.name;
    if (form.symbol.trim() !== row.symbol) patch.symbol = form.symbol;
    if (!rateLocked && form.rate.trim() !== row.exchangeRateRaw.trim()) {
      patch.exchangeRateToInr = form.rate;
    }
    if (sortOrder !== row.sortOrder) patch.sortOrder = sortOrder;

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await updateCurrency(row.id, patch);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${row.code} updated.` });
      onOpenChange(false);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg max-h-[calc(100dvh-32px)]"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            firstFieldRef.current?.focus();
          }}
        >
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            {isEdit ? `Edit ${row?.code ?? "currency"}` : "Add a currency"}
          </Dialog.Title>
          <Dialog.Description className="text-[14.5px] text-[#64748B] mb-4" style={{ lineHeight: 1.55 }}>
            The rate is how many {baseCode} one unit of this currency is worth.
            It is entered by hand and stamped with the date you save it.
          </Dialog.Description>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <CurrencyField
                label="Code"
                htmlFor="currency-form-code"
                hint={codeLocked ? "Locked — records reference it" : "3 letters, ISO-4217"}
              >
                <CurrencyInput
                  id="currency-form-code"
                  ref={firstFieldRef}
                  required
                  maxLength={3}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={codeLocked || pending}
                  value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  className="uppercase tracking-[0.08em]"
                />
              </CurrencyField>
              <CurrencyField label="Symbol" htmlFor="currency-form-symbol" hint="Optional, e.g. $">
                <CurrencyInput
                  id="currency-form-symbol"
                  maxLength={6}
                  autoComplete="off"
                  disabled={pending}
                  value={form.symbol}
                  onChange={(e) => set("symbol", e.target.value)}
                />
              </CurrencyField>
            </div>

            <CurrencyField label="Name" htmlFor="currency-form-name">
              <CurrencyInput
                id="currency-form-name"
                required
                maxLength={60}
                autoComplete="off"
                disabled={pending}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </CurrencyField>

            <div className="grid grid-cols-2 gap-4">
              <CurrencyField
                label={`Rate (${baseCode} per unit)`}
                htmlFor="currency-form-rate"
                hint={rateLocked ? "The base currency is fixed at 1" : undefined}
              >
                <CurrencyInput
                  id="currency-form-rate"
                  required={!rateLocked}
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={rateLocked || pending}
                  value={rateLocked ? "1" : form.rate}
                  onChange={(e) => set("rate", e.target.value)}
                  className="tabular-nums"
                />
              </CurrencyField>
              <CurrencyField label="Sort order" htmlFor="currency-form-sort">
                <CurrencyInput
                  id="currency-form-sort"
                  type="number"
                  min={0}
                  max={9999}
                  disabled={pending}
                  value={form.sortOrder}
                  onChange={(e) => set("sortOrder", e.target.value)}
                  className="tabular-nums"
                />
              </CurrencyField>
            </div>

            {error && <AdminInlineError>{error}</AdminInlineError>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => onOpenChange(false)}
                className="px-4 py-2.5 text-[14px] font-medium text-[#64748B] disabled:opacity-50"
              >
                Cancel
              </button>
              <CurrencyPrimaryButton type="submit" disabled={pending}>
                {pending ? "Saving" : isEdit ? "Save changes" : "Add currency"}
              </CurrencyPrimaryButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
