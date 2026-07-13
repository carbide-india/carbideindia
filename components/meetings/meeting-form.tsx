"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  MEETING_PURPOSES,
  MEETING_PURPOSE_LABELS,
  MEETING_SOURCES,
} from "@/db/enums";
import { CreateClientMeetingSchema } from "@/lib/validators/client-meeting";
import { createClientMeeting } from "@/app/(app)/meetings/actions";
import { useFormDraft } from "@/components/drafts/use-form-draft";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { NotesField } from "@/components/ui/notes-field";
import { SearchableSelect } from "@/components/inquiries/searchable-select";
import {
  Field,
  SectionCard,
  Segmented,
} from "@/components/inquiries/form-field";
import type { EmployeeOption } from "@/lib/queries/employees";
import type { ClientAutofill, ClientOption } from "@/lib/queries/clients";
import type { MasterOptionItem } from "@/lib/queries/masters";

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands the
 *  parsed *output* (defaults applied, `""` folded to `undefined`) to the submit
 *  handler — which is exactly what createClientMeeting takes. */
export type MeetingFormValues = z.input<typeof CreateClientMeetingSchema>;
type MeetingFormOutput = z.output<typeof CreateClientMeetingSchema>;

interface Props {
  defaultSalesPersonId: string;
  defaultSalesName: string;
  defaultSalesEmail: string;
  employees: EmployeeOption[];
  clients: ClientOption[];
  customerTypes: MasterOptionItem[];
  /** Resumed/edit prefill: spread over the base defaults. */
  initialValues?: Partial<MeetingFormValues>;
  /** Enable auto-saving this form as a draft while typing. */
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
 *  wrap-arounds can't land the meeting on the wrong day (same treatment as the
 *  sample / inquiry forms). Empty folds to undefined. */
function toIsoNoon(s: string | undefined): string | undefined {
  return s ? new Date(`${s}T12:00:00.000Z`).toISOString() : undefined;
}

const PURPOSE_OPTIONS = MEETING_PURPOSES.map((p) => ({
  value: p,
  label: MEETING_PURPOSE_LABELS[p],
}));

const SOURCE_OPTIONS = MEETING_SOURCES.map((s) => ({ value: s, label: s }));
const OTHER_SOURCE = "Other";

/**
 * New Daily Client Meeting form — four card sections (Sales Person / Meeting /
 * Client / Outcome). No selfie: the proof-of-visit gate was dropped, so submit
 * is enabled as soon as the required fields are valid.
 */
export function MeetingForm({
  defaultSalesPersonId,
  defaultSalesName,
  defaultSalesEmail,
  employees,
  clients,
  customerTypes,
  initialValues,
  enableDrafts,
  resumeDraftId,
}: Props) {
  const draftsOn = Boolean(enableDrafts);
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Meeting Source uses the sample-form's Other→specify dance: a local "face"
  // (which preset is selected) drives whether the specify input shows; the
  // TYPED text is what we store in meetingSource (never the literal "Other").
  const [sourceChoice, setSourceChoice] = React.useState<string>("");
  const sourceSpecifying = sourceChoice === OTHER_SOURCE;

  // Guards against an older client-autofill fetch landing after a newer pick.
  const autofillSeq = React.useRef(0);

  const clientNames = React.useMemo(
    () => clients.map((c) => c.name),
    [clients],
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<MeetingFormValues, unknown, MeetingFormOutput>({
    resolver: zodResolver(CreateClientMeetingSchema),
    defaultValues: {
      purpose: "regular_order",
      salesPersonId: defaultSalesPersonId,
      salesName: defaultSalesName,
      salesEmail: defaultSalesEmail || undefined,
      meetingDate: todayLocalIso(),
      companyName: "",
      contactFirstName: "",
      meetingSource: undefined,
      // Resumed draft prefills header/client/outcome fields.
      ...initialValues,
    },
  });

  // ── Draft auto-save (silent, runs in background) ──
  const { discard } = useFormDraft({
    kind: "meeting",
    enabled: draftsOn,
    resumeDraftId,
    watch,
    getValues,
  });

  // Subscribe to the purpose field so the "Other" specify input reveals/hides.
  const watchedPurpose = useWatch({ control, name: "purpose" });
  const showSpecify = watchedPurpose === "other";

  /**
   * A known client was picked — fetch its KYC snapshot and prefill the
   * editable Client Type / Contact fields. Custom (unknown) companies skip
   * this entirely. A fetchSeq ref drops stale responses from rapid re-picks.
   */
  async function prefillFromClient(clientId: string) {
    const seq = ++autofillSeq.current;
    try {
      const res = await fetch(`/api/clients/${clientId}/autofill`);
      if (!res.ok) throw new Error(`autofill ${res.status}`);
      const data = (await res.json()) as ClientAutofill;
      if (seq !== autofillSeq.current) return; // stale response
      if (data.customerTypeName) {
        setValue("clientType", data.customerTypeName, { shouldValidate: false });
      }
      if (data.contact) {
        if (data.contact.firstName) {
          setValue("contactFirstName", data.contact.firstName, {
            shouldValidate: true,
          });
        }
        if (data.contact.lastName) {
          setValue("contactLastName", data.contact.lastName, {
            shouldValidate: false,
          });
        }
        if (data.contact.designation) {
          setValue("contactPersonDesignation", data.contact.designation, {
            shouldValidate: false,
          });
        }
        if (data.contact.contactNo) {
          setValue("contactNumber", data.contact.contactNo, {
            shouldValidate: false,
          });
        }
        if (data.contact.email) {
          setValue("contactEmail", data.contact.email, {
            shouldValidate: false,
          });
        }
      }
    } catch {
      // Network/fetch failure — leave the fields for manual entry, no toast
      // (the company name is already set; prefill is a convenience).
    }
  }

  const submit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res = await createClientMeeting({
        ...values,
        meetingDate: toIsoNoon(values.meetingDate),
        nextFollowUpDate: toIsoNoon(values.nextFollowUpDate),
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
      // Meeting saved — retire the draft so it leaves the Drafts inbox.
      if (draftsOn) await discard();
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
      {/* ── 1 · Sales Person ─────────────────────────────────────────── */}
      <SectionCard
        title="Sales Person"
        hint="Who met the client — prefilled from your profile."
        inlineHint
      >
        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
          <Field id="mtg-sales-name" label="Name" required>
            <input
              id="mtg-sales-name"
              type="text"
              required
              className="nt-input"
              placeholder="e.g. Priya Nair"
              {...register("salesName")}
            />
          </Field>
          <Field id="mtg-sales-number" label="Sales Number">
            <input
              id="mtg-sales-number"
              type="tel"
              className="nt-input"
              placeholder="e.g. +91 98765 43210"
              {...register("salesNumber")}
            />
          </Field>
          <Field id="mtg-sales-desig" label="Designation">
            <input
              id="mtg-sales-desig"
              type="text"
              className="nt-input"
              placeholder="e.g. Sales Executive"
              {...register("salesDesignation")}
            />
          </Field>
          <Field id="mtg-sales-email" label="Email">
            <input
              id="mtg-sales-email"
              type="email"
              className="nt-input"
              placeholder="e.g. priya@carbideindia.com"
              {...register("salesEmail")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 2 · Meeting ──────────────────────────────────────────────── */}
      <SectionCard
        title="Meeting"
        hint="When the visit happened, and how it came about."
        inlineHint
      >
        <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-md:grid-cols-1">
          <Field id="mtg-date" label="Date" required>
            <input
              id="mtg-date"
              type="date"
              required
              className="nt-input"
              {...register("meetingDate")}
            />
          </Field>
          <Field id="mtg-start" label="Meeting Start Time">
            <input
              id="mtg-start"
              type="time"
              className="nt-input"
              {...register("meetingStartTime")}
            />
          </Field>
          <Field id="mtg-end" label="Meeting End Time">
            <input
              id="mtg-end"
              type="time"
              className="nt-input"
              {...register("meetingEndTime")}
            />
          </Field>
          <Field label="Meeting Source" labelOnly>
            <div className="flex flex-col gap-2">
              <Controller
                control={control}
                name="meetingSource"
                render={({ field }) => (
                  <Select
                    value={sourceChoice}
                    onValueChange={(next) => {
                      setSourceChoice(next);
                      // Store the preset directly; "Other" defers to the typed
                      // specify input below (cleared until the user types).
                      field.onChange(next === OTHER_SOURCE ? undefined : next || undefined);
                    }}
                    placeholder="Select a source"
                    ariaLabel="Meeting source"
                    options={SOURCE_OPTIONS}
                  />
                )}
              />
              {sourceSpecifying && (
                <Controller
                  control={control}
                  name="meetingSource"
                  render={({ field }) => (
                    <input
                      type="text"
                      required
                      maxLength={80}
                      className="nt-input"
                      placeholder="Specify source"
                      aria-label="Meeting source — specify"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || undefined)}
                    />
                  )}
                />
              )}
            </div>
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
                    placeholder="Select a client type"
                    searchPlaceholder="Search types"
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
      </SectionCard>

      {/* ── 3 · Client ───────────────────────────────────────────────── */}
      <SectionCard
        title="Client"
        hint="Pick a known client to link it, or type a new company name."
        inlineHint
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
                  // Known client → prefill its KYC type + contact (editable).
                  if (match) {
                    void prefillFromClient(match.id);
                  } else {
                    // Custom/unknown company: invalidate any in-flight prefill.
                    autofillSeq.current++;
                  }
                }}
                options={clientNames}
                allowCustom
                placeholder="Select or type a company"
                searchPlaceholder="Search companies"
                emptyText="No matching client — type to add a new company."
                ariaLabel="Company name"
                invalid={Boolean(errors.companyName)}
              />
            )}
          />
        </Field>

        <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-md:grid-cols-1">
          <Field id="mtg-cfirst" label="Contact First Name" required>
            <input
              id="mtg-cfirst"
              type="text"
              required
              className="nt-input"
              placeholder="e.g. Rahul"
              {...register("contactFirstName")}
            />
          </Field>
          <Field id="mtg-clast" label="Contact Last Name">
            <input
              id="mtg-clast"
              type="text"
              className="nt-input"
              placeholder="e.g. Sharma"
              {...register("contactLastName")}
            />
          </Field>
          <Field id="mtg-cdesig" label="Designation">
            <input
              id="mtg-cdesig"
              type="text"
              className="nt-input"
              placeholder="e.g. Purchase Manager"
              {...register("contactPersonDesignation")}
            />
          </Field>
          <Field id="mtg-cnumber" label="Number">
            <input
              id="mtg-cnumber"
              type="tel"
              className="nt-input"
              placeholder="e.g. +91 98765 43210"
              {...register("contactNumber")}
            />
          </Field>
          <Field id="mtg-cemail" label="Email">
            <input
              id="mtg-cemail"
              type="email"
              className="nt-input"
              placeholder="e.g. rahul@acmetools.com"
              {...register("contactEmail")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 4 · Outcome ──────────────────────────────────────────────── */}
      <SectionCard
        title="Outcome"
        hint="Why you met, what came of it, and when to follow up."
        inlineHint
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
                activeTone="brand"
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
              placeholder="Specify purpose"
              {...register("purposeOther")}
            />
          </Field>
        )}

        <Field id="mtg-notes" label="Meeting Notes">
          <Controller
            control={control}
            name="meetingNotes"
            render={({ field }) => (
              <NotesField
                id="mtg-notes"
                rows={4}
                placeholder="What was discussed, decisions, action items"
                value={field.value ?? ""}
                onChange={field.onChange}
              />
            )}
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
          {pending ? "Logging" : "Log Meeting"}
        </button>
      </div>
    </form>
  );
}
