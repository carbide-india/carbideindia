"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Check } from "lucide-react";
import { INQUIRY_CURRENCIES, INQUIRY_COUNTRIES } from "@/db/enums";
import { CreateClientKycSchema } from "@/lib/validators/client-kyc";
import { createClientKyc } from "@/app/(app)/clients/actions";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { INDIA_STATES, citiesForState } from "@/lib/data/india-states-cities";
import { SearchableSelect } from "@/components/inquiries/searchable-select";
import { Field, SectionCard } from "@/components/inquiries/form-field";
import type { MasterOptionItem } from "@/lib/queries/masters";

/** RHF holds the schema's *input* shape (pre-transform); zodResolver hands
 *  the parsed *output* (`""` folded to `undefined`, currency/country
 *  defaulted) to the submit handler — exactly what createClientKyc takes. */
type KycFormValues = z.input<typeof CreateClientKycSchema>;
type KycFormOutput = z.output<typeof CreateClientKycSchema>;

interface Props {
  customerTypes: MasterOptionItem[];
  industryTypes: MasterOptionItem[];
  productTypes: MasterOptionItem[];
}

const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

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
export function KycForm({ customerTypes, industryTypes, productTypes }: Props) {
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
      currency: "INR",
      country: "India",
      name: "",
      productTypeIds: [],
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
      meetingDate: "",
    },
  });

  const submit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res = await createClientKyc({
        ...values,
        // <input type="date"> gives YYYY-MM-DD; pin to noon UTC so timezone
        // wrap-arounds can't land the meeting on the wrong day.
        meetingDate: values.meetingDate
          ? new Date(`${values.meetingDate}T12:00:00.000Z`).toISOString()
          : undefined,
      });
      if (!res.ok) {
        setServerError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: `Client ${values.name} onboarded.`,
        type: "success",
      });
      router.push("/admin/clients" as Route);
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
          <MasterSelect
            control={control}
            name="customerTypeId"
            label="Customer Type"
            options={customerTypes}
          />
          <MasterSelect
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
      </SectionCard>

      {/* ── 2 · Address ──────────────────────────────────────────────── */}
      <SectionCard title="Address">
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field id="kyc-export" label="Export">
            <Controller
              control={control}
              name="export"
              render={({ field }) => (
                <Select
                  id="kyc-export"
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
          <Field id="kyc-currency" label="Currency">
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  id="kyc-currency"
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
          <Field id="kyc-country" label="Country">
            <Controller
              control={control}
              name="country"
              render={({ field }) => (
                <Select
                  id="kyc-country"
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
              <Field id="kyc-state" label="State">
                <Controller
                  control={control}
                  name="state"
                  render={({ field }) => (
                    <SearchableSelect
                      id="kyc-state"
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
              <Field id="kyc-city" label="City">
                <Controller
                  control={control}
                  name="city"
                  render={({ field }) => {
                    const selectedState = watch("state") ?? "";
                    return (
                      <>
                        <SearchableSelect
                          id="kyc-city"
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
              <Field id="kyc-state" label="State / Province">
                <input
                  id="kyc-state"
                  type="text"
                  className="nt-input"
                  {...register("state")}
                />
              </Field>
              <Field id="kyc-city" label="City">
                <input
                  id="kyc-city"
                  type="text"
                  className="nt-input"
                  {...register("city")}
                />
              </Field>
            </>
          )}
          <Field id="kyc-pin" label="Pin Code">
            <input
              id="kyc-pin"
              type="text"
              className="nt-input"
              {...register("pinCode")}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field id="kyc-addr1" label="Address Line 1">
            <input
              id="kyc-addr1"
              type="text"
              className="nt-input"
              {...register("addressLine1")}
            />
          </Field>
          <Field id="kyc-addr2" label="Address Line 2">
            <input
              id="kyc-addr2"
              type="text"
              className="nt-input"
              {...register("addressLine2")}
            />
          </Field>
          <Field id="kyc-addr3" label="Address Line 3">
            <input
              id="kyc-addr3"
              type="text"
              className="nt-input"
              {...register("addressLine3")}
            />
          </Field>
          <Field id="kyc-addr4" label="Address Line 4">
            <input
              id="kyc-addr4"
              type="text"
              className="nt-input"
              {...register("addressLine4")}
            />
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
      </SectionCard>

      {/* ── 4 · Meeting ──────────────────────────────────────────────── */}
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
          {pending ? "Saving…" : "Onboard Client"}
        </button>
      </div>
    </form>
  );
}

/**
 * One admin-managed master dropdown — disabled with an explanatory
 * placeholder when the list is empty (same contract as the enquiry form's
 * master selects).
 */
function MasterSelect({
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
  const id = `kyc-${name}`;
  const empty = options.length === 0;
  return (
    <Field id={id} label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            id={id}
            value={field.value ?? ""}
            onValueChange={(v) => field.onChange(v || undefined)}
            placeholder={empty ? "No options yet" : `Select ${label.toLowerCase()}…`}
            disabled={empty}
            options={options.map((o) => ({ value: o.id, label: o.name }))}
          />
        )}
      />
      <p className="text-[12px] text-ink-subtle">Managed in Admin → Masters</p>
    </Field>
  );
}
