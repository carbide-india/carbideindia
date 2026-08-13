"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  INQUIRY_PRIORITIES,
  INQUIRY_PRIORITY_LABELS,
  INQUIRY_SOURCES,
  INQUIRY_SOURCE_LABELS,
} from "@/db/enums";
import { CreateInquirySchema } from "@/lib/validators/inquiry";
import { createInquiry, updateInquiry } from "@/app/(app)/inquiries/actions";
import { saveEnquiryDraft, deleteEnquiryDraft } from "@/app/(app)/enquiries/drafts/actions";
import { draftHasContent } from "@/lib/drafts/enquiry-draft";
import { Plus, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { NotesField } from "@/components/ui/notes-field";
import { INDIA_STATES, citiesForState } from "@/lib/data/india-states-cities";
import { SearchableSelect } from "./searchable-select";
import { Field, SectionCard, GroupHeader } from "./form-field";
import { ExistingClientPicker } from "./client-autofill";
import { ProductsSection } from "./products-section";
import { ChecklistSection } from "./checklist-section";
import type { ClientAutofill, ClientOption } from "@/lib/queries/clients";
import type { EmployeeOption } from "@/lib/queries/employees";
import type { MasterOptionItem } from "@/lib/queries/masters";
import type { SampleOption } from "@/lib/queries/samples";
import type { ShapeConfig } from "@/lib/masters/shape-config";
import type { PickerMasters } from "@/components/erp/product-picker";
import { InlineOptionAdd } from "@/components/clients/inline-option-add";
import { addCustomOption } from "@/app/(app)/_actions/custom-lists";
import { firstErrorMessage } from "@/lib/forms/first-error";
import { useUnsavedGuard } from "@/lib/forms/use-unsaved-guard";
import { useKeyboardForm } from "@/components/forms/use-keyboard-form";
import { CURRENCY_CODES } from "@/lib/data/currencies";
import { COUNTRIES } from "@/lib/data/geo";
import { ViewPdfButton } from "@/components/forms/view-pdf-button";

/** Field label with an optional action (e.g. inline "+ Add") on the right. */
function LabelWithAdd({ label, add }: { label: string; add?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <label
        className="font-bold"
        style={{
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          fontSize: 14,
          letterSpacing: "-0.005em",
          color: "var(--color-ink-strong)",
        }}
      >
        {label}
      </label>
      {add}
    </div>
  );
}

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands
 *  the parsed *output* (with `quantityUom` defaulted, `""` folded to
 *  `undefined`) to the submit handler - which is exactly what createInquiry
 *  takes. */
export type InquiryFormValues = z.input<typeof CreateInquirySchema>;
type InquiryFormOutput = z.output<typeof CreateInquirySchema>;

interface Props {
  clients: ClientOption[];
  employees: EmployeeOption[];
  grades: MasterOptionItem[];
  tolerances: MasterOptionItem[];
  conditions: MasterOptionItem[];
  /** 3-tier grades + production masters (migration 0062) for the product cards. */
  externalGrades?: MasterOptionItem[];
  internalProductionCodes?: MasterOptionItem[];
  partNos?: MasterOptionItem[];
  /** Owning department options (master_options 'department'). */
  departments?: MasterOptionItem[];
  /** Per-shape dimension config keyed by shape name. */
  shapeProfiles: Record<string, ShapeConfig>;
  /**
   * Masters for the SAP-style Material Search / create-new mini-form. Only
   * needed in create mode (the ProductsSection is hidden on edit).
   */
  pickerMasters?: PickerMasters;
  /** Enquiry "Custom Dropdown Master" lists - each falls back to a built-in. */
  stateOptions?: string[];
  cityOptions?: string[];
  unitOptions?: string[];
  /** ENQ Dropdown Master lists for Currency / Country / Quantity UOM. */
  currencyOptions?: string[];
  countryOptions?: string[];
  uomOptions?: string[];
  /** Pre-registered samples for the per-product "Linked Sample" picker. */
  sampleOptions?: SampleOption[];
  /** Current employee - preselected as the assigned sales person. */
  defaultSalesPersonId: string;
  /**
   * Edit mode: when set, the form prefills from `initialValues`, hides the
   * ProductsSection (products link to costings/quotes and are not edited
   * here), and submits via `updateInquiry` instead of `createInquiry`.
   */
  editInquiryId?: string;
  initialValues?: Partial<InquiryFormValues>;
  /** Create-mode only: enable auto-saving this form as a draft. */
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

const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

/**
 * New Inquiry form - the inquiry module's centerpiece. Four card sections
 * (Client / Enquiry / Product & Checklist / Assignment); "Old client" mode
 * auto-fetches the client's KYC block as an editable snapshot. The SM number
 * is generated server-side on save.
 */
export function InquiryForm({
  clients,
  employees,
  grades,
  tolerances,
  conditions,
  externalGrades = [],
  internalProductionCodes = [],
  partNos = [],
  departments = [],
  shapeProfiles,
  pickerMasters,
  stateOptions,
  cityOptions,
  unitOptions,
  currencyOptions,
  countryOptions,
  uomOptions,
  sampleOptions,
  defaultSalesPersonId,
  editInquiryId,
  initialValues,
  enableDrafts,
  resumeDraftId,
}: Props) {
  // Custom-master lists fall back to the built-in datasets.
  const stateList = stateOptions?.length ? stateOptions : INDIA_STATES;

  // Editable Currency / Country lists (ENQ Dropdown Master), with locally-added
  // values shown instantly before router.refresh() syncs them from the server.
  const [extraCurrencies, setExtraCurrencies] = React.useState<string[]>([]);
  const [extraCountries, setExtraCountries] = React.useState<string[]>([]);
  const currencyList = React.useMemo(
    () => Array.from(new Set([...(currencyOptions?.length ? currencyOptions : CURRENCY_CODES), ...extraCurrencies])),
    [currencyOptions, extraCurrencies],
  );
  const countryList = React.useMemo(
    () => Array.from(new Set([...(countryOptions?.length ? countryOptions : COUNTRIES), ...extraCountries])),
    [countryOptions, extraCountries],
  );
  const isEdit = editInquiryId !== undefined;
  const draftsOn = Boolean(enableDrafts) && !isEdit;
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
    getValues,
    formState: { errors, isDirty },
  } = useForm<InquiryFormValues, unknown, InquiryFormOutput>({
    resolver: zodResolver(CreateInquirySchema),
    defaultValues: {
      clientMode: "old",
      enquiryDate: todayLocalIso(),
      priority: "normal",
      currency: "INR",
      country: "India",
      quantityUom: "Nos",
      companyName: "",
      state: "",
      city: "",
      addressLine1: "",
      addressLine2: "",
      addressLine3: "",
      addressLine4: "",
      pinCode: "",
      contactFirstName: "",
      contactLastName: "",
      contactNo: "",
      contactEmail: "",
      ccEmails: "",
      extraContacts: [],
      productDescription: "",
      docsGiven: [],
      assumedValues: {},
      dimensionNotes: "",
      smFolderLink: "",
      enquiryNotes: "",
      assignedSalesPersonId: defaultSalesPersonId,
      products: [
        {
          custProductName: "",
          custDrawingNo: "",
          drawingRevisionNo: "",
          shape: undefined,
          outerDia: undefined,
          innerDia: undefined,
          length: undefined,
          width: undefined,
          thickness: undefined,
          dimensionNotes: "",
          gradeId: undefined,
          gradeCustomer: "",
          gradeCustomerFacingId: undefined,
          gradeInternalProductionId: undefined,
          internalProductionCodeId: undefined,
          partNoId: undefined,
          toleranceId: undefined,
          conditionId: undefined,
          quantityNos: undefined,
          quantityUom: "Nos",
        },
      ],
      // Edit mode prefills header/client/checklist/meta fields (products are
      // not editable here, so the array default above stays unused).
      ...initialValues,
    },
  });

  const clientId = watch("clientId");

  const {
    fields: extraContactFields,
    append: appendContact,
    remove: removeContact,
  } = useFieldArray({ control, name: "extraContacts" });

  // Keyboard-first array-row ergonomics: focus a freshly-added contact's first
  // field, and recover focus to the Add button when a row is removed (so
  // keyboard users never land in a focus black-hole).
  const addContactBtnRef = React.useRef<HTMLButtonElement>(null);
  const focusContactIdxRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    const i = focusContactIdxRef.current;
    if (i == null) return;
    focusContactIdxRef.current = null;
    document.getElementById(`extra-contact-${i}-first`)?.focus();
  }, [extraContactFields.length]);

  // ── Draft auto-save (create mode only - silent, runs in background) ──
  const [draftId] = React.useState(() =>
    resumeDraftId ?? (draftsOn ? crypto.randomUUID() : ""),
  );
  const draftDeletedRef = React.useRef(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = React.useRef("");

  const persistDraft = React.useCallback(async () => {
    if (!draftsOn || !draftId || draftDeletedRef.current) return;
    const values = getValues() as Record<string, unknown>;
    if (!draftHasContent(values)) return;
    const json = JSON.stringify(values);
    if (json === lastSavedRef.current) return;
    try {
      await saveEnquiryDraft({ id: draftId, payload: values });
      lastSavedRef.current = json;
    } catch {
      /* silent - retried on the next change */
    }
  }, [draftsOn, draftId, getValues]);

  React.useEffect(() => {
    if (!draftsOn) return;
    const sub = watch(() => {
      if (draftDeletedRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void persistDraft(), 1200);
    });
    return () => {
      sub.unsubscribe();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [watch, draftsOn, persistDraft]);

  /** Copy the fetched KYC snapshot into the client block. Values stay fully
   *  editable - the inquiry stores a snapshot, not a live reference. */
  function applyAutofill(data: ClientAutofill) {
    setValue("companyName", data.name);
    if (data.export !== null) setValue("export", data.export);
    // Currency / Country are free-text now (editable via ENQ Dropdown Master),
    // so the client's values flow straight through.
    if (data.currency) setValue("currency", data.currency);
    if (data.country) setValue("country", data.country);
    setValue("state", data.state ?? "");
    setValue("city", data.city ?? "");
    setValue("addressLine1", data.addressLine1 ?? "");
    setValue("addressLine2", data.addressLine2 ?? "");
    setValue("addressLine3", data.addressLine3 ?? "");
    setValue("addressLine4", data.addressLine4 ?? "");
    setValue("pinCode", data.pinCode ?? "");
    setValue("contactFirstName", data.contact?.firstName ?? "");
    setValue("contactLastName", data.contact?.lastName ?? "");
    setValue("contactNo", data.contact?.contactNo ?? "");
    setValue("contactEmail", data.contact?.email ?? "");
    setValue("ccEmails", data.contact?.ccEmails ?? "");
  }

  const submit = handleSubmit((values) => {
    setServerError(null);
    // <input type="date"> gives YYYY-MM-DD; pin to noon UTC so timezone
    // wrap-arounds can't land the enquiry on the wrong day.
    const enquiryDate = values.enquiryDate
      ? new Date(`${values.enquiryDate}T12:00:00.000Z`).toISOString()
      : undefined;

    startTransition(async () => {
      if (isEdit) {
        // Products are not edited here (they link to costings/quotes), and the
        // update schema rejects the `products` key - drop it from the patch.
        const { products: _products, ...rest } = values;
        const res = await updateInquiry(editInquiryId, { ...rest, enquiryDate });
        if (!res.ok) {
          setServerError(res.error);
          fireToast({ message: res.error, type: "error" });
          return;
        }
        fireToast({ message: "Enquiry updated.", type: "success" });
        router.push(`/inquiries/${editInquiryId}`);
        return;
      }

      const res = await createInquiry({ ...values, enquiryDate });
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: res.smNumber ? `Enquiry ${res.smNumber} created` : "Enquiry created",
        type: "success",
      });
      // Enquiry saved - retire the draft so it leaves the Drafts inbox.
      if (draftsOn && draftId) {
        draftDeletedRef.current = true;
        try {
          await deleteEnquiryDraft(draftId);
        } catch {
          /* non-fatal - the draft just lingers */
        }
      }
      // The detail route exists now (typedRoutes verifies the template literal).
      if (res.id) router.push(`/inquiries/${res.id}`);
      else router.push("/inquiries" as Route);
    });
  });

  const firstFieldError = firstErrorMessage(errors);

  // Warn before losing unsaved edits (refresh/close) - matters most in edit mode
  // which has no draft autosave.
  useUnsavedGuard(isDirty && !pending);

  // Keyboard-first ergonomics: Enter advances to the next field; Ctrl/Cmd+Enter saves.
  const { formProps } = useKeyboardForm();

  return (
    <form onSubmit={submit} onKeyDown={formProps.onKeyDown} className="flex flex-col gap-6" noValidate>
      {/* ── 1 · Client ───────────────────────────────────────────────── */}
      <SectionCard>
        {/* Existing client (required) · New Client button · Company Name - one
            line. New clients are onboarded only via the Client KYC form. */}
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-[300px] max-md:w-full">
            <ExistingClientPicker
              clientId={clientId}
              onClientChange={(id) => setValue("clientId", id)}
              clients={clients}
              onAutofill={applyAutofill}
              error={errors.clientId?.message}
            />
          </div>
          <div className="pt-[26px] max-md:w-full max-md:pt-0">
            <a
              href="/clients/new"
              title="Onboard a new client (opens the Client KYC form)"
              className="inline-flex h-[42px] items-center gap-1.5 rounded-lg border-[1.75px] border-[#3f3f94] bg-[#f4f4fd] px-3.5 text-[13px] font-bold text-[#3f3f94] transition hover:-translate-y-0.5 hover:bg-[#3f3f94] hover:text-white"
            >
              <Plus className="h-[15px] w-[15px]" strokeWidth={2.6} />
              New Client
            </a>
          </div>
          <div className="min-w-[240px] max-w-[460px] flex-1 max-md:w-full">
            <Field id="inq-company" label="Company Name" required float>
              <input
                id="inq-company"
                type="text"
                className="nt-input"
                placeholder="e.g. Precision Tools Pvt Ltd"
                {...register("companyName")}
              />
            </Field>
          </div>
          <div className="w-[132px] max-md:w-full">
            <Field id="inq-export" label="Export" float>
              <Controller
                control={control}
                name="export"
                render={({ field }) => (
                  <Select
                    id="inq-export"
                    value={field.value === undefined ? "" : field.value ? "yes" : "no"}
                    onValueChange={(v) => field.onChange(v === "" ? undefined : v === "yes")}
                    placeholder="Select"
                    options={YES_NO_OPTIONS}
                  />
                )}
              />
            </Field>
          </div>
          <div className="w-[160px] max-md:w-full">
            <Field id="inq-sm" label="SM Number" float>
              <div className="flex min-h-[42px] items-center rounded-lg border border-[#dcdce8] bg-[#f4f5f9] px-3 py-2 text-[12px] leading-snug text-[#9aa0ab]">
                Auto-generated on save
              </div>
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
          <Field id="inq-date" label="Enquiry Date" float>
            <input
              id="inq-date"
              type="date"
              className="nt-input"
              {...register("enquiryDate")}
            />
          </Field>
          <Field id="inq-priority" label="Priority" float>
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Select
                  id="inq-priority"
                  value={field.value ?? "normal"}
                  onValueChange={field.onChange}
                  options={INQUIRY_PRIORITIES.map((p) => ({
                    value: p,
                    label: INQUIRY_PRIORITY_LABELS[p],
                  }))}
                />
              )}
            />
          </Field>
          <Field id="inq-source" label="Source" float>
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <Select
                  id="inq-source"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v === "" ? undefined : v)}
                  placeholder="How did it come in?"
                  options={INQUIRY_SOURCES.map((s) => ({
                    value: s,
                    label: INQUIRY_SOURCE_LABELS[s],
                  }))}
                />
              )}
            />
          </Field>
          <Field id="inq-first" label="First Enquiry?" float>
            <Controller
              control={control}
              name="firstEnquiry"
              render={({ field }) => (
                <Select
                  id="inq-first"
                  value={field.value === undefined ? "" : field.value ? "yes" : "no"}
                  onValueChange={(v) => field.onChange(v === "" ? undefined : v === "yes")}
                  placeholder="Client's first enquiry?"
                  options={YES_NO_OPTIONS}
                />
              )}
            />
          </Field>
        </div>

        <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2">
          <div className="flex flex-col">
            <LabelWithAdd
              label="Currency"
              add={
                <InlineOptionAdd
                  title="Currency"
                  add={async (n) => {
                    const r = await addCustomOption("enquiry", "currency", n);
                    return r.ok ? { ok: true, value: n } : { ok: false, error: r.error };
                  }}
                  onAdded={(v) => {
                    setExtraCurrencies((p) => [...p, v]);
                    setValue("currency", v);
                  }}
                />
              }
            />
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  id="inq-currency"
                  ariaLabel="Currency"
                  value={field.value ?? "INR"}
                  onValueChange={field.onChange}
                  searchable
                  searchPlaceholder="Search currencies"
                  options={currencyList.map((c) => ({ value: c, label: c }))}
                />
              )}
            />
          </div>
          <div className="flex flex-col">
            <LabelWithAdd
              label="Country"
              add={
                <InlineOptionAdd
                  title="Country"
                  add={async (n) => {
                    const r = await addCustomOption("enquiry", "country", n);
                    return r.ok ? { ok: true, value: n } : { ok: false, error: r.error };
                  }}
                  onAdded={(v) => {
                    setExtraCountries((p) => [...p, v]);
                    setValue("country", v);
                  }}
                />
              }
            />
            <Controller
              control={control}
              name="country"
              render={({ field }) => (
                <Select
                  id="inq-country"
                  ariaLabel="Country"
                  value={field.value ?? "India"}
                  onValueChange={field.onChange}
                  searchable
                  searchPlaceholder="Search countries"
                  options={countryList.map((c) => ({ value: c, label: c }))}
                />
              )}
            />
          </div>
          {watch("country") === "India" ? (
            <>
              <Field id="inq-state" label="State" float>
                <Controller
                  control={control}
                  name="state"
                  render={({ field }) => (
                    <SearchableSelect
                      id="inq-state"
                      value={field.value || undefined}
                      onChange={(v) => {
                        field.onChange(v ?? "");
                        // State changed → the old city no longer applies.
                        setValue("city", "");
                        if (v) setCityGateError(false);
                      }}
                      options={stateList}
                      placeholder="Select state"
                      searchPlaceholder="Search states"
                    />
                  )}
                />
              </Field>
              <Field id="inq-city" label="City" float>
                <Controller
                  control={control}
                  name="city"
                  render={({ field }) => {
                    const selectedState = watch("state") ?? "";
                    return (
                      <>
                        <SearchableSelect
                          id="inq-city"
                          value={field.value || undefined}
                          onChange={(v) => field.onChange(v ?? "")}
                          options={[
                            ...new Set([
                              ...citiesForState(selectedState),
                              ...(cityOptions ?? []),
                            ]),
                          ]}
                          placeholder="Select city"
                          searchPlaceholder="Search cities"
                          emptyText="No cities match."
                          allowCustom
                          disabled={!selectedState}
                          invalid={cityGateError && !selectedState}
                          onDisabledClick={() => {
                            setCityGateError(true);
                            fireToast({
                              message: "Select a state first - the city list depends on it.",
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
            </>
          ) : (
            <>
              <Field id="inq-state" label="State / Province" float>
                <input
                  id="inq-state"
                  type="text"
                  className="nt-input"
                  {...register("state")}
                />
              </Field>
              <Field id="inq-city" label="City" float>
                <input
                  id="inq-city"
                  type="text"
                  className="nt-input"
                  {...register("city")}
                />
              </Field>
            </>
          )}
          <Field id="inq-pin" label="Pin Code" float>
            <input
              id="inq-pin"
              type="text"
              inputMode="numeric"
              className="nt-input"
              {...register("pinCode")}
              onInput={(e) => {
                e.currentTarget.value = e.currentTarget.value.replace(/[^0-9]/g, "");
              }}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <GroupHeader n={1} label="Contact" />
          <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
            <Field id="inq-cfirst" label="First Name" float>
              <input
                id="inq-cfirst"
                type="text"
                className="nt-input"
                {...register("contactFirstName")}
              />
            </Field>
            <Field id="inq-clast" label="Last Name" float>
              <input
                id="inq-clast"
                type="text"
                className="nt-input"
                {...register("contactLastName")}
              />
            </Field>
            <Field id="inq-cno" label="Contact No" float>
              <input
                id="inq-cno"
                type="tel"
                className="nt-input"
                {...register("contactNo")}
              />
            </Field>
            <Field id="inq-cemail" label="Email" float>
              <input
                id="inq-cemail"
                type="email"
                className="nt-input"
                {...register("contactEmail")}
              />
            </Field>
          </div>
        </div>

        <Field id="inq-cc" label="CC Emails" float>
          <input
            id="inq-cc"
            type="text"
            className="nt-input"
            placeholder="Comma-separated"
            {...register("ccEmails")}
          />
        </Field>

        {extraContactFields.length > 0 && (
          <div className="flex flex-col gap-5">
            {extraContactFields.map((f, i) => (
              <div key={f.id} className="flex flex-col gap-3">
                <GroupHeader
                  n={i + 2}
                  label="Contact"
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        removeContact(i);
                        requestAnimationFrame(() => addContactBtnRef.current?.focus());
                      }}
                      aria-label={`Remove contact ${i + 2}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-semibold text-ink-subtle transition hover:border-[#f0b4b4] hover:bg-[#fdf3f3] hover:text-[#d32f2f]"
                    >
                      <X className="h-[15px] w-[15px]" />
                      Remove
                    </button>
                  }
                />
                <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
                  <Field label="First Name" float>
                    <input id={`extra-contact-${i}-first`} type="text" className="nt-input" {...register(`extraContacts.${i}.firstName` as const)} />
                  </Field>
                  <Field label="Last Name" float>
                    <input type="text" className="nt-input" {...register(`extraContacts.${i}.lastName` as const)} />
                  </Field>
                  <Field label="Contact No" float>
                    <input type="tel" className="nt-input" {...register(`extraContacts.${i}.contactNo` as const)} />
                  </Field>
                  <Field label="Email" float>
                    <input type="email" className="nt-input" {...register(`extraContacts.${i}.email` as const)} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          ref={addContactBtnRef}
          type="button"
          onClick={() => {
            focusContactIdxRef.current = extraContactFields.length;
            appendContact({ firstName: "", lastName: "", contactNo: "", email: "" });
          }}
          className="inline-flex w-max items-center gap-1.5 rounded-lg border border-[#c9c9ea] bg-[#f4f4fd] px-4 py-2.5 text-[13px] font-bold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#eeeefb]"
        >
          <Plus className="h-4 w-4" />
          Add Contact
        </button>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="inq-addr1" label="Address Line 1" float>
            <input
              id="inq-addr1"
              type="text"
              className="nt-input"
              placeholder="Unit No./Block No., Floor, Building Name"
              {...register("addressLine1")}
            />
          </Field>
          <Field id="inq-addr2" label="Address Line 2" float>
            <input
              id="inq-addr2"
              type="text"
              className="nt-input"
              placeholder="Street Name, Sector Name"
              {...register("addressLine2")}
            />
          </Field>
          <Field id="inq-addr3" label="Address Line 3" float>
            <input
              id="inq-addr3"
              type="text"
              className="nt-input"
              placeholder="Area"
              {...register("addressLine3")}
            />
          </Field>
          <Field id="inq-addr4" label="Address Line 4" float>
            <input
              id="inq-addr4"
              type="text"
              className="nt-input"
              placeholder="Nearby Landmark"
              {...register("addressLine4")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 2 · Checklist (edit mode only) ───────────────────────────── */}
      {/* On new enquiries the checklist + product description live INSIDE each
          product card (per-product). Edit mode keeps the header-level checklist
          since products aren't re-synced from enquiry edits. */}
      {isEdit && (
        <ChecklistSection
          control={control}
          register={register}
          productDescriptionError={errors.productDescription?.message}
        />
      )}

      {/* ── 3 · Products (with per-product checklist) ────────────────── */}
      {/* Products are hidden in edit mode - they link to costings/quotes and
          are managed from the SM Repo, not re-synced on enquiry edits. */}
      {!isEdit && pickerMasters && (
        <ProductsSection
          control={control}
          register={register}
          watch={watch}
          setValue={setValue}
          grades={grades}
          tolerances={tolerances}
          conditions={conditions}
          externalGrades={externalGrades}
          internalProductionCodes={internalProductionCodes}
          partNos={partNos}
          shapeProfiles={shapeProfiles}
          pickerMasters={pickerMasters}
          unitOptions={unitOptions}
          uomOptions={uomOptions}
          sampleOptions={sampleOptions}
        />
      )}

      {/* ── 4 · Assignment ───────────────────────────────────────────── */}
      <SectionCard title="Assignment">
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="inq-sm-link" label="SM Folder Link" float>
            <input
              id="inq-sm-link"
              type="url"
              className="nt-input"
              placeholder="https://drive.google.com/"
              {...register("smFolderLink")}
            />
          </Field>
          <Field id="inq-sales" label="Assign Sales Person" float>
            <Controller
              control={control}
              name="assignedSalesPersonId"
              render={({ field }) => (
                <Select
                  id="inq-sales"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder="Select an employee"
                  searchPlaceholder="Search employees"
                  searchable
                  options={employees.map((e) => ({ value: e.id, label: e.name }))}
                />
              )}
            />
          </Field>
          <Field id="inq-dept" label="Department" float>
            <Controller
              control={control}
              name="departmentId"
              render={({ field }) => (
                <Select
                  id="inq-dept"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v || undefined)}
                  placeholder={departments.length ? "Select department" : "No departments yet"}
                  disabled={departments.length === 0}
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                />
              )}
            />
          </Field>
        </div>
        <Field id="inq-notes" label="Enquiry Notes" float>
          <Controller
            control={control}
            name="enquiryNotes"
            render={({ field }) => (
              <NotesField
                id="inq-notes"
                rows={3}
                placeholder="Anything the team should know about this enquiry"
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
        className="flex flex-col items-center justify-center gap-2 pt-5"
        style={{ borderTop: "1px solid var(--color-hairline)" }}
      >
        <ViewPdfButton title="New Enquiry" />
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
          {pending
            ? isEdit
              ? "Updating"
              : "Creating"
            : isEdit
              ? "Update Enquiry"
              : "Create Enquiry"}
        </button>
        <p className="text-[11px] text-ink-subtle">Ctrl / ⌘ + Enter to save</p>
      </div>
    </form>
  );
}
