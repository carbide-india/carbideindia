"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { restoreInquiry } from "@/app/(app)/inquiries/recycle-actions";
import type { RecycledInquiry } from "@/lib/queries/inquiries";
import { fmtDate } from "./parts";

/**
 * The records Recycle Bin — soft-deleted enquiries (whole pipeline). Restore
 * brings the entire inquiry back. Everything here is permanently purged 48h
 * after deletion by the nightly cron.
 */
export function RecordsRecycleBin({ rows }: { rows: RecycledInquiry[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function restore(id: string) {
    startTransition(async () => {
      const res = await restoreInquiry(id);
      if (res.ok) {
        fireToast({ message: "Enquiry restored." });
        router.refresh();
      } else {
        fireToast({ type: "error", message: res.error });
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <div className="mb-4">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#d03232]">
          Recycle Bin
        </span>
        <h1 className="mt-1 text-[24px] font-black tracking-tight text-[#1f2547]">
          Deleted Enquiries
        </h1>
        <p className="mt-1 text-[13px] text-[#777985]">
          Deleting an enquiry removes its whole pipeline. Restore any within 48 hours —
          after that they&apos;re purged permanently.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-[#e2dfdc] bg-white p-10 text-center">
          <Trash2 className="h-6 w-6 text-[#a8a8a8]" />
          <p className="text-[13px] text-[#777985]">The recycle bin is empty.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#e2dfdc] bg-white">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e2dfdc] text-[10.5px] font-black uppercase tracking-[0.08em] text-[#777985]">
                <th className="px-3 py-2.5">SM No</th>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">Sales Person</th>
                <th className="px-3 py-2.5">Deleted</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[#f3f1ec] last:border-0">
                  <td
                    className="whitespace-nowrap px-3 py-2.5 text-[13px] font-black text-[#1f2547]"
                    style={{ fontFamily: "var(--font-mono, monospace)" }}
                  >
                    {r.smNumber}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] font-semibold text-[#1f2547]">
                    <div className="max-w-[260px] truncate">{r.companyName}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-[#777985]">
                    {r.salesPersonName ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-[#777985]">
                    {fmtDate(r.deletedAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => restore(r.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-[#16a34a] bg-[#16a34a]/10 px-2.5 text-[12px] font-bold text-[#15803d] transition-colors hover:bg-[#16a34a]/20 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.4} />
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
