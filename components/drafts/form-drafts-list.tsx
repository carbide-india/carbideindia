"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { FileText, Trash2, ArrowUpRight } from "lucide-react";
import { recycleFormDraft } from "@/app/(app)/_actions/form-drafts";
import { FORM_DRAFT_META, type FormDraftKind } from "@/lib/drafts/form-drafts";
import type { FormDraftListItem } from "@/lib/queries/form-drafts";
import { fireToast } from "@/lib/toast";

/** Capitalize the first letter of every word, leaving existing caps/acronyms
 *  intact (so "abc pvt ltd" → "Abc Pvt Ltd", "ACME Ltd" stays "ACME Ltd"). */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(d: Date): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** The list of a single form's auto-saved drafts, with resume + delete. */
export function FormDraftsList({
  kind,
  items,
}: {
  kind: FormDraftKind;
  items: FormDraftListItem[];
}) {
  const router = useRouter();
  const meta = FORM_DRAFT_META[kind];
  const [pending, setPending] = React.useState<string | null>(null);

  async function remove(id: string) {
    setPending(id);
    try {
      await recycleFormDraft(kind, id);
      fireToast({ message: "Moved to Recycle Bin." });
      router.refresh();
    } catch {
      fireToast({ message: "Couldn't move the draft.", type: "error" });
    } finally {
      setPending(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center text-[14px] text-ink-subtle">
        No {meta.noun.toLowerCase()} drafts yet — half-filled {meta.noun.toLowerCase()} forms auto-save here so you can resume them later.
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
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#efeffb] text-[#3f3f94]">
                <FileText className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold text-ink-strong">{titleCase(d.label)}</p>
                <p className="text-[12px] text-ink-subtle tabular-nums">
                  {d.completeness}% filled · {timeAgo(d.updatedAt)}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`${meta.newRoute}?draft=${d.id}` as Route}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#3f3f94] px-3 text-[13px] font-bold text-white transition hover:bg-[#2f2f6f]"
            >
              Resume
              <ArrowUpRight className="h-[15px] w-[15px]" />
            </Link>
            <button
              type="button"
              onClick={() => remove(d.id)}
              disabled={pending === d.id}
              aria-label="Move draft to Recycle Bin"
              title="Move to Recycle Bin"
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
