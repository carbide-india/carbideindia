"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { upload } from "@vercel/blob/client";
import { Camera, Loader2, X } from "lucide-react";
import {
  MEETING_PURPOSES,
  MEETING_PURPOSE_LABELS,
} from "@/db/enums";
import { CreateClientMeetingSchema } from "@/lib/validators/client-meeting";
import { createClientMeeting } from "@/app/(app)/meetings/actions";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/inquiries/searchable-select";
import {
  Field,
  SectionCard,
  Segmented,
} from "@/components/inquiries/form-field";
import type { EmployeeOption } from "@/lib/queries/employees";
import type { ClientOption } from "@/lib/queries/clients";
import type { MasterOptionItem } from "@/lib/queries/masters";

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands the
 *  parsed *output* (defaults applied, `""` folded to `undefined`) to the submit
 *  handler — which is exactly what createClientMeeting takes. */
type MeetingFormValues = z.input<typeof CreateClientMeetingSchema>;
type MeetingFormOutput = z.output<typeof CreateClientMeetingSchema>;

interface Props {
  defaultSalesPersonId: string;
  employees: EmployeeOption[];
  clients: ClientOption[];
  customerTypes: MasterOptionItem[];
}

/** Local YYYY-MM-DD for the date input's default (today, user's timezone). */
function todayLocalIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** <input type="date"> gives YYYY-MM-DD (or ""); pin to noon UTC so timezone
 *  wrap-arounds can't land the meeting on the wrong day (same treatment as the
 *  sample / inquiry forms). Empty folds to undefined. */
function toIsoNoon(s: string | undefined): string | undefined {
  return s ? new Date(`${s}T12:00:00.000Z`).toISOString() : undefined;
}

const PURPOSE_OPTIONS = MEETING_PURPOSES.map((p) => ({
  value: p,
  label: MEETING_PURPOSE_LABELS[p],
}));

/* ── Selfie upload (browser → Vercel Blob, client-direct) ────────────── */

const ALLOWED_SELFIE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const MAX_SELFIE_BYTES = 25 * 1024 * 1024;

function safePhotoName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "selfie";
}

/** Single-image client-direct upload, scoped to meeting-selfies/ — token minted
 *  by /api/meetings/selfie/upload (images only, 25 MB cap, random suffix). */
function uploadSelfieToBlob(file: File) {
  const contentType = file.type;
  return upload(`meeting-selfies/${safePhotoName(file.name)}`, file, {
    access: "public",
    handleUploadUrl: "/api/meetings/selfie/upload",
    contentType,
    clientPayload: JSON.stringify({ contentType }),
  });
}

/**
 * New Daily Client Meeting form — four card sections (Meeting / Client /
 * Outcome / Verification). The client-location selfie is required (the whole
 * point of this form is proof-of-visit), so the submit button is disabled
 * until one is uploaded.
 */
export function MeetingForm({
  defaultSalesPersonId,
  employees,
  clients,
  customerTypes,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Selfie lives in local state (source of truth) and is merged into the
  // payload via setValue on success — the schema requires it, so submit is
  // gated until it lands.
  const [selfieUrl, setSelfieUrl] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const clientNames = React.useMemo(
    () => clients.map((c) => c.name),
    [clients],
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<MeetingFormValues, unknown, MeetingFormOutput>({
    resolver: zodResolver(CreateClientMeetingSchema),
    defaultValues: {
      purpose: "regular_order",
      salesPersonId: defaultSalesPersonId,
      meetingDate: todayLocalIso(),
      companyName: "",
      contactPersonName: "",
    },
  });

  // Subscribe to the purpose field so the "Other" specify input reveals/hides.
  const watchedPurpose = useWatch({ control, name: "purpose" });
  const showSpecify = watchedPurpose === "other";

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after a remove
    if (!file) return;
    if (!ALLOWED_SELFIE_TYPES.has(file.type)) {
      fireToast({
        message: `${file.name}: only JPEG, PNG, WebP or HEIC images are allowed.`,
        type: "error",
      });
      return;
    }
    if (file.size > MAX_SELFIE_BYTES) {
      fireToast({ message: `${file.name} exceeds 25 MB.`, type: "error" });
      return;
    }
    setUploading(true);
    try {
      const blob = await uploadSelfieToBlob(file);
      setSelfieUrl(blob.url);
      setValue("selfieUrl", blob.url, { shouldValidate: true });
    } catch {
      // Missing BLOB_READ_WRITE_TOKEN (or a Blob outage) lands here.
      fireToast({
        message: "Selfie upload needs storage configured (Vercel Blob).",
        type: "error",
      });
    } finally {
      setUploading(false);
    }
  }

  function removeSelfie() {
    setSelfieUrl(null);
    setValue("selfieUrl", undefined, { shouldValidate: true });
  }

  const submit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res = await createClientMeeting({
        ...values,
        meetingDate: toIsoNoon(values.meetingDate),
        nextFollowUpDate: toIsoNoon(values.nextFollowUpDate),
        selfieUrl: selfieUrl ?? undefined,
      });
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: res.meetingNo
          ? `Meeting ${res.meetingNo} logged`
          : "Meeting logged",
        type: "success",
      });
      if (res.id) router.push(`/meetings/${res.id}`);
      else router.push("/meetings");
    });
  });

  const firstFieldError = Object.values(errors)[0]?.message as
    | string
    | undefined;

  const customerTypeNames = customerTypes.map((c) => c.name);

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {/* ── 1 · Meeting ──────────────────────────────────────────────── */}
      <SectionCard
        title="Meeting"
        hint="Who logged the visit, and when."
      >
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 items-start">
          <Field label="Sales Person" labelOnly>
            <Controller
              control={control}
              name="salesPersonId"
              render={({ field }) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select an employee…"
                  searchPlaceholder="Search employees…"
                  searchable
                  ariaLabel="Sales person"
                  options={employees.map((e) => ({
                    value: e.id,
                    label: e.name,
                  }))}
                />
              )}
            />
          </Field>
          <Field label="Client Type" labelOnly>
            <Controller
              control={control}
              name="clientType"
              render={({ field }) =>
                customerTypeNames.length ? (
                  <Select
                    value={field.value ?? ""}
                    onValueChange={(v) => field.onChange(v || undefined)}
                    placeholder="Select a client type…"
                    searchPlaceholder="Search types…"
                    ariaLabel="Client type"
                    options={customerTypeNames.map((n) => ({
                      value: n,
                      label: n,
                    }))}
                  />
                ) : (
                  <button
                    type="button"
                    disabled
                    aria-label="Client type — no options"
                    className="nt-input flex w-full items-center text-left text-ink-subtle cursor-not-allowed opacity-60"
                  >
                    No options — add in Admin → Masters
                  </button>
                )
              }
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="mtg-date" label="Date" required>
            <input
              id="mtg-date"
              type="date"
              required
              className="nt-input"
              {...register("meetingDate")}
            />
          </Field>
          <Field id="mtg-time" label="Time">
            <input
              id="mtg-time"
              type="time"
              className="nt-input"
              {...register("meetingTime")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 2 · Client ───────────────────────────────────────────────── */}
      <SectionCard
        title="Client"
        hint="Pick a known client to link it, or type a new company name."
      >
        <Field label="Company Name" labelOnly required>
          <Controller
            control={control}
            name="companyName"
            render={({ field }) => (
              <SearchableSelect
                value={field.value || undefined}
                onChange={(next) => {
                  field.onChange(next ?? "");
                  // Linking: if the typed/picked name matches a known client,
                  // carry its id; otherwise clear the link (custom company).
                  const match = clients.find(
                    (c) => c.name.toLowerCase() === (next ?? "").toLowerCase(),
                  );
                  setValue("clientId", match?.id, { shouldValidate: false });
                }}
                options={clientNames}
                allowCustom
                placeholder="Select or type a company…"
                searchPlaceholder="Search companies…"
                emptyText="No matching client — type to add a new company."
                ariaLabel="Company name"
                invalid={Boolean(errors.companyName)}
              />
            )}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="mtg-contact" label="Contact Person Name" required>
            <input
              id="mtg-contact"
              type="text"
              required
              className="nt-input"
              placeholder="e.g. Rahul Sharma"
              {...register("contactPersonName")}
            />
          </Field>
          <Field id="mtg-desig" label="Contact Person Designation">
            <input
              id="mtg-desig"
              type="text"
              className="nt-input"
              placeholder="e.g. Purchase Manager"
              {...register("contactPersonDesignation")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 3 · Outcome ──────────────────────────────────────────────── */}
      <SectionCard
        title="Outcome"
        hint="Why you met, what came of it, and when to follow up."
      >
        <Field label="Purpose of Meeting" labelOnly>
          <Controller
            control={control}
            name="purpose"
            render={({ field }) => (
              <Segmented
                options={PURPOSE_OPTIONS}
                value={field.value ?? "regular_order"}
                onChange={(v) => field.onChange(v ?? "regular_order")}
                allowClear={false}
                ariaLabel="Purpose of meeting"
              />
            )}
          />
        </Field>

        {showSpecify && (
          <Field id="mtg-purpose-other" label="Specify purpose" required>
            <input
              id="mtg-purpose-other"
              type="text"
              required
              className="nt-input"
              placeholder="Specify purpose…"
              {...register("purposeOther")}
            />
          </Field>
        )}

        <Field id="mtg-notes" label="Meeting Notes">
          <textarea
            id="mtg-notes"
            rows={4}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="What was discussed, decisions, action items…"
            {...register("meetingNotes")}
          />
        </Field>

        <Field id="mtg-followup" label="Next Follow-Up Date">
          <input
            id="mtg-followup"
            type="date"
            className="nt-input"
            {...register("nextFollowUpDate")}
          />
        </Field>
      </SectionCard>

      {/* ── 4 · Verification ─────────────────────────────────────────── */}
      <SectionCard
        title="Verification"
        hint="A single client-location selfie — proof you were on site."
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          aria-label="Add client-location selfie"
          onChange={(e) => void onPickFile(e)}
        />
        <Field label="Client Location Selfie" labelOnly required>
          <div className="flex flex-wrap items-start gap-3">
            {selfieUrl ? (
              <div className="relative size-[140px] overflow-hidden rounded-xl border border-hairline bg-surface-soft">
                {/* Blob URLs are remote + unconfigured for next/image — plain img. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selfieUrl}
                  alt="Client-location selfie"
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove selfie"
                  onClick={removeSelfie}
                  className="absolute right-1 top-1 inline-flex size-[22px] items-center justify-center rounded-full bg-white/90 text-ink-strong shadow-sm border border-hairline hover:bg-white transition-colors"
                >
                  <X size={13} strokeWidth={2.6} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex size-[140px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline-strong text-ink-subtle hover:text-ink-strong hover:border-ink-subtle transition-colors disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2
                    size={20}
                    style={{ animation: "spinFast 0.8s linear infinite" }}
                  />
                ) : (
                  <Camera size={20} />
                )}
                <span className="text-[11.5px] font-semibold">
                  {uploading ? "Uploading…" : "Add selfie"}
                </span>
              </button>
            )}
          </div>
          <p
            className="mt-2 text-[12.5px] font-semibold"
            style={{ color: "var(--color-red-deep)" }}
          >
            Required — proof of visit.
          </p>
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
          disabled={pending || uploading || !selfieUrl}
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
          {pending ? "Logging…" : "Log Meeting"}
        </button>
      </div>
    </form>
  );
}
