"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller, useFieldArray, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Check, Copy, FileText, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { CreateClientKycSchema } from "@/lib/validators/client-kyc";
import { createClientKyc, fetchGstDetailsAction } from "@/app/(app)/clients/actions";
import { parseGstin, type GstinParse, GST_STATE_NAMES } from "@/lib/data/gst";
import { AddMasterOptionModal } from "@/components/masters/add-master-option-modal";
import { InlineOptionAdd } from "@/components/clients/inline-option-add";
import { addCustomOption } from "@/app/(app)/_actions/custom-lists";
import { CUSTOM_LISTS } from "@/lib/custom-lists/registry";
import { createMasterOption } from "@/app/(admin)/admin/masters/actions";
import {
  adminUpdateClientKyc,
  checkClientDuplicate,
  type DuplicateClientMatch,
} from "@/app/(admin)/admin/clients/actions";
import {
  GST_REGISTRATION_TYPES,
  GST_REGISTRATION_TYPE_LABELS,
  CLIENT_GRADES,
} from "@/db/enums";
import { fireToast } from "@/lib/toast";
import { firstErrorMessage } from "@/lib/forms/first-error";
import { useUnsavedGuard } from "@/lib/forms/use-unsaved-guard";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { TagsInput } from "@/components/ui/tags-input";
import { Field, SectionCard, GroupHeader } from "@/components/inquiries/form-field";
import { NotesField } from "@/components/ui/notes-field";
import { useFormDraft } from "@/components/drafts/use-form-draft";
import { useKeyboardForm } from "@/components/forms/use-keyboard-form";
import type { MasterOptionItem } from "@/lib/queries/masters";
import type { EmployeeOption } from "@/lib/queries/employees";
import { COUNTRIES, INDIAN_STATES, pinToState, toAddressStateName } from "@/lib/data/geo";
import { INDIA_CITIES } from "@/lib/data/india-states-cities";
import { CURRENCY_CODES, currencyLabel } from "@/lib/data/currencies";
import { BANKS, ACCOUNT_TYPES } from "@/lib/data/banks";
import { ClientDocuments } from "@/components/clients/client-documents";
import type { ClientDocument } from "@/lib/queries/client-documents";

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands
 *  the parsed *output* (`""` folded to `undefined`, currency/country
 *  defaulted) to the submit handler - exactly what createClientKyc takes. */
export type KycFormValues = z.input<typeof CreateClientKycSchema>;
type KycFormOutput = z.output<typeof CreateClientKycSchema>;

/** All Indian cities across states, de-duped + sorted — the fallback list when
 *  no state is chosen (or the state name doesn't map to the cities dataset). */
const ALL_CITIES: string[] = Array.from(
  new Set(Object.values(INDIA_CITIES).flat()),
).sort((a, b) => a.localeCompare(b));

/** Cities for a state name; tolerant of the "&" vs "and" UT naming difference
 *  between the geo state list and the cities dataset. Never returns empty. */
function citiesForState(state: string | null | undefined): string[] {
  if (!state) return ALL_CITIES;
  const map = INDIA_CITIES as Record<string, string[]>;
  return map[state] ?? map[state.replace(/ and /g, " & ")] ?? ALL_CITIES;
}

/** City picker — a searchable dropdown that cascades from the row's selected
 *  State (`addresses.${idx}.state`). Any pre-filled value (import / GST /
 *  business-card autofill) stays visible even if it isn't in the dataset. */
function CityField({ idx, control }: { idx: number; control: Control<KycFormValues> }) {
  const state = useWatch({ control, name: `addresses.${idx}.state` });
  const options = React.useMemo(
    () =>
      citiesForState(typeof state === "string" ? state : undefined).map((c) => ({
        value: c,
        label: c,
      })),
    [state],
  );
  return (
    <Controller
      control={control}
      name={`addresses.${idx}.city`}
      render={({ field }) => {
        const value = (field.value as string | undefined) ?? "";
        const opts =
          value && !options.some((o) => o.value === value)
            ? [{ value, label: value }, ...options]
            : options;
        return (
          <Select
            ariaLabel="City"
            value={value}
            onValueChange={(v) => field.onChange(v || undefined)}
            placeholder="Select city"
            searchable
            searchPlaceholder="Search cities"
            options={opts}
          />
        );
      }}
    />
  );
}

interface Props {
  customerTypes: MasterOptionItem[];
  industryTypes: MasterOptionItem[];
  productTypes: MasterOptionItem[];
  employees: EmployeeOption[];
  /** Admins get inline "+ Add" buttons on the type groups (add a master option
   *  without leaving the form). */
  isAdmin?: boolean;
  /** Admin-managed departments - surfaced as the "Department" dropdown. */
  departments?: MasterOptionItem[];
  /** Contact-person designations (custom list) - the "Designation" dropdown. */
  designationOptions?: string[];
  /** Per-form "Custom" dropdown lists (§2.5). Each falls back to a preset. */
  paymentTermsOptions?: string[];
  freightOptions?: string[];
  creditDaysOptions?: string[];
  creditLimitOptions?: string[];
  qtyDeviationOptions?: string[];
  transporterOptions?: string[];
  bankOptions?: string[];
  accountTypeOptions?: string[];
  stateOptions?: string[];
  countryOptions?: string[];
  currencyOptions?: string[];
  /** When set, the form edits this client in place (admin "Edit client")
   *  instead of onboarding a new one. */
  editClientId?: string;
  /** Prefill values for edit mode - shaped like the form's input fields. */
  initialValues?: Partial<KycFormValues>;
  /** The generated client code (e.g. CL-0001) - shown read-only when editing. */
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
/** The "Other" documents tile additionally accepts PDFs. */
const ALLOWED_OTHER_TYPES = new Set([...ALLOWED_CARD_TYPES, "application/pdf"]);
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

/* ── Commercial dropdown presets ──────────────────────────────────────────
 * Fallback option lists for the §2.5 commercial dropdowns. When the per-form
 * "Custom" lists are populated the page passes those in as props; until then
 * (or when a list is empty) these presets keep the dropdowns usable. */
const PAYMENT_TERMS_PRESET = [
  "Advance",
  "50% Advance, 50% on Delivery",
  "Against Delivery",
  "30 Days Credit",
  "45 Days Credit",
  "60 Days Credit",
  "As per PO",
];
const FREIGHT_PRESET = ["Paid", "To Pay", "Extra at Actuals", "Included", "Ex-Works"];
const DESIGNATION_PRESET =
  CUSTOM_LISTS.kyc?.lists.find((l) => l.key === "designation")?.defaults ?? [];
const CREDIT_DAYS_PRESET = ["0", "15", "30", "45", "60", "90"];
const CREDIT_LIMIT_PRESET = ["50000", "100000", "250000", "500000", "1000000"];
const QTY_DEVIATION_PRESET = ["±5%", "±10%", "±15%", "±20%", "As per PO"];

/** Field label with an optional action (e.g. inline "+ Add") on the right. */
function AddLabelRow({ label, add }: { label: string; add?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className="font-bold"
        style={{
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          fontSize: 14,
          letterSpacing: "-0.005em",
          color: "var(--color-ink-strong)",
        }}
      >
        {label}
      </span>
      {add}
    </div>
  );
}

/**
 * Map a KYC country to its default currency - drives the auto-populate of the
 * Currency field when a Country is picked (Registration & Tax section).
 */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  India: "INR",
  USA: "USD",
  UK: "GBP",
  Russia: "RUB",
  Italy: "EUR",
  Poland: "PLN",
  Australia: "AUD",
  UAE: "AED",
  Spain: "EUR",
  Belgium: "EUR",
  Germany: "EUR",
  France: "EUR",
  Netherlands: "EUR",
  China: "CNY",
  Japan: "JPY",
  Canada: "CAD",
  Singapore: "SGD",
  Switzerland: "CHF",
};


/** Server-side upload: POST the file to our route, which put()s it to Blob
 *  server-to-server. Avoids the browser→Blob direct PUT that gets blocked
 *  cross-origin (CORS / vercel.com/api/blob 400). Returns { url }. */
async function uploadCardToBlob(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/clients/business-card/upload", {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Upload failed (${res.status}).`);
  }
  return (await res.json()) as { url: string };
}

/**
 * Client KYC form - restyled to the New Enquiry visual language (prominent
 * chips, one-line dense grids, numbered group headers). Sections: Identity /
 * Registration & Tax / Addresses / Contact Person / Commercial & Credit /
 * Bank Details / Documents.
 */
export function KycForm({
  customerTypes,
  industryTypes,
  productTypes,
  employees,
  isAdmin = false,
  departments = [],
  designationOptions,
  paymentTermsOptions,
  freightOptions,
  creditDaysOptions,
  creditLimitOptions,
  qtyDeviationOptions,
  transporterOptions,
  bankOptions,
  accountTypeOptions,
  stateOptions,
  countryOptions,
  currencyOptions,
  editClientId,
  initialValues,
  clientCode,
  documents,
  enableDrafts,
  resumeDraftId,
}: Props) {
  // Custom lists fall back to presets when the "Custom" editor hasn't been used.
  const paymentTermsList = paymentTermsOptions?.length ? paymentTermsOptions : PAYMENT_TERMS_PRESET;
  const freightList = freightOptions?.length ? freightOptions : FREIGHT_PRESET;
  const creditDaysList = creditDaysOptions?.length ? creditDaysOptions : CREDIT_DAYS_PRESET;
  const creditLimitList = creditLimitOptions?.length ? creditLimitOptions : CREDIT_LIMIT_PRESET;
  const qtyDeviationList = qtyDeviationOptions?.length ? qtyDeviationOptions : QTY_DEVIATION_PRESET;
  const transporterList = transporterOptions?.length ? transporterOptions : TRANSPORTER_OPTIONS;
  const bankList = bankOptions?.length ? bankOptions : BANKS;
  const accountTypeList = accountTypeOptions?.length ? accountTypeOptions : ACCOUNT_TYPES;
  const stateList = stateOptions?.length ? stateOptions : INDIAN_STATES;
  const countryList = countryOptions?.length ? countryOptions : COUNTRIES;
  const currencyList: readonly string[] = currencyOptions?.length ? currencyOptions : CURRENCY_CODES;

  // Locally-added Designation / Department options show in their dropdown
  // instantly (before router.refresh() syncs them back from the server).
  const [extraDesignations, setExtraDesignations] = React.useState<string[]>(() => {
    // Seed with any designations the client already has so a previously
    // free-typed value still renders as the selected dropdown option.
    const vals: string[] = [];
    if (initialValues?.contactDesignation) vals.push(initialValues.contactDesignation);
    (initialValues?.additionalContacts ?? []).forEach((c) => {
      if (c?.designation) vals.push(c.designation);
    });
    return vals;
  });
  const [extraDepartments, setExtraDepartments] = React.useState<MasterOptionItem[]>([]);
  const designationList = React.useMemo(() => {
    const base = designationOptions?.length ? designationOptions : DESIGNATION_PRESET;
    return Array.from(
      new Set([...base, ...extraDesignations].map((s) => s.trim()).filter(Boolean)),
    );
  }, [designationOptions, extraDesignations]);
  const departmentList = React.useMemo(() => {
    const map = new Map<string, MasterOptionItem>();
    [...departments, ...extraDepartments].forEach((d) => map.set(d.id, d));
    return Array.from(map.values());
  }, [departments, extraDepartments]);

  // Locally-added Commercial & Credit terms (payment terms / freight / credit
  // days / credit limit / transporter / qty deviation) - each list is a custom
  // dropdown; the inline "+ Add" writes to it and shows the value immediately.
  const [extraTerms, setExtraTerms] = React.useState<Record<string, string[]>>({});
  const withExtra = React.useCallback(
    (base: readonly string[] | undefined, key: string) =>
      Array.from(new Set([...(base ?? []), ...(extraTerms[key] ?? [])].filter(Boolean))),
    [extraTerms],
  );

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
    formState: { errors, isDirty },
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
      businessCardOtherUrls: [],
      notes: "",
      // Edit mode prefill - overrides the empty defaults field-by-field.
      ...initialValues,
    },
  });

  const { fields: additionalContactFields, append: appendContact, remove: removeContact } =
    useFieldArray({ control, name: "additionalContacts" });

  const { fields: addressFields, append: appendAddress, remove: removeAddress } =
    useFieldArray({ control, name: "addresses" });

  const { fields: bankFields, append: appendBank, remove: removeBank } =
    useFieldArray({ control, name: "bankAccounts" });

  // Always show one primary bank account expanded (never just the "+ Add
  // Account" button). Empty accounts are dropped on save, so this seeds no junk.
  const bankSeeded = React.useRef(false);
  React.useEffect(() => {
    if (bankSeeded.current) return;
    bankSeeded.current = true;
    if (bankFields.length === 0) {
      // shouldFocus:false — this seed runs on mount; focusing the new row would
      // scroll the page down to Bank Details instead of opening at the top.
      appendBank(
        {
          isPrimary: true,
          bankName: "",
          accountNo: "",
          ifsc: "",
          branch: "",
          accountHolder: "",
          accountType: "",
        },
        { shouldFocus: false },
      );
    }
  }, [bankFields.length, appendBank]);

  // ── Draft auto-save (create mode only - silent, runs in background) ──
  const { discard } = useFormDraft({
    kind: "kyc",
    enabled: draftsOn,
    resumeDraftId,
    watch,
    getValues,
  });

  /** Pick a Country → default its Currency and propagate the country down to
   *  every address block (Registration is the source of truth). */
  function applyCountry(next: string) {
    setValue("country", next);
    const mapped = COUNTRY_TO_CURRENCY[next];
    if (mapped) setValue("currency", mapped);
    const addrs = getValues("addresses") ?? [];
    addrs.forEach((_, i) => setValue(`addresses.${i}.country`, next));
  }

  /** When a 6-digit PIN is entered, infer the State (postal circle) and default
   *  the Country to India. Only fills fields the user has left blank so it never
   *  clobbers a manual choice. */
  function autofillFromPin(idx: number, pinRaw: string) {
    const pin = pinRaw.replace(/\D/g, "");
    if (pin.length < 6) return;
    const state = pinToState(pin);
    if (state && !getValues(`addresses.${idx}.state`)) {
      setValue(`addresses.${idx}.state`, state, { shouldDirty: true });
    }
    if (!getValues(`addresses.${idx}.country`)) {
      setValue(`addresses.${idx}.country`, "India", { shouldDirty: true });
    }
  }

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

  // ── GSTIN "master key": normalize as the user types (uppercase, strip
  //    spaces/hyphens on paste), validate format + checksum live, and silently
  //    auto-fill PAN, Place of Supply (state) and the registration type. ──
  const [gstParse, setGstParse] = React.useState<GstinParse>(() =>
    parseGstin(String(initialValues?.gstin ?? "")),
  );

  function handleGstinChange(raw: string) {
    const parse = parseGstin(raw);
    setGstParse(parse);
    setValue("gstin", parse.normalized, { shouldDirty: true });

    if (parse.normalized === "") {
      // Cleared - relax the registration type back to unregistered.
      const t = watch("gstRegistrationType");
      if (t === "regular" || !t) setValue("gstRegistrationType", "unregistered", { shouldDirty: true });
      return;
    }

    // Step 1 - the first 2 digits (state code) locate the entity: a GSTIN is
    // always Indian, so fill State (Place of Supply), Country and Currency the
    // moment the code resolves, without waiting for the rest of the number.
    // The registration state also flows into the Billing Address so that block
    // is auto-completed too.
    if (parse.stateName) {
      setValue("placeOfSupply", parse.stateName, { shouldDirty: true });
      applyCountry("India");
      const addrState = toAddressStateName(parse.stateName);
      setValue("addresses.0.state", addrState, { shouldDirty: true });
      const t = watch("gstRegistrationType");
      if (!t || t === "unregistered") setValue("gstRegistrationType", "regular", { shouldDirty: true });
    }

    // Step 2 - once chars 3-12 exist, extract and fill the PAN / I-T number.
    if (parse.pan) setValue("panNo", parse.pan, { shouldDirty: true });
  }

  // ── GSTIN → business details auto-fetch. A GSTIN is a rich key: one lookup
  //    (configured KYB provider, lib/kyb/gst-lookup.ts) fills the Company Name,
  //    registered address, registration type and reports the GSTIN status.
  //    Only fills fields the user left blank so it never clobbers a manual edit.
  const [gstPending, startGst] = React.useTransition();
  function setIfBlank(name: Parameters<typeof setValue>[0], value: string | undefined) {
    if (!value) return;
    const current = getValues(name);
    if (current === undefined || current === null || current === "") {
      setValue(name, value, { shouldDirty: true });
    }
  }
  function handleFetchGst() {
    const gstin = (watch("gstin") ?? "").trim();
    if (gstin.replace(/[^a-zA-Z0-9]/g, "").length !== 15) {
      fireToast({ message: "Enter a complete 15-character GSTIN first.", type: "error" });
      return;
    }
    startGst(async () => {
      const res = await fetchGstDetailsAction(gstin);
      if (!res.ok) {
        fireToast({ message: res.error ?? "Couldn't fetch GST details.", type: "error" });
        return;
      }
      setIfBlank("name", res.tradeName ?? res.legalName);
      if (
        res.registrationType &&
        (GST_REGISTRATION_TYPES as readonly string[]).includes(res.registrationType)
      ) {
        setValue(
          "gstRegistrationType",
          res.registrationType as (typeof GST_REGISTRATION_TYPES)[number],
          { shouldDirty: true },
        );
      }
      const a = res.address;
      if (a) {
        setIfBlank("addresses.0.line1", a.line1);
        setIfBlank("addresses.0.line2", a.line2);
        setIfBlank("addresses.0.line3", a.line3);
        setIfBlank("addresses.0.line4", a.line4);
        setIfBlank("addresses.0.city", a.city);
        setIfBlank("addresses.0.state", a.state);
        setIfBlank("addresses.0.pinCode", a.pincode);
        setIfBlank("addresses.0.country", "India");
      }
      const cancelled = (res.status ?? "").toLowerCase().includes("cancel");
      fireToast({
        message: `${res.legalName ?? res.tradeName ?? "GST"} fetched${res.status ? ` · ${res.status}` : ""}.`,
        type: cancelled ? "error" : "success",
      });
    });
  }

  // Auto-fetch GST details in the background the moment a complete, valid GSTIN
  // is entered (no manual button). Guarded so each distinct GSTIN fetches once.
  const lastAutoFetchedGstin = React.useRef<string>("");
  React.useEffect(() => {
    if (gstParse.valid && gstParse.normalized !== lastAutoFetchedGstin.current) {
      lastAutoFetchedGstin.current = gstParse.normalized;
      handleFetchGst();
    }
    // handleFetchGst reads the current gstin via watch(); the ref guard prevents
    // re-fetching the same number, so we intentionally depend only on the parse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstParse.valid, gstParse.normalized]);

  /** Inline "+ Add" for a Commercial & Credit custom dropdown: writes the value
   *  to the list, shows it instantly, and selects it via `onSelect`. */
  function termAdd(listKey: string, title: string, onSelect: (v: string) => void) {
    return (
      <InlineOptionAdd
        title={title}
        add={async (n) => {
          const r = await addCustomOption("kyc", listKey, n);
          return r.ok ? { ok: true, value: n } : { ok: false, error: r.error };
        }}
        onAdded={(v) => {
          setExtraTerms((p) => ({ ...p, [listKey]: [...(p[listKey] ?? []), v] }));
          onSelect(v);
        }}
      />
    );
  }

  // Business-card scans live in form state via the URL fields - uploads run on
  // file-pick and never block the save. `front`/`back` track in-flight uploads.
  const cardFront = watch("businessCardFrontUrl");
  const cardBack = watch("businessCardBackUrl");
  const cardOther = watch("businessCardOtherUrls") ?? [];
  const [uploading, setUploading] = React.useState<{
    front: boolean;
    back: boolean;
    other: boolean;
  }>({ front: false, back: false, other: false });

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
    } catch (err) {
      // Missing BLOB_READ_WRITE_TOKEN (or a Blob outage) lands here - the
      // card is skipped, the form still saves without it. Surface the real
      // server reason so config issues are diagnosable, not a vague message.
      const reason = err instanceof Error ? err.message : "";
      fireToast({
        message: reason
          ? `Business card upload failed: ${reason}`
          : "Business card upload unavailable - check storage configuration.",
        type: "error",
      });
    } finally {
      setUploading((u) => ({ ...u, [side]: false }));
    }
  }

  /** "Other" documents - multi-file, appends every uploaded blob URL. */
  async function onPickOther(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading((u) => ({ ...u, other: true }));
    try {
      for (const file of Array.from(files)) {
        if (!ALLOWED_OTHER_TYPES.has(file.type)) {
          fireToast({
            message: `${file.name}: only images or PDF files are allowed.`,
            type: "error",
          });
          continue;
        }
        if (file.size > MAX_CARD_BYTES) {
          fireToast({ message: `${file.name} exceeds 25 MB.`, type: "error" });
          continue;
        }
        try {
          const blob = await uploadCardToBlob(file);
          setValue("businessCardOtherUrls", [
            ...(getValues("businessCardOtherUrls") ?? []),
            blob.url,
          ]);
        } catch {
          fireToast({
            message: `${file.name}: upload unavailable - check storage configuration.`,
            type: "error",
          });
        }
      }
    } finally {
      setUploading((u) => ({ ...u, other: false }));
    }
  }

  function removeOther(url: string) {
    setValue(
      "businessCardOtherUrls",
      (getValues("businessCardOtherUrls") ?? []).filter((u) => u !== url),
    );
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
      // Client saved - retire the draft so it leaves the Drafts inbox.
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

  const firstFieldError = firstErrorMessage(errors);

  // Warn before losing unsaved edits (refresh/close) - the key safety net for
  // EDIT mode, which has no draft autosave.
  useUnsavedGuard(isDirty && !pending);

  // Keyboard-first ergonomics: Enter advances to the next field (single-line
  // inputs), Ctrl/Cmd + Enter submits. See use-keyboard-form for the rules.
  const { formProps } = useKeyboardForm();

  return (
    <form onSubmit={submit} onKeyDown={formProps.onKeyDown} className="flex flex-col gap-6" noValidate>

      {/* ── 1 · Identity ─────────────────────────────────────────────── */}
      <SectionCard
        title="Identity"
        hint="Who the client is - type, industry and the products they buy."
      >
        {/* Client Code - read-only display field, only when editing */}
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

        {/* GSTIN · Company Name · Assign Sales Person · Export · Grade · Tags —
            one line. GSTIN sits first and auto-fetches the company details. */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.95fr)_minmax(0,0.65fr)_minmax(0,0.55fr)_minmax(0,1.1fr)] gap-3 max-xl:grid-cols-3 max-md:grid-cols-2">
          <Field id="kyc-gstin" label="GSTIN">
            <Controller
              control={control}
              name="gstin"
              render={({ field }) => (
                <input
                  id="kyc-gstin"
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={15}
                  placeholder="27ABCDE1234F1Z5"
                  className="nt-input font-mono uppercase tracking-wide"
                  value={field.value ?? ""}
                  onChange={(e) => handleGstinChange(e.target.value)}
                  onBlur={() => {
                    field.onBlur();
                    runDupCheck();
                  }}
                />
              )}
            />
            {gstPending && (
              <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-[#6b7280]">
                <Loader2 className="h-[13px] w-[13px] animate-spin" /> Fetching details…
              </p>
            )}
            {!gstPending && gstParse.status === "valid" && (
              <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-[#15803d]">
                <Check size={13} strokeWidth={3} /> Verified
                {gstParse.stateName ? ` · ${gstParse.stateName}` : ""}
              </p>
            )}
            {gstParse.status === "invalid" && (
              <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-[#d32f2f]">
                <X size={13} strokeWidth={3} /> {gstParse.error ?? "Invalid GST Number"}
              </p>
            )}
            {gstParse.status === "idle" && gstParse.stateName && (
              <p className="mt-1 text-[12px] font-medium text-[#6b7280]">
                State: <span className="font-semibold text-ink-strong">{gstParse.stateName}</span>
              </p>
            )}
          </Field>
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
                    employees.length === 0 ? "No employees yet" : "Select an employee"
                  }
                  disabled={employees.length === 0}
                  searchable
                  searchPlaceholder="Search employees"
                  options={employees.map((e) => ({ value: e.id, label: e.name }))}
                />
              )}
            />
          </Field>
          <Field label="Export" labelOnly>
            <Controller
              control={control}
              name="export"
              render={({ field }) => (
                <Select
                  ariaLabel="Export"
                  value={field.value === undefined ? "" : field.value ? "yes" : "no"}
                  onValueChange={(v) =>
                    field.onChange(v === "" ? undefined : v === "yes")
                  }
                  placeholder="Export?"
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ]}
                />
              )}
            />
          </Field>
          <Field label="Grade" labelOnly>
            <Controller
              control={control}
              name="grade"
              render={({ field }) => (
                <Select
                  ariaLabel="Grade"
                  value={field.value ?? ""}
                  onValueChange={(v) =>
                    field.onChange((v || undefined) as (typeof CLIENT_GRADES)[number] | undefined)
                  }
                  placeholder="Grade"
                  options={CLIENT_GRADES.map((g) => ({ value: g, label: g }))}
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
                  placeholder="e.g. Mining, Defense"
                />
              )}
            />
          </Field>
        </div>

        {/* Customer Type on its own line; Industry Type stacked below it. */}
        <div className="flex flex-col gap-4">
          <MasterChips
            control={control}
            name="customerTypeIds"
            label="Customer Type"
            options={customerTypes}
            add={isAdmin ? <AddMasterOptionModal kind="customer_type" label="Customer Type" /> : null}
          />
          <MasterChips
            control={control}
            name="industryTypeIds"
            label="Industry Type"
            options={industryTypes}
            add={isAdmin ? <AddMasterOptionModal kind="industry_type" label="Industry Type" /> : null}
          />
        </div>

        {/* Product Types - uniform-width checkbox chip grid over the master. */}
        <div className="flex flex-col gap-2">
          <span
            className="font-bold"
            style={{
              fontFamily: "var(--font-sans), system-ui, sans-serif",
              fontSize: 14,
              letterSpacing: "-0.005em",
              color: "var(--color-ink-strong)",
            }}
          >
            Product Types
          </span>
          <Controller
            control={control}
            name="productTypeIds"
            render={({ field }) => {
              const selected = field.value ?? [];
              return (
                <>
                  {productTypes.length === 0 ? (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <p className="text-[13px] text-ink-subtle">
                        No product types yet.
                      </p>
                      {isAdmin && <AddMasterOptionModal kind="product_type" label="Product Types" />}
                    </div>
                  ) : (
                    <div className="grid grid-cols-7 gap-2 max-xl:grid-cols-5 max-lg:grid-cols-4 max-md:grid-cols-2">
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
                              "flex w-full items-start gap-2 rounded-chip border-[1.75px] px-2.5 py-2 text-left text-[12.5px] font-semibold leading-tight transition-colors",
                              checked
                                ? "border-brand bg-brand/8 text-ink-strong"
                                : "border-[#9199b6] bg-surface-card text-ink-strong hover:border-[#6f78a0] hover:bg-[#f3f4f8]",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-[1px] inline-flex size-[16px] shrink-0 items-center justify-center rounded-[4px] border-[1.75px] transition-colors",
                                checked
                                  ? "bg-brand border-brand text-white"
                                  : "border-[#9199b6] bg-white text-transparent",
                              )}
                            >
                              <Check size={11} strokeWidth={3} />
                            </span>
                            <span className="whitespace-normal break-words">{opt.name}</span>
                          </button>
                        );
                      })}
                      {isAdmin && (
                        <div className="flex items-center">
                          <AddMasterOptionModal kind="product_type" label="Product Types" />
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            }}
          />
        </div>

      </SectionCard>

      {/* ── 2 · Registration & Tax ───────────────────────────────────── */}
      <SectionCard
        title="Registration & Tax"
        inlineHint
        hint="GST, PAN, MSME / Udyam registration and export / currency details."
      >
        {/* PAN · MSME · GST Reg Type · Currency · Country · State - one line.
            GSTIN moved to the Identity row and auto-fetches on a complete number. */}
        <div className="grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2">
          <Field id="kyc-pan" label="PAN / IT No">
            <Controller
              control={control}
              name="panNo"
              render={({ field }) => (
                <input
                  id="kyc-pan"
                  type="text"
                  className="nt-input font-mono uppercase tracking-wide"
                  maxLength={10}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10),
                    )
                  }
                  onBlur={() => {
                    field.onBlur();
                    runDupCheck();
                  }}
                />
              )}
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
          <Field label="Currency" labelOnly>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  ariaLabel="Currency"
                  value={field.value ?? "INR"}
                  onValueChange={field.onChange}
                  searchable
                  searchPlaceholder="Search currencies"
                  options={currencyList.map((c) => ({ value: c, label: c }))}
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
                  onValueChange={(v) => applyCountry(v)}
                  searchable
                  searchPlaceholder="Search countries"
                  options={countryList.map((c) => ({ value: c, label: c }))}
                />
              )}
            />
          </Field>
          {/* State — auto-detected from the GSTIN state code; also editable. */}
          <Field label="State" labelOnly>
            <Controller
              control={control}
              name="placeOfSupply"
              render={({ field }) => (
                <Select
                  ariaLabel="State"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || "")}
                  placeholder="Select state"
                  searchable
                  options={GST_STATE_NAMES.map((s) => ({ value: s, label: s }))}
                />
              )}
            />
          </Field>
        </div>

        {/* Non-blocking dedup warning - existing clients sharing this GSTIN/PAN. */}
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
      </SectionCard>

      {/* ── 3 · Contact Person ───────────────────────────────────────── */}
      <SectionCard
        title="Contact Person"
        inlineHint
        hint="The first contact is saved as the client's primary - auto-fetched on enquiries."
      >
        {/* Primary contact */}
        <div className="flex flex-col gap-3">
          <GroupHeader n={1} label="Contact" />
          {/* First Name · Last Name · Contact No · Email · Designation ·
              Department - all on one line (wraps on smaller screens). */}
          <div className="grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
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
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="font-bold"
                  style={{
                    fontFamily: "var(--font-sans), system-ui, sans-serif",
                    fontSize: 14,
                    letterSpacing: "-0.005em",
                    color: "var(--color-ink-strong)",
                  }}
                >
                  Designation
                </span>
                <InlineOptionAdd
                  title="Designation"
                  placeholder="e.g. Purchase Manager"
                  add={async (n) => {
                    const r = await addCustomOption("kyc", "designation", n);
                    return r.ok ? { ok: true, value: n } : { ok: false, error: r.error };
                  }}
                  onAdded={(v) => {
                    setExtraDesignations((prev) => [...prev, v]);
                    setValue("contactDesignation", v, { shouldDirty: true });
                  }}
                />
              </div>
              <Controller
                control={control}
                name="contactDesignation"
                render={({ field }) => (
                  <Select
                    ariaLabel="Designation"
                    value={field.value ?? ""}
                    onValueChange={(v) => field.onChange(v || undefined)}
                    placeholder="Select designation"
                    searchable
                    searchPlaceholder="Search designations"
                    options={designationList.map((d) => ({ value: d, label: d }))}
                  />
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="font-bold"
                  style={{
                    fontFamily: "var(--font-sans), system-ui, sans-serif",
                    fontSize: 14,
                    letterSpacing: "-0.005em",
                    color: "var(--color-ink-strong)",
                  }}
                >
                  Department
                </span>
                {isAdmin && (
                  <InlineOptionAdd
                    title="Department"
                    add={async (n) => {
                      const r = await createMasterOption({ kind: "department", name: n });
                      return r.ok
                        ? { ok: true, value: r.id }
                        : { ok: false, error: r.error };
                    }}
                    onAdded={(id, name) => {
                      setExtraDepartments((prev) => [...prev, { id, name }]);
                      setValue("departmentId", id, { shouldDirty: true });
                    }}
                  />
                )}
              </div>
              <Controller
                control={control}
                name="departmentId"
                render={({ field }) => (
                  <Select
                    ariaLabel="Department"
                    value={field.value ?? ""}
                    onValueChange={(v) => field.onChange(v || undefined)}
                    placeholder={
                      departmentList.length === 0 ? "No departments yet" : "Select a department"
                    }
                    disabled={departmentList.length === 0}
                    options={departmentList.map((d) => ({ value: d.id, label: d.name }))}
                  />
                )}
              />
            </div>
          </div>
          <Field id="kyc-cnotes" label="Contact Notes">
            <Controller
              control={control}
              name="contactNotes"
              render={({ field }) => (
                <NotesField
                  id="kyc-cnotes"
                  ariaLabel="Contact Notes"
                  rows={1}
                  placeholder="Notes about this contact"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
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
              <Field label="Designation" labelOnly>
                <Controller
                  control={control}
                  name={`additionalContacts.${idx}.designation`}
                  render={({ field: df }) => (
                    <Select
                      ariaLabel="Designation"
                      value={df.value ?? ""}
                      onValueChange={(v) => df.onChange(v || undefined)}
                      placeholder="Select designation"
                      searchable
                      searchPlaceholder="Search designations"
                      options={designationList.map((d) => ({ value: d, label: d }))}
                    />
                  )}
                />
              </Field>
              <Field id={`kyc-ac${idx}-notes`} label="Notes">
                <Controller
                  control={control}
                  name={`additionalContacts.${idx}.notes`}
                  render={({ field: nf }) => (
                    <NotesField
                      id={`kyc-ac${idx}-notes`}
                      ariaLabel="Contact notes"
                      rows={2}
                      placeholder="Notes about this contact"
                      value={nf.value ?? ""}
                      onChange={nf.onChange}
                    />
                  )}
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
          className="inline-flex w-max items-center gap-1.5 rounded-lg border border-[#c9c9ea] bg-[#f4f4fd] px-4 py-2.5 text-[13px] font-bold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#eeeefb]"
        >
          <Plus className="h-4 w-4" />
          Add Contact
        </button>
      </SectionCard>

      {/* ── 4 · Addresses ────────────────────────────────────────────── */}
      <SectionCard
        title="Addresses"
        inlineHint
        hint="Billing and shipping addresses - copy billing into shipping when they match."
      >
        {addressFields.map((field, idx) => {
          const addrLabel =
            idx === 0 ? "Billing Address" : idx === 1 ? "Shipping Address" : `Address ${idx + 1}`;
          return (
            <div key={field.id} className="flex flex-col gap-3">
              <GroupHeader
                n={idx + 1}
                label={addrLabel}
                leftAction={
                  idx >= 1 ? (
                    <button
                      type="button"
                      onClick={() => copyFromBilling(idx)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border-[1.75px] border-[#3f3f94] bg-[#f4f4fd] px-3 py-1.5 text-[12.5px] font-bold text-[#3f3f94] transition hover:bg-[#3f3f94] hover:text-white hover:shadow-[0_6px_16px_rgba(63,63,148,0.28)]"
                    >
                      <Copy className="h-[14px] w-[14px]" />
                      Click here to Copy from Billing Address
                    </button>
                  ) : undefined
                }
                action={
                  idx >= 1 ? (
                    <button
                      type="button"
                      onClick={() => removeAddress(idx)}
                      aria-label={`Remove ${addrLabel.toLowerCase()}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-semibold text-ink-subtle transition hover:border-[#f0b4b4] hover:bg-[#fdf3f3] hover:text-[#d32f2f]"
                    >
                      <X className="h-[15px] w-[15px]" />
                      Remove
                    </button>
                  ) : undefined
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
                <Field label="City" labelOnly>
                  <CityField idx={idx} control={control} />
                </Field>
                <Field label="State" labelOnly>
                  <Controller
                    control={control}
                    name={`addresses.${idx}.state`}
                    render={({ field }) => (
                      <Select
                        ariaLabel="State"
                        value={field.value ?? ""}
                        onValueChange={(v) => field.onChange(v || undefined)}
                        placeholder="Select state"
                        searchable
                        searchPlaceholder="Search states"
                        options={stateList.map((s) => ({ value: s, label: s }))}
                      />
                    )}
                  />
                </Field>
                <Field label="Country" labelOnly>
                  <Controller
                    control={control}
                    name={`addresses.${idx}.country`}
                    render={({ field }) => (
                      <Select
                        ariaLabel="Country"
                        value={field.value ?? ""}
                        onValueChange={(v) => field.onChange(v || undefined)}
                        placeholder="Select country"
                        searchable
                        searchPlaceholder="Search countries"
                        options={countryList.map((c) => ({ value: c, label: c }))}
                      />
                    )}
                  />
                </Field>
                <Field id={`kyc-addr${idx}-pin`} label="Pin Code">
                  <input
                    id={`kyc-addr${idx}-pin`}
                    type="text"
                    inputMode="numeric"
                    className="nt-input"
                    maxLength={6}
                    {...register(`addresses.${idx}.pinCode`, {
                      onChange: (e) => {
                        e.target.value = e.target.value.replace(/[^0-9]/g, "");
                        autofillFromPin(idx, e.target.value);
                      },
                    })}
                  />
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
              country: getValues("country") ?? "",
              pinCode: "",
            })
          }
          className="inline-flex w-max items-center gap-1.5 rounded-lg border border-[#c9c9ea] bg-[#f4f4fd] px-4 py-2.5 text-[13px] font-bold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#eeeefb]"
        >
          <Plus className="h-4 w-4" />
          Add address
        </button>
      </SectionCard>

      {/* ── 5 · Commercial & Credit ──────────────────────────────────── */}
      <SectionCard
        title="Commercial & Credit"
        inlineHint
        hint="Payment terms, credit limits, freight and logistics details."
      >
        <div className="grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <AddLabelRow
              label="Payment Terms"
              add={termAdd("payment_terms", "Payment Term", (v) =>
                setValue("paymentTerms", v, { shouldDirty: true }),
              )}
            />
            <Controller
              control={control}
              name="paymentTerms"
              render={({ field }) => (
                <Select
                  ariaLabel="Payment Terms"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select payment terms"
                  options={withExtra(paymentTermsList, "payment_terms").map((t) => ({ value: t, label: t }))}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AddLabelRow
              label="Freight Charges"
              add={termAdd("freight_charges", "Freight Charge", (v) =>
                setValue("freightCharges", v, { shouldDirty: true }),
              )}
            />
            <Controller
              control={control}
              name="freightCharges"
              render={({ field }) => (
                <Select
                  ariaLabel="Freight Charges"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select freight terms"
                  options={withExtra(freightList, "freight_charges").map((t) => ({ value: t, label: t }))}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AddLabelRow
              label="Credit Days"
              add={termAdd("credit_days", "Credit Days value", (v) =>
                setValue("creditDays", v as never, { shouldDirty: true }),
              )}
            />
            <Controller
              control={control}
              name="creditDays"
              render={({ field }) => (
                <Select
                  ariaLabel="Credit Days"
                  value={field.value != null ? String(field.value) : ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select credit days"
                  options={withExtra(creditDaysList, "credit_days").map((d) => ({
                    value: d,
                    label: /^\d+$/.test(d) ? `${d} days` : d,
                  }))}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AddLabelRow
              label="Credit Limit"
              add={termAdd("credit_limit", "Credit Limit value", (v) =>
                setValue("creditLimit", v as never, { shouldDirty: true }),
              )}
            />
            <Controller
              control={control}
              name="creditLimit"
              render={({ field }) => (
                <Select
                  ariaLabel="Credit Limit"
                  value={field.value != null ? String(field.value) : ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select credit limit"
                  options={withExtra(creditLimitList, "credit_limit").map((c) => ({
                    value: c,
                    label: /^\d+$/.test(c) ? `₹${Number(c).toLocaleString("en-IN")}` : c,
                  }))}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AddLabelRow
              label="Transporter"
              add={termAdd("transporter", "Transporter", (v) =>
                setValue("transporter", v, { shouldDirty: true }),
              )}
            />
            <Controller
              control={control}
              name="transporter"
              render={({ field }) => (
                <Select
                  ariaLabel="Transporter"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select transporter"
                  options={withExtra(transporterList, "transporter").map((t) => ({ value: t, label: t }))}
                />
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AddLabelRow
              label="Quantity Deviation"
              add={termAdd("qty_deviation", "Quantity Deviation", (v) =>
                setValue("qtyDeviation", v, { shouldDirty: true }),
              )}
            />
            <Controller
              control={control}
              name="qtyDeviation"
              render={({ field }) => (
                <Select
                  ariaLabel="Quantity Deviation"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select deviation"
                  options={withExtra(qtyDeviationList, "qty_deviation").map((t) => ({ value: t, label: t }))}
                />
              )}
            />
          </div>
        </div>

        {/* Other References + Client Notes side by side to save vertical space. */}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="kyc-otherrefs" label="Other References">
            <Controller
              control={control}
              name="otherReferences"
              render={({ field }) => (
                <NotesField
                  id="kyc-otherrefs"
                  ariaLabel="Other References"
                  rows={2}
                  placeholder="Any other references or notes relevant to this client"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>

          <Field id="kyc-notes" label="Client Notes">
            <Controller
              control={control}
              name="notes"
              render={({ field }) => (
                <NotesField
                  id="kyc-notes"
                  ariaLabel="Client Notes"
                  rows={2}
                  placeholder="Any general notes about this client"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 6 · Bank Details ─────────────────────────────────────────── */}
      <SectionCard
        title="Bank Details"
        inlineHint
        hint="One or more bank accounts for payments - flag one as primary."
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
              <Field label="Bank Name" labelOnly>
                <Controller
                  control={control}
                  name={`bankAccounts.${idx}.bankName`}
                  render={({ field }) => (
                    <Select
                      ariaLabel="Bank Name"
                      value={field.value ?? ""}
                      onValueChange={(v) => field.onChange(v || undefined)}
                      placeholder="Select a bank"
                      searchable
                      searchPlaceholder="Search banks"
                      options={bankList.map((b) => ({ value: b, label: b }))}
                    />
                  )}
                />
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
              <Field label="Account Type" labelOnly>
                <Controller
                  control={control}
                  name={`bankAccounts.${idx}.accountType`}
                  render={({ field }) => (
                    <Select
                      ariaLabel="Account Type"
                      value={field.value ?? ""}
                      onValueChange={(v) => field.onChange(v || undefined)}
                      placeholder="Select account type"
                      options={accountTypeList.map((t) => ({ value: t, label: t }))}
                    />
                  )}
                />
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
                  Primary Account
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
          className="inline-flex w-max items-center gap-1.5 rounded-lg border border-[#c9c9ea] bg-[#f4f4fd] px-4 py-2.5 text-[13px] font-bold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#eeeefb]"
        >
          <Plus className="h-4 w-4" />
          Add Account
        </button>
      </SectionCard>

      {/* ── 7 · Documents & Business Card ────────────────────────────── */}
      <SectionCard
        title="Documents"
        inlineHint
        hint="Attach any document, image, audio, or video to this client record - plus scans of the contact's business card."
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
          <GroupHeader n={1} label="Business Card & Documents" />
          {/* Front / Back / Other sit close together as fixed tiles. */}
          <div className="flex flex-wrap items-start gap-4">
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
            <OtherDocsUpload
              urls={cardOther}
              uploading={uploading.other}
              onPick={(files) => void onPickOther(files)}
              onRemove={removeOther}
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
        <span className="text-[11px] text-ink-subtle">Ctrl / ⌘ + Enter to save</span>
        <button
          type="submit"
          // Block submit while any business-card upload is still in flight, else
          // the client saves before the just-uploaded scan URL is attached.
          disabled={pending || uploading.front || uploading.back || uploading.other}
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
          {uploading.front || uploading.back || uploading.other
            ? "Uploading…"
            : pending
              ? "Saving"
              : isEdit
                ? "Save changes"
                : "Onboard Client"}
        </button>
      </div>
    </form>
  );
}

/**
 * Multi-select master picker rendered as a prominent checkbox chip row - the
 * same chip treatment as the enquiry checklist's "Docs Given". Stores an array
 * of selected uuids; the legacy singular column is mirrored to the first
 * selection server-side. Empty master shows the "add them in the Masters
 * module" fallback.
 */
function MasterChips({
  control,
  name,
  label,
  options,
  add,
}: {
  control: Control<KycFormValues>;
  name: "customerTypeIds" | "industryTypeIds";
  label: string;
  options: MasterOptionItem[];
  /** Optional "+ Add" control rendered at the end of the chip row. */
  add?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className="font-bold"
        style={{
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          fontSize: 14,
          letterSpacing: "-0.005em",
          color: "var(--color-ink-strong)",
        }}
      >
        {label}
      </span>
      <Controller
        control={control}
        name={name}
        render={({ field }) => {
          const selected = field.value ?? [];
          return (
            <>
              {options.length === 0 ? (
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="text-[13px] text-ink-subtle">
                    No options yet.
                  </p>
                  {add}
                </div>
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
                            "inline-flex size-[16px] shrink-0 items-center justify-center rounded-[4px] border-[1.75px] transition-colors",
                            checked
                              ? "bg-brand border-brand text-white"
                              : "border-[#9199b6] bg-white text-transparent",
                          )}
                        >
                          <Check size={11} strokeWidth={3} />
                        </span>
                        <span className="whitespace-nowrap">{opt.name}</span>
                      </button>
                    );
                  })}
                  {add ? <div className="self-center">{add}</div> : null}
                </div>
              )}
            </>
          );
        }}
      />
    </div>
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
    <Field label={label} labelOnly>
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
          {/* Blob URLs are remote + unconfigured for next/image - plain img. */}
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
          className="inline-flex size-[120px] flex-col items-center justify-center gap-1.5 rounded-xl border border-hairline-strong text-ink-subtle hover:text-ink-strong hover:border-ink-subtle transition-colors disabled:opacity-60"
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

/** True for blob URLs whose pathname ends in an image extension. */
function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|heic)(?:$|\?)/i.test(url);
}

/** Human filename from a blob URL (drops the query + path prefix). */
function fileNameFromUrl(url: string): string {
  try {
    const last = url.split("/").pop()?.split("?")[0] ?? "file";
    return decodeURIComponent(last) || "file";
  } catch {
    return "file";
  }
}

/**
 * "Other" documents tile - a multi-file uploader for the rest of the client's
 * scans (images or PDFs). Each uploaded blob shows as a 120px tile (thumbnail
 * for images, a file chip for PDFs) with a remove x, followed by the dashed
 * add tile. Mirrors CardUpload's look so the three sit together.
 */
function OtherDocsUpload({
  urls,
  uploading,
  onPick,
  onRemove,
}: {
  urls: string[];
  uploading: boolean;
  onPick: (files: FileList | null) => void;
  onRemove: (url: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <Field label="Other" labelOnly>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        className="hidden"
        aria-label="Other documents"
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = ""; // allow re-picking the same file after a remove
        }}
      />
      <div className="flex flex-wrap items-start gap-3">
        {urls.map((url) => (
          <div
            key={url}
            className="relative inline-block size-[120px] overflow-hidden rounded-xl border border-hairline bg-surface-soft"
          >
            {isImageUrl(url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="Document" className="size-full object-cover" />
            ) : (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex size-full flex-col items-center justify-center gap-1.5 px-2 text-center text-ink-subtle hover:text-ink-strong transition-colors"
              >
                <FileText size={22} />
                <span className="line-clamp-2 break-all text-[10.5px] font-semibold">
                  {fileNameFromUrl(url)}
                </span>
              </a>
            )}
            <button
              type="button"
              aria-label="Remove document"
              onClick={() => onRemove(url)}
              className="absolute right-1 top-1 inline-flex size-[22px] items-center justify-center rounded-full bg-white/90 text-ink-strong shadow-sm border border-hairline hover:bg-white transition-colors"
            >
              <X size={13} strokeWidth={2.6} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex size-[120px] flex-col items-center justify-center gap-1.5 rounded-xl border border-hairline-strong text-ink-subtle hover:text-ink-strong hover:border-ink-subtle transition-colors disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 size={18} style={{ animation: "spinFast 0.8s linear infinite" }} />
          ) : (
            <Plus size={18} />
          )}
          <span className="text-[11.5px] font-semibold">
            {uploading ? "Uploading" : "Add files"}
          </span>
        </button>
      </div>
    </Field>
  );
}
