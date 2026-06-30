"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  INQUIRY_PRIORITIES,
  INQUIRY_PRIORITY_LABELS,
  INQUIRY_SOURCES,
  INQUIRY_SOURCE_LABELS,
  INQUIRY_CURRENCIES,
  INQUIRY_COUNTRIES,
} from "@/db/enums";
import { CreateInquirySchema } from "@/lib/validators/inquiry";
import { createInquiry, updateInquiry } from "@/app/(app)/inquiries/actions";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { INDIA_STATES, citiesForState } from "@/lib/data/india-states-cities";
import { SearchableSelect } from "./searchable-select";
import { Field, SectionCard } from "./form-field";
import { ClientAutofillSection } from "./client-autofill";
import { ProductsSection } from "./products-section";
import { ChecklistSection } from "./checklist-section";
import type { ClientAutofill, ClientOption } from "@/lib/queries/clients";
import type { EmployeeOption } from "@/lib/queries/employees";
import type { MasterOptionItem } from "@/lib/queries/masters";
import type { ShapeConfig } from "@/lib/masters/shape-config";

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands
 *  the parsed *output* (with `quantityUom` defaulted, `""` folded to
 *  `undefined`) to the submit handler — which is exactly what createInquiry
 *  takes. */
export type InquiryFormValues = z.input<typeof CreateInquirySchema>;
type InquiryFormOutput = z.output<typeof CreateInquirySchema>;

interface Props {
  clients: ClientOption[];
  employees: EmployeeOption[];
  grades: MasterOptionItem[];
  tolerances: MasterOptionItem[];
  conditions: MasterOptionItem[];
  /** Per-shape dimension config keyed by shape name. */
  shapeProfiles: Record<string, ShapeConfig>;
  /** Current employee — preselected as the assigned sales person. */
  defaultSalesPersonId: string;
  /**
   * Edit mode: when set, the form prefills from `initialValues`, hides the
   * ProductsSection (products link to costings/quotes and are not edited
   * here), and submits via `updateInquiry` instead of `createInquiry`.
   */
  editInquiryId?: string;
  initialValues?: Partial<InquiryFormValues>;
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
 * New Inquiry form — the inquiry module's centerpiece. Four card sections
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
  shapeProfiles,
  defaultSalesPersonId,
  editInquiryId,
  initialValues,
}: Props) {
  const isEdit = editInquiryId !== undefined;
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
  } = useForm<InquiryFormValues, unknown, InquiryFormOutput>({
    resolver: zodResolver(CreateInquirySchema),
    defaultValues: {
      clientMode: "new",
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
      productDescription: "",
      docsGiven: [],
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

  const clientMode = watch("clientMode");
  const clientId = watch("clientId");

  /** Copy the fetched KYC snapshot into the client block. Values stay fully
   *  editable — the inquiry stores a snapshot, not a live reference. */
  function applyAutofill(data: ClientAutofill) {
    setValue("companyName", data.name);
    if (data.export !== null) setValue("export", data.export);
    if (
      data.currency &&
      (INQUIRY_CURRENCIES as readonly string[]).includes(data.currency)
    ) {
      setValue("currency", data.currency as (typeof INQUIRY_CURRENCIES)[number]);
    }
    if (
      data.country &&
      (INQUIRY_COUNTRIES as readonly string[]).includes(data.country)
    ) {
      setValue("country", data.country as (typeof INQUIRY_COUNTRIES)[number]);
    }
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
        // update schema rejects the `products` key — drop it from the patch.
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
      // The detail route exists now (typedRoutes verifies the template literal).
      if (res.id) router.push(`/inquiries/${res.id}`);
      else router.push("/inquiries" as Route);
    });
  });

  const firstFieldError = Object.values(errors)[0]?.message as
    | string
    | undefined;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {!isEdit && (
        <p className="text-[13px] text-ink-subtle -mb-1">
          SM number is assigned automatically on save.
        </p>
      )}

      {/* ── 1 · Client ───────────────────────────────────────────────── */}
      <SectionCard
        title="Client"
        hint="New client creates a client record; Old client fetches its KYC details as an editable snapshot."
      >
        <ClientAutofillSection
          mode={clientMode}
          onModeChange={(m) => {
            setValue("clientMode", m);
            if (m === "new") setValue("clientId", undefined);
          }}
          clientId={clientId}
          onClientChange={(id) => setValue("clientId", id)}
          clients={clients}
          onAutofill={applyAutofill}
          error={errors.clientId?.message}
        />

        <Field id="inq-company" label="Company Name" required>
          <input
            id="inq-company"
            type="text"
            className="nt-input"
            placeholder="e.g. Precision Tools Pvt Ltd"
            {...register("companyName")}
          />
        </Field>

        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="inq-export" label="Export">
            <Controller
              control={control}
              name="export"
              render={({ field }) => (
                <Select
                  id="inq-export"
                  value={
                    field.value === undefined ? "" : field.value ? "yes" : "no"
                  }
                  onValueChange={(v) =>
                    field.onChange(v === "" ? undefined : v === "yes")
                  }
                  placeholder="Select…"
                  options={YES_NO_OPTIONS}
                />
              )}
            />
          </Field>
          <Field id="inq-currency" label="Currency">
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  id="inq-currency"
                  value={field.value ?? "INR"}
                  onValueChange={field.onChange}
                  options={INQUIRY_CURRENCIES.map((c) => ({
                    value: c,
                    label: c,
                  }))}
                />
              )}
            />
          </Field>
          <Field id="inq-country" label="Country">
            <Controller
              control={control}
              name="country"
              render={({ field }) => (
                <Select
                  id="inq-country"
                  value={field.value ?? "India"}
                  onValueChange={field.onChange}
                  options={INQUIRY_COUNTRIES.map((c) => ({
                    value: c,
                    label: c,
                  }))}
                />
              )}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          {watch("country") === "India" ? (
            <>
              <Field id="inq-state" label="State">
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
                      options={INDIA_STATES}
                      placeholder="Select state…"
                      searchPlaceholder="Search states…"
                    />
                  )}
                />
              </Field>
              <Field id="inq-city" label="City">
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
            </>
          ) : (
            <>
              <Field id="inq-state" label="State / Province">
                <input
                  id="inq-state"
                  type="text"
                  className="nt-input"
                  {...register("state")}
                />
              </Field>
              <Field id="inq-city" label="City">
                <input
                  id="inq-city"
                  type="text"
                  className="nt-input"
                  {...register("city")}
                />
              </Field>
            </>
          )}
          <Field id="inq-pin" label="Pin Code">
            <input
              id="inq-pin"
              type="text"
              className="nt-input"
              {...register("pinCode")}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="inq-addr1" label="Address Line 1">
            <input
              id="inq-addr1"
              type="text"
              className="nt-input"
              {...register("addressLine1")}
            />
          </Field>
          <Field id="inq-addr2" label="Address Line 2">
            <input
              id="inq-addr2"
              type="text"
              className="nt-input"
              {...register("addressLine2")}
            />
          </Field>
          <Field id="inq-addr3" label="Address Line 3">
            <input
              id="inq-addr3"
              type="text"
              className="nt-input"
              {...register("addressLine3")}
            />
          </Field>
          <Field id="inq-addr4" label="Address Line 4">
            <input
              id="inq-addr4"
              type="text"
              className="nt-input"
              {...register("addressLine4")}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="inq-cfirst" label="Contact First Name">
            <input
              id="inq-cfirst"
              type="text"
              className="nt-input"
              {...register("contactFirstName")}
            />
          </Field>
          <Field id="inq-clast" label="Contact Last Name">
            <input
              id="inq-clast"
              type="text"
              className="nt-input"
              {...register("contactLastName")}
            />
          </Field>
          <Field id="inq-cno" label="Contact No">
            <input
              id="inq-cno"
              type="tel"
              className="nt-input"
              {...register("contactNo")}
            />
          </Field>
          <Field id="inq-cemail" label="Email">
            <input
              id="inq-cemail"
              type="email"
              className="nt-input"
              {...register("contactEmail")}
            />
          </Field>
        </div>

        <Field id="inq-cc" label="CC Emails">
          <input
            id="inq-cc"
            type="text"
            className="nt-input"
            placeholder="Comma-separated…"
            {...register("ccEmails")}
          />
        </Field>
      </SectionCard>

      {/* ── 2 · Enquiry ──────────────────────────────────────────────── */}
      <SectionCard title="Enquiry">
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="inq-date" label="Enquiry Date">
            <input
              id="inq-date"
              type="date"
              className="nt-input"
              {...register("enquiryDate")}
            />
          </Field>
          <Field id="inq-priority" label="Priority">
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
          <Field id="inq-source" label="Source">
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <Select
                  id="inq-source"
                  value={field.value ?? ""}
                  onValueChange={(v) =>
                    field.onChange(v === "" ? undefined : v)
                  }
                  placeholder="How did it come in?"
                  options={INQUIRY_SOURCES.map((s) => ({
                    value: s,
                    label: INQUIRY_SOURCE_LABELS[s],
                  }))}
                />
              )}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ── 3 · Products ─────────────────────────────────────────────── */}
      {/* Products are hidden in edit mode — they link to costings/quotes and
          are managed from the SM Repo, not re-synced on enquiry edits. */}
      {!isEdit && (
        <ProductsSection
          control={control}
          register={register}
          watch={watch}
          setValue={setValue}
          grades={grades}
          tolerances={tolerances}
          conditions={conditions}
          shapeProfiles={shapeProfiles}
        />
      )}

      {/* ── 4 · Checklist ────────────────────────────────────────────── */}
      <ChecklistSection
        control={control}
        register={register}
        productDescriptionError={errors.productDescription?.message}
      />

      {/* ── 5 · Assignment ───────────────────────────────────────────── */}
      <SectionCard title="Assignment">
        <Field id="inq-sm-link" label="SM Folder Link">
          <input
            id="inq-sm-link"
            type="url"
            className="nt-input"
            placeholder="https://drive.google.com/…"
            {...register("smFolderLink")}
          />
        </Field>
        <Field id="inq-notes" label="Enquiry Notes">
          <textarea
            id="inq-notes"
            rows={3}
            className="nt-input resize-y"
            style={{ fontWeight: 400 }}
            placeholder="Anything the team should know about this enquiry…"
            {...register("enquiryNotes")}
          />
        </Field>
        <Field id="inq-sales" label="Assign Sales Person">
          <Controller
            control={control}
            name="assignedSalesPersonId"
            render={({ field }) => (
              <Select
                id="inq-sales"
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
          {pending
            ? isEdit
              ? "Updating…"
              : "Creating…"
            : isEdit
              ? "Update Enquiry"
              : "Create Enquiry"}
        </button>
      </div>
    </form>
  );
}
