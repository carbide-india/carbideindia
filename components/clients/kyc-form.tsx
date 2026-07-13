"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller, useFieldArray, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { upload } from "@vercel/blob/client";
import { Check, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { CreateClientKycSchema } from "@/lib/validators/client-kyc";
import { createClientKyc } from "@/app/(app)/clients/actions";
import {
  adminUpdateClientKyc,
  checkClientDuplicate,
  type DuplicateClientMatch,
} from "@/app/(admin)/admin/clients/actions";
import {
  GST_REGISTRATION_TYPES,
  GST_REGISTRATION_TYPE_LABELS,
  CLIENT_GRADES,
  INQUIRY_CURRENCIES,
  INQUIRY_COUNTRIES,
} from "@/db/enums";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { TagsInput } from "@/components/ui/tags-input";
import { Field, SectionCard, GroupHeader, Segmented } from "@/components/inquiries/form-field";
import { useFormDraft } from "@/components/drafts/use-form-draft";
import { toOptionalNumber } from "@/lib/form-utils";
import type { MasterOptionItem } from "@/lib/queries/masters";
import type { EmployeeOption } from "@/lib/queries/employees";
import { ClientDocuments } from "@/components/clients/client-documents";
import type { ClientDocument } from "@/lib/queries/client-documents";

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands
 *  the parsed *output* (`""` folded to `undefined`, currency/country
 *  defaulted) to the submit handler — exactly what createClientKyc takes. */
export type KycFormValues = z.input<typeof CreateClientKycSchema>;
type KycFormOutput = z.output<typeof CreateClientKycSchema>;

interface Props {
  customerTypes: MasterOptionItem[];
  industryTypes: MasterOptionItem[];
  productTypes: MasterOptionItem[];
  employees: EmployeeOption[];
  /** Admin-managed departments — surfaced as the "Department" dropdown. */
  departments?: MasterOptionItem[];
  /** When set, the form edits this client in place (admin "Edit client")
   *  instead of onboarding a new one. */
  editClientId?: string;
  /** Prefill values for edit mode — shaped like the form's input fields. */
  initialValues?: Partial<KycFormValues>;
  /** The generated client code (e.g. CL-0001) — shown read-only when editing. */
  clientCode?: string;
  /** Pre-presigned documents list for the Documents section (edit mode only). */
  documents?: ClientDocument[];
  /** Create-mode only: enable auto-saving this form as a draft. */
  enableDrafts?: boolean;
  /** When resuming a draft, its id (auto-save continues into the same draft). */
  resumeDraftId?: string;
}

/* ── Business-card upload (browser → Vercel Blob, client-direct) ──────── */

const ALLOWED_CARD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const MAX_CARD_BYTES = 25 * 1024 * 1024;

/** Common courier partners for the Transporter dropdown (free-text label). */
const TRANSPORTER_OPTIONS = [
  "Blue Dart",
  "DTDC",
  "VRL",
  "Gati",
  "Delhivery",
  "Professional Couriers",
  "Other",
];

const YES_NO_SEGMENTED = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

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

/**
 * Client KYC form — restyled to the New Enquiry visual language (prominent
 * chips, one-line dense grids, numbered group headers). Sections: Identity /
 * Registration & Tax / Addresses / Contact Person / Commercial & Credit /
 * Bank Details / Documents.
 */
export function KycForm({
  customerTypes,
  industryTypes,
  productTypes,
  employees,
  departments = [],
  editClientId,
  initialValues,
  clientCode,
  documents,
  enableDrafts,
  resumeDraftId,
}: Props) {
  const isEdit = Boolean(editClientId);
  const draftsOn = Boolean(enableDrafts) && !isEdit;
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<KycFormValues, unknown, KycFormOutput>({
    resolver: zodResolver(CreateClientKycSchema),
    defaultValues: {
      name: "",
      grade: undefined,
      departmentId: undefined,
      export: undefined,
      currency: "INR",
      country: "India",
      customerTypeIds: [],
      industryTypeIds: [],
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
      // New client: seed a billing + shipping address; editing prefills below.
      addresses: [
        {
          addressType: "bill_to",
          isPrimary: true,
          line1: "",
          line2: "",
          line3: "",
          line4: "",
          city: "",
          state: "",
          country: "",
          pinCode: "",
        },
        {
          addressType: "ship_to",
          isPrimary: false,
          line1: "",
          line2: "",
          line3: "",
          line4: "",
          city: "",
          state: "",
          country: "",
          pinCode: "",
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

  // ── Draft auto-save (create mode only — silent, runs in background) ──
  const { discard } = useFormDraft({
    kind: "kyc",
    enabled: draftsOn,
    resumeDraftId,
    watch,
    getValues,
  });

  /** Copy the billing address (index 0) into another address block. */
  function copyFromBilling(idx: number) {
    const billing = getValues("addresses")?.[0];
    (["line1", "line2", "line3", "line4", "city", "state", "country", "pinCode"] as const).forEach(
      (key) => setValue(`addresses.${idx}.${key}`, billing?.[key] ?? ""),
    );
  }

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
      // Client saved — retire the draft so it leaves the Drafts inbox.
      if (draftsOn) await discard();
      fireToast({
        message: isEdit
          ? `${values.name} updated.`
          : `Client ${values.name} onboarded.`,
        type: "success",
      });
      router.push("/clients" as Route);
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

        {/* Company Name (fills the row) + Grade rating on one line */}
        <div className="grid grid-cols-[1fr_auto] gap-4 max-md:grid-cols-1">
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
          <Field label="Grade" labelOnly>
            <Controller
              control={control}
              name="grade"
              render={({ field }) => (
                <Segmented
                  ariaLabel="Grade"
                  options={CLIENT_GRADES.map((g) => ({ value: g, label: g }))}
                  value={field.value}
                  onChange={(v) =>
                    field.onChange(v as (typeof CLIENT_GRADES)[number] | undefined)
                  }
                />
              )}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
          <MasterChips
            control={control}
            name="customerTypeIds"
            label="Customer Type"
            options={customerTypes}
          />
          <MasterChips
            control={control}
            name="industryTypeIds"
            label="Industry Type"
            options={industryTypes}
          />
        </div>

        {/* Product Types — uniform-width checkbox chip grid over the master. */}
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
                    <div className="grid grid-cols-4 gap-2 max-md:grid-cols-2">
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
                              "flex w-full items-center gap-2 rounded-chip border-[1.75px] px-3 py-2 text-[13px] font-semibold transition-colors",
                              checked
                                ? "border-brand bg-brand/8 text-ink-strong"
                                : "border-[#9199b6] bg-surface-card text-ink-strong hover:border-[#6f78a0] hover:bg-[#f3f4f8]",
                            )}
                          >
                            <span
                              className={cn(
                                "inline-flex size-[16px] shrink-0 items-center justify-center rounded-[4px] border-[1.75px] transition-colors",
                                checked
                                  ? "bg-brand border-brand text-white"
                                  : "border-[#9199b6] bg-white text-transparent",
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

        {/* Assign Sales Person (left) + Tags (right) on one row */}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Assign Sales Person" labelOnly>
            <Controller
              control={control}
              name="kycSalesPersonId"
              render={({ field }) => (
                <Select
                  ariaLabel="Assign Sales Person"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder={
                    employees.length === 0
                      ? "No employees yet"
                      : "Select an employee"
                  }
                  disabled={employees.length === 0}
                  searchable
                  searchPlaceholder="Search employees"
                  options={employees.map((e) => ({ value: e.id, label: e.name }))}
                />
              )}
            />
          </Field>
          <Field label="Tags">
            <Controller
              control={control}
              name="tags"
              render={({ field }) => (
                <TagsInput
                  id="kyc-tags"
                  value={field.value ?? []}
                  onChange={field.onChange}
                  placeholder="e.g. Mining, Defense, Cutting"
                />
              )}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 2 · Registration & Tax ───────────────────────────────────── */}
      <SectionCard
        title="Registration & Tax"
        inlineHint
        hint="GST, PAN, MSME / Udyam registration and export / currency details."
      >
        <div className="grid grid-cols-5 gap-4 max-lg:grid-cols-3 max-md:grid-cols-1">
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
          <Field label="GST Registration Type" labelOnly>
            <Controller
              control={control}
              name="gstRegistrationType"
              render={({ field }) => (
                <Select
                  ariaLabel="GST Registration Type"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select type"
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

        {/* Non-blocking dedup warning — existing clients sharing this GSTIN/PAN. */}
        {(dupPending || dupMatches.length > 0) && (
          <p
            className="text-[12.5px] font-semibold"
            style={{ color: dupMatches.length > 0 ? "#B45309" : "var(--color-ink-subtle)" }}
            role="status"
          >
            {dupPending
              ? "Checking for duplicates"
              : `Possible duplicate: ${dupMatches
                  .map((m) => `${m.name}${m.clientCode ? ` (${m.clientCode})` : ""}`)
                  .join(", ")}`}
          </p>
        )}

        <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
          <Field label="Department" labelOnly>
            <Controller
              control={control}
              name="departmentId"
              render={({ field }) => (
                <Select
                  ariaLabel="Department"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder={
                    departments.length === 0
                      ? "No departments yet"
                      : "Select a department"
                  }
                  disabled={departments.length === 0}
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                />
              )}
            />
          </Field>
          <Field label="Export" labelOnly>
            <Controller
              control={control}
              name="export"
              render={({ field }) => (
                <Segmented
                  ariaLabel="Export"
                  options={YES_NO_SEGMENTED}
                  value={
                    field.value === undefined ? undefined : field.value ? "yes" : "no"
                  }
                  onChange={(v) =>
                    field.onChange(v === undefined ? undefined : v === "yes")
                  }
                />
              )}
            />
          </Field>
          <Field label="Currency" labelOnly>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  ariaLabel="Currency"
                  value={field.value ?? "INR"}
                  onValueChange={field.onChange}
                  options={INQUIRY_CURRENCIES.map((c) => ({ value: c, label: c }))}
                />
              )}
            />
          </Field>
          <Field label="Country" labelOnly>
            <Controller
              control={control}
              name="country"
              render={({ field }) => (
                <Select
                  ariaLabel="Country"
                  value={field.value ?? "India"}
                  onValueChange={field.onChange}
                  options={INQUIRY_COUNTRIES.map((c) => ({ value: c, label: c }))}
                />
              )}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 3 · Addresses ────────────────────────────────────────────── */}
      <SectionCard
        title="Addresses"
        inlineHint
        hint="Billing and shipping addresses — copy billing into shipping when they match."
      >
        {addressFields.map((field, idx) => {
          const addrLabel =
            idx === 0 ? "Billing Address" : idx === 1 ? "Shipping Address" : `Address ${idx + 1}`;
          return (
            <div key={field.id} className="flex flex-col gap-3">
              <GroupHeader
                n={idx + 1}
                label={addrLabel}
                action={
                  <div className="flex shrink-0 items-center gap-2">
                    {idx >= 1 && (
                      <button
                        type="button"
                        onClick={() => copyFromBilling(idx)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9c9ea] bg-[#f4f4fd] px-2.5 py-1.5 text-[12px] font-bold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#eeeefb]"
                      >
                        Copy from billing address
                      </button>
                    )}
                    {idx >= 1 && (
                      <button
                        type="button"
                        onClick={() => removeAddress(idx)}
                        aria-label={`Remove ${addrLabel.toLowerCase()}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-semibold text-ink-subtle transition hover:border-[#f0b4b4] hover:bg-[#fdf3f3] hover:text-[#d32f2f]"
                      >
                        <X className="h-[15px] w-[15px]" />
                        Remove
                      </button>
                    )}
                  </div>
                }
              />

              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field id={`kyc-addr${idx}-l1`} label="Address Line 1">
                  <input
                    id={`kyc-addr${idx}-l1`}
                    type="text"
                    className="nt-input"
                    placeholder="Unit No./Block No., Floor, Building Name"
                    {...register(`addresses.${idx}.line1`)}
                  />
                </Field>
                <Field id={`kyc-addr${idx}-l2`} label="Address Line 2">
                  <input
                    id={`kyc-addr${idx}-l2`}
                    type="text"
                    className="nt-input"
                    placeholder="Street Name, Sector Name"
                    {...register(`addresses.${idx}.line2`)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Field id={`kyc-addr${idx}-l3`} label="Address Line 3">
                  <input
                    id={`kyc-addr${idx}-l3`}
                    type="text"
                    className="nt-input"
                    placeholder="Area"
                    {...register(`addresses.${idx}.line3`)}
                  />
                </Field>
                <Field id={`kyc-addr${idx}-l4`} label="Address Line 4">
                  <input
                    id={`kyc-addr${idx}-l4`}
                    type="text"
                    className="nt-input"
                    placeholder="Nearby Landmark"
                    {...register(`addresses.${idx}.line4`)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
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
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() =>
            appendAddress({
              addressType: "ship_to",
              isPrimary: false,
              line1: "",
              line2: "",
              line3: "",
              line4: "",
              city: "",
              state: "",
              country: "",
              pinCode: "",
            })
          }
          className="inline-flex w-max items-center gap-1.5 rounded-lg border border-dashed border-[#c9c9ea] bg-[#f4f4fd] px-4 py-2.5 text-[13px] font-bold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#eeeefb]"
        >
          <Plus className="h-4 w-4" />
          Add address
        </button>
      </SectionCard>

      {/* ── 4 · Contact Person ───────────────────────────────────────── */}
      <SectionCard
        title="Contact Person"
        inlineHint
        hint="The first contact is saved as the client's primary — auto-fetched on enquiries."
      >
        {/* Primary contact */}
        <div className="flex flex-col gap-3">
          <GroupHeader n={1} label="Contact" />
          <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
            <Field id="kyc-cfirst" label="First Name">
              <input id="kyc-cfirst" type="text" className="nt-input" {...register("contactFirstName")} />
            </Field>
            <Field id="kyc-clast" label="Last Name">
              <input id="kyc-clast" type="text" className="nt-input" {...register("contactLastName")} />
            </Field>
            <Field id="kyc-cno" label="Contact No">
              <input id="kyc-cno" type="tel" className="nt-input" {...register("contactNo")} />
            </Field>
            <Field id="kyc-cemail" label="Email">
              <input id="kyc-cemail" type="email" className="nt-input" {...register("contactEmail")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <Field id="kyc-cdesig" label="Designation">
              <input
                id="kyc-cdesig"
                type="text"
                className="nt-input"
                placeholder="e.g. Purchase Manager"
                {...register("contactDesignation")}
              />
            </Field>
            <Field id="kyc-cnotes" label="Contact Notes">
              <input
                id="kyc-cnotes"
                type="text"
                className="nt-input"
                placeholder="Notes about this contact"
                {...register("contactNotes")}
              />
            </Field>
          </div>
        </div>

        {/* Additional contacts */}
        {additionalContactFields.map((field, idx) => (
          <div key={field.id} className="flex flex-col gap-3">
            <GroupHeader
              n={idx + 2}
              label="Contact"
              action={
                <button
                  type="button"
                  onClick={() => removeContact(idx)}
                  aria-label={`Remove contact ${idx + 2}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-semibold text-ink-subtle transition hover:border-[#f0b4b4] hover:bg-[#fdf3f3] hover:text-[#d32f2f]"
                >
                  <X className="h-[15px] w-[15px]" />
                  Remove
                </button>
              }
            />
            <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
              <Field id={`kyc-ac${idx}-first`} label="First Name" required>
                <input id={`kyc-ac${idx}-first`} type="text" className="nt-input" {...register(`additionalContacts.${idx}.firstName`)} />
              </Field>
              <Field id={`kyc-ac${idx}-last`} label="Last Name">
                <input id={`kyc-ac${idx}-last`} type="text" className="nt-input" {...register(`additionalContacts.${idx}.lastName`)} />
              </Field>
              <Field id={`kyc-ac${idx}-no`} label="Contact No">
                <input id={`kyc-ac${idx}-no`} type="tel" className="nt-input" {...register(`additionalContacts.${idx}.contactNo`)} />
              </Field>
              <Field id={`kyc-ac${idx}-email`} label="Email">
                <input id={`kyc-ac${idx}-email`} type="email" className="nt-input" {...register(`additionalContacts.${idx}.email`)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field id={`kyc-ac${idx}-desig`} label="Designation">
                <input
                  id={`kyc-ac${idx}-desig`}
                  type="text"
                  className="nt-input"
                  placeholder="e.g. Purchase Manager"
                  {...register(`additionalContacts.${idx}.designation`)}
                />
              </Field>
              <Field id={`kyc-ac${idx}-notes`} label="Notes">
                <input
                  id={`kyc-ac${idx}-notes`}
                  type="text"
                  className="nt-input"
                  placeholder="Notes about this contact"
                  {...register(`additionalContacts.${idx}.notes`)}
                />
              </Field>
            </div>
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
          className="inline-flex w-max items-center gap-1.5 rounded-lg border border-dashed border-[#c9c9ea] bg-[#f4f4fd] px-4 py-2.5 text-[13px] font-bold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#eeeefb]"
        >
          <Plus className="h-4 w-4" />
          Add Contact
        </button>
      </SectionCard>

      {/* ── 5 · Commercial & Credit ──────────────────────────────────── */}
      <SectionCard
        title="Commercial & Credit"
        inlineHint
        hint="Payment terms, credit limits, freight and logistics details."
      >
        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
          <Field id="kyc-payterms" label="Payment Terms">
            <input
              id="kyc-payterms"
              type="text"
              className="nt-input"
              placeholder="e.g. 50% advance, 50% on delivery"
              {...register("paymentTerms")}
            />
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
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Transporter" labelOnly>
            <Controller
              control={control}
              name="transporter"
              render={({ field }) => (
                <Select
                  ariaLabel="Transporter"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select transporter"
                  options={TRANSPORTER_OPTIONS.map((t) => ({ value: t, label: t }))}
                />
              )}
            />
          </Field>
          <Field id="kyc-qtydev" label="Quantity Deviation">
            <input
              id="kyc-qtydev"
              type="text"
              className="nt-input"
              placeholder="e.g. +/- 10%"
              {...register("qtyDeviation")}
            />
          </Field>
        </div>

        <Field id="kyc-otherrefs" label="Other References">
          <textarea
            id="kyc-otherrefs"
            rows={2}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="Any other references or notes relevant to this client"
            {...register("otherReferences")}
          />
        </Field>

        <Field id="kyc-notes" label="Client Notes">
          <textarea
            id="kyc-notes"
            rows={3}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="Any general notes about this client"
            {...register("notes")}
          />
        </Field>
      </SectionCard>

      {/* ── 6 · Bank Details ─────────────────────────────────────────── */}
      <SectionCard
        title="Bank Details"
        inlineHint
        hint="One or more bank accounts for payments — flag one as primary."
      >
        {bankFields.map((field, idx) => (
          <div key={field.id} className="flex flex-col gap-3">
            <GroupHeader
              n={idx + 1}
              label="Account"
              action={
                <button
                  type="button"
                  onClick={() => removeBank(idx)}
                  aria-label={`Remove bank account ${idx + 1}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-semibold text-ink-subtle transition hover:border-[#f0b4b4] hover:bg-[#fdf3f3] hover:text-[#d32f2f]"
                >
                  <X className="h-[15px] w-[15px]" />
                  Remove
                </button>
              }
            />

            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
              <Field id={`kyc-bank${idx}-holder`} label="Account Name">
                <input
                  id={`kyc-bank${idx}-holder`}
                  type="text"
                  className="nt-input"
                  placeholder={watch("name") || "Name on the account"}
                  {...register(`bankAccounts.${idx}.accountHolder`)}
                />
                <button
                  type="button"
                  onClick={() =>
                    setValue(`bankAccounts.${idx}.accountHolder`, watch("name") ?? "")
                  }
                  className="self-start text-[12px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors"
                >
                  &#8627; Same as company
                </button>
              </Field>
              <Field id={`kyc-bank${idx}-name`} label="Bank Name">
                <input id={`kyc-bank${idx}-name`} type="text" className="nt-input" placeholder="e.g. State Bank of India" {...register(`bankAccounts.${idx}.bankName`)} />
              </Field>
              <Field id={`kyc-bank${idx}-accno`} label="Account No">
                <input id={`kyc-bank${idx}-accno`} type="text" className="nt-input" {...register(`bankAccounts.${idx}.accountNo`)} />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
              <Field id={`kyc-bank${idx}-ifsc`} label="IFSC / SWIFT Code">
                <input id={`kyc-bank${idx}-ifsc`} type="text" className="nt-input" placeholder="IFSC (domestic) or SWIFT (international)" {...register(`bankAccounts.${idx}.ifsc`)} />
              </Field>
              <Field id={`kyc-bank${idx}-branch`} label="Branch">
                <input id={`kyc-bank${idx}-branch`} type="text" className="nt-input" placeholder="e.g. Ambad, Nashik" {...register(`bankAccounts.${idx}.branch`)} />
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
          className="inline-flex w-max items-center gap-1.5 rounded-lg border border-dashed border-[#c9c9ea] bg-[#f4f4fd] px-4 py-2.5 text-[13px] font-bold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#eeeefb]"
        >
          <Plus className="h-4 w-4" />
          Add account
        </button>
      </SectionCard>

      {/* ── 7 · Documents & Business Card ────────────────────────────── */}
      <SectionCard
        title="Documents"
        inlineHint
        hint="Attach any document, image, audio, or video to this client record — plus scans of the contact's business card."
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

        <div className="flex flex-col gap-3">
          <GroupHeader n={1} label="Business Card" />
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
        </div>
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
          {pending ? "Saving" : isEdit ? "Save changes" : "Onboard Client"}
        </button>
      </div>
    </form>
  );
}

/**
 * Multi-select master picker rendered as a prominent checkbox chip row — the
 * same chip treatment as the enquiry checklist's "Docs Given". Stores an array
 * of selected uuids; the legacy singular column is mirrored to the first
 * selection server-side. Empty master shows the "add in Admin -> Masters"
 * fallback.
 */
function MasterChips({
  control,
  name,
  label,
  options,
}: {
  control: Control<KycFormValues>;
  name: "customerTypeIds" | "industryTypeIds";
  label: string;
  options: MasterOptionItem[];
}) {
  return (
    <Field label={label} labelOnly>
      <Controller
        control={control}
        name={name}
        render={({ field }) => {
          const selected = field.value ?? [];
          return (
            <>
              {options.length === 0 ? (
                <p className="text-[13px] text-ink-subtle">
                  No options — add in Admin &#8594; Masters.
                </p>
              ) : (
                <div
                  role="group"
                  aria-label={label}
                  className="flex flex-wrap gap-2"
                >
                  {options.map((opt) => {
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
            {uploading ? "Uploading" : `Add ${label.toLowerCase()}`}
          </span>
        </button>
      )}
    </Field>
  );
}
