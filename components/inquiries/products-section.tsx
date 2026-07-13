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
import { Trash2 } from "lucide-react";
import { INQUIRY_SHAPES, QUANTITY_UOMS } from "@/db/enums";
import { Select } from "@/components/ui/select";
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

interface Props {
  control: Control<InquiryFormValues>;
  register: UseFormRegister<InquiryFormValues>;
  watch: UseFormWatch<InquiryFormValues>;
  setValue: UseFormSetValue<InquiryFormValues>;
  grades: MasterOptionItem[];
  tolerances: MasterOptionItem[];
  conditions: MasterOptionItem[];
  /** Per-shape dimension config keyed by shape NAME (matches the master name). */
  shapeProfiles: Record<string, ShapeConfig>;
  /** Masters for the SAP-style Material Search / create-new mini-form. */
  pickerMasters: PickerMasters;
}

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
  dimensionNotes: "",
  gradeId: undefined,
  toleranceId: undefined,
  conditionId: undefined,
  quantityNos: undefined,
  quantityUom: "Nos",
};

/**
 * Section 3 of the New Inquiry form — Products. A repeatable per-product
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
  shapeProfiles,
  pickerMasters,
}: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: "products" });
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
      hint="Search existing materials first — pick to reuse the canonical spec, or create a new one. You can still edit the fields below."
    >
      {fields.map((field, index) => {
        // Resolve this card's shape config (which dims apply). Shape values
        // match the shape master names, so we look up by name.
        const shapeName = watch(`products.${index}.shape`);
        const cfg: ShapeConfig =
          (typeof shapeName === "string" && shapeProfiles[shapeName]) ||
          defaultShapeConfig();
        return (
        <div
          key={field.id}
          className="flex flex-col gap-5 rounded-section border border-hairline p-5"
          style={{ background: "var(--color-surface-soft)" }}
        >
          <GroupHeader
            n={index + 1}
            label="Product"
            action={
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={fields.length === 1}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-chip border border-hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={13} strokeWidth={2.4} />
                Remove
              </button>
            }
          />

          {/* SAP-style Material Search — the primary way to add a product. */}
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

          {/* Shape + dimensions — one row (only the dims the shape uses, mm). */}
          <div className="grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2">
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
                      mm
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
            <input
              id={`products.${index}.dimensionNotes`}
              type="text"
              className="nt-input"
              placeholder="e.g. as per drawing rev. B, chamfer both ends"
              {...register(`products.${index}.dimensionNotes`)}
            />
          </Field>

          {/* Masters + quantity — one row: grade, tolerance, condition, qty, uom */}
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
                    options={QUANTITY_UOMS.map((u) => ({ value: u, label: u }))}
                  />
                )}
              />
            </Field>
          </div>
        </div>
        );
      })}

      <div>
        <button
          type="button"
          onClick={() => append({ ...EMPTY_PRODUCT })}
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
    | `products.${number}.conditionId`;
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
      <p className="text-[12px] text-ink-subtle">Managed in Admin → Masters</p>
    </Field>
  );
}
