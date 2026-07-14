"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2, FileText } from "lucide-react";
import { deleteFormDraft, restoreFormDraft } from "@/app/(app)/_actions/form-drafts";
import type { RecycledDraftItem } from "@/lib/queries/form-drafts";
import { fireToast } from "@/lib/toast";

function ago(d: Date): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

function until(d: Date): string {
  const ms = new Date(d).getTime() - Date.now();
  if (ms <= 0) return "purging…";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Recycled drafts across every form - restore or delete forever; each auto-purges 48h after it was recycled. */
export function RecycleBinList({ items }: { items: RecycledDraftItem[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);

  async function run(id: string, fn: () => Promise<unknown>, msg: string) {
    setPending(id);
    try {
      await fn();
      fireToast({ message: msg });
      router.refresh();
    } catch {
      fireToast({ message: "Something went wrong.", type: "error" });
    } finally {
      setPending(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center text-[14px] text-ink-subtle">
        Recycle Bin is empty. Drafts you delete - or that overflow the 10-per-form limit - land
        here and are permanently removed 48 hours later.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
      {items.map((d) => (
        <div
          key={d.id}
          className="flex flex-col gap-3 rounded-section border border-hairline bg-surface-card p-4"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        >
          <div className="flex items-start gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#efeffb] text-[#3f3f94]">
              <FileText className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-ink-strong">{d.label}</p>
              <p className="text-[12px] text-ink-subtle">
                <span className="font-semibold text-[#3f3f94]">{d.typeLabel}</span> · recycled{" "}
                {ago(d.deletedAt)} · auto-deletes in{" "}
                <span className="font-semibold text-[#d32f2f]">{until(d.expiresAt)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => run(d.id, () => restoreFormDraft(d.id), "Draft restored.")}
              disabled={pending === d.id}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#3f3f94] px-3 text-[13px] font-bold text-white transition hover:bg-[#2f2f6f] disabled:opacity-50"
            >
              <RotateCcw className="h-[15px] w-[15px]" />
              Restore
            </button>
            <button
              type="button"
              onClick={() => run(d.id, () => deleteFormDraft(d.kind, d.id), "Draft permanently deleted.")}
              disabled={pending === d.id}
              aria-label="Delete forever"
              title="Delete forever"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-hairline text-ink-subtle transition hover:border-[#f0b4b4] hover:bg-[#fdf3f3] hover:text-[#d32f2f] disabled:opacity-50"
            >
              <Trash2 className="h-[16px] w-[16px]" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
