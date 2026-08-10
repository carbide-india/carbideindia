"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { FlaskConical, ExternalLink, Paperclip } from "lucide-react";
import {
  SAMPLE_STATUS_LABELS,
  SAMPLE_STATUS_COLORS,
  STAGE_STATUS_LABELS,
  STAGE_STATUS_COLORS,
  type SampleStatus,
  type StageStatus,
} from "@/db/enums";
import { formatDate } from "@/lib/format";
import type { SampleOption } from "@/lib/queries/samples";

/*
 * A READ-ONLY, structured panel that surfaces EVERY captured Sample Register
 * field for a sample linked to an enquiry product line. Rendered prominently
 * (dark frame + clear labels + a real stage-tracking table) so the attached
 * sample's data is unmissable. Fed the full snapshot from listSampleOptions.
 */

const TONE: Record<string, string> = {
  slate: "#64748b", blue: "#2563eb", amber: "#d97706", orange: "#ea580c",
  red: "#dc2626", stone: "#78716c", purple: "#7c3aed", green: "#16a34a",
};
const tone = (c: string) => TONE[c] ?? "#64748b";

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "-";
  return formatDate(date);
}

/** One labelled detail cell - clear label + a bold, readable value. */
function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value == null || value === "" || value === "-";
  return (
    <div className="flex flex-col gap-1 px-3.5 py-2.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#6b7280]">{label}</span>
      <span className={`text-[13.5px] leading-snug ${empty ? "text-[#b3b8c2]" : "text-[#14151a] font-bold"}`}>
        {empty ? "-" : value}
      </span>
    </div>
  );
}

/** A titled section header bar. */
function SectionBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-y border-[#dfe2ea] bg-[#eef0f6] px-3.5 py-1.5">
      <span className="text-[10.5px] font-black uppercase tracking-[0.12em] text-[#3f3f94]">{title}</span>
    </div>
  );
}

export function SampleSummaryPanel({ sample }: { sample: SampleOption }) {
  const s = sample;
  const status = s.sampleStatus as SampleStatus;
  const photos = s.photoUrls ?? [];
  const reports = s.reportsUploaded ?? [];

  const stageRows: {
    name: string;
    status: StageStatus;
    location: string | null;
    completedOn: Date | string | null;
    notes: string | null;
  }[] = [
    { name: "Dimension", status: s.dimensionStatus, location: s.dimensionLocation, completedOn: s.dimensionCompletedOn, notes: s.dimensionNotes },
    { name: "Chemical", status: s.chemicalStatus, location: s.chemicalLocation, completedOn: s.chemicalCompletedOn, notes: s.chemicalNotes },
    { name: "Drawing", status: s.drawingStatus, location: s.drawingLocation, completedOn: s.drawingCompletedOn, notes: s.drawingNotes },
    { name: "Costing", status: s.costingStatus, location: null, completedOn: s.costingCompletedOn, notes: null },
  ];

  return (
    <div
      className="mt-3 overflow-hidden rounded-xl border-2 border-[#2b303b] bg-white"
      style={{ boxShadow: "0 6px 20px -8px rgba(15,23,42,0.25)" }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#2b303b] bg-[#f4f5f9] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-[#efeffb] text-[#3f3f94]">
            <FlaskConical className="h-[15px] w-[15px]" />
          </span>
          <span className="font-mono text-[14px] font-black text-[#14151a]">{s.sampleNo}</span>
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white"
            style={{ background: tone(SAMPLE_STATUS_COLORS[status]) }}
          >
            {SAMPLE_STATUS_LABELS[status]}
          </span>
        </div>
        <Link
          href={`/samples/${s.id}` as Route}
          target="_blank"
          className="inline-flex items-center gap-1 text-[12px] font-bold text-[#3f3f94] hover:underline"
        >
          Open sample <ExternalLink className="h-[13px] w-[13px]" />
        </Link>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 divide-x divide-y divide-[#e7e9f1] sm:grid-cols-4">
        <Cell label="Sample Date" value={fmt(s.sampleDate)} />
        <Cell label="Location" value={s.location} />
        <Cell label="Responsible" value={s.responsibleName} />
        <Cell label="Linked Company" value={s.companyName} />
        {s.sampleNotes ? (
          <div className="col-span-full border-t border-[#e7e9f1]">
            <Cell label="Sample Notes" value={s.sampleNotes} />
          </div>
        ) : null}
      </div>

      {/* Stage tracking - a real table. */}
      <SectionBar title="Stage Tracking" />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#6b7280]">
              <th className="border-b border-[#dfe2ea] bg-[#f7f8fb] px-3.5 py-1.5">Stage</th>
              <th className="border-b border-[#dfe2ea] bg-[#f7f8fb] px-3.5 py-1.5">Status</th>
              <th className="border-b border-[#dfe2ea] bg-[#f7f8fb] px-3.5 py-1.5">Location</th>
              <th className="border-b border-[#dfe2ea] bg-[#f7f8fb] px-3.5 py-1.5">Completed On</th>
              <th className="border-b border-[#dfe2ea] bg-[#f7f8fb] px-3.5 py-1.5">Notes</th>
            </tr>
          </thead>
          <tbody>
            {stageRows.map((r, i) => (
              <tr key={r.name} className={i % 2 ? "bg-[#fafbfd]" : "bg-white"}>
                <td className="border-b border-[#eceef4] px-3.5 py-2 text-[12.5px] font-bold text-[#14151a]">{r.name}</td>
                <td className="border-b border-[#eceef4] px-3.5 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block size-2 rounded-full" style={{ background: tone(STAGE_STATUS_COLORS[r.status]) }} />
                    <span className="text-[12.5px] font-semibold text-[#3a4152]">{STAGE_STATUS_LABELS[r.status]}</span>
                  </span>
                </td>
                <td className="border-b border-[#eceef4] px-3.5 py-2 text-[12.5px] text-[#4b5563]">{r.location || "-"}</td>
                <td className="border-b border-[#eceef4] px-3.5 py-2 text-[12.5px] tabular-nums text-[#4b5563]">{r.completedOn ? fmt(r.completedOn) : "-"}</td>
                <td className="border-b border-[#eceef4] px-3.5 py-2 text-[12px] text-[#6b7280]">{r.notes || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reports & processing */}
      <SectionBar title="Reports & Processing" />
      <div className="grid grid-cols-2 divide-x divide-y divide-[#e7e9f1] sm:grid-cols-4">
        <Cell label="Reports Uploaded" value={reports.length ? reports.join(", ") : "-"} />
        <Cell label="In SM Folder" value={s.reportsInSmFolder ? "Yes" : "No"} />
        <Cell label="Processed Date" value={fmt(s.processedDate)} />
        <Cell label="Process Notes" value={s.processNotes} />
      </div>

      {/* Attachments */}
      {photos.length > 0 && (
        <>
          <SectionBar title="Attachments" />
          <div className="flex flex-wrap gap-2 px-3.5 py-3">
            {photos.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#dcdce8] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#4b5563] hover:border-brand hover:text-brand"
              >
                <Paperclip className="h-[13px] w-[13px]" />
                File {i + 1}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
