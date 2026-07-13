"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Clock, Trash2, ArrowRight, FilePlus2, Package, Check, X } from "lucide-react";
import { deleteEnquiryDraft } from "@/app/(app)/enquiries/drafts/actions";
import { fireToast } from "@/lib/toast";

const MONO = "var(--font-mono-display)";

export interface DraftItem {
  id: string;
  label: string;
  productCount: number;
  completeness: number;
  updatedAt: string | Date;
}

function relTime(d: string | Date): string {
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function CompletenessRing({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[58px] w-[58px] shrink-0">
      <svg viewBox="0 0 58 58" className="h-[58px] w-[58px] -rotate-90">
        <circle cx="29" cy="29" r={r} fill="none" stroke="#eceef4" strokeWidth="5.5" />
        <circle
          cx="29"
          cy="29"
          r={r}
          fill="none"
          stroke="url(#draftRing)"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset .7s cubic-bezier(.22,.61,.36,1)" }}
        />
        <defs>
          <linearGradient id="draftRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3F3F94" />
            <stop offset="1" stopColor="#7b6cf0" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[13px] font-extrabold tabular-nums text-[#1e2f66]">
        {pct}
        <span className="text-[8px]">%</span>
      </span>
    </div>
  );
}

export function DraftsList({ drafts }: { drafts: DraftItem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(drafts);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function remove(id: string) {
    setItems((prev) => prev.filter((d) => d.id !== id));
    setConfirmId(null);
    startTransition(async () => {
      try {
        await deleteEnquiryDraft(id);
        fireToast({ message: "Draft deleted.", type: "success" });
        router.refresh();
      } catch {
        fireToast({ message: "Could not delete draft.", type: "error" });
        router.refresh();
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#d7dbe3] bg-white/60 px-6 py-16 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#eef1fb]">
          <FilePlus2 className="h-8 w-8 text-[#2b46b5]" strokeWidth={1.8} />
        </div>
        <h3 className="mt-4 text-[19px] font-extrabold text-[#1e2f66]">No drafts yet</h3>
        <p className="mt-1.5 max-w-[380px] text-[14px] font-medium text-[#6b7280]">
          Anything you start on the New Enquiry form auto-saves here until you submit it.
        </p>
        <Link
          href={"/enquiries/new" as Route}
          className="mt-6 inline-flex h-[44px] items-center gap-2 rounded-xl bg-[#1e2f66] px-5 text-[13px] font-bold tracking-[0.04em] text-white transition hover:-translate-y-0.5 hover:bg-[#18274f] hover:shadow-[0_8px_20px_rgba(30,47,102,0.3)]"
          style={{ fontFamily: MONO }}
        >
          <FilePlus2 className="h-4 w-4" />
          START A NEW ENQUIRY
        </Link>
      </div>
    );
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes draftCardIn { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        .draft-card { animation: draftCardIn .5s cubic-bezier(.22,.61,.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .draft-card { animation: none } }
      `,
        }}
      />
      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((d, i) => {
          const confirming = confirmId === d.id;
          return (
            <div
              key={d.id}
              className="draft-card group relative flex flex-col overflow-hidden rounded-2xl border border-[#e6e8ec] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-[#c7ccf5] hover:shadow-[0_16px_40px_rgba(30,47,102,0.13)]"
              style={{ animationDelay: `${0.05 + i * 0.05}s` }}
            >
              <span className="pointer-events-none absolute inset-x-0 top-0 h-[4px] origin-left scale-x-0 bg-[linear-gradient(90deg,#3F3F94,#7b6cf0)] transition-transform duration-300 group-hover:scale-x-100" />

              <div className="flex items-start gap-4">
                <CompletenessRing pct={d.completeness} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[16px] font-extrabold tracking-tight text-[#1e2f66]" title={d.label}>
                    {d.label}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-[#8a90a0]">
                    <span className="inline-flex items-center gap-1">
                      <Package className="h-3.5 w-3.5" />
                      {d.productCount} {d.productCount === 1 ? "product" : "products"}
                    </span>
                    <span className="inline-flex items-center gap-1" suppressHydrationWarning>
                      <Clock className="h-3.5 w-3.5" />
                      {relTime(d.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-2">
                <Link
                  href={`/enquiries/new?draft=${d.id}` as Route}
                  className="inline-flex h-[40px] flex-1 items-center justify-center gap-2 rounded-lg bg-[#1e2f66] px-4 text-[12.5px] font-bold tracking-[0.05em] text-white transition hover:bg-[#18274f] hover:shadow-[0_6px_16px_rgba(30,47,102,0.28)]"
                  style={{ fontFamily: MONO }}
                >
                  RESUME
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmId(d.id)}
                  aria-label="Delete draft"
                  className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-lg border border-[#e6e8ec] text-[#9aa0ab] transition hover:border-[#f0b4b4] hover:bg-[#fdf3f3] hover:text-[#d32f2f]"
                >
                  <Trash2 className="h-[17px] w-[17px]" />
                </button>
              </div>

              {/* Inline delete confirm */}
              {confirming && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/95 backdrop-blur-sm">
                  <p className="text-[14px] font-bold text-[#1e2f66]">Delete this draft?</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(d.id)}
                      className="inline-flex h-[38px] items-center gap-1.5 rounded-lg bg-[#d32f2f] px-4 text-[12.5px] font-bold text-white transition hover:bg-[#b52626] disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" /> Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-[#d5d8de] bg-white px-4 text-[12.5px] font-bold text-[#3a4152] transition hover:bg-[#f5f6f8]"
                    >
                      <X className="h-4 w-4" /> Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
