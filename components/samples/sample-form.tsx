"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { upload } from "@vercel/blob/client";
import { Check, Paperclip, Loader2, X, Film, Music, FileText } from "lucide-react";
import {
  SAMPLE_ATTACHMENT_TYPES,
  SAMPLE_MAX_ATTACHMENT_BYTES,
  SAMPLE_ATTACHMENT_ACCEPT,
  attachmentKind,
  attachmentName,
} from "@/lib/samples/attachments";
import {
  SAMPLE_LOCATIONS,
  SAMPLE_STATUSES,
  SAMPLE_STATUS_LABELS,
  STAGE_STATUSES,
  STAGE_STATUS_LABELS,
  STAGE_LOCATIONS,
  SAMPLE_REPORT_TYPES,
} from "@/db/enums";
import { CreateSampleSchema } from "@/lib/validators/sample";
import { createSample } from "@/app/(app)/samples/actions";
import { useFormDraft } from "@/components/drafts/use-form-draft";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { NotesField } from "@/components/ui/notes-field";
import { LocationSelect } from "@/components/samples/location-select";
import {
  Field,
  MiniField,
  SectionCard,
  Segmented,
} from "@/components/inquiries/form-field";
import type { EmployeeOption } from "@/lib/queries/employees";

/** Form-level schema: the register form always requires a Sample No (the
 *  linked-enquiry auto-numbering path still exists server-side, it's just no
 *  longer driven from this form). */
const SampleFormSchema = CreateSampleSchema.superRefine((v, ctx) => {
  if (!v.sampleNo && !v.inquiryId) {
    ctx.addIssue({
      code: "custom",
      path: ["sampleNo"],
      message: "Sample No is required.",
    });
  }
});

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands
 *  the parsed *output* (defaults applied, `""` folded to `undefined`) to the
 *  submit handler - which is exactly what createSample takes. */
export type SampleFormValues = z.input<typeof SampleFormSchema>;
type SampleFormOutput = z.output<typeof SampleFormSchema>;

interface Props {
  employees: EmployeeOption[];
  /** Editable Sample Location options (Custom Dropdown Master). Falls back to
   *  the built-in SAMPLE_LOCATIONS. */
  sampleLocationOptions?: string[];
  /** Editable Stage Location options (Custom Dropdown Master). Falls back to
   *  the built-in STAGE_LOCATIONS. */
  stageLocationOptions?: string[];
  /** Prefill values (used to resume a saved draft). */
  initialValues?: Partial<SampleFormValues>;
  /** Enable auto-saving this form as a draft. */
  enableDrafts?: boolean;
  /** When resuming a draft, its id (auto-save continues into the same draft). */
  resumeDraftId?: string;
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

/* ── Attachment upload (browser → Vercel Blob, client-direct) ────────── */

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

/** Public sample blob (photos/videos/audio/docs), token minted by
 *  /api/samples/upload. */
function uploadAttachmentToBlob(file: File) {
  const contentType = file.type;
  return upload(`samples/${safeFileName(file.name)}`, file, {
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

const SAMPLE_STATUS_OPTIONS = SAMPLE_STATUSES.map((s) => ({
  value: s,
  label: SAMPLE_STATUS_LABELS[s],
}));

const SM_FOLDER_OPTIONS = [
  { value: "not_done" as const, label: "Not Done" },
  { value: "done" as const, label: "Done" },
];

/** The three location-tracked stages - Costing is its own section with no
 *  location (it's in-house by definition on Manan's sheet). */
const TRACKED_STAGES = [
  {
    label: "Dimension",
    status: "dimensionStatus",
    location: "dimensionLocation",
    completed: "dimensionCompletedOn",
    notes: "dimensionNotes",
    audio: "dimensionAudioUrl",
  },
  {
    label: "Chemical Analysis",
    status: "chemicalStatus",
    location: "chemicalLocation",
    completed: "chemicalCompletedOn",
    notes: "chemicalNotes",
    audio: "chemicalAudioUrl",
  },
  {
    label: "Drawing",
    status: "drawingStatus",
    location: "drawingLocation",
    completed: "drawingCompletedOn",
    notes: "drawingNotes",
    audio: "drawingAudioUrl",
  },
] as const;

/**
 * New Sample form - five card sections (Sample / Photos / Stage Tracking /
 * Costing / Reports & Processing). The Sample No is typed off the physical
 * sample or register (always required here). Every stage field defaults to
 * its first option per Manan's dashboard rule, so untouched stages read as
 * incomplete.
 */
export function SampleForm({
  employees,
  sampleLocationOptions,
  stageLocationOptions,
  initialValues,
  enableDrafts,
  resumeDraftId,
}: Props) {
  const draftsOn = Boolean(enableDrafts);
  // Location option lists - editable via the Custom Dropdown Master, with the
  // built-in enum arrays as the fallback.
  const sampleLocations =
    sampleLocationOptions?.length ? sampleLocationOptions : [...SAMPLE_LOCATIONS];
  const stageLocations =
    stageLocationOptions?.length ? stageLocationOptions : [...STAGE_LOCATIONS];
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Photos live in local state (source of truth) and are merged into the
  // payload on submit - uploads run on file-pick, the save never waits on or
  // requires them.
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [uploadingCount, setUploadingCount] = React.useState(0);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    getValues,
    formState: { errors },
  } = useForm<SampleFormValues, unknown, SampleFormOutput>({
    resolver: zodResolver(SampleFormSchema),
    defaultValues: {
      sampleDate: todayLocalIso(),
      sampleNo: "",
      location: "AYK Cabin",
      responsiblePersonId: undefined,
      sampleNotes: "",
      sampleStatus: "received",
      dimensionStatus: "not_started",
      dimensionLocation: "Undecided",
      dimensionCompletedOn: "",
      dimensionNotes: "",
      dimensionAudioUrl: "",
      chemicalStatus: "not_started",
      chemicalLocation: "Undecided",
      chemicalCompletedOn: "",
      chemicalNotes: "",
      chemicalAudioUrl: "",
      drawingStatus: "not_started",
      drawingLocation: "Undecided",
      drawingCompletedOn: "",
      drawingNotes: "",
      drawingAudioUrl: "",
      costingStatus: "not_started",
      costingCompletedOn: "",
      reportsUploaded: [],
      reportsInSmFolder: false,
      processedDate: "",
      processNotes: "",
      // Resumed-draft values override the base defaults so the form prefills.
      ...initialValues,
    },
  });

  const { discard } = useFormDraft({
    kind: "sample",
    enabled: draftsOn,
    resumeDraftId,
    watch,
    getValues,
  });

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file after a remove
    for (const file of files) {
      if (!SAMPLE_ATTACHMENT_TYPES.has(file.type)) {
        fireToast({
          message: `${file.name}: this file type isn't supported.`,
          type: "error",
        });
        continue;
      }
      if (file.size > SAMPLE_MAX_ATTACHMENT_BYTES) {
        fireToast({ message: `${file.name} exceeds 100 MB.`, type: "error" });
        continue;
      }
      setUploadingCount((n) => n + 1);
      try {
        const blob = await uploadAttachmentToBlob(file);
        setPhotos((prev) => [...prev, blob.url]);
      } catch {
        // Missing BLOB_READ_WRITE_TOKEN (or a Blob outage) lands here - the
        // file is skipped, the form still saves without it.
        fireToast({
          message: "Upload unavailable - check storage configuration.",
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
      // Sample saved - retire the draft so it leaves the Drafts inbox.
      await discard();
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

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {/* ── 1 · Sample ───────────────────────────────────────────────── */}
      <SectionCard
        title="Sample"
        hint="Sample number as written on the physical sample / register."
        inlineHint
      >
        <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-md:grid-cols-1 items-start">
          <Field id="smp-date" label="Date">
            <input
              id="smp-date"
              type="date"
              className="nt-input"
              {...register("sampleDate")}
            />
          </Field>
          <Field id="smp-no" label="Sample No" required>
            <input
              id="smp-no"
              type="text"
              required
              className="nt-input"
              placeholder="e.g. SM9657-01"
              style={{ fontFamily: "var(--font-mono)", fontSize: 13.5 }}
              {...register("sampleNo")}
            />
          </Field>
          <Field label="Sample Location" labelOnly>
            <Controller
              control={control}
              name="location"
              render={({ field }) => (
                <LocationSelect
                  value={field.value ?? "AYK Cabin"}
                  onChange={field.onChange}
                  options={sampleLocations}
                  otherOption="Other"
                  specifyPlaceholder="Specify location"
                  ariaLabel="Sample location"
                />
              )}
            />
          </Field>
          <Field label="Sample Status" labelOnly>
            <Controller
              control={control}
              name="sampleStatus"
              render={({ field }) => (
                <Select
                  value={field.value ?? "received"}
                  onValueChange={field.onChange}
                  options={SAMPLE_STATUS_OPTIONS}
                  ariaLabel="Sample status"
                />
              )}
            />
          </Field>
          <Field label="Responsible Person" labelOnly>
            <Controller
              control={control}
              name="responsiblePersonId"
              render={({ field }) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select an employee"
                  searchPlaceholder="Search employees"
                  searchable
                  ariaLabel="Responsible person"
                  options={employees.map((e) => ({
                    value: e.id,
                    label: e.name,
                  }))}
                />
              )}
            />
          </Field>
        </div>

        <Field id="smp-notes" label="Sample Notes">
          <Controller
            control={control}
            name="sampleNotes"
            render={({ field }) => (
              <NotesField
                id="smp-notes"
                rows={3}
                placeholder="Anything the team should know about this sample"
                value={field.value ?? ""}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
      </SectionCard>

      {/* ── 2 · Attachments ──────────────────────────────────────────── */}
      <SectionCard
        title="Attachments"
        hint="Photos, videos, audio or documents (PDF / Office) up to 100 MB each - the sample saves fine without any."
        inlineHint
      >
        <input
          ref={fileRef}
          type="file"
          accept={SAMPLE_ATTACHMENT_ACCEPT}
          multiple
          className="hidden"
          aria-label="Add sample attachments"
          onChange={(e) => void onPickFiles(e)}
        />
        <div className="flex flex-wrap items-start gap-3">
          {photos.map((url) => (
            <AttachmentTile
              key={url}
              url={url}
              onRemove={() => setPhotos((prev) => prev.filter((u) => u !== url))}
            />
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
              <Paperclip size={18} />
            )}
            <span className="text-[11.5px] font-semibold">
              {uploadingCount > 0 ? "Uploading" : "Add files"}
            </span>
          </button>
        </div>
      </SectionCard>

      {/* ── 3 · Stage Tracking ───────────────────────────────────────── */}
      <SectionCard
        title="Stage Tracking"
        hint="First option means 'not started yet', so dashboards can flag incomplete stages."
        inlineHint
      >
        <div className="flex flex-col gap-3">
          {TRACKED_STAGES.map((row) => (
            <div
              key={row.status}
              className="rounded-xl border border-hairline p-3"
            >
              {/* Everything on one line - name · Status · Location · Completed · Notes. */}
              <div className="grid grid-cols-[96px_150px_minmax(120px,0.8fr)_170px_minmax(170px,1.3fr)] items-end gap-3 max-xl:grid-cols-2 max-sm:grid-cols-1">
                <div className="flex items-end pb-2 text-[14px] font-bold text-ink-strong max-xl:col-span-2 max-sm:col-span-1">
                  {row.label}
                </div>
                <MiniField label="Status">
                  <Controller
                    control={control}
                    name={row.status}
                    render={({ field }) => (
                      <Select
                        options={STAGE_STATUS_OPTIONS}
                        value={field.value ?? ""}
                        onValueChange={(v) =>
                          field.onChange(v as (typeof STAGE_STATUSES)[number])
                        }
                        ariaLabel={`${row.label} status`}
                      />
                    )}
                  />
                </MiniField>
                <MiniField label="Location">
                  <Controller
                    control={control}
                    name={row.location}
                    render={({ field }) => (
                      <LocationSelect
                        value={field.value ?? "Undecided"}
                        onChange={field.onChange}
                        options={stageLocations}
                        otherOption="Others"
                        specifyPlaceholder="Specify lab / vendor"
                        ariaLabel={`${row.label} location`}
                      />
                    )}
                  />
                </MiniField>
                <MiniField label="Completed On">
                  <input
                    type="date"
                    className="nt-input w-full"
                    aria-label={`${row.label} completed on`}
                    {...register(row.completed)}
                  />
                </MiniField>
                <MiniField label="Notes">
                  <Controller
                    control={control}
                    name={row.notes}
                    render={({ field }) => (
                      <NotesField
                        ariaLabel={`${row.label} notes`}
                        rows={1}
                        placeholder={`Notes about the ${row.label.toLowerCase()} stage`}
                        value={(field.value as string | undefined) ?? ""}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </MiniField>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── 4 · Costing ──────────────────────────────────────────────── */}
      <SectionCard
        title="Costing"
        hint="In-house - status and completion only, no location."
        inlineHint
      >
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3.5">
          <MiniField label="Status" className="min-w-[200px]">
            <Controller
              control={control}
              name="costingStatus"
              render={({ field }) => (
                <Select
                  options={STAGE_STATUS_OPTIONS}
                  value={field.value ?? "not_started"}
                  onValueChange={(v) =>
                    field.onChange(v as (typeof STAGE_STATUSES)[number])
                  }
                  ariaLabel="Costing status"
                />
              )}
            />
          </MiniField>
          <MiniField label="Completed On">
            <input
              type="date"
              className="nt-input w-[180px]"
              aria-label="Costing completed on"
              {...register("costingCompletedOn")}
            />
          </MiniField>
        </div>
      </SectionCard>

      {/* ── 5 · Reports & Processing ─────────────────────────────────── */}
      <SectionCard title="Reports & Processing">
        <div className="grid grid-cols-[1fr_auto_auto] gap-5 max-lg:grid-cols-1 items-start">
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
                        "inline-flex items-center gap-2 rounded-chip border-[1.75px] px-3 py-2 text-[13px] font-semibold transition-colors",
                        checked
                          ? "border-brand bg-brand/8 text-ink-strong"
                          : "border-[#9199b6] bg-surface-card text-ink-strong hover:border-[#6f78a0] hover:bg-[#f3f4f8]",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex size-[16px] items-center justify-center rounded-[4px] border-[1.75px] transition-colors",
                          checked
                            ? "bg-brand border-brand text-white"
                            : "border-[#9199b6] bg-white text-transparent",
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
          <Controller
            control={control}
            name="processNotes"
            render={({ field }) => (
              <NotesField
                id="smp-process-notes"
                rows={3}
                placeholder="How the sample was (or should be) processed"
                value={field.value ?? ""}
                onChange={field.onChange}
              />
            )}
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
          {pending ? "Registering" : "Register Sample"}
        </button>
      </div>
    </form>
  );
}

/** One attachment preview - image thumbnail, inline video, audio icon, or a
 *  generic file chip, each with a remove button. */
function AttachmentTile({ url, onRemove }: { url: string; onRemove: () => void }) {
  const kind = attachmentKind(url);
  const name = attachmentName(url);
  const removeBtn = (
    <button
      type="button"
      aria-label="Remove attachment"
      onClick={onRemove}
      className="absolute right-1 top-1 z-10 inline-flex size-[22px] items-center justify-center rounded-full border border-hairline bg-white/90 text-ink-strong shadow-sm transition-colors hover:bg-white"
    >
      <X size={13} strokeWidth={2.6} />
    </button>
  );

  if (kind === "image") {
    return (
      <div className="relative size-[96px] overflow-hidden rounded-xl border border-hairline bg-surface-soft">
        {removeBtn}
        {/* Blob URLs are remote + unconfigured for next/image - plain img. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} className="size-full object-cover" />
      </div>
    );
  }
  if (kind === "video") {
    return (
      <div className="relative size-[96px] overflow-hidden rounded-xl border border-hairline bg-black">
        {removeBtn}
        <video src={url} className="size-full object-cover" muted playsInline />
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-white/90">
          <Film size={22} />
        </span>
      </div>
    );
  }
  return (
    <div className="relative flex size-[96px] flex-col items-center justify-center gap-1.5 rounded-xl border border-hairline bg-surface-soft px-2 text-center">
      {removeBtn}
      {kind === "audio" ? (
        <Music size={22} className="text-[#3f3f94]" />
      ) : (
        <FileText size={22} className="text-[#3f3f94]" />
      )}
      <span className="line-clamp-2 w-full break-all text-[10.5px] font-semibold text-ink-soft">
        {name}
      </span>
    </div>
  );
}
