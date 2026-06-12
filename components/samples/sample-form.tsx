"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { upload } from "@vercel/blob/client";
import { Check, ImagePlus, Loader2, X } from "lucide-react";
import {
  SAMPLE_LOCATIONS,
  STAGE_STATUSES,
  STAGE_STATUS_LABELS,
  STAGE_LOCATIONS,
  SAMPLE_REPORT_TYPES,
} from "@/db/enums";
import { CreateSampleSchema } from "@/lib/validators/sample";
import { createSample } from "@/app/(app)/samples/actions";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/inquiries/searchable-select";
import { Field, SectionCard, Segmented } from "@/components/inquiries/form-field";
import type { InquiryOption } from "@/lib/queries/inquiries";
import type { EmployeeOption } from "@/lib/queries/employees";

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands
 *  the parsed *output* (defaults applied, `""` folded to `undefined`) to the
 *  submit handler — which is exactly what createSample takes. */
export type SampleFormValues = z.input<typeof CreateSampleSchema>;
type SampleFormOutput = z.output<typeof CreateSampleSchema>;

interface Props {
  inquiries: InquiryOption[];
  employees: EmployeeOption[];
}

/** Local YYYY-MM-DD for the date input's default (today, user's timezone). */
function todayLocalIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** <input type="date"> gives YYYY-MM-DD (or ""); pin to noon UTC so timezone
 *  wrap-arounds can't land the sample on the wrong day (same treatment as
 *  enquiryDate in the inquiry form). Empty folds to undefined. */
function toIsoNoon(s: string | undefined): string | undefined {
  return s ? new Date(`${s}T12:00:00.000Z`).toISOString() : undefined;
}

/* ── Photo upload (browser → Vercel Blob, client-direct) ─────────────── */

const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function safePhotoName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "photo";
}

/** Mirrors document-library's uploadToBlob, scoped to samples/: public blobs
 *  (rendered via plain <img>), images only, token minted by
 *  /api/samples/upload. */
function uploadPhotoToBlob(file: File) {
  const contentType = file.type;
  return upload(`samples/${safePhotoName(file.name)}`, file, {
    access: "public",
    handleUploadUrl: "/api/samples/upload",
    contentType,
    clientPayload: JSON.stringify({ contentType }),
  });
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

/** The four tracked stages — Costing has no location (it's in-house by
 *  definition on Manan's sheet). */
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

/**
 * New Sample form — four card sections (Sample / Photos / Stages / Reports &
 * Processing). The sample number derives server-side from the linked
 * enquiry's SM (`SM9579-01`); the manual input is the fallback for unlinked
 * samples. Every stage field defaults to its first option per Manan's
 * dashboard rule, so untouched stages read as incomplete.
 */
export function SampleForm({ inquiries, employees }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Photos live in local state (source of truth) and are merged into the
  // payload on submit — uploads run on file-pick, the save never waits on or
  // requires them.
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [uploadingCount, setUploadingCount] = React.useState(0);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SampleFormValues, unknown, SampleFormOutput>({
    resolver: zodResolver(CreateSampleSchema),
    defaultValues: {
      sampleDate: todayLocalIso(),
      inquiryId: undefined,
      sampleNo: "",
      location: "AYK Cabin",
      responsiblePersonId: undefined,
      sampleNotes: "",
      sampleStatus: "received",
      dimensionStatus: "not_started",
      dimensionLocation: "Undecided",
      dimensionCompletedOn: "",
      chemicalStatus: "not_started",
      chemicalLocation: "Undecided",
      chemicalCompletedOn: "",
      drawingStatus: "not_started",
      drawingLocation: "Undecided",
      drawingCompletedOn: "",
      costingStatus: "not_started",
      costingCompletedOn: "",
      reportsUploaded: [],
      reportsInSmFolder: false,
      processedDate: "",
      processNotes: "",
    },
  });

  // SearchableSelect speaks display strings; the form stores the inquiry id.
  const labelById = React.useMemo(
    () => new Map(inquiries.map((i) => [i.id, `${i.smNumber} — ${i.companyName}`])),
    [inquiries],
  );
  const idByLabel = React.useMemo(
    () => new Map(inquiries.map((i) => [`${i.smNumber} — ${i.companyName}`, i.id])),
    [inquiries],
  );
  const inquiryLabels = React.useMemo(
    () => inquiries.map((i) => `${i.smNumber} — ${i.companyName}`),
    [inquiries],
  );

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file after a remove
    for (const file of files) {
      if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
        fireToast({
          message: `${file.name}: only JPEG, PNG or WebP images are allowed.`,
          type: "error",
        });
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        fireToast({ message: `${file.name} exceeds 10 MB.`, type: "error" });
        continue;
      }
      setUploadingCount((n) => n + 1);
      try {
        const blob = await uploadPhotoToBlob(file);
        setPhotos((prev) => [...prev, blob.url]);
      } catch {
        // Missing BLOB_READ_WRITE_TOKEN (or a Blob outage) lands here — the
        // photo is skipped, the form still saves without it.
        fireToast({
          message: "Photo upload unavailable — check storage configuration.",
          type: "error",
        });
      } finally {
        setUploadingCount((n) => n - 1);
      }
    }
  }

  const submit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res = await createSample({
        ...values,
        sampleDate: toIsoNoon(values.sampleDate),
        dimensionCompletedOn: toIsoNoon(values.dimensionCompletedOn),
        chemicalCompletedOn: toIsoNoon(values.chemicalCompletedOn),
        drawingCompletedOn: toIsoNoon(values.drawingCompletedOn),
        costingCompletedOn: toIsoNoon(values.costingCompletedOn),
        processedDate: toIsoNoon(values.processedDate),
        photoUrls: photos.length ? photos : undefined,
      });
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: res.sampleNo
          ? `Sample ${res.sampleNo} registered`
          : "Sample registered",
        type: "success",
      });
      if (res.id) router.push(`/samples/${res.id}`);
      else router.push("/samples" as Route);
    });
  });

  const firstFieldError = Object.values(errors)[0]?.message as
    | string
    | undefined;
  const inquiryId = watch("inquiryId");

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {/* ── 1 · Sample ───────────────────────────────────────────────── */}
      <SectionCard
        title="Sample"
        hint="Link an enquiry and the sample number derives from its SM automatically."
      >
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="smp-date" label="Date">
            <input
              id="smp-date"
              type="date"
              className="nt-input"
              {...register("sampleDate")}
            />
          </Field>
          <Field id="smp-location" label="Location">
            <Controller
              control={control}
              name="location"
              render={({ field }) => (
                <Select
                  id="smp-location"
                  value={field.value ?? "AYK Cabin"}
                  onValueChange={field.onChange}
                  options={SAMPLE_LOCATIONS.map((l) => ({ value: l, label: l }))}
                />
              )}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="smp-inquiry" label="Linked Enquiry">
            <Controller
              control={control}
              name="inquiryId"
              render={({ field }) => (
                <SearchableSelect
                  id="smp-inquiry"
                  value={field.value ? labelById.get(field.value) : undefined}
                  onChange={(label) =>
                    field.onChange(label ? idByLabel.get(label) : undefined)
                  }
                  options={inquiryLabels}
                  placeholder="Select an enquiry…"
                  searchPlaceholder="Search SM number or company…"
                  emptyText="No enquiries match."
                />
              )}
            />
            <p className="text-[12.5px] text-ink-subtle">
              Leave Sample No blank to auto-number from the SM (e.g. SM9579-01).
            </p>
          </Field>
          <Field id="smp-no" label="Sample No" required={!inquiryId}>
            <input
              id="smp-no"
              type="text"
              className="nt-input"
              placeholder={inquiryId ? "Auto from SM…" : "e.g. SMP-001"}
              style={{ fontFamily: "var(--font-mono)", fontSize: 13.5 }}
              {...register("sampleNo")}
            />
          </Field>
        </div>

        <Field id="smp-resp" label="Responsible Person">
          <Controller
            control={control}
            name="responsiblePersonId"
            render={({ field }) => (
              <Select
                id="smp-resp"
                value={field.value ?? ""}
                onValueChange={(v) => field.onChange(v || undefined)}
                placeholder="Select an employee…"
                searchPlaceholder="Search employees…"
                searchable
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
              />
            )}
          />
        </Field>

        <Field id="smp-notes" label="Sample Notes">
          <textarea
            id="smp-notes"
            rows={3}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="Anything the team should know about this sample…"
            {...register("sampleNotes")}
          />
        </Field>
      </SectionCard>

      {/* ── 2 · Photos ───────────────────────────────────────────────── */}
      <SectionCard
        title="Photos"
        hint="JPEG, PNG or WebP up to 10 MB each — uploads run immediately; the sample saves fine without photos."
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          aria-label="Add sample photos"
          onChange={(e) => void onPickFiles(e)}
        />
        <div className="flex flex-wrap items-start gap-3">
          {photos.map((url) => (
            <div
              key={url}
              className="relative size-[96px] overflow-hidden rounded-xl border border-hairline bg-surface-soft"
            >
              {/* Blob URLs are remote + unconfigured for next/image — plain img. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Sample photo"
                className="size-full object-cover"
              />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => setPhotos((prev) => prev.filter((u) => u !== url))}
                className="absolute right-1 top-1 inline-flex size-[22px] items-center justify-center rounded-full bg-white/90 text-ink-strong shadow-sm border border-hairline hover:bg-white transition-colors"
              >
                <X size={13} strokeWidth={2.6} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingCount > 0}
            className="inline-flex size-[96px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline-strong text-ink-subtle hover:text-ink-strong hover:border-ink-subtle transition-colors disabled:opacity-60"
          >
            {uploadingCount > 0 ? (
              <Loader2
                size={18}
                style={{ animation: "spinFast 0.8s linear infinite" }}
              />
            ) : (
              <ImagePlus size={18} />
            )}
            <span className="text-[11.5px] font-semibold">
              {uploadingCount > 0 ? "Uploading…" : "Add photos"}
            </span>
          </button>
        </div>
      </SectionCard>

      {/* ── 3 · Stages ───────────────────────────────────────────────── */}
      <SectionCard
        title="Stages"
        hint="Dimension, chemical analysis, drawing and costing — first options mean 'not started yet', so dashboards can flag incomplete stages."
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
                        value={field.value ?? "Undecided"}
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

      {/* ── 4 · Reports & Processing ─────────────────────────────────── */}
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
          <Field id="smp-processed" label="Samples Processed Date">
            <input
              id="smp-processed"
              type="date"
              className="nt-input"
              {...register("processedDate")}
            />
          </Field>
        </div>

        <Field id="smp-process-notes" label="Sample Process Notes">
          <textarea
            id="smp-process-notes"
            rows={3}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="How the sample was (or should be) processed…"
            {...register("processNotes")}
          />
        </Field>
      </SectionCard>

      {(serverError || firstFieldError) && (
        <p
          className="font-semibold"
          style={{ fontSize: 14, color: "var(--color-red-deep)" }}
        >
          {serverError ?? firstFieldError}
        </p>
      )}

      <div
        className="flex items-center justify-end gap-3 pt-2"
        style={{ borderTop: "1px solid var(--color-hairline)" }}
      >
        <button
          type="submit"
          disabled={pending}
          className="text-cta text-white px-8 py-4 rounded-chip transition-transform disabled:opacity-50"
          style={{
            background:
              "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
            boxShadow: "0 6px 16px rgba(63, 63, 148, 0.34)",
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: "0.005em",
          }}
        >
          {pending ? "Registering…" : "Register Sample"}
        </button>
      </div>
    </form>
  );
}
