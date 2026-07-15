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
import type { SampleOption } from "@/lib/queries/samples";

/*
 * A compact, READ-ONLY panel that surfaces EVERY captured Sample Register field
 * for a sample linked to an enquiry product line. Fed the full snapshot from
 * listSampleOptions (no extra round-trip). Used on the New Enquiry form under a
 * product's "Linked Sample" picker, and reusable on the enquiry detail.
 */

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value == null || value === "" || value === "-";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] uppercase tracking-wide font-semibold text-ink-subtle">{label}</span>
      <span className={`text-[13px] leading-snug ${empty ? "text-[#b3b8c2]" : "text-ink-strong font-medium"}`}>
        {empty ? "-" : value}
      </span>
    </div>
  );
}

function StatusDot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

const STAGE_TONE: Record<string, string> = {
  slate: "#64748b", blue: "#2563eb", amber: "#d97706", red: "#dc2626",
  purple: "#7c3aed", green: "#16a34a",
};
function tone(c: string): string {
  return STAGE_TONE[c] ?? "#64748b";
}

function StageRow({
  name,
  status,
  location,
  completedOn,
  notes,
}: {
  name: string;
  status: StageStatus;
  location?: string | null;
  completedOn?: Date | string | null;
  notes?: string | null;
}) {
  return (
    <div className="grid grid-cols-[110px_140px_minmax(120px,1fr)_110px] gap-3 rounded-lg bg-white px-3 py-2 max-md:grid-cols-2">
      <span className="text-[12.5px] font-bold text-ink-strong">{name}</span>
      <StatusDot color={tone(STAGE_STATUS_COLORS[status])}>
        <span className="text-[12.5px] font-medium text-ink-soft">{STAGE_STATUS_LABELS[status]}</span>
      </StatusDot>
      <span className="text-[12px] text-ink-soft">{location || "-"}</span>
      <span className="text-[12px] text-ink-subtle tabular-nums">{completedOn ? fmt(completedOn) : "-"}</span>
      {notes ? <span className="col-span-full text-[12px] text-ink-subtle">Note: {notes}</span> : null}
    </div>
  );
}

export function SampleSummaryPanel({ sample }: { sample: SampleOption }) {
  const s = sample;
  const status = s.sampleStatus as SampleStatus;
  const photos = s.photoUrls ?? [];
  const reports = s.reportsUploaded ?? [];

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-section border border-[#dfe2ea] bg-surface-soft p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-[#efeffb] text-[#3f3f94]">
            <FlaskConical className="h-[15px] w-[15px]" />
          </span>
          <span className="font-mono text-[13.5px] font-bold text-ink-strong">{s.sampleNo}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
            style={{ background: tone(SAMPLE_STATUS_COLORS[status]) }}
          >
            {SAMPLE_STATUS_LABELS[status]}
          </span>
        </div>
        <Link
          href={`/samples/${s.id}` as Route}
          target="_blank"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#3f3f94] hover:underline"
        >
          Open sample <ExternalLink className="h-[13px] w-[13px]" />
        </Link>
      </div>

      {/* Identity */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4">
        <Cell label="Sample Date" value={fmt(s.sampleDate)} />
        <Cell label="Location" value={s.location} />
        <Cell label="Responsible" value={s.responsibleName} />
        <Cell label="Linked Company" value={s.companyName} />
      </div>
      {s.sampleNotes && <Cell label="Sample Notes" value={s.sampleNotes} />}

      {/* Stage tracking */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#3f3f94]">Stage Tracking</span>
        <StageRow name="Dimension" status={s.dimensionStatus} location={s.dimensionLocation} completedOn={s.dimensionCompletedOn} notes={s.dimensionNotes} />
        <StageRow name="Chemical" status={s.chemicalStatus} location={s.chemicalLocation} completedOn={s.chemicalCompletedOn} notes={s.chemicalNotes} />
        <StageRow name="Drawing" status={s.drawingStatus} location={s.drawingLocation} completedOn={s.drawingCompletedOn} notes={s.drawingNotes} />
        <StageRow name="Costing" status={s.costingStatus} location={null} completedOn={s.costingCompletedOn} notes={null} />
      </div>

      {/* Reports & processing */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4">
        <Cell label="Reports Uploaded" value={reports.length ? reports.join(", ") : "-"} />
        <Cell label="In SM Folder" value={s.reportsInSmFolder ? "Yes" : "No"} />
        <Cell label="Processed Date" value={fmt(s.processedDate)} />
        <Cell label="Process Notes" value={s.processNotes} />
      </div>

      {/* Attachments */}
      {photos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[#3f3f94]">Attachments</span>
          <div className="flex flex-wrap gap-2">
            {photos.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft hover:border-brand hover:text-brand"
              >
                <Paperclip className="h-[13px] w-[13px]" />
                File {i + 1}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
