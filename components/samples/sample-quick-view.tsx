"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { X, Loader2, Pencil, FileText } from "lucide-react";
import { getSampleForView } from "@/app/(app)/samples/actions";
import { fireToast } from "@/lib/toast";
import { SampleSummaryPanel } from "@/components/inquiries/sample-summary-panel";
import type { SampleOption } from "@/lib/queries/samples";

/*
 * Read-only Quick View for a sample from the Sample Register - fetches the full
 * snapshot on open and renders every captured field (reusing SampleSummaryPanel,
 * the same panel shown on the enquiry). Mirrors the Client Master Quick View.
 */
export function SampleQuickView({
  sampleId,
  sampleNo,
  onClose,
}: {
  sampleId: string;
  sampleNo: string;
  onClose: () => void;
}) {
  const [sample, setSample] = React.useState<SampleOption | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    getSampleForView(sampleId)
      .then((s) => {
        if (alive) setSample(s);
      })
      .catch(() => {
        if (alive) fireToast({ message: "Couldn't load the sample.", type: "error" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sampleId]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-[min(94vw,820px)] max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-hairline bg-white px-7 pt-6 pb-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-ink-subtle">
              Sample Register
            </div>
            <h2 className="mt-1 font-mono text-[22px] font-bold text-ink-strong">{sampleNo}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-ink-subtle hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="px-7 py-5">
          {loading || !sample ? (
            <div className="flex items-center justify-center gap-2 py-14 text-ink-subtle">
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-[14px] font-medium">Loading sample…</span>
                </>
              ) : (
                <span className="text-[14px] font-medium">Couldn&apos;t load this sample.</span>
              )}
            </div>
          ) : (
            <SampleSummaryPanel sample={sample} />
          )}
        </div>

        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-hairline bg-white px-7 py-4">
          <Link
            href={`/samples/${sampleId}` as Route}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-4 py-2 text-[13px] font-semibold text-ink-soft hover:border-brand hover:text-brand"
          >
            <FileText size={14} strokeWidth={2.2} />
            Full record
          </Link>
          <Link
            href={`/samples/${sampleId}` as Route}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-deep"
          >
            <Pencil size={14} strokeWidth={2.4} />
            Edit
          </Link>
        </div>
      </div>
    </div>
  );
}
