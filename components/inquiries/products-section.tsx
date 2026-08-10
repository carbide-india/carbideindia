"use client";

import * as React from "react";
import {
  Controller,
  useFieldArray,
  type Control,
  type UseFormRegister,
  type UseFormWatch,
  type UseFormSetValue,
} from "react-hook-form";
import { Trash2, Check } from "lucide-react";
import {
  INQUIRY_SHAPES,
  QUANTITY_UOMS,
  CHECK_STATES,
  CHECK_STATE_LABELS,
  DOC_GIVEN_OPTIONS,
  type CheckState,
} from "@/db/enums";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { NotesField } from "@/components/ui/notes-field";
import { Field, SectionCard, GroupHeader } from "./form-field";
import { toOptionalNumber } from "./checklist-section";
import type { InquiryFormValues } from "./inquiry-form";
import type { MasterOptionItem } from "@/lib/queries/masters";
import {
  DIM_FIELDS,
  DIM_LABELS,
  defaultShapeConfig,
  type ShapeConfig,
} from "@/lib/masters/shape-config";
import { ProductPicker, type PickerMasters } from "@/components/erp/product-picker";
import type { MaterialPrefill } from "@/app/(app)/_actions/product-picker";
import { SampleSummaryPanel } from "./sample-summary-panel";
import type { SampleOption } from "@/lib/queries/samples";

interface Props {
  control: Control<InquiryFormValues>;
  register: UseFormRegister<InquiryFormValues>;
  watch: UseFormWatch<InquiryFormValues>;
  setValue: UseFormSetValue<InquiryFormValues>;
  grades: MasterOptionItem[];
  tolerances: MasterOptionItem[];
  conditions: MasterOptionItem[];
  /** 3-tier grades + production masters (migration 0062). */
  externalGrades?: MasterOptionItem[];
  internalProductionCodes?: MasterOptionItem[];
  partNos?: MasterOptionItem[];
  /** Per-shape dimension config keyed by shape NAME (matches the master name). */
  shapeProfiles: Record<string, ShapeConfig>;
  /** Masters for the SAP-style Material Search / create-new mini-form. */
  pickerMasters: PickerMasters;
  /** Enquiry Custom Dropdown Master - dimension Unit list (falls back to defaults). */
  unitOptions?: string[];
  /** ENQ Dropdown Master - Quantity UOM list (falls back to QUANTITY_UOMS). */
  uomOptions?: string[];
  /** Pre-registered samples the user can attach to a product line (Sample-before-
   *  Enquiry flow). Full snapshots so the read-only panel renders with no fetch. */
  sampleOptions?: SampleOption[];
}

/** Units a product's dimensions can be expressed in. */
const DIMENSION_UNITS = ["mm", "cm", "m", "inch"] as const;

/** Shape of one fresh, empty product card. */
const EMPTY_PRODUCT = {
  custProductName: "",
  custDrawingNo: "",
  drawingRevisionNo: "",
  shape: undefined,
  outerDia: undefined,
  innerDia: undefined,
  length: undefined,
  width: undefined,
  thickness: undefined,
  dimensionUnit: "mm",
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
  sampleId: undefined,
  quantityStatus: undefined,
  shapeDimensionCheck: undefined,
  gradeCheck: undefined,
  toleranceCheck: undefined,
  conditionCheck: undefined,
  assumedQuantity: "",
  assumedShapeDimension: "",
  assumedGrade: "",
  assumedTolerance: "",
  assumedCondition: "",
  docsGiven: [],
  sampleReceived: undefined,
  description: "",
};

const CHECK_OPTIONS = CHECK_STATES.map((s) => ({ value: s, label: CHECK_STATE_LABELS[s] }));
const CHECK_TEXT_COLOR: Record<CheckState, string> = {
  given: "!text-emerald-700",
  not_given: "!text-[#d32f2f]",
  assumed: "!text-amber-700",
};
const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

/** One per-product checklist mark (Given / Not Given / Assumed) with a
 *  follow-up "what did you assume?" input when Assumed is picked. */
function ProductCheck({
  index,
  label,
  name,
  assumed,
  control,
  register,
}: {
  index: number;
  label: string;
  name: "quantityStatus" | "shapeDimensionCheck" | "gradeCheck" | "toleranceCheck" | "conditionCheck";
  assumed: "assumedQuantity" | "assumedShapeDimension" | "assumedGrade" | "assumedTolerance" | "assumedCondition";
  control: Control<InquiryFormValues>;
  register: UseFormRegister<InquiryFormValues>;
}) {
  return (
    <Field label={label}>
      <Controller
        control={control}
        name={`products.${index}.${name}`}
        render={({ field }) => (
          <div className="flex flex-col gap-2">
            <Select
              options={CHECK_OPTIONS}
              value={field.value ?? ""}
              onValueChange={(v) => field.onChange((v || undefined) as CheckState | undefined)}
              placeholder="Select"
              className={cn("font-bold", field.value ? CHECK_TEXT_COLOR[field.value as CheckState] : "")}
            />
            {field.value === "assumed" && (
              <input
                type="text"
                className="nt-input"
                placeholder="What value did you assume?"
                {...register(`products.${index}.${assumed}`)}
              />
            )}
          </div>
        )}
      />
    </Field>
  );
}

/**
 * Section 3 of the New Inquiry form - Products. A repeatable per-product
 * editor: one card per product, each holding the product's identity, shape +
 * dimensions, admin-managed masters and quantity. At least one product card
 * is always present; product #1 is mirrored into the legacy single-product
 * columns server-side.
 */
export function ProductsSection({
  control,
  register,
  watch,
  setValue,
  grades,
  tolerances,
  conditions,
  externalGrades = [],
  internalProductionCodes = [],
  partNos = [],
  shapeProfiles,
  pickerMasters,
  unitOptions,
  uomOptions,
  sampleOptions = [],
}: Props) {
  const unitList = unitOptions?.length ? unitOptions : DIMENSION_UNITS;
  const uomList = uomOptions?.length ? uomOptions : [...QUANTITY_UOMS];
  const { fields, append, remove } = useFieldArray({ control, name: "products" });

  // Keyboard-first array-row ergonomics: focus the first field of a freshly-
  // added product card, and recover focus to the Add button on removal so a
  // keyboard user never lands in a focus black-hole.
  const addProductBtnRef = React.useRef<HTMLButtonElement>(null);
  const focusNewProductRef = React.useRef(false);
  React.useEffect(() => {
    if (!focusNewProductRef.current) return;
    focusNewProductRef.current = false;
    const cards = document.querySelectorAll<HTMLElement>("[data-product-card]");
    const last = cards[cards.length - 1];
    // First genuine data field of the card: a text/number input or a custom
    // Select trigger (the checklist's first dropdown), never the Remove button.
    last
      ?.querySelector<HTMLElement>(
        'input:not([type=hidden]):not([disabled]), textarea:not([disabled]), button[aria-haspopup="listbox"]:not([disabled])',
      )
      ?.focus();
  }, [fields.length]);
  // Per-row attached Item (from the Material Search). Keyed by field.id so it
  // survives reorder/removal; presence pins the picker chip + drives the
  // "attached" hint. The item_id itself is derived server-side by the existing
  // in-tx sync (which dedups to the same item from the prefilled spec).
  const [attached, setAttached] = React.useState<
    Record<string, { itemId: string; itemCode: string }>
  >({});

  /** Prefill a product card's spec fields from a picked/created material. */
  function applyPrefill(index: number, fieldId: string, p: MaterialPrefill) {
    const set = (
      name: Parameters<UseFormSetValue<InquiryFormValues>>[0],
      value: Parameters<UseFormSetValue<InquiryFormValues>>[1],
    ) => setValue(name, value, { shouldValidate: false, shouldDirty: true });
    set(`products.${index}.shape`, p.shape ?? undefined);
    set(`products.${index}.gradeId`, p.gradeId ?? undefined);
    set(`products.${index}.toleranceId`, p.toleranceId ?? undefined);
    set(`products.${index}.conditionId`, p.conditionId ?? undefined);
    set(`products.${index}.outerDia`, p.outerDia != null ? Number(p.outerDia) : undefined);
    set(`products.${index}.innerDia`, p.innerDia != null ? Number(p.innerDia) : undefined);
    set(`products.${index}.length`, p.length != null ? Number(p.length) : undefined);
    set(`products.${index}.width`, p.width != null ? Number(p.width) : undefined);
    set(`products.${index}.thickness`, p.thickness != null ? Number(p.thickness) : undefined);
    set(`products.${index}.dimensionNotes`, p.dimensionNotes ?? "");
    setAttached((prev) => ({ ...prev, [fieldId]: { itemId: p.itemId, itemCode: p.itemCode } }));
  }

  return (
    <SectionCard
      title="Products"
      inlineHint
      hint="Search existing materials first - pick to reuse the canonical spec, or create a new one. You can still edit the fields below."
    >
      {fields.map((field, index) => {
        // Resolve this card's shape config (which dims apply). Shape values
        // match the shape master names, so we look up by name.
        const shapeName = watch(`products.${index}.shape`);
        const cfg: ShapeConfig =
          (typeof shapeName === "string" && shapeProfiles[shapeName]) ||
          defaultShapeConfig();
        // The unit every dimension in this card is expressed in.
        const dimUnit = watch(`products.${index}.dimensionUnit`) || "mm";
        return (
        <div
          key={field.id}
          data-product-card
          className="flex flex-col gap-5 rounded-section border border-hairline p-5"
          style={{ background: "var(--color-surface-soft)" }}
        >
          <GroupHeader
            n={index + 1}
            label="Product"
            action={
              <button
                type="button"
                onClick={() => {
                  remove(index);
                  requestAnimationFrame(() => addProductBtnRef.current?.focus());
                }}
                disabled={fields.length === 1}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-chip border border-hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={13} strokeWidth={2.4} />
                Remove
              </button>
            }
          />

          {/* Checklist FIRST - what the client gave us for reference (Given /
              Not Given / Assumed), packed densely to save space. */}
          <div className="flex flex-col gap-3 rounded-lg border border-[#dcdce8] bg-white p-4">
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#3f3f94]">
              Checklist
            </span>
            <div className="grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2">
              <ProductCheck index={index} label="Quantity" name="quantityStatus" assumed="assumedQuantity" control={control} register={register} />
              <ProductCheck index={index} label="Shape & Dimension" name="shapeDimensionCheck" assumed="assumedShapeDimension" control={control} register={register} />
              <ProductCheck index={index} label="Grade" name="gradeCheck" assumed="assumedGrade" control={control} register={register} />
              <ProductCheck index={index} label="Tolerance" name="toleranceCheck" assumed="assumedTolerance" control={control} register={register} />
              <ProductCheck index={index} label="Condition" name="conditionCheck" assumed="assumedCondition" control={control} register={register} />
              <Field label="Sample Received">
                <Controller
                  control={control}
                  name={`products.${index}.sampleReceived`}
                  render={({ field: f }) => (
                    <Select
                      options={YES_NO}
                      value={f.value === undefined ? "" : f.value ? "yes" : "no"}
                      onValueChange={(v) => f.onChange(v === "" ? undefined : v === "yes")}
                      placeholder="Select"
                      className="font-bold"
                    />
                  )}
                />
              </Field>
            </div>
            <Field label="Docs Given">
              <Controller
                control={control}
                name={`products.${index}.docsGiven`}
                render={({ field: f }) => (
                  <div className="flex flex-wrap gap-2">
                    {DOC_GIVEN_OPTIONS.map((opt) => {
                      const selected = f.value ?? [];
                      const checked = selected.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          onClick={() => f.onChange(checked ? selected.filter((o) => o !== opt) : [...selected, opt])}
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
                              checked ? "bg-brand border-brand text-white" : "border-[#9199b6] bg-white text-transparent",
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
          </div>

          {/* Material Search + Linked Sample on one line. The picked sample's
              read-only panel renders full-width below the row. */}
          {(() => {
            const pickedId = watch(`products.${index}.sampleId`);
            const picked = sampleOptions.find((o) => o.id === pickedId);
            return (
              <>
                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <div>
                    <span className="mb-1.5 block text-[12px] font-semibold text-ink-soft">
                      Material
                    </span>
                    <ProductPicker
                      masters={pickerMasters}
                      selected={attached[field.id] ?? null}
                      onSelect={(p) => applyPrefill(index, field.id, p)}
                      onClear={() =>
                        setAttached((prev) => {
                          const cp = { ...prev };
                          delete cp[field.id];
                          return cp;
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="mb-1.5 block text-[12px] font-semibold text-ink-soft">
                      Linked Sample
                    </span>
                    <Controller
                      control={control}
                      name={`products.${index}.sampleId`}
                      render={({ field: f }) => (
                        <Select
                          id={`products.${index}.sampleId`}
                          ariaLabel="Linked Sample"
                          value={f.value ?? ""}
                          onValueChange={(v) => f.onChange(v || undefined)}
                          placeholder={
                            sampleOptions.length === 0 ? "No samples registered yet" : "Attach a registered sample"
                          }
                          disabled={sampleOptions.length === 0}
                          searchable
                          searchPlaceholder="Search sample no. / company"
                          options={sampleOptions.map((o) => ({
                            value: o.id,
                            label: `${o.sampleNo}${o.companyName ? ` · ${o.companyName}` : ""}`,
                          }))}
                        />
                      )}
                    />
                  </div>
                </div>
                {picked && <SampleSummaryPanel sample={picked} />}
              </>
            );
          })()}

          <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
            <Field
              id={`products.${index}.custProductName`}
              label="Customer Product Name"
            >
              <input
                id={`products.${index}.custProductName`}
                type="text"
                className="nt-input"
                placeholder="What the client calls it"
                {...register(`products.${index}.custProductName`)}
              />
            </Field>
            <Field id={`products.${index}.custDrawingNo`} label="Drawing No">
              <input
                id={`products.${index}.custDrawingNo`}
                type="text"
                className="nt-input"
                {...register(`products.${index}.custDrawingNo`)}
              />
            </Field>
            <Field
              id={`products.${index}.drawingRevisionNo`}
              label="Drawing Rev No"
            >
              <input
                id={`products.${index}.drawingRevisionNo`}
                type="text"
                className="nt-input"
                {...register(`products.${index}.drawingRevisionNo`)}
              />
            </Field>
          </div>

          {/* Shape + Unit + dimensions on one line - auto-fit so the visible
              boxes stretch to fill the row (no wasted space, no truncation)
              however many dimensions the chosen shape shows. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(108px,1fr))] gap-2.5 max-lg:grid-cols-4 max-md:grid-cols-2">
            <Field id={`products.${index}.shape`} label="Shape">
              <Controller
                control={control}
                name={`products.${index}.shape`}
                render={({ field: f }) => (
                  <Select
                    id={`products.${index}.shape`}
                    value={f.value ?? ""}
                    onValueChange={(v) => {
                      f.onChange(v || undefined);
                      // Clear any dimension the newly-chosen shape hides.
                      const next = (v && shapeProfiles[v]) || defaultShapeConfig();
                      for (const d of DIM_FIELDS) {
                        if (next.dims[d] === "hidden") {
                          setValue(`products.${index}.${d}`, undefined, {
                            shouldValidate: false,
                            shouldDirty: false,
                          });
                        }
                      }
                    }}
                    placeholder="Select a shape"
                    options={INQUIRY_SHAPES.map((s) => ({ value: s, label: s }))}
                  />
                )}
              />
            </Field>
            <Field id={`products.${index}.dimensionUnit`} label="Unit">
              <Controller
                control={control}
                name={`products.${index}.dimensionUnit`}
                render={({ field: f }) => (
                  <Select
                    id={`products.${index}.dimensionUnit`}
                    value={f.value ?? "mm"}
                    onValueChange={(v) => f.onChange(v || "mm")}
                    options={unitList.map((u) => ({ value: u, label: u }))}
                  />
                )}
              />
            </Field>
            {DIM_FIELDS.map((dim) => {
              const rule = cfg.dims[dim];
              if (rule === "hidden") return null;
              return (
                <Field
                  key={dim}
                  id={`products.${index}.${dim}`}
                  label={`${DIM_LABELS[dim]}${rule === "required" ? " *" : ""}`}
                >
                  <div className="relative">
                    <input
                      id={`products.${index}.${dim}`}
                      type="number"
                      min={0}
                      step="any"
                      placeholder="e.g. 12"
                      className="nt-input pr-12"
                      {...register(`products.${index}.${dim}`, {
                        setValueAs: toOptionalNumber,
                      })}
                    />
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-ink-subtle">
                      {dimUnit}
                    </span>
                  </div>
                </Field>
              );
            })}
          </div>

          <Field
            id={`products.${index}.dimensionNotes`}
            label="Dimension Notes"
          >
            <Controller
              control={control}
              name={`products.${index}.dimensionNotes`}
              render={({ field: nf }) => (
                <NotesField
                  id={`products.${index}.dimensionNotes`}
                  ariaLabel="Dimension Notes"
                  rows={2}
                  placeholder="e.g. as per drawing rev. B, chamfer both ends"
                  value={nf.value ?? ""}
                  onChange={nf.onChange}
                />
              )}
            />
          </Field>

          {/* 3-tier grades + production codes (migration 0062). The customer's
              raw grade text, the grade WE quote them, the internal production
              grade, and the production/part codes each live on their own. */}
          <div className="flex flex-col gap-3 rounded-lg border border-[#dcdce8] bg-white p-4">
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#3f3f94]">
              Grades &amp; Codes
            </span>
            <div className="grid grid-cols-5 gap-4 max-lg:grid-cols-3 max-md:grid-cols-1">
              <Field id={`products.${index}.gradeCustomer`} label="Grade Name (Customer)">
                <input
                  id={`products.${index}.gradeCustomer`}
                  type="text"
                  className="nt-input"
                  placeholder="As the client stated it"
                  {...register(`products.${index}.gradeCustomer`)}
                />
              </Field>
              <ProductMasterSelect
                control={control}
                name={`products.${index}.gradeCustomerFacingId`}
                label="Grade Given to Customer"
                options={externalGrades}
              />
              <ProductMasterSelect
                control={control}
                name={`products.${index}.gradeInternalProductionId`}
                label="Internal Grade for Production"
                options={grades}
              />
              <ProductMasterSelect
                control={control}
                name={`products.${index}.internalProductionCodeId`}
                label="Internal Production Code"
                options={internalProductionCodes}
              />
              <ProductMasterSelect
                control={control}
                name={`products.${index}.partNoId`}
                label="Part No"
                options={partNos}
              />
            </div>
          </div>

          {/* Masters + quantity - one row: grade, tolerance, condition, qty, uom */}
          <div className="grid grid-cols-5 gap-4 max-lg:grid-cols-3 max-md:grid-cols-1">
            <ProductMasterSelect
              control={control}
              name={`products.${index}.gradeId`}
              label="Grade (Internal)"
              options={grades}
            />
            <ProductMasterSelect
              control={control}
              name={`products.${index}.toleranceId`}
              label="Tolerance"
              options={tolerances}
            />
            <ProductMasterSelect
              control={control}
              name={`products.${index}.conditionId`}
              label="Condition"
              options={conditions}
            />
            <Field id={`products.${index}.quantityNos`} label="Quantity (Nos)">
              <input
                id={`products.${index}.quantityNos`}
                type="number"
                min={0}
                step="any"
                className="nt-input"
                placeholder="e.g. 500"
                {...register(`products.${index}.quantityNos`, {
                  setValueAs: toOptionalNumber,
                })}
              />
            </Field>
            <Field id={`products.${index}.quantityUom`} label="UOM">
              <Controller
                control={control}
                name={`products.${index}.quantityUom`}
                render={({ field: f }) => (
                  <Select
                    id={`products.${index}.quantityUom`}
                    value={f.value ?? "Nos"}
                    onValueChange={f.onChange}
                    searchable
                    options={uomList.map((u) => ({ value: u, label: u }))}
                  />
                )}
              />
            </Field>
          </div>

          {/* Product Description - at the bottom of each product. */}
          <Field id={`products.${index}.description`} label="Product Description">
            <Controller
              control={control}
              name={`products.${index}.description`}
              render={({ field: df }) => (
                <NotesField
                  id={`products.${index}.description`}
                  ariaLabel="Product Description"
                  rows={2}
                  placeholder="What the client is asking for, in their words"
                  value={df.value ?? ""}
                  onChange={df.onChange}
                />
              )}
            />
          </Field>
        </div>
        );
      })}

      <div>
        <button
          ref={addProductBtnRef}
          type="button"
          onClick={() => {
            focusNewProductRef.current = true;
            append({ ...EMPTY_PRODUCT });
          }}
          className="inline-flex items-center gap-2 rounded-chip border border-brand bg-brand/8 px-4 py-2.5 text-[13px] font-semibold text-brand transition-colors hover:bg-brand/12"
        >
          + Add product
        </button>
      </div>
    </SectionCard>
  );
}

/**
 * One admin-managed master dropdown bound to an indexed product field. When
 * the master list is empty the select is disabled with an explanatory
 * placeholder; either way a muted hint points at where options are managed.
 */
function ProductMasterSelect({
  control,
  name,
  label,
  options,
}: {
  control: Control<InquiryFormValues>;
  name:
    | `products.${number}.gradeId`
    | `products.${number}.toleranceId`
    | `products.${number}.conditionId`
    | `products.${number}.gradeCustomerFacingId`
    | `products.${number}.gradeInternalProductionId`
    | `products.${number}.internalProductionCodeId`
    | `products.${number}.partNoId`;
  label: string;
  options: MasterOptionItem[];
}) {
  const id = `${name}`;
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
            placeholder={
              empty ? "No options yet" : `Select ${label.toLowerCase()}`
            }
            disabled={empty}
            options={options.map((o) => ({ value: o.id, label: o.name }))}
          />
        )}
      />
      {/* Masters moved out of the admin console into their own module in the
          forms/masters redesign (/admin/masters is now only a redirect), so
          name the real destination — the admin sidebar has no Masters entry. */}
      <p className="text-[12px] text-ink-subtle">Managed in the Masters module</p>
    </Field>
  );
}
