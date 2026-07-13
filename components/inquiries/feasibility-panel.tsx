"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  useForm,
  Controller,
  type Control,
  type UseFormRegister,
} from "react-hook-form";
import { Loader2 } from "lucide-react";
import {
  FEAS_CHECK_VERDICTS,
  FEAS_CHECK_VERDICT_LABELS,
  FEAS_PRIORITIES,
  FEAS_PRIORITY_LABELS,
  FEASIBILITY_STATUSES,
  FEASIBILITY_STATUS_LABELS,
  type FeasCheckVerdict,
  type FeasPriority,
  type FeasibilityStatus,
} from "@/db/enums";
import type { Inquiry, InquiryItemFeasibility } from "@/db/schema";
import type { InquiryProductCard } from "@/lib/queries/sm-workspace";
import type { EmployeeOption } from "@/lib/queries/employees";
import { saveFeasibilityFull } from "@/app/(app)/inquiries/actions";
import { fireToast } from "@/lib/toast";
import { Select } from "@/components/ui/select";
import { Field, GroupHeader, SectionCard, Segmented } from "./form-field";
import { Chip } from "./chip";
import { ProductFeasibilityContext } from "./feasibility-context";

/** Per-product form slice — five verdicts + five notes, all optional. */
interface ProductForm {
  shapeDimVerdict?: FeasCheckVerdict;
  gradeVerdict?: FeasCheckVerdict;
  toleranceVerdict?: FeasCheckVerdict;
  conditionVerdict?: FeasCheckVerdict;
  quantityVerdict?: FeasCheckVerdict;
  shapeDimNote?: string;
  gradeNote?: string;
  toleranceNote?: string;
  conditionNote?: string;
  quantityNote?: string;
}

interface FeasForm {
  sm: {
    feasPriority?: FeasPriority;
    feasExport?: boolean;
    feasActionsList?: string;
    feasibilityCheckedById?: string;
  };
  status?: FeasibilityStatus;
  products: Record<string, ProductForm>;
}

const CHECK_OPTS = FEAS_CHECK_VERDICTS.map((v) => ({
  value: v,
  label: FEAS_CHECK_VERDICT_LABELS[v],
}));

const PRIORITY_OPTS = FEAS_PRIORITIES.map((v) => ({
  value: v,
  label: FEAS_PRIORITY_LABELS[v],
}));

const YES_NO = [
  { value: "yes" as const, label: "Yes" },
  { value: "no" as const, label: "No" },
];

/** The five per-product checks — key drives the RHF path, label the UI. */
const CHECKS: { key: "shapeDim" | "grade" | "tolerance" | "condition" | "quantity"; label: string }[] = [
  { key: "shapeDim", label: "Shape & Dimension" },
  { key: "grade", label: "Grade" },
  { key: "tolerance", label: "Tolerance" },
  { key: "condition", label: "Condition" },
  { key: "quantity", label: "Quantity" },
];

/** Verdict-column keys, used for the readiness rollup. */
const VERDICT_KEYS = [
  "shapeDimVerdict",
  "gradeVerdict",
  "toleranceVerdict",
  "conditionVerdict",
  "quantityVerdict",
] as const;

/**
 * One verdict cell: a segmented Feasible / Not feasible / Need info control,
 * with a note input that reveals only when the verdict is a non-feasible one
 * (Not feasible or Need info). Bound to `products.<inquiryItemId>.<key>*`.
 */
function VerdictCell({
  control,
  register,
  base,
  label,
  k,
}: {
  control: Control<FeasForm>;
  register: UseFormRegister<FeasForm>;
  base: `products.${string}`;
  label: string;
  k: string;
}) {
  return (
    <Field label={label} labelOnly>
      <Controller
        control={control}
        name={`${base}.${k}Verdict` as never}
        render={({ field }) => {
          const value = field.value as FeasCheckVerdict | undefined;
          return (
            <div className="flex flex-col gap-2">
              <Segmented
                options={CHECK_OPTS}
                value={value}
                onChange={(v) => field.onChange(v)}
                ariaLabel={`${label} verdict`}
              />
              {(value === "not_feasible" || value === "need_info") && (
                <input
                  className="nt-input"
                  placeholder="Add a note"
                  aria-label={`${label} note`}
                  {...register(`${base}.${k}Note` as never)}
                />
              )}
            </div>
          );
        }}
      />
    </Field>
  );
}

/**
 * Primary Feasibility — the second SM stage, per Manan's flow. An SM-level
 * summary (priority / export / who checked / actions) sits above one card per
 * product: the complete read-only enquiry context, then the five technical
 * verdicts. Everything saves in one transaction via `saveFeasibilityFull`.
 */
export function FeasibilityPanel({
  inquiry,
  employees,
  products = [],
  itemFeasibility = {},
}: {
  inquiry: Inquiry;
  employees: EmployeeOption[];
  products?: InquiryProductCard[];
  itemFeasibility?: Record<string, InquiryItemFeasibility>;
}) {
  const router = useRouter();

  const defaults = React.useMemo<FeasForm>(() => {
    const productDefaults: Record<string, ProductForm> = {};
    for (const p of products) {
      const f = itemFeasibility[p.id];
      productDefaults[p.id] = {
        shapeDimVerdict: f?.shapeDimVerdict ?? undefined,
        gradeVerdict: f?.gradeVerdict ?? undefined,
        toleranceVerdict: f?.toleranceVerdict ?? undefined,
        conditionVerdict: f?.conditionVerdict ?? undefined,
        quantityVerdict: f?.quantityVerdict ?? undefined,
        shapeDimNote: f?.shapeDimNote ?? undefined,
        gradeNote: f?.gradeNote ?? undefined,
        toleranceNote: f?.toleranceNote ?? undefined,
        conditionNote: f?.conditionNote ?? undefined,
        quantityNote: f?.quantityNote ?? undefined,
      };
    }
    return {
      sm: {
        feasPriority: inquiry.feasPriority ?? undefined,
        feasExport: inquiry.feasExport ?? undefined,
        feasActionsList: inquiry.feasActionsList ?? undefined,
        feasibilityCheckedById: inquiry.feasibilityCheckedById ?? undefined,
      },
      status: inquiry.feasibilityStatus,
      products: productDefaults,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiry, products, itemFeasibility]);

  const { control, register, handleSubmit, watch, formState: { isSubmitting } } =
    useForm<FeasForm>({ defaultValues: defaults });

  // Readiness rollup — a product is feasible when all five verdicts pass.
  const watchedProducts = watch("products");
  const feasibleCount = products.filter((p) => {
    const v = watchedProducts?.[p.id];
    return !!v && VERDICT_KEYS.every((k) => v[k] === "feasible");
  }).length;
  const allFeasible = products.length > 0 && feasibleCount === products.length;

  const onSubmit = handleSubmit(async (values) => {
    const productsPayload = products.map((p) => ({
      inquiryItemId: p.id,
      ...values.products[p.id],
    }));
    if (values.status === "proceed_to_costing" && feasibleCount < products.length) {
      fireToast({
        type: "error",
        message: "Some products aren't marked Feasible yet — proceeding anyway.",
      });
    }
    const res = await saveFeasibilityFull(inquiry.id, {
      sm: values.sm,
      status: values.status,
      products: productsPayload,
    });
    if (res.ok) {
      fireToast({ message: "Feasibility saved." });
      router.refresh();
    } else {
      fireToast({ type: "error", message: res.error });
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      {/* ── SM-level summary ─────────────────────────────────────────── */}
      <SectionCard
        title="Feasibility"
        inlineHint
        hint="Verify each product can be made to the customer's spec before costing."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Chip
            label={`${feasibleCount} of ${products.length} products feasible`}
            tone={allFeasible ? "green" : "slate"}
          />
          {products.length > 0 && feasibleCount < products.length && (
            <span className="text-[13px] font-semibold" style={{ color: "var(--color-amber-deep)" }}>
              Not all products are marked Feasible yet.
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <Field label="Priority" labelOnly>
            <Controller
              control={control}
              name="sm.feasPriority"
              render={({ field }) => (
                <Segmented
                  size="lg"
                  options={PRIORITY_OPTS}
                  value={field.value}
                  onChange={field.onChange}
                  ariaLabel="Feasibility priority"
                />
              )}
            />
          </Field>
          <Field label="Export" labelOnly>
            <Controller
              control={control}
              name="sm.feasExport"
              render={({ field }) => (
                <Segmented
                  size="lg"
                  options={YES_NO}
                  value={field.value === undefined ? undefined : field.value ? "yes" : "no"}
                  onChange={(v) => field.onChange(v === undefined ? undefined : v === "yes")}
                  ariaLabel="Export"
                />
              )}
            />
          </Field>
          <Field id="feas-checked-by" label="Checked By" labelOnly>
            <Controller
              control={control}
              name="sm.feasibilityCheckedById"
              render={({ field }) => (
                <Select
                  id="feas-checked-by"
                  value={field.value ?? ""}
                  onValueChange={(v) => field.onChange(v === "" ? undefined : v)}
                  placeholder="Select"
                  options={employees.map((e) => ({ value: e.id, label: e.name }))}
                  ariaLabel="Feasibility checked by"
                />
              )}
            />
          </Field>
        </div>

        <Field id="feas-actions" label="Actions List">
          <textarea
            id="feas-actions"
            rows={3}
            placeholder="Actions to take"
            className="nt-input"
            {...register("sm.feasActionsList")}
          />
        </Field>
      </SectionCard>

      {/* ── One card per product ─────────────────────────────────────── */}
      {products.map((p, i) => (
        <SectionCard key={p.id}>
          <GroupHeader n={i + 1} label={p.custProductName || p.itemCode || "Product"} />
          <ProductFeasibilityContext product={p} inquiry={inquiry} />
          <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-md:grid-cols-1">
            {CHECKS.map((c) => (
              <VerdictCell
                key={c.key}
                control={control}
                register={register}
                base={`products.${p.id}`}
                label={c.label}
                k={c.key}
              />
            ))}
          </div>
        </SectionCard>
      ))}

      {/* ── Footer: status + save ────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-hairline pt-4">
        <Field id="feas-status" label="Feasibility Status" labelOnly>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select
                id="feas-status"
                value={field.value ?? ""}
                onValueChange={(v) => field.onChange(v || undefined)}
                placeholder="Select"
                options={FEASIBILITY_STATUSES.map((s) => ({
                  value: s,
                  label: FEASIBILITY_STATUS_LABELS[s],
                }))}
                ariaLabel="Feasibility status"
              />
            )}
          />
        </Field>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] text-white transition-opacity disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
            fontWeight: 800,
          }}
        >
          {isSubmitting && (
            <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
          )}
          Save Feasibility
        </button>
      </div>
    </form>
  );
}
