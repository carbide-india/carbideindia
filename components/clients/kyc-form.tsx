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
import {
  adminUpdateClientKyc,
  checkClientDuplicate,
  type DuplicateClientMatch,
} from "@/app/(admin)/admin/clients/actions";
import {
  ADDRESS_TYPES,
  ADDRESS_TYPE_LABELS,
  GST_REGISTRATION_TYPES,
  GST_REGISTRATION_TYPE_LABELS,
} from "@/db/enums";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { TagsInput } from "@/components/ui/tags-input";
import { Field, SectionCard } from "@/components/inquiries/form-field";
import { toOptionalNumber } from "@/lib/form-utils";
import type { MasterOptionItem } from "@/lib/queries/masters";
import type { EmployeeOption } from "@/lib/queries/employees";
import { ClientDocuments } from "@/components/clients/client-documents";
import type { ClientDocument } from "@/lib/queries/client-documents";

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
  /** The generated client code (e.g. CL-0001) — shown read-only when editing. */
  clientCode?: string;
  /** Pre-presigned documents list for the Documents section (edit mode only). */
  documents?: ClientDocument[];
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
 * Client KYC form — reorganised into 9 sections matching the Client Master
 * spec: Identity / Registration & Tax / Addresses / Contacts /
 * Commercial & Credit / Bank Details / Documents / Business Cards /
 * Meeting & Notes.
 */
export function KycForm({
  customerTypes,
  industryTypes,
  productTypes,
  employees,
  editClientId,
  initialValues,
  clientCode,
  documents,
}: Props) {
  const isEdit = Boolean(editClientId);
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);

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
      msmeUdyamNo: "",
      billToAddress: "",
      shipToAddress: "",
      paymentTerms: "",
      freightCharges: "",
      qtyDeviation: "",
      transporter: "",
      otherReferences: "",
      creditDays: undefined,
      creditLimit: undefined,
      bankName: "",
      bankAccountNo: "",
      bankIfsc: "",
      bankBranch: "",
      bankAccountHolder: "",
      // ── GST normalization (ERP Phase 2) ──
      gstRegistrationType: undefined,
      placeOfSupply: "",
      isTransporter: false,
      // ── Normalized multi-address / multi-bank children ──
      // New client: seed one empty registered address; editing prefills below.
      addresses: [
        {
          addressType: "registered",
          isPrimary: false,
          line1: "",
          line2: "",
          line3: "",
          line4: "",
          city: "",
          state: "",
          country: "",
          pinCode: "",
          gstin: "",
          notes: "",
        },
      ],
      bankAccounts: [],
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

  const { fields: addressFields, append: appendAddress, remove: removeAddress } =
    useFieldArray({ control, name: "addresses" });

  const { fields: bankFields, append: appendBank, remove: removeBank } =
    useFieldArray({ control, name: "bankAccounts" });

  // Non-blocking GSTIN/PAN dedup warning. On blur of either field we ask the
  // server for clients sharing the same GSTIN/PAN (excluding the one we edit);
  // matches are surfaced inline and never block submit.
  const [dupMatches, setDupMatches] = React.useState<DuplicateClientMatch[]>([]);
  const [dupPending, startDupCheck] = React.useTransition();

  function runDupCheck() {
    const gstin = (watch("gstin") ?? "").trim();
    const panNo = (watch("panNo") ?? "").trim();
    if (!gstin && !panNo) {
      setDupMatches([]);
      return;
    }
    startDupCheck(async () => {
      try {
        const matches = await checkClientDuplicate({
          gstin: gstin || undefined,
          panNo: panNo || undefined,
          excludeId: editClientId,
        });
        setDupMatches(matches);
      } catch {
        setDupMatches([]);
      }
    });
  }

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

      {/* ── 1 · Identity ─────────────────────────────────────────────── */}
      <SectionCard
        title="Identity"
        hint="Who the client is — type, industry and the products they buy."
      >
        {/* Client Code — read-only display field, only when editing */}
        {isEdit && clientCode && (
          <Field id="kyc-client-code" label="Client Code">
            <input
              id="kyc-client-code"
              type="text"
              className="nt-input"
              value={clientCode}
              disabled
              readOnly
              aria-readonly="true"
            />
          </Field>
        )}

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
                      No product types yet — add them in Admin &#8594; Masters.
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
                placeholder="e.g. Mining, Defense, Cutting..."
              />
            )}
          />
        </Field>

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
                    : "Select an employee..."
                }
                disabled={employees.length === 0}
                searchable
                searchPlaceholder="Search employees..."
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
              />
            )}
          />
        </Field>
      </SectionCard>

      {/* ── 2 · Registration & Tax ───────────────────────────────────── */}
      <SectionCard
        title="Registration &amp; Tax"
        hint="GST, PAN and MSME / Udyam registration details."
      >
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="kyc-gstin" label="GSTIN">
            <input
              id="kyc-gstin"
              type="text"
              className="nt-input"
              {...register("gstin", { onBlur: runDupCheck })}
            />
          </Field>
          <Field id="kyc-pan" label="PAN / IT No">
            <input
              id="kyc-pan"
              type="text"
              className="nt-input"
              {...register("panNo", { onBlur: runDupCheck })}
            />
          </Field>
          <Field id="kyc-msme" label="MSME / Udyam No">
            <input
              id="kyc-msme"
              type="text"
              className="nt-input"
              placeholder="e.g. UDYAM-MH-00-0000000"
              {...register("msmeUdyamNo")}
            />
          </Field>
        </div>

        {/* Non-blocking dedup warning — existing clients sharing this GSTIN/PAN. */}
        {(dupPending || dupMatches.length > 0) && (
          <p
            className="text-[12.5px] font-semibold"
            style={{ color: dupMatches.length > 0 ? "#B45309" : "var(--color-ink-subtle)" }}
            role="status"
          >
            {dupPending
              ? "Checking for duplicates..."
              : `Possible duplicate: ${dupMatches
                  .map((m) => `${m.name}${m.clientCode ? ` (${m.clientCode})` : ""}`)
                  .join(", ")}`}
          </p>
        )}

        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field label="GST Registration Type" labelOnly>
            <Controller
              control={control}
              name="gstRegistrationType"
              render={({ field }) => (
                <Select
                  ariaLabel="GST Registration Type"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select type..."
                  options={GST_REGISTRATION_TYPES.map((t) => ({
                    value: t,
                    label: GST_REGISTRATION_TYPE_LABELS[t],
                  }))}
                />
              )}
            />
          </Field>
          <Field id="kyc-pos" label="Place of Supply">
            <input
              id="kyc-pos"
              type="text"
              className="nt-input"
              placeholder="e.g. Maharashtra"
              {...register("placeOfSupply")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 3 · Addresses ────────────────────────────────────────────── */}
      <SectionCard
        title="Addresses"
        hint="Registered, bill-to, ship-to and consignee addresses — flag one as primary."
      >
        {addressFields.map((field, idx) => (
          <div
            key={field.id}
            className="rounded-xl border border-hairline bg-surface-soft p-4 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-ink-strong">
                Address {idx + 1}
              </p>
              <button
                type="button"
                aria-label={`Remove address ${idx + 1}`}
                onClick={() => removeAddress(idx)}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-muted hover:text-red-600 transition-colors"
              >
                <Trash2 size={13} strokeWidth={2.4} />
                Remove
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field label="Address Type" labelOnly>
                <Controller
                  control={control}
                  name={`addresses.${idx}.addressType`}
                  render={({ field: f }) => (
                    <Select
                      ariaLabel="Address Type"
                      value={f.value ?? "registered"}
                      onValueChange={(v) => f.onChange(v)}
                      options={ADDRESS_TYPES.map((t) => ({
                        value: t,
                        label: ADDRESS_TYPE_LABELS[t],
                      }))}
                    />
                  )}
                />
              </Field>
              <Field label="Primary" labelOnly>
                <Controller
                  control={control}
                  name={`addresses.${idx}.isPrimary`}
                  render={({ field: f }) => (
                    <label className="inline-flex items-center gap-2 py-2 text-[13px] font-semibold text-ink-muted">
                      <input
                        type="checkbox"
                        className="size-[16px] accent-brand"
                        checked={Boolean(f.value)}
                        onChange={(e) => f.onChange(e.target.checked)}
                      />
                      Primary address
                    </label>
                  )}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field id={`kyc-addr${idx}-l1`} label="Address Line 1">
                <input id={`kyc-addr${idx}-l1`} type="text" className="nt-input" {...register(`addresses.${idx}.line1`)} />
              </Field>
              <Field id={`kyc-addr${idx}-l2`} label="Address Line 2">
                <input id={`kyc-addr${idx}-l2`} type="text" className="nt-input" {...register(`addresses.${idx}.line2`)} />
              </Field>
              <Field id={`kyc-addr${idx}-l3`} label="Address Line 3">
                <input id={`kyc-addr${idx}-l3`} type="text" className="nt-input" {...register(`addresses.${idx}.line3`)} />
              </Field>
              <Field id={`kyc-addr${idx}-l4`} label="Address Line 4">
                <input id={`kyc-addr${idx}-l4`} type="text" className="nt-input" {...register(`addresses.${idx}.line4`)} />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
              <Field id={`kyc-addr${idx}-city`} label="City">
                <input id={`kyc-addr${idx}-city`} type="text" className="nt-input" {...register(`addresses.${idx}.city`)} />
              </Field>
              <Field id={`kyc-addr${idx}-state`} label="State">
                <input id={`kyc-addr${idx}-state`} type="text" className="nt-input" {...register(`addresses.${idx}.state`)} />
              </Field>
              <Field id={`kyc-addr${idx}-country`} label="Country">
                <input id={`kyc-addr${idx}-country`} type="text" className="nt-input" placeholder="e.g. India" {...register(`addresses.${idx}.country`)} />
              </Field>
              <Field id={`kyc-addr${idx}-pin`} label="Pin Code">
                <input id={`kyc-addr${idx}-pin`} type="text" className="nt-input" {...register(`addresses.${idx}.pinCode`)} />
              </Field>
              <Field id={`kyc-addr${idx}-gstin`} label="GSTIN">
                <input id={`kyc-addr${idx}-gstin`} type="text" className="nt-input" {...register(`addresses.${idx}.gstin`)} />
              </Field>
            </div>

            <Field id={`kyc-addr${idx}-notes`} label="Notes">
              <textarea
                id={`kyc-addr${idx}-notes`}
                rows={2}
                className="nt-input resize-y"
                style={{ fontWeight: 400 }}
                placeholder="Notes about this address..."
                {...register(`addresses.${idx}.notes`)}
              />
            </Field>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            appendAddress({
              addressType: "registered",
              isPrimary: false,
              line1: "",
              line2: "",
              line3: "",
              line4: "",
              city: "",
              state: "",
              country: "",
              pinCode: "",
              gstin: "",
              notes: "",
            })
          }
          className="inline-flex items-center gap-1.5 self-start rounded-chip border border-hairline-strong bg-surface-card px-4 py-2 text-[13px] font-semibold text-ink-muted hover:text-ink-strong hover:border-ink-subtle transition-colors"
        >
          <Plus size={14} strokeWidth={2.6} />
          Add address
        </button>
      </SectionCard>

      {/* ── 4 · Contact Person ───────────────────────────────────────── */}
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
            placeholder="Notes about this contact person..."
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
                placeholder="Notes about this contact..."
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

      {/* ── 5 · Commercial & Credit ──────────────────────────────────── */}
      <SectionCard
        title="Commercial &amp; Credit"
        hint="Payment terms, credit limits, freight and logistics details."
      >
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="kyc-payterms" label="Payment Terms">
            <input id="kyc-payterms" type="text" className="nt-input" {...register("paymentTerms")} />
          </Field>
          <Field id="kyc-freight" label="Freight Charges">
            <input id="kyc-freight" type="text" className="nt-input" {...register("freightCharges")} />
          </Field>
          <Field id="kyc-creditdays" label="Credit Days">
            <input
              id="kyc-creditdays"
              type="number"
              min={0}
              step={1}
              className="nt-input"
              placeholder="e.g. 30"
              {...register("creditDays", { setValueAs: toOptionalNumber })}
            />
          </Field>
          <Field id="kyc-creditlimit" label="Credit Limit">
            <input
              id="kyc-creditlimit"
              type="number"
              min={0}
              step={0.01}
              className="nt-input"
              placeholder="e.g. 500000"
              {...register("creditLimit", { setValueAs: toOptionalNumber })}
            />
          </Field>
          <Field id="kyc-transporter" label="Transporter">
            <input
              id="kyc-transporter"
              type="text"
              className="nt-input"
              placeholder="e.g. Blue Dart"
              {...register("transporter")}
            />
          </Field>
        </div>
        <Field id="kyc-otherrefs" label="Other References">
          <textarea
            id="kyc-otherrefs"
            rows={2}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="Any other references or notes relevant to this client..."
            {...register("otherReferences")}
          />
        </Field>
      </SectionCard>

      {/* ── 6 · Bank Details ─────────────────────────────────────────── */}
      <SectionCard
        title="Bank Details"
        hint="One or more bank accounts for payments — flag one as primary."
      >
        {bankFields.map((field, idx) => (
          <div
            key={field.id}
            className="rounded-xl border border-hairline bg-surface-soft p-4 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-ink-strong">
                Account {idx + 1}
              </p>
              <button
                type="button"
                aria-label={`Remove bank account ${idx + 1}`}
                onClick={() => removeBank(idx)}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-muted hover:text-red-600 transition-colors"
              >
                <Trash2 size={13} strokeWidth={2.4} />
                Remove
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field id={`kyc-bank${idx}-name`} label="Bank Name">
                <input id={`kyc-bank${idx}-name`} type="text" className="nt-input" placeholder="e.g. State Bank of India" {...register(`bankAccounts.${idx}.bankName`)} />
              </Field>
              <Field id={`kyc-bank${idx}-accno`} label="Account No">
                <input id={`kyc-bank${idx}-accno`} type="text" className="nt-input" {...register(`bankAccounts.${idx}.accountNo`)} />
              </Field>
              <Field id={`kyc-bank${idx}-ifsc`} label="IFSC Code">
                <input id={`kyc-bank${idx}-ifsc`} type="text" className="nt-input" placeholder="e.g. SBIN0001234" {...register(`bankAccounts.${idx}.ifsc`)} />
              </Field>
              <Field id={`kyc-bank${idx}-branch`} label="Branch">
                <input id={`kyc-bank${idx}-branch`} type="text" className="nt-input" placeholder="e.g. Ambad, Nashik" {...register(`bankAccounts.${idx}.branch`)} />
              </Field>
              <Field id={`kyc-bank${idx}-holder`} label="Account Holder">
                <input id={`kyc-bank${idx}-holder`} type="text" className="nt-input" placeholder="Name on the account" {...register(`bankAccounts.${idx}.accountHolder`)} />
              </Field>
              <Field id={`kyc-bank${idx}-type`} label="Account Type">
                <input id={`kyc-bank${idx}-type`} type="text" className="nt-input" placeholder="e.g. Current / Savings" {...register(`bankAccounts.${idx}.accountType`)} />
              </Field>
            </div>

            <Controller
              control={control}
              name={`bankAccounts.${idx}.isPrimary`}
              render={({ field: f }) => (
                <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
                  <input
                    type="checkbox"
                    className="size-[16px] accent-brand"
                    checked={Boolean(f.value)}
                    onChange={(e) => f.onChange(e.target.checked)}
                  />
                  Primary account
                </label>
              )}
            />
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            appendBank({
              bankName: "",
              accountNo: "",
              ifsc: "",
              branch: "",
              accountHolder: "",
              accountType: "",
              isPrimary: false,
              notes: "",
            })
          }
          className="inline-flex items-center gap-1.5 self-start rounded-chip border border-hairline-strong bg-surface-card px-4 py-2 text-[13px] font-semibold text-ink-muted hover:text-ink-strong hover:border-ink-subtle transition-colors"
        >
          <Plus size={14} strokeWidth={2.6} />
          Add account
        </button>
      </SectionCard>

      {/* ── 7 · Documents ────────────────────────────────────────────── */}
      <SectionCard
        title="Documents"
        hint="Attach PDFs, images and other files to this client record."
      >
        {editClientId ? (
          <ClientDocuments
            clientId={editClientId}
            documents={documents ?? []}
          />
        ) : (
          <p className="text-[13px] text-ink-subtle">
            Save the client first, then you can attach documents.
          </p>
        )}
      </SectionCard>

      {/* ── 8 · Business Card ────────────────────────────────────────── */}
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

      {/* ── 9 · Meeting & Notes ──────────────────────────────────────── */}
      <SectionCard title="Meeting &amp; Notes">
        <Field id="kyc-notes" label="Client Notes">
          <textarea
            id="kyc-notes"
            rows={3}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="Any general notes about this client..."
            {...register("notes")}
          />
        </Field>
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
            placeholder="Key points from the meeting..."
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
          {pending ? "Saving..." : isEdit ? "Save changes" : "Onboard Client"}
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
 * master shows the "add in Admin -> Masters" fallback.
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
                No options — add in Admin &#8594; Masters.
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
 * shows a thumbnail + remove x once uploaded. Mirrors the sample-form photo
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
    <Field label={`Business Card -- ${label}`} labelOnly>
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
            {uploading ? "Uploading..." : `Add ${label.toLowerCase()}`}
          </span>
        </button>
      )}
    </Field>
  );
}
