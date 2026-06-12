"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { Check, Loader2 } from "lucide-react";
import {
  SAMPLE_STATUSES,
  SAMPLE_STATUS_LABELS,
  SAMPLE_STATUS_COLORS,
  STAGE_STATUSES,
  STAGE_STATUS_LABELS,
  STAGE_LOCATIONS,
  SAMPLE_REPORT_TYPES,
  type StageStatus,
} from "@/db/enums";
import type { Sample } from "@/db/schema";
import { setSampleStatus, updateSample } from "@/app/(app)/samples/actions";
import type { UpdateSampleInput } from "@/lib/validators/sample";
import type { EmployeeOption } from "@/lib/queries/employees";
import { formatDate } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { Field, SectionCard, Segmented } from "@/components/inquiries/form-field";
import { StatusPicker } from "@/components/inquiries/status-picker";

/** Slim link block for the header — resolved server-side from inquiryId. */
export interface SampleInquiryLink {
  id: string;
  smNumber: string;
  companyName: string;
}

interface Props {
  sample: Sample;
  employees: EmployeeOption[];
  inquiryLink: SampleInquiryLink | null;
}

const STAGE_STATUS_OPTIONS = STAGE_STATUSES.map((s) => ({
  value: s,
  label: STAGE_STATUS_LABELS[s],
}));

const STAGE_LOCATION_OPTIONS = STAGE_LOCATIONS.map((l) => ({
  value: l,
  label: l,
}));

const SM_FOLDER_OPTIONS = [
  { value: "not_done" as const, label: "Not Done" },
  { value: "done" as const, label: "Done" },
];

const STAGE_ROWS = [
  {
    label: "Dimension",
    status: "dimensionStatus",
    location: "dimensionLocation",
    completed: "dimensionCompletedOn",
  },
  {
    label: "Chemical Analysis",
    status: "chemicalStatus",
    location: "chemicalLocation",
    completed: "chemicalCompletedOn",
  },
  {
    label: "Drawing",
    status: "drawingStatus",
    location: "drawingLocation",
    completed: "drawingCompletedOn",
  },
  {
    label: "Costing",
    status: "costingStatus",
    location: null,
    completed: "costingCompletedOn",
  },
] as const;

/** The editable slice of the sample — RHF holds <input>-shaped values
 *  (dates as YYYY-MM-DD strings); the dirty-only patch converts on save. */
interface SampleEditValues {
  dimensionStatus: StageStatus;
  dimensionLocation: string;
  dimensionCompletedOn: string;
  chemicalStatus: StageStatus;
  chemicalLocation: string;
  chemicalCompletedOn: string;
  drawingStatus: StageStatus;
  drawingLocation: string;
  drawingCompletedOn: string;
  costingStatus: StageStatus;
  costingCompletedOn: string;
  reportsUploaded: string[];
  reportsInSmFolder: boolean;
  processedDate: string;
  processNotes: string;
}

/** Date → local YYYY-MM-DD for <input type="date"> defaults. */
function toDateInput(d: Date | null): string {
  if (!d) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Keys whose YYYY-MM-DD input value must become a noon-UTC ISO timestamp. */
const DATE_KEYS = new Set<keyof SampleEditValues>([
  "dimensionCompletedOn",
  "chemicalCompletedOn",
  "drawingCompletedOn",
  "costingCompletedOn",
  "processedDate",
]);

/**
 * Sample detail — the register row in full: header with the SM link, sticky
 * status sidebar, photo grid, and one editable form (Stages + Reports) that
 * saves only the dirty fields via updateSample (same patch pattern as the
 * feasibility panel).
 */
export function SampleDetail({ sample, employees, inquiryLink }: Props) {
  const router = useRouter();

  const responsible =
    employees.find((e) => e.id === sample.responsiblePersonId)?.name ?? null;
  const createdBy =
    employees.find((e) => e.id === sample.createdById)?.name ?? null;

  const defaults: SampleEditValues = {
    dimensionStatus: sample.dimensionStatus,
    dimensionLocation: sample.dimensionLocation,
    dimensionCompletedOn: toDateInput(sample.dimensionCompletedOn),
    chemicalStatus: sample.chemicalStatus,
    chemicalLocation: sample.chemicalLocation,
    chemicalCompletedOn: toDateInput(sample.chemicalCompletedOn),
    drawingStatus: sample.drawingStatus,
    drawingLocation: sample.drawingLocation,
    drawingCompletedOn: toDateInput(sample.drawingCompletedOn),
    costingStatus: sample.costingStatus,
    costingCompletedOn: toDateInput(sample.costingCompletedOn),
    reportsUploaded: sample.reportsUploaded ?? [],
    reportsInSmFolder: sample.reportsInSmFolder,
    processedDate: toDateInput(sample.processedDate),
    processNotes: sample.processNotes ?? "",
  };

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { isDirty, dirtyFields, isSubmitting },
  } = useForm<SampleEditValues>({ defaultValues: defaults });

  const onSubmit = handleSubmit(async (values) => {
    // Dirty-only patch — the action's strip-undefined + no-op short-circuit
    // handles the rest. Date inputs (YYYY-MM-DD) pin to noon UTC; an emptied
    // date folds to undefined (dates can't be cleared once set — backend has
    // no null path yet).
    const patch = Object.fromEntries(
      Object.keys(dirtyFields).map((key) => {
        const k = key as keyof SampleEditValues;
        const raw = values[k];
        const value =
          DATE_KEYS.has(k) && typeof raw === "string"
            ? raw
              ? new Date(`${raw}T12:00:00.000Z`).toISOString()
              : undefined
            : raw;
        return [k, value];
      }),
    ) as UpdateSampleInput;
    if (Object.keys(patch).length === 0) return;
    const res = await updateSample(sample.id, patch);
    if (res.ok) {
      fireToast({ message: "Sample saved." });
      reset(values);
      router.refresh();
    } else {
      fireToast({ message: res.error, type: "error" });
    }
  });

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header>
        <p className="text-[12px] uppercase tracking-[0.18em] font-bold text-ink-subtle">
          Sales · Sample Register
        </p>
        <h1 className="font-mono text-[40px] leading-tight tracking-tight text-ink-strong">
          {sample.sampleNo}
        </h1>
        <p className="text-[15px] text-ink-muted">
          {inquiryLink ? (
            <>
              {inquiryLink.companyName}
              <span className="mx-2 text-ink-subtle">·</span>
              <Link
                href={`/inquiries/${inquiryLink.id}` as Route}
                className="font-semibold text-ink-strong hover:underline"
                style={{ fontFamily: "var(--font-mono)", fontSize: 13.5 }}
              >
                {inquiryLink.smNumber}
              </Link>
              <span className="mx-2 text-ink-subtle">·</span>
            </>
          ) : (
            <>
              Not linked to an enquiry
              <span className="mx-2 text-ink-subtle">·</span>
            </>
          )}
          {formatDate(sample.sampleDate)}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] items-start">
        {/* ── Main column ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Photos (read-only) */}
          <SectionCard title="Photos">
            {sample.photoUrls?.length ? (
              <div className="flex flex-wrap gap-3">
                {sample.photoUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block size-[120px] overflow-hidden rounded-xl border border-hairline bg-surface-soft"
                  >
                    {/* Blob URLs are remote + unconfigured for next/image — plain img. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Photo of sample ${sample.sampleNo}`}
                      className="size-full object-cover"
                    />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-ink-subtle">
                No photos uploaded for this sample.
              </p>
            )}
          </SectionCard>

          {/* One form for the whole editable area: Stages + Reports. */}
          <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
            <SectionCard
              title="Stages"
              hint="Status, location and completion per stage — only changed fields are saved."
            >
              <div className="flex flex-col gap-3">
                {STAGE_ROWS.map((row) => (
                  <div
                    key={row.status}
                    className="flex flex-col gap-3 rounded-xl border border-hairline p-3"
                  >
                    <span className="text-[14px] font-bold text-ink-strong">
                      {row.label}
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      <Controller
                        control={control}
                        name={row.status}
                        render={({ field }) => (
                          <Segmented
                            options={STAGE_STATUS_OPTIONS}
                            value={field.value}
                            onChange={field.onChange}
                            allowClear={false}
                            ariaLabel={`${row.label} status`}
                          />
                        )}
                      />
                      {row.location && (
                        <Controller
                          control={control}
                          name={row.location}
                          render={({ field }) => (
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                              options={STAGE_LOCATION_OPTIONS}
                              ariaLabel={`${row.label} location`}
                              className="min-w-[200px]"
                            />
                          )}
                        />
                      )}
                      <input
                        type="date"
                        className="nt-input max-w-[180px]"
                        aria-label={`${row.label} completed on`}
                        {...register(row.completed)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Reports & Processing">
              <Field label="Sample Reports Uploaded">
                <Controller
                  control={control}
                  name="reportsUploaded"
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-2">
                      {SAMPLE_REPORT_TYPES.map((opt) => {
                        const selected = field.value ?? [];
                        const checked = selected.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() =>
                              field.onChange(
                                checked
                                  ? selected.filter((o) => o !== opt)
                                  : [...selected, opt],
                              )
                            }
                            className={cn(
                              "inline-flex items-center gap-2 rounded-chip border px-3 py-2 text-[13px] font-semibold transition-colors",
                              checked
                                ? "border-brand bg-brand/8 text-ink-strong"
                                : "border-hairline bg-surface-card text-ink-muted hover:border-hairline-strong hover:text-ink-strong",
                            )}
                          >
                            <span
                              className={cn(
                                "inline-flex size-[16px] items-center justify-center rounded-[4px] border transition-colors",
                                checked
                                  ? "bg-brand border-brand text-white"
                                  : "border-hairline-strong bg-white text-transparent",
                              )}
                            >
                              <Check size={11} strokeWidth={3} />
                            </span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field label="Reports in SM Folder">
                  <Controller
                    control={control}
                    name="reportsInSmFolder"
                    render={({ field }) => (
                      <Segmented
                        options={SM_FOLDER_OPTIONS}
                        value={field.value ? "done" : "not_done"}
                        onChange={(v) => field.onChange(v === "done")}
                        allowClear={false}
                        ariaLabel="Reports in SM folder"
                      />
                    )}
                  />
                </Field>
                <Field id="smpd-processed" label="Samples Processed Date">
                  <input
                    id="smpd-processed"
                    type="date"
                    className="nt-input"
                    {...register("processedDate")}
                  />
                </Field>
              </div>

              <Field id="smpd-process-notes" label="Sample Process Notes">
                <textarea
                  id="smpd-process-notes"
                  rows={3}
                  className="nt-input resize-y"
                  style={{ fontWeight: 400 }}
                  {...register("processNotes")}
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
          <div className="flex flex-col gap-2">
            <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
              Sample Status
            </span>
            <StatusPicker
              value={sample.sampleStatus}
              options={SAMPLE_STATUSES}
              labels={SAMPLE_STATUS_LABELS}
              tones={SAMPLE_STATUS_COLORS}
              onPick={(next) => setSampleStatus(sample.id, next)}
              ariaLabel="Sample status"
            />
          </div>
          <SidebarRow label="Responsible" value={responsible ?? "Not allocated"} />
          <SidebarRow label="Location" value={sample.location} />
          <SidebarRow label="Created" value={formatDate(sample.createdAt)} />
          {createdBy && <SidebarRow label="Created By" value={createdBy} />}
          <SidebarRow label="Last Updated" value={formatDate(sample.updatedAt)} />
          {sample.sampleNotes && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
                Sample Notes
              </span>
              <span className="text-[13.5px] text-ink-strong whitespace-pre-wrap break-words">
                {sample.sampleNotes}
              </span>
            </div>
          )}
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
