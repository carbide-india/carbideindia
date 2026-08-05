"use client";

import { useId, useMemo, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { QUANTITY_UOMS } from "@/db/enums";
import { createHsnCode, updateHsnCode } from "@/app/(admin)/admin/tax/actions";
import type { HsnCodeRow, TaxRateRow } from "@/lib/queries/tax";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

/** `null` = create mode, a row = edit mode, `undefined` = closed. */
export type HsnDialogTarget = HsnCodeRow | null | undefined;

const UNMAPPED = "__none__";

const FIELD_CLASS =
  "h-[42px] w-full rounded-lg border border-[#dfe1e6] bg-white px-3.5 text-[14px] text-[#1f2430] outline-none transition placeholder:text-[#adb2bd] focus:border-[#3f3f94] focus:ring-2 focus:ring-[#3f3f94]/15";

/**
 * Create / edit an HSN master row.  `items.hsn_code` is free text with no FK,
 * so this master is the only place a code learns which GST rate it carries;
 * leaving the rate unmapped is legal and means "fall back to the org default".
 * The body remounts on the target (key) rather than syncing via an effect.
 */
export function TaxHsnDialog({
  target,
  rates,
  presetCode,
  onClose,
}: {
  target: HsnDialogTarget;
  rates: TaxRateRow[];
  /** Pre-fills the code when adopting an unmapped Item Master code. */
  presetCode?: string;
  onClose: () => void;
}) {
  const isOpen = target !== undefined;
  const editing = target ?? null;
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
            <HsnForm
              key={editing?.id ?? `new:${presetCode ?? ""}`}
              editing={editing}
              rates={rates}
              presetCode={presetCode}
              onBusyChange={setBusy}
              onClose={onClose}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function HsnForm({
  editing,
  rates,
  presetCode,
  onBusyChange,
  onClose,
}: {
  editing: HsnCodeRow | null;
  rates: TaxRateRow[];
  presetCode?: string;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const uomListId = useId();

  const [code, setCode] = useState(editing?.code ?? presetCode ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [taxRateId, setTaxRateId] = useState<string>(editing?.taxRateId ?? UNMAPPED);
  const [defaultUom, setDefaultUom] = useState(editing?.defaultUom ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Inactive rates stay selectable only when they are the current mapping, so
  // an existing row never silently loses its rate on save.
  const rateOptions = useMemo(() => {
    const usable = rates.filter((r) => r.isActive || r.id === editing?.taxRateId);
    return [
      { value: UNMAPPED, label: "Not mapped — use the default rate" },
      ...usable.map((r) => ({
        value: r.id,
        label: `${r.label} · ${Number(r.ratePercent.toFixed(3))}%${r.isActive ? "" : " (inactive)"}`,
      })),
    ];
  }, [rates, editing?.taxRateId]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      code: code.trim(),
      description: description.trim() || null,
      taxRateId: taxRateId === UNMAPPED ? null : taxRateId,
      defaultUom: defaultUom.trim() || null,
    };

    onBusyChange(true);
    startTransition(async () => {
      const res = editing
        ? await updateHsnCode(editing.id, payload)
        : await createHsnCode(payload);
      onBusyChange(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({
        message: editing
          ? `HSN ${payload.code} updated.`
          : `HSN ${payload.code} added to the master.`,
      });
      onClose();
    });
  }

  return (
    <>
      <Dialog.Title className="text-[18px] font-extrabold text-[#1e2f66]">
        {editing ? `Edit HSN ${editing.code}` : "New HSN / SAC code"}
      </Dialog.Title>
      <Dialog.Description className="mt-1 text-[13.5px] text-[#6b7280]">
        Items carry an HSN code as free text. Mapping it here is what lets a
        quotation or invoice line resolve its GST rate automatically.
      </Dialog.Description>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-bold text-[#3a4152]">
              HSN / SAC code
            </span>
            <input
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={12}
              inputMode="numeric"
              placeholder="8209"
              className={`${FIELD_CLASS} tabular-nums`}
            />
            <span className="text-[11.5px] text-[#a2a8b4]">4 to 8 digits</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-bold text-[#3a4152]">Default unit</span>
            <input
              value={defaultUom}
              onChange={(e) => setDefaultUom(e.target.value)}
              maxLength={20}
              list={uomListId}
              placeholder="Nos"
              className={FIELD_CLASS}
            />
            <datalist id={uomListId}>
              {QUANTITY_UOMS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-bold text-[#3a4152]">Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={240}
            placeholder="Plates, sticks, tips and the like for tools, of cermets"
            className={FIELD_CLASS}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-bold text-[#3a4152]">GST rate</span>
          <Select
            options={rateOptions}
            value={taxRateId}
            onValueChange={setTaxRateId}
            ariaLabel="GST rate for this HSN code"
            placeholder="Not mapped"
          />
        </div>

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
            disabled={pending}
            className="rounded-lg bg-[#3f3f94] px-5 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-[#2f2f6f] disabled:opacity-50"
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Add code"}
          </button>
        </div>
      </form>
    </>
  );
}
