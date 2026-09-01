"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, PlusCircle, X, Check, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { useIsAdmin } from "@/components/auth/admin-provider";

/**
 * Compact "+ Add" affordance for a dropdown inside a form: a small pill that
 * opens a tiny modal to add one option without leaving the page. On success it
 * calls `onAdded` (so the caller can select the new value immediately) and
 * refreshes the route so the option is persisted into the list on next load.
 *
 * `add` returns the value the caller should select - the option label for a
 * free-text custom list, or the new row id for a master option.
 */
export function InlineOptionAdd({
  title,
  placeholder,
  add,
  onAdded,
}: {
  /** e.g. "Designation" - shown as "Add Designation". */
  title: string;
  placeholder?: string;
  add: (name: string) => Promise<{ ok: true; value: string } | { ok: false; error: string }>;
  onAdded?: (value: string, name: string) => void;
}) {
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Managing dropdown options is admin-only (enforced server-side too). Non-
  // admins simply don't see the "+ Add" affordance. Placed after all hooks so
  // hook order stays stable.
  if (!isAdmin) return null;

  function submit() {
    const v = name.trim();
    if (!v) {
      fireToast({ message: "Enter a name first.", type: "error" });
      return;
    }
    start(async () => {
      const res = await add(v);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      onAdded?.(res.value, v);
      setName("");
      setOpen(false);
      fireToast({ message: `"${v}" added.`, type: "success" });
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-6 items-center gap-1 rounded-md bg-[#eef0fb] px-2 text-[11px] font-bold text-[#3f3f94] transition hover:bg-[#e2e4fb]"
      >
        <Plus className="h-[13px] w-[13px]" strokeWidth={2.8} />
        Add
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-10"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[min(92vw,460px)] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.28)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#eef0f3] px-5 py-3.5">
              <h3 className="inline-flex items-center gap-2 text-[15px] font-extrabold text-[#3f3f94]">
                <PlusCircle className="h-[18px] w-[18px]" />
                Add {title}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-lg text-[#9aa0ab] transition hover:bg-[#f5f6f8] hover:text-[#3f3f94]"
              >
                <X className="h-[17px] w-[17px]" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 px-5 py-4">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={placeholder ?? `Enter ${title.toLowerCase()}`}
                className="h-[40px] min-w-[180px] flex-1 rounded-lg border border-[#dfe1e6] bg-white px-3 text-[14px] text-[#3f3f94] outline-none transition placeholder:text-[#adb2bd] focus:border-[#3f3f94] focus:ring-2 focus:ring-[#3f3f94]/20"
              />
              <button
                type="button"
                disabled={pending}
                onClick={submit}
                className="inline-flex h-[40px] items-center gap-2 rounded-lg bg-[#3f3f94] px-4 text-[13px] font-bold text-white transition hover:bg-[#2f2f6f] disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
