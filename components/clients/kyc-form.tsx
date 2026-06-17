"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller, useFieldArray, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { upload } from "@vercel/blob/client";
import { Check, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { CreateClientKycSchema } from "@/lib/validators/client-kyc";
import { createClientKyc } from "@/app/(app)/clients/actions";
import { adminUpdateClientKyc } from "@/app/(admin)/admin/clients/actions";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { TagsInput } from "@/components/ui/tags-input";
import { INDIA_STATES, citiesForState } from "@/lib/data/india-states-cities";
import { SearchableSelect } from "@/components/inquiries/searchable-select";
import { Field, SectionCard } from "@/components/inquiries/form-field";
import type { MasterOptionItem } from "@/lib/queries/masters";
import type { EmployeeOption } from "@/lib/queries/employees";

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands
 *  the parsed *output* (`""` folded to `undefined`, currency/country
 *  defaulted) to the submit handler — exactly what createClientKyc takes. */
type KycFormValues = z.input<typeof CreateClientKycSchema>;
type KycFormOutput = z.output<typeof CreateClientKycSchema>;

interface Props {
  customerTypes: MasterOptionItem[];
  industryTypes: MasterOptionItem[];
  productTypes: MasterOptionItem[];
  employees: EmployeeOption[];
  /** When set, the form edits this client in place (admin "Edit client")
   *  instead of onboarding a new one. */
  editClientId?: string;
  /** Prefill values for edit mode — shaped like the form's input fields. */
  initialValues?: Partial<KycFormValues>;
}

/* ── Business-card upload (browser → Vercel Blob, client-direct) ──────── */

const ALLOWED_CARD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const MAX_CARD_BYTES = 25 * 1024 * 1024;

function safeCardName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "card";
}

/** Mirrors sample-form's photo upload, scoped to business-cards/: public
 *  blobs (rendered via plain <img>), images only, token minted by
 *  /api/clients/business-card/upload. */
function uploadCardToBlob(file: File) {
  const contentType = file.type;
  return upload(`business-cards/${safeCardName(file.name)}`, file, {
    access: "public",
    handleUploadUrl: "/api/clients/business-card/upload",
    contentType,
    clientPayload: JSON.stringify({ contentType }),
  });
}

/** <input type="time"> yields "" when cleared — the HH:MM regex must never see it. */
function emptyToUndefined(v: unknown): string | undefined {
  return v === "" || v == null ? undefined : String(v);
}

/**
 * Client KYC form — Manan's onboarding sheet as four card sections
 * (Company / Address / Contact Person / Meeting). Option lists for Customer
 * Type, Industry Type and Product Types are admin-managed masters. No selfie
 * field, no active toggle — both were explicit removals.
 */
export function KycForm({
  customerTypes,
  industryTypes,
  productTypes,
  employees,
  editClientId,
  initialValues,
}: Props) {
  const isEdit = Boolean(editClientId);
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);
  // "Select a state first" guard for the dependent City dropdown.
  const [cityGateError, setCityGateError] = React.useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<KycFormValues, unknown, KycFormOutput>({
    resolver: zodResolver(CreateClientKycSchema),
    defaultValues: {
      name: "",
      productTypeIds: [],
      state: "",
      city: "",
      addressLine1: "",
      addressLine2: "",
      addressLine3: "",
      addressLine4: "",
      pinCode: "",
      gstin: "",
      panNo: "",
      billToAddress: "",
      paymentTerms: "",
      freightCharges: "",
      qtyDeviation: "",
      tags: [],
      contactFirstName: "",
      contactLastName: "",
      contactDesignation: "",
      contactNo: "",
      contactEmail: "",
      contactNotes: "",
      additionalContacts: [],
      notes: "",
      meetingDate: "",
      meetingNotes: "",
      // Edit mode prefill — overrides the empty defaults field-by-field.
      ...initialValues,
    },
  });

  const { fields: additionalContactFields, append: appendContact, remove: removeContact } =
    useFieldArray({ control, name: "additionalContacts" });

  // Business-card scans live in form state via the URL fields — uploads run on
  // file-pick and never block the save. `front`/`back` track in-flight uploads.
  const cardFront = watch("businessCardFrontUrl");
  const cardBack = watch("businessCardBackUrl");
  const [uploading, setUploading] = React.useState<{
    front: boolean;
    back: boolean;
  }>({ front: false, back: false });

  async function onPickCard(file: File | undefined, side: "front" | "back") {
    if (!file) return;
    if (!ALLOWED_CARD_TYPES.has(file.type)) {
      fireToast({
        message: `${file.name}: only JPEG, PNG, WebP or HEIC images are allowed.`,
        type: "error",
      });
      return;
    }
    if (file.size > MAX_CARD_BYTES) {
      fireToast({ message: `${file.name} exceeds 25 MB.`, type: "error" });
      return;
    }
    setUploading((u) => ({ ...u, [side]: true }));
    try {
      const blob = await uploadCardToBlob(file);
      setValue(
        side === "front" ? "businessCardFrontUrl" : "businessCardBackUrl",
        blob.url,
      );
    } catch {
      // Missing BLOB_READ_WRITE_TOKEN (or a Blob outage) lands here — the
      // card is skipped, the form still saves without it.
      fireToast({
        message:
          "Business card upload unavailable — check storage configuration.",
        type: "error",
      });
    } finally {
      setUploading((u) => ({ ...u, [side]: false }));
    }
  }

  const submit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const payload = {
        ...values,
        // <input type="date"> gives YYYY-MM-DD; pin to noon UTC so timezone
        // wrap-arounds can't land the meeting on the wrong day.
        meetingDate: values.meetingDate
          ? new Date(`${values.meetingDate}T12:00:00.000Z`).toISOString()
          : undefined,
      };
      const res =
        isEdit && editClientId
          ? await adminUpdateClientKyc(editClientId, payload)
          : await createClientKyc(payload);
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: isEdit
          ? `${values.name} updated.`
          : `Client ${values.name} onboarded.`,
        type: "success",
      });
      router.push("/admin/clients" as Route);
      router.refresh();
    });
  });

  const firstFieldError = Object.values(errors)[0]?.message as
    | string
    | undefined;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {/* ── 1 · Company ──────────────────────────────────────────────── */}
      <SectionCard
        title="Company"
        hint="Who the client is — type, industry and the products they buy."
      >
        <Field id="kyc-name" label="Company Name" required>
          <input
            id="kyc-name"
            type="text"
            className="nt-input"
            placeholder="e.g. Precision Tools Pvt Ltd"
            {...register("name")}
          />
          {errors.name?.message && (
            <p className="text-[13px] font-semibold" style={{ color: "#D32F2F" }}>
              {errors.name.message}
            </p>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <MasterChips
            control={control}
            name="customerTypeId"
            label="Customer Type"
            options={customerTypes}
          />
          <MasterChips
            control={control}
            name="industryTypeId"
            label="Industry Type"
            options={industryTypes}
          />
        </div>

        <Field label="Sales Person" labelOnly>
          <Controller
            control={control}
            name="kycSalesPersonId"
            render={({ field }) => (
              <Select
                ariaLabel="Sales Person"
                value={field.value ?? ""}
                onValueChange={(v) => field.onChange(v || undefined)}
                placeholder={
                  employees.length === 0
                    ? "No employees yet"
                    : "Select an employee…"
                }
                disabled={employees.length === 0}
                searchable
                searchPlaceholder="Search employees…"
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
              />
            )}
          />
        </Field>

        {/* Product Types — checkbox chip grid over the admin-managed master. */}
        <Field label="Product Types">
          <Controller
            control={control}
            name="productTypeIds"
            render={({ field }) => {
              const selected = field.value ?? [];
              return (
                <>
                  {productTypes.length === 0 ? (
                    <p className="text-[13px] text-ink-subtle">
                      No product types yet — add them in Admin → Masters.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {productTypes.map((opt) => {
                        const checked = selected.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() =>
                              field.onChange(
                                checked
                                  ? selected.filter((id) => id !== opt.id)
                                  : [...selected, opt.id],
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
                            {opt.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[12px] text-ink-subtle">
                    {selected.length} selected
                  </p>
                </>
              );
            }}
          />
        </Field>

        {/* Tags — open, multi, optional categorization (Mining / Defense / …). */}
        <Field label="Tags">
          <Controller
            control={control}
            name="tags"
            render={({ field }) => (
              <TagsInput
                id="kyc-tags"
                value={field.value ?? []}
                onChange={field.onChange}
                placeholder="e.g. Mining, Defense, Cutting…"
              />
            )}
          />
        </Field>
      </SectionCard>

      {/* ── 2 · Address ──────────────────────────────────────────────── */}
      <SectionCard title="Address">
        {/* Address lines first, then State / City / Pin (Hetesh 2026-06-17). */}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="kyc-addr1" label="Address Line 1">
            <input id="kyc-addr1" type="text" className="nt-input" {...register("addressLine1")} />
          </Field>
          <Field id="kyc-addr2" label="Address Line 2">
            <input id="kyc-addr2" type="text" className="nt-input" {...register("addressLine2")} />
          </Field>
          <Field id="kyc-addr3" label="Address Line 3">
            <input id="kyc-addr3" type="text" className="nt-input" {...register("addressLine3")} />
          </Field>
          <Field id="kyc-addr4" label="Address Line 4">
            <input id="kyc-addr4" type="text" className="nt-input" {...register("addressLine4")} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          {/* State — always shown; allowCustom lets a foreign state be typed. */}
          <Field label="State" labelOnly>
            <Controller
              control={control}
              name="state"
              render={({ field }) => (
                <SearchableSelect
                  ariaLabel="State"
                  value={field.value || undefined}
                  onChange={(v) => {
                    field.onChange(v ?? "");
                    // State changed → the old city no longer applies.
                    setValue("city", "");
                    if (v) setCityGateError(false);
                  }}
                  options={INDIA_STATES}
                  placeholder="Select or type a state…"
                  searchPlaceholder="Search states…"
                  emptyText="No states match — type to add."
                  allowCustom
                />
              )}
            />
          </Field>
          <Field label="City" labelOnly>
            <Controller
              control={control}
              name="city"
              render={({ field }) => {
                const selectedState = watch("state") ?? "";
                return (
                  <>
                    <SearchableSelect
                      ariaLabel="City"
                      value={field.value || undefined}
                      onChange={(v) => field.onChange(v ?? "")}
                      options={citiesForState(selectedState)}
                      placeholder="Select city…"
                      searchPlaceholder="Search cities…"
                      emptyText="No cities match."
                      allowCustom
                      disabled={!selectedState}
                      invalid={cityGateError && !selectedState}
                      onDisabledClick={() => {
                        setCityGateError(true);
                        fireToast({
                          message: "Select a state first — the city list depends on it.",
                          type: "error",
                        });
                      }}
                    />
                    {cityGateError && !selectedState && (
                      <p className="text-[12.5px] font-semibold" style={{ color: "#D32F2F" }}>
                        Select a state first.
                      </p>
                    )}
                  </>
                );
              }}
            />
          </Field>
          <Field id="kyc-pin" label="Pin Code">
            <input
              id="kyc-pin"
              type="text"
              className="nt-input"
              {...register("pinCode")}
            />
          </Field>
        </div>

        <Field id="kyc-billto" label="Bill-to Address">
          <textarea
            id="kyc-billto"
            rows={2}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="Billing address (if different from the address above)"
            {...register("billToAddress")}
          />
        </Field>
      </SectionCard>

      {/* ── Tax & Commercial ─────────────────────────────────────────── */}
      <SectionCard
        title="Tax & Commercial"
        hint="GST / PAN and the commercial terms for this customer."
      >
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="kyc-gstin" label="GSTIN">
            <input id="kyc-gstin" type="text" className="nt-input" {...register("gstin")} />
          </Field>
          <Field id="kyc-pan" label="PAN / IT No">
            <input id="kyc-pan" type="text" className="nt-input" {...register("panNo")} />
          </Field>
          <Field id="kyc-payterms" label="Payment Terms">
            <input id="kyc-payterms" type="text" className="nt-input" {...register("paymentTerms")} />
          </Field>
          <Field id="kyc-freight" label="Freight Charges">
            <input id="kyc-freight" type="text" className="nt-input" {...register("freightCharges")} />
          </Field>
          <Field id="kyc-qtydev" label="Quantity Deviation">
            <input id="kyc-qtydev" type="text" className="nt-input" placeholder="e.g. ±10%" {...register("qtyDeviation")} />
          </Field>
        </div>
      </SectionCard>

      {/* ── 3 · Contact Person ───────────────────────────────────────── */}
      <SectionCard
        title="Contact Person"
        hint="Saved as the client's primary contact — auto-fetched on enquiries."
      >
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="kyc-cfirst" label="First Name">
            <input
              id="kyc-cfirst"
              type="text"
              className="nt-input"
              {...register("contactFirstName")}
            />
          </Field>
          <Field id="kyc-clast" label="Last Name">
            <input
              id="kyc-clast"
              type="text"
              className="nt-input"
              {...register("contactLastName")}
            />
          </Field>
          <Field id="kyc-cdesig" label="Designation">
            <input
              id="kyc-cdesig"
              type="text"
              className="nt-input"
              placeholder="e.g. Purchase Manager"
              {...register("contactDesignation")}
            />
          </Field>
          <Field id="kyc-cno" label="Contact No">
            <input
              id="kyc-cno"
              type="tel"
              className="nt-input"
              {...register("contactNo")}
            />
          </Field>
          <Field id="kyc-cemail" label="Email">
            <input
              id="kyc-cemail"
              type="email"
              className="nt-input"
              {...register("contactEmail")}
            />
          </Field>
        </div>
        <Field id="kyc-cnotes" label="Contact Notes">
          <textarea
            id="kyc-cnotes"
            rows={2}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="Notes about this contact person…"
            {...register("contactNotes")}
          />
        </Field>

        {/* Additional contacts */}
        {additionalContactFields.map((field, idx) => (
          <div
            key={field.id}
            className="rounded-xl border border-hairline bg-surface-soft p-4 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-ink-strong">
                Contact {idx + 2}
              </p>
              <button
                type="button"
                aria-label={`Remove contact ${idx + 2}`}
                onClick={() => removeContact(idx)}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-muted hover:text-red-600 transition-colors"
              >
                <Trash2 size={13} strokeWidth={2.4} />
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field id={`kyc-ac${idx}-first`} label="First Name" required>
                <input
                  id={`kyc-ac${idx}-first`}
                  type="text"
                  className="nt-input"
                  {...register(`additionalContacts.${idx}.firstName`)}
                />
              </Field>
              <Field id={`kyc-ac${idx}-last`} label="Last Name">
                <input
                  id={`kyc-ac${idx}-last`}
                  type="text"
                  className="nt-input"
                  {...register(`additionalContacts.${idx}.lastName`)}
                />
              </Field>
              <Field id={`kyc-ac${idx}-desig`} label="Designation">
                <input
                  id={`kyc-ac${idx}-desig`}
                  type="text"
                  className="nt-input"
                  placeholder="e.g. Purchase Manager"
                  {...register(`additionalContacts.${idx}.designation`)}
                />
              </Field>
              <Field id={`kyc-ac${idx}-no`} label="Contact No">
                <input
                  id={`kyc-ac${idx}-no`}
                  type="tel"
                  className="nt-input"
                  {...register(`additionalContacts.${idx}.contactNo`)}
                />
              </Field>
              <Field id={`kyc-ac${idx}-email`} label="Email">
                <input
                  id={`kyc-ac${idx}-email`}
                  type="email"
                  className="nt-input"
                  {...register(`additionalContacts.${idx}.email`)}
                />
              </Field>
            </div>
            <Field id={`kyc-ac${idx}-notes`} label="Notes">
              <textarea
                id={`kyc-ac${idx}-notes`}
                rows={2}
                className="nt-input resize-y"
                style={{ fontWeight: 400 }}
                placeholder="Notes about this contact…"
                {...register(`additionalContacts.${idx}.notes`)}
              />
            </Field>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            appendContact({
              firstName: "",
              lastName: "",
              designation: "",
              contactNo: "",
              email: "",
              notes: "",
            })
          }
          className="inline-flex items-center gap-1.5 self-start rounded-chip border border-hairline-strong bg-surface-card px-4 py-2 text-[13px] font-semibold text-ink-muted hover:text-ink-strong hover:border-ink-subtle transition-colors"
        >
          <Plus size={14} strokeWidth={2.6} />
          Add another contact
        </button>
      </SectionCard>

      {/* ── 4 · Business Card ────────────────────────────────────────── */}
      <SectionCard
        title="Business Card"
        hint="Optional scans of the contact's card — uploads run immediately; the client saves fine without them."
      >
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <CardUpload
            label="Front"
            url={cardFront}
            uploading={uploading.front}
            onPick={(f) => void onPickCard(f, "front")}
            onClear={() => setValue("businessCardFrontUrl", undefined)}
          />
          <CardUpload
            label="Back"
            url={cardBack}
            uploading={uploading.back}
            onPick={(f) => void onPickCard(f, "back")}
            onClear={() => setValue("businessCardBackUrl", undefined)}
          />
        </div>
      </SectionCard>

      {/* ── 5 · Notes ────────────────────────────────────────────────── */}
      <SectionCard title="Notes" hint="General notes about this client.">
        <Field id="kyc-notes" label="Client Notes">
          <textarea
            id="kyc-notes"
            rows={3}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="Any general notes about this client…"
            {...register("notes")}
          />
        </Field>
      </SectionCard>

      {/* ── 6 · Meeting ──────────────────────────────────────────────── */}
      <SectionCard title="Meeting">
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="kyc-mdate" label="Meeting Date">
            <input
              id="kyc-mdate"
              type="date"
              className="nt-input"
              {...register("meetingDate")}
            />
          </Field>
          <Field id="kyc-mstart" label="Meeting Start Time">
            <input
              id="kyc-mstart"
              type="time"
              className="nt-input"
              {...register("meetingStart", { setValueAs: emptyToUndefined })}
            />
          </Field>
          <Field id="kyc-mend" label="Meeting End Time">
            <input
              id="kyc-mend"
              type="time"
              className="nt-input"
              {...register("meetingEnd", { setValueAs: emptyToUndefined })}
            />
          </Field>
        </div>
        <Field id="kyc-mnotes" label="Meeting Notes">
          <textarea
            id="kyc-mnotes"
            rows={3}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="Key points from the meeting…"
            {...register("meetingNotes")}
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
          {pending ? "Saving…" : isEdit ? "Save changes" : "Onboard Client"}
        </button>
      </div>
    </form>
  );
}

/**
 * Single-select master picker rendered as a chip/tile group — the same visual
 * as Product Types' chips, but radio (only one selectable; Manan's "only 1 to
 * select" rule keeps the stored id a single uuid). Clicking the selected chip
 * clears it; a11y via role="radiogroup" + role="radio"/aria-checked. Empty
 * master shows the "add in Admin → Masters" fallback.
 */
function MasterChips({
  control,
  name,
  label,
  options,
}: {
  control: Control<KycFormValues>;
  name: "customerTypeId" | "industryTypeId";
  label: string;
  options: MasterOptionItem[];
}) {
  return (
    <Field label={label} labelOnly>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <>
            {options.length === 0 ? (
              <p className="text-[13px] text-ink-subtle">
                No options — add in Admin → Masters.
              </p>
            ) : (
              <div
                role="radiogroup"
                aria-label={label}
                className="flex flex-wrap gap-2"
              >
                {options.map((opt) => {
                  const checked = field.value === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() =>
                        // Toggle-off the selected chip; otherwise select it.
                        field.onChange(checked ? undefined : opt.id)
                      }
                      className={cn(
                        "inline-flex items-center rounded-chip border px-3 py-2 text-[13px] font-semibold transition-colors",
                        checked
                          ? "border-brand bg-brand/8 text-ink-strong"
                          : "border-hairline bg-surface-card text-ink-muted hover:border-hairline-strong hover:text-ink-strong",
                      )}
                    >
                      {opt.name}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[12px] text-ink-subtle">Select one</p>
          </>
        )}
      />
    </Field>
  );
}

/**
 * One business-card side (Front / Back): a single labelled image upload that
 * shows a thumbnail + remove × once uploaded. Mirrors the sample-form photo
 * tile, scaled to a single image per side and never required.
 */
function CardUpload({
  label,
  url,
  uploading,
  onPick,
  onClear,
}: {
  label: string;
  url: string | undefined;
  uploading: boolean;
  onPick: (file: File | undefined) => void;
  onClear: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <Field label={`Business Card — ${label}`} labelOnly>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        aria-label={`Business card ${label.toLowerCase()}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow re-picking after a remove
          onPick(file);
        }}
      />
      {url ? (
        <div className="relative inline-block size-[120px] overflow-hidden rounded-xl border border-hairline bg-surface-soft">
          {/* Blob URLs are remote + unconfigured for next/image — plain img. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Business card ${label.toLowerCase()}`}
            className="size-full object-cover"
          />
          <button
            type="button"
            aria-label={`Remove business card ${label.toLowerCase()}`}
            onClick={onClear}
            className="absolute right-1 top-1 inline-flex size-[22px] items-center justify-center rounded-full bg-white/90 text-ink-strong shadow-sm border border-hairline hover:bg-white transition-colors"
          >
            <X size={13} strokeWidth={2.6} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex size-[120px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline-strong text-ink-subtle hover:text-ink-strong hover:border-ink-subtle transition-colors disabled:opacity-60"
        >
          {uploading ? (
            <Loader2
              size={18}
              style={{ animation: "spinFast 0.8s linear infinite" }}
            />
          ) : (
            <ImagePlus size={18} />
          )}
          <span className="text-[11.5px] font-semibold">
            {uploading ? "Uploading…" : `Add ${label.toLowerCase()}`}
          </span>
        </button>
      )}
    </Field>
  );
}
