"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import {
  MEETING_PURPOSE_LABELS,
  MEETING_PURPOSE_COLORS,
} from "@/db/enums";
import type { ClientMeeting } from "@/db/schema";
import { updateClientMeeting } from "@/app/(app)/meetings/actions";
import type { UpdateClientMeetingInput } from "@/lib/validators/client-meeting";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Chip } from "@/components/inquiries/chip";
import { Field, SectionCard } from "@/components/inquiries/form-field";

interface Props {
  meeting: ClientMeeting;
  employees: EmployeeOption[];
}

/** The editable slice — RHF holds <input>-shaped values (date as YYYY-MM-DD);
 *  the dirty-only patch converts on save. */
interface MeetingEditValues {
  contactFirstName: string;
  contactLastName: string;
  contactPersonDesignation: string;
  contactNumber: string;
  contactEmail: string;
  clientType: string;
  meetingStartTime: string;
  meetingEndTime: string;
  meetingNotes: string;
  nextFollowUpDate: string;
}

/** Date → local YYYY-MM-DD for <input type="date"> defaults. */
function toDateInput(d: Date | null): string {
  if (!d) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Midnight-today, local — a follow-up dated strictly before now is overdue. */
function isPastDue(d: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

const DATE_KEYS = new Set<keyof MeetingEditValues>(["nextFollowUpDate"]);

/**
 * Daily-meeting detail — breadcrumb + header, a sticky sidebar (sales person,
 * client type, next follow-up, created), a read-only details card, and one
 * dirty-only edit form for the mutable fields. (No proof-of-visit selfie.)
 */
export function MeetingDetail({ meeting, employees }: Props) {
  const router = useRouter();

  const salesPerson =
    meeting.salesName ??
    employees.find((e) => e.id === meeting.salesPersonId)?.name ??
    null;
  const createdBy =
    employees.find((e) => e.id === meeting.createdById)?.name ?? null;

  const purposeTone = MEETING_PURPOSE_COLORS[meeting.purpose] ?? "slate";

  // Prefer the new first/last pair; fall back to the legacy combined column.
  const contactDisplayName =
    [meeting.contactFirstName, meeting.contactLastName]
      .filter(Boolean)
      .join(" ")
      .trim() || meeting.contactPersonName;

  // Start–end window for the header; falls back to the legacy single time.
  const timeLabel =
    [meeting.meetingStartTime, meeting.meetingEndTime]
      .filter(Boolean)
      .join(" – ") || meeting.meetingTime || null;

  const defaults: MeetingEditValues = {
    contactFirstName: meeting.contactFirstName ?? "",
    contactLastName: meeting.contactLastName ?? "",
    contactPersonDesignation: meeting.contactPersonDesignation ?? "",
    contactNumber: meeting.contactNumber ?? "",
    contactEmail: meeting.contactEmail ?? "",
    clientType: meeting.clientType ?? "",
    meetingStartTime: meeting.meetingStartTime ?? "",
    meetingEndTime: meeting.meetingEndTime ?? "",
    meetingNotes: meeting.meetingNotes ?? "",
    nextFollowUpDate: toDateInput(meeting.nextFollowUpDate),
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, dirtyFields, isSubmitting },
  } = useForm<MeetingEditValues>({ defaultValues: defaults });

  const onSubmit = handleSubmit(async (values) => {
    // Dirty-only patch — the action's strip-undefined + no-op short-circuit
    // handles the rest. The date input (YYYY-MM-DD) pins to noon UTC; an
    // emptied date folds to undefined (no null path on the backend yet).
    const patch = Object.fromEntries(
      Object.keys(dirtyFields).map((key) => {
        const k = key as keyof MeetingEditValues;
        const raw = values[k];
        const value =
          DATE_KEYS.has(k) && typeof raw === "string"
            ? raw
              ? new Date(`${raw}T12:00:00.000Z`).toISOString()
              : undefined
            : raw;
        return [k, value];
      }),
    ) as UpdateClientMeetingInput;
    if (Object.keys(patch).length === 0) return;
    const res = await updateClientMeeting(meeting.id, patch);
    if (res.ok) {
      fireToast({ message: "Meeting saved." });
      reset(values);
      router.refresh();
    } else {
      fireToast({ message: res.error, type: "error" });
    }
  });

  const followUpOverdue =
    meeting.nextFollowUpDate !== null && isPastDue(meeting.nextFollowUpDate);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Breadcrumb ──────────────────────────────────────────────── */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-[13px]"
      >
        <Link
          href={"/meetings" as Route}
          className="inline-flex items-center gap-1.5 font-semibold text-ink-muted hover:text-ink-strong transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={2.4} />
          Client Meetings
        </Link>
        <span aria-hidden className="text-ink-subtle">
          ·
        </span>
        <span
          aria-current="page"
          className="text-ink-subtle"
          style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}
        >
          {meeting.meetingNo}
        </span>
      </nav>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 -mt-2">
        <div className="min-w-0">
          <h1 className="font-mono text-[40px] leading-tight tracking-tight text-ink-strong">
            {meeting.meetingNo}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[14.5px] text-ink-muted">
            <span className="font-semibold text-ink-strong">
              {meeting.companyName}
            </span>
            <span aria-hidden className="text-ink-subtle">
              ·
            </span>
            {formatDate(meeting.meetingDate)}
            {timeLabel && (
              <>
                <span aria-hidden className="text-ink-subtle">
                  ·
                </span>
                <span className="tabular-nums">{timeLabel}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Chip
            label={MEETING_PURPOSE_LABELS[meeting.purpose]}
            tone={purposeTone}
          />
          <Link
            href={"/meetings/new" as Route}
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-4 py-2 text-[13.5px] font-bold text-ink-strong hover:border-hairline-strong hover:bg-surface-soft transition-colors"
          >
            <Plus size={14} strokeWidth={2.6} />
            New Meeting
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] items-start">
        {/* ── Main column ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Editable details — one dirty-only form. */}
          <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
            <SectionCard
              title="Details"
              hint="Contact, timing, purpose and notes — only changed fields are saved."
            >
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field id="mtgd-cfirst" label="Contact First Name">
                  <input
                    id="mtgd-cfirst"
                    type="text"
                    className="nt-input"
                    {...register("contactFirstName")}
                  />
                </Field>
                <Field id="mtgd-clast" label="Contact Last Name">
                  <input
                    id="mtgd-clast"
                    type="text"
                    className="nt-input"
                    {...register("contactLastName")}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field id="mtgd-desig" label="Designation">
                  <input
                    id="mtgd-desig"
                    type="text"
                    className="nt-input"
                    {...register("contactPersonDesignation")}
                  />
                </Field>
                <Field id="mtgd-cnumber" label="Number">
                  <input
                    id="mtgd-cnumber"
                    type="tel"
                    className="nt-input"
                    {...register("contactNumber")}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field id="mtgd-cemail" label="Email">
                  <input
                    id="mtgd-cemail"
                    type="email"
                    className="nt-input"
                    {...register("contactEmail")}
                  />
                </Field>
                <Field id="mtgd-clienttype" label="Client Type">
                  <input
                    id="mtgd-clienttype"
                    type="text"
                    className="nt-input"
                    {...register("clientType")}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field id="mtgd-start" label="Meeting Start Time">
                  <input
                    id="mtgd-start"
                    type="time"
                    className="nt-input"
                    {...register("meetingStartTime")}
                  />
                </Field>
                <Field id="mtgd-end" label="Meeting End Time">
                  <input
                    id="mtgd-end"
                    type="time"
                    className="nt-input"
                    {...register("meetingEndTime")}
                  />
                </Field>
              </div>

              {/* Purpose (read-only here — set on the form, immutable cue). */}
              <div className="flex flex-col gap-1">
                <span className="text-[14px] font-bold text-ink-strong">
                  Purpose of Meeting
                </span>
                <span className="text-[14px] text-ink-soft">
                  {MEETING_PURPOSE_LABELS[meeting.purpose]}
                  {meeting.purpose === "other" && meeting.purposeOther
                    ? ` — ${meeting.purposeOther}`
                    : ""}
                </span>
              </div>

              <Field id="mtgd-notes" label="Meeting Notes">
                <textarea
                  id="mtgd-notes"
                  rows={4}
                  className="nt-input resize-y"
                  style={{ fontWeight: 400 }}
                  {...register("meetingNotes")}
                />
              </Field>

              <Field id="mtgd-followup" label="Next Follow-Up Date">
                <input
                  id="mtgd-followup"
                  type="date"
                  className="nt-input"
                  {...register("nextFollowUpDate")}
                />
              </Field>

              <div className="flex items-center justify-end border-t border-hairline pt-4">
                <button
                  type="submit"
                  disabled={!isDirty || isSubmitting}
                  className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
                  }}
                >
                  {isSubmitting && (
                    <Loader2
                      size={14}
                      style={{ animation: "spinFast 0.8s linear infinite" }}
                    />
                  )}
                  Save Changes
                </button>
              </div>
            </SectionCard>
          </form>
        </div>

        {/* ── Sticky sidebar ─────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-24 flex flex-col gap-4 rounded-section border border-hairline bg-surface-card p-5">
          <SidebarRow label="Sales Person" value={salesPerson ?? "Not allocated"} />
          {meeting.salesDesignation && (
            <SidebarRow label="Sales Designation" value={meeting.salesDesignation} />
          )}
          {meeting.salesNumber && (
            <SidebarRow label="Sales Number" value={meeting.salesNumber} />
          )}
          {meeting.salesEmail && (
            <SidebarRow label="Sales Email" value={meeting.salesEmail} />
          )}
          <SidebarRow label="Contact" value={contactDisplayName} />
          {meeting.meetingSource && (
            <SidebarRow label="Meeting Source" value={meeting.meetingSource} />
          )}
          {meeting.clientType && (
            <SidebarRow label="Client Type" value={meeting.clientType} />
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
              Next Follow-Up
            </span>
            {meeting.nextFollowUpDate ? (
              <span
                className="text-[14px] font-semibold"
                style={
                  followUpOverdue
                    ? { color: "var(--color-red-deep)" }
                    : { color: "var(--color-ink-strong)" }
                }
                title={followUpOverdue ? "Follow-up overdue" : undefined}
              >
                {formatDate(meeting.nextFollowUpDate)}
                {followUpOverdue ? " · overdue" : ""}
              </span>
            ) : (
              <span className="text-[14px] font-semibold text-ink-subtle">
                None set
              </span>
            )}
          </div>
          <SidebarRow label="Created" value={formatDate(meeting.createdAt)} />
          {createdBy && <SidebarRow label="Created By" value={createdBy} />}
          <SidebarRow label="Last Updated" value={formatDate(meeting.updatedAt)} />
          <Link
            href={"/meetings" as Route}
            className="mt-1 inline-flex items-center gap-1.5 border-t border-hairline pt-4 text-[13px] font-semibold text-ink-muted hover:text-ink-strong transition-colors"
          >
            <ArrowLeft size={13} strokeWidth={2.4} />
            Open Register
          </Link>
        </aside>
      </div>
    </div>
  );
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
        {label}
      </span>
      <span className="text-[14px] font-semibold text-ink-strong">{value}</span>
    </div>
  );
}
