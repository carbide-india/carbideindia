"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowUpRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineRow, StageState } from "@/lib/queries/pipeline-tracker";
import { OverallChip, Stepper, fmtDate } from "./parts";

const STATE_TEXT: Record<StageState, { label: string; cls: string }> = {
  done: { label: "Done", cls: "text-[#15803d]" },
  active: { label: "In progress", cls: "text-[#454595]" },
  pending: { label: "Pending", cls: "text-[#a8a29e]" },
  dead: { label: "Dropped", cls: "text-[#d03232]" },
};

/** Best available route to open a given stage for this inquiry. Some stages have
 *  a per-inquiry page; the rest open their register. */
function stageHref(key: string, id: string): Route {
  switch (key) {
    case "kyc":
      return "/clients" as Route;
    case "sample":
      return "/samples" as Route;
    case "enquiry":
      return `/enquiries/register/${id}` as Route;
    case "feasibility":
      return `/enquiries/feasibility/${id}` as Route;
    case "secondary":
      return "/secondary-feasibility" as Route;
    case "costing":
      return "/costings" as Route;
    case "quotation":
      return "/quotations" as Route;
    case "negotiation":
      return "/negotiations" as Route;
    case "sales_order":
      return "/sales-orders" as Route;
    default:
      return "/enquiries" as Route;
  }
}

export function PipelineDetail({ row }: { row: PipelineRow }) {
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <Link
        href={"/pipeline" as Route}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#454595] hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
        Back to Pipeline
      </Link>

      {/* Header card */}
      <div className="rounded-lg border border-[#e2dfdc] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-[18px] font-black text-[#1f2547]"
                style={{ fontFamily: "var(--font-mono, monospace)" }}
              >
                {row.smNumber}
              </span>
              <OverallChip overall={row.overall} />
            </div>
            <div className="mt-0.5 text-[15px] font-bold text-[#1f2547]">{row.companyName}</div>
            <div className="mt-0.5 text-[12px] text-[#777985]">
              {row.salesPerson ?? "Unassigned"} · {fmtDate(row.enquiryDate)} · Currently at{" "}
              <span className="font-bold text-[#454595]">{row.currentStageLabel}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href={`/inquiries/${row.inquiryId}/edit` as Route}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#e2dfdc] bg-white px-3 text-[12.5px] font-bold text-[#454595] transition-colors hover:border-[#454595] hover:bg-[#454595]/8"
            >
              <Pencil className="h-4 w-4" strokeWidth={2.4} />
              Edit Enquiry
            </Link>
            <Link
              href={`/inquiries/${row.inquiryId}` as Route}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#454595] px-3 text-[12.5px] font-bold text-white transition-colors hover:bg-[#3a3a80]"
            >
              Open Full SM
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Big stepper */}
        <div className="mt-5">
          <Stepper stages={row.stages} minWidth={620} />
        </div>
      </div>

      {/* Per-stage rows */}
      <div className="mt-4 rounded-lg border border-[#e2dfdc] bg-white">
        {row.stages.map((st, i) => {
          const t = STATE_TEXT[st.state];
          return (
            <div
              key={st.key}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                i > 0 && "border-t border-[#eef0f3]",
              )}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#f4f0e8] text-[11px] font-black text-[#777985] tabular-nums">
                {i + 1}
              </span>
              <span className="w-[110px] shrink-0 text-[13px] font-bold text-[#1f2547]">{st.label}</span>
              <span className={cn("flex-1 text-[12.5px] font-semibold", t.cls)}>{t.label}</span>
              <Link
                href={stageHref(st.key, row.inquiryId)}
                className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-[#e2dfdc] bg-[#f4f0e8] px-2 text-[11px] font-bold text-[#454595] transition-colors hover:border-[#454595] hover:bg-[#454595]/10"
              >
                Open
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
