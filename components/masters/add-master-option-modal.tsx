"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, PlusCircle, X, Check, ListPlus, Loader2 } from "lucide-react";
import {
  createMasterOption,
  createMasterOptionsBulk,
} from "@/app/(admin)/admin/masters/actions";
import { fireToast } from "@/lib/toast";
import type { MasterKind } from "@/db/enums";

const MONO = "var(--font-mono-display)";

/**
 * "+ Add" button + modal for adding a new master option (Customer Type,
 * Industry Type, Product Type…) without leaving the current form. Single add +
 * bulk paste. On success it refreshes the route so the new option appears in
 * the chip lists. Admin-only action (createMasterOption requires admin).
 */
export function AddMasterOptionModal({
  kind,
  label,
}: {
  kind: MasterKind;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkText, setBulkText] = React.useState("");

  const singular = label.endsWith("s") ? label.slice(0, -1) : label;

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function addOne() {
    const v = name.trim();
    if (!v) {
      fireToast({ message: "Enter a name first.", type: "error" });
      return;
    }
    start(async () => {
      const res = await createMasterOption({ kind, name: v });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setName("");
      fireToast({ message: `"${v}" added.`, type: "success" });
      router.refresh();
    });
  }

  function addBulk() {
    const names = bulkText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) {
      fireToast({ message: "Paste at least one value.", type: "error" });
      return;
    }
    start(async () => {
      const res = await createMasterOptionsBulk({ kind, names });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setBulkText("");
      setBulkOpen(false);
      setOpen(false);
      fireToast({
        message: `Added ${res.created}${res.skipped ? `, skipped ${res.skipped} duplicate(s)` : ""}.`,
        type: "success",
      });
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#3f3f94] px-2.5 text-[12px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#2f2f6f] hover:shadow-[0_6px_16px_rgba(63,63,148,0.28)] active:translate-y-0"
      >
        <Plus className="h-[14px] w-[14px]" strokeWidth={2.6} />
        Add
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-10"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[min(92vw,540px)] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.28)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#eef0f3] px-6 py-4">
              <h3 className="inline-flex items-center gap-2 text-[16px] font-extrabold text-[#3f3f94]">
                <PlusCircle className="h-[19px] w-[19px]" />
                Add {singular}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-lg text-[#9aa0ab] transition hover:bg-[#f5f6f8] hover:text-[#3f3f94]"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            <div className="px-6 py-5">
              <label
                className="mb-1.5 block text-[11px] font-bold tracking-[0.14em] text-[#8a90a0]"
                style={{ fontFamily: MONO }}
              >
                NAME
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOne();
                    }
                  }}
                  placeholder={`Enter ${singular} name`}
                  className="h-[42px] min-w-[200px] flex-1 rounded-lg border border-[#dfe1e6] bg-white px-3.5 text-[14px] text-[#3f3f94] outline-none transition placeholder:text-[#adb2bd] focus:border-[#3f3f94] focus:ring-2 focus:ring-[#3f3f94]/20"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={addOne}
                  className="inline-flex h-[42px] items-center gap-2 rounded-lg bg-[#3f3f94] px-5 text-[13px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#2f2f6f] hover:shadow-[0_8px_20px_rgba(63,63,148,0.28)] disabled:translate-y-0 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save
                </button>
              </div>
              <p className="mt-2 text-[12px] font-medium text-[#9aa0ab]">
                Press Enter to add - the field clears so you can keep adding.
              </p>

              <div className="mt-5 border-t border-[#eef0f3] pt-4">
                <button
                  type="button"
                  onClick={() => setBulkOpen((v) => !v)}
                  className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-[#dfe1e6] bg-white px-4 text-[13px] font-semibold text-[#3a4152] transition hover:border-[#c9c9ea] hover:text-[#3f3f94]"
                >
                  <ListPlus className="h-[16px] w-[16px]" />
                  {bulkOpen ? "Hide Bulk Add" : "Bulk Add (paste many)"}
                </button>

                {bulkOpen && (
                  <div className="mt-4 rounded-xl border border-[#eef0f3] bg-[#fafbfc] p-4">
                    <label
                      className="mb-1.5 block text-[11px] font-bold tracking-[0.14em] text-[#8a90a0]"
                      style={{ fontFamily: MONO }}
                    >
                      PASTE MANY - ONE PER LINE
                    </label>
                    <textarea
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      rows={5}
                      placeholder={"Value one\nValue two\nValue three"}
                      className="w-full resize-y rounded-lg border border-[#dfe1e6] bg-white px-3.5 py-2.5 text-[14px] text-[#3f3f94] outline-none transition placeholder:text-[#adb2bd] focus:border-[#3f3f94] focus:ring-2 focus:ring-[#3f3f94]/20"
                    />
                    <div className="mt-3 flex items-center gap-2.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={addBulk}
                        className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-[#3f3f94] px-4 text-[13px] font-bold text-white transition hover:bg-[#2f2f6f] disabled:opacity-50"
                      >
                        <ListPlus className="h-4 w-4" />
                        Add All
                      </button>
                      <span className="text-[12px] font-medium text-[#9aa0ab] tabular-nums">
                        {bulkText.split("\n").filter((s) => s.trim()).length} value(s)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
