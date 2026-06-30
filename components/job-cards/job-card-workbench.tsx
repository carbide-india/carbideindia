"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { WorkbenchActions } from "@/components/workbench/workbench-actions";
import {
  WorkbenchTable,
  type WbColumn,
} from "@/components/workbench/workbench-table";
import { RecordPicker, PickerField } from "@/components/workbench/record-picker";
import { Select, type SelectOption } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import {
  createJobCard,
  updateJobCard,
  deactivateJobCard,
} from "@/app/(app)/job-cards/actions";
import type {
  JobCardListItem,
  JobCardPickerData,
  JobCardPickerClient,
  JobCardPickerItem,
} from "@/lib/queries/job-cards";
import type { CreateJobCardInput } from "@/lib/validators/job-card";

interface Props {
  rows: JobCardListItem[];
  picker: JobCardPickerData;
  isAdmin: boolean;
}

/** Yes/No select options used for the boolean process flags. */
const YES_NO: SelectOption[] = [
  { value: "", label: "—" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

/** Form state: every field a string (selects hold ids/flags; numerics parsed on save). */
interface FormState {
  jobCardNo: string;
  jobCardDate: string;
  oaNo: string;
  clientId: string;
  customerName: string;
  itemId: string;
  productCode: string;
  productName: string;
  diaSize: string;
  punchSize: string;
  proposedSize: string;
  gradeName: string;
  gradeColour: string;
  deliveryDate: string;
  weight: string;
  heightMin: string;
  heightMax: string;
  orderQuantity: string;
  dispatchConditionId: string;
  plannedQtyToPress: string;
  toleranceId: string;
  ypNo: string;
  supportSizeTop: string;
  supportSizeBottom: string;
  pressingTypeId: string;
  makeSampleForSintering: string;
  outsource: string;
  supplierVendorName: string;
  process: string;
  prevWeight: string;
  prevPressure: string;
  prevGradeName: string;
  remarks: string;
}

const BLANK: FormState = {
  jobCardNo: "",
  jobCardDate: "",
  oaNo: "",
  clientId: "",
  customerName: "",
  itemId: "",
  productCode: "",
  productName: "",
  diaSize: "",
  punchSize: "",
  proposedSize: "",
  gradeName: "",
  gradeColour: "",
  deliveryDate: "",
  weight: "",
  heightMin: "",
  heightMax: "",
  orderQuantity: "",
  dispatchConditionId: "",
  plannedQtyToPress: "",
  toleranceId: "",
  ypNo: "",
  supportSizeTop: "",
  supportSizeBottom: "",
  pressingTypeId: "",
  makeSampleForSintering: "",
  outsource: "",
  supplierVendorName: "",
  process: "",
  prevWeight: "",
  prevPressure: "",
  prevGradeName: "",
  remarks: "",
};

/** ISO date / Date → yyyy-mm-dd for <input type=date>. */
function toDateInput(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** Trimmed string → string|undefined (drop empties for the action payload). */
function txt(v: string): string | undefined {
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** Numeric text → number|undefined (drop blank / non-finite). */
function num(v: string): number | undefined {
  const t = v.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** uuid select → string|undefined. */
function uuid(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/** Yes/No flag select → boolean|undefined. */
function flag(v: string): boolean | undefined {
  if (v === "yes") return true;
  if (v === "no") return false;
  return undefined;
}

export function JobCardWorkbench({ rows, picker, isAdmin }: Props) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(BLANK);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [customerOpen, setCustomerOpen] = React.useState(false);
  const [productOpen, setProductOpen] = React.useState(false);

  const dispatchOptions = React.useMemo<SelectOption[]>(
    () => [
      { value: "", label: "—" },
      ...picker.dispatchConditions.map((o) => ({ value: o.id, label: o.name })),
    ],
    [picker.dispatchConditions],
  );
  const pressingOptions = React.useMemo<SelectOption[]>(
    () => [
      { value: "", label: "—" },
      ...picker.pressingTypes.map((o) => ({ value: o.id, label: o.name })),
    ],
    [picker.pressingTypes],
  );
  const toleranceOptions = React.useMemo<SelectOption[]>(
    () => [
      { value: "", label: "—" },
      ...picker.tolerances.map((o) => ({ value: o.id, label: o.name })),
    ],
    [picker.tolerances],
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm(BLANK);
    setSelectedId(null);
    setError(null);
  }

  /** Load a register row into the form for editing. */
  function loadRow(row: JobCardListItem) {
    setError(null);
    setSelectedId(row.id);
    const yn = (b: boolean | null): string => (b === true ? "yes" : b === false ? "no" : "");
    setForm({
      jobCardNo: row.jobCardNo,
      jobCardDate: toDateInput(row.jobCardDate),
      oaNo: row.oaNo ?? "",
      clientId: row.clientId ?? "",
      customerName: row.customerName ?? "",
      itemId: row.itemId ?? "",
      productCode: row.productCode ?? "",
      productName: row.productName ?? "",
      diaSize: row.diaSize ?? "",
      punchSize: row.punchSize ?? "",
      proposedSize: row.proposedSize ?? "",
      gradeName: row.gradeName ?? "",
      gradeColour: row.gradeColour ?? "",
      deliveryDate: toDateInput(row.deliveryDate),
      weight: row.weight ?? "",
      heightMin: row.heightMin ?? "",
      heightMax: row.heightMax ?? "",
      orderQuantity: row.orderQuantity ?? "",
      dispatchConditionId: row.dispatchConditionId ?? "",
      plannedQtyToPress: row.plannedQtyToPress ?? "",
      toleranceId: row.toleranceId ?? "",
      ypNo: row.ypNo ?? "",
      supportSizeTop: row.supportSizeTop ?? "",
      supportSizeBottom: row.supportSizeBottom ?? "",
      pressingTypeId: row.pressingTypeId ?? "",
      makeSampleForSintering: yn(row.makeSampleForSintering),
      outsource: yn(row.outsource),
      supplierVendorName: row.supplierVendorName ?? "",
      process: row.process ?? "",
      prevWeight: row.prevWeight ?? "",
      prevPressure: row.prevPressure ?? "",
      prevGradeName: row.prevGradeName ?? "",
      remarks: row.remarks ?? "",
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function onSelectCustomer(c: JobCardPickerClient) {
    setForm((prev) => ({ ...prev, clientId: c.id, customerName: c.name }));
  }

  function onSelectProduct(it: JobCardPickerItem) {
    const od = it.outerDia ?? "";
    const innerD = it.innerDia ?? "";
    const proposed = od !== "" && innerD !== "" ? `${od}x${innerD}` : od;
    setForm((prev) => ({
      ...prev,
      itemId: it.id,
      productCode: it.itemCode,
      gradeName: it.gradeName ?? prev.gradeName,
      toleranceId: it.toleranceId ?? prev.toleranceId,
      diaSize: od !== "" ? od : prev.diaSize,
      proposedSize: proposed !== "" ? proposed : prev.proposedSize,
    }));
  }

  function buildPayload(): CreateJobCardInput {
    return {
      jobCardNo: form.jobCardNo.trim(),
      jobCardDate: txt(form.jobCardDate),
      oaNo: txt(form.oaNo),
      deliveryDate: txt(form.deliveryDate),
      clientId: uuid(form.clientId),
      customerName: txt(form.customerName),
      itemId: uuid(form.itemId),
      productCode: txt(form.productCode),
      productName: txt(form.productName),
      diaSize: txt(form.diaSize),
      punchSize: txt(form.punchSize),
      proposedSize: txt(form.proposedSize),
      gradeName: txt(form.gradeName),
      gradeColour: txt(form.gradeColour),
      weight: num(form.weight),
      heightMin: num(form.heightMin),
      heightMax: num(form.heightMax),
      orderQuantity: num(form.orderQuantity),
      plannedQtyToPress: num(form.plannedQtyToPress),
      dispatchConditionId: uuid(form.dispatchConditionId),
      toleranceId: uuid(form.toleranceId),
      pressingTypeId: uuid(form.pressingTypeId),
      ypNo: txt(form.ypNo),
      supportSizeTop: txt(form.supportSizeTop),
      supportSizeBottom: txt(form.supportSizeBottom),
      makeSampleForSintering: flag(form.makeSampleForSintering),
      outsource: flag(form.outsource),
      supplierVendorName: txt(form.supplierVendorName),
      process: txt(form.process),
      prevWeight: num(form.prevWeight),
      prevPressure: txt(form.prevPressure),
      prevGradeName: txt(form.prevGradeName),
      remarks: txt(form.remarks),
    };
  }

  async function onSave() {
    setError(null);
    if (form.jobCardNo.trim() === "") {
      setError("Job card number is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      const res = selectedId
        ? await updateJobCard(selectedId, payload)
        : await createJobCard(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({
        message: selectedId
          ? `Job card ${res.jobCardNo} saved`
          : `Job card ${res.jobCardNo} created`,
        type: "success",
      });
      resetForm();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!selectedId) return;
    setError(null);
    setSaving(true);
    try {
      const res = await deactivateJobCard(selectedId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Job card deactivated", type: "success" });
      resetForm();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const columns = React.useMemo<WbColumn<JobCardListItem>[]>(
    () => [
      {
        key: "jobCardNo",
        header: "Job Card No",
        cell: (r) => (
          <span className="font-semibold text-ink-strong">{r.jobCardNo}</span>
        ),
        filterValue: (r) => r.jobCardNo,
        sortValue: (r) => r.jobCardNo,
      },
      {
        key: "jobCardDate",
        header: "Date",
        cell: (r) => fmtDate(r.jobCardDate),
        sortValue: (r) =>
          r.jobCardDate ? new Date(r.jobCardDate).getTime() : 0,
      },
      {
        key: "oaNo",
        header: "O.A. No",
        cell: (r) => r.oaNo ?? "—",
        filterValue: (r) => r.oaNo ?? "",
      },
      {
        key: "customerName",
        header: "Customer",
        cell: (r) => r.customerName ?? "—",
        filterValue: (r) => r.customerName ?? "",
      },
      {
        key: "productCode",
        header: "Product Code",
        cell: (r) => r.productCode ?? "—",
        filterValue: (r) => r.productCode ?? "",
      },
      {
        key: "gradeName",
        header: "Grade",
        cell: (r) => r.gradeName ?? "—",
      },
      {
        key: "deliveryDate",
        header: "Delivery",
        cell: (r) => fmtDate(r.deliveryDate),
        sortValue: (r) =>
          r.deliveryDate ? new Date(r.deliveryDate).getTime() : 0,
      },
      {
        key: "orderQuantity",
        header: "Order Qty",
        align: "right",
        cell: (r) => r.orderQuantity ?? "—",
        sortValue: (r) => (r.orderQuantity ? Number(r.orderQuantity) : 0),
      },
      {
        key: "dispatchConditionName",
        header: "Dispatch",
        cell: (r) => r.dispatchConditionName ?? "—",
      },
      {
        key: "status",
        header: "Status",
        cell: (r) => <StatusChip active={r.isActive} />,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <WorkbenchPanel
        title={selectedId ? "Job Card Entry — Editing" : "Job Card Entry"}
        icon={<ClipboardList size={17} strokeWidth={2.2} />}
        defaultOpen
      >
        <div className="flex flex-col gap-5">
          {error ? (
            <div
              role="alert"
              className="rounded-chip border border-red/40 bg-red/[0.06] px-3.5 py-2.5 text-[13px] font-medium text-red"
            >
              {error}
            </div>
          ) : null}

          {/* General */}
          <FieldGrid>
            <Field label="Job Card No" required>
              <TextInput
                value={form.jobCardNo}
                onChange={(v) => set("jobCardNo", v)}
                placeholder="JC-0001"
              />
            </Field>
            <Field label="Date">
              <DateInput
                value={form.jobCardDate}
                onChange={(v) => set("jobCardDate", v)}
              />
            </Field>
            <Field label="O.A. No">
              <TextInput value={form.oaNo} onChange={(v) => set("oaNo", v)} />
            </Field>

            <Field label="Customer">
              <PickerField
                value={form.customerName}
                placeholder="Pick customer…"
                onOpen={() => setCustomerOpen(true)}
              />
            </Field>
            <Field label="Product">
              <PickerField
                value={form.productCode}
                placeholder="Pick product…"
                onOpen={() => setProductOpen(true)}
              />
            </Field>
            <Field label="Product Code">
              <TextInput
                value={form.productCode}
                onChange={(v) => set("productCode", v)}
              />
            </Field>

            <Field label="Product Name">
              <TextInput
                value={form.productName}
                onChange={(v) => set("productName", v)}
              />
            </Field>
            <Field label="Dia Size">
              <TextInput
                value={form.diaSize}
                onChange={(v) => set("diaSize", v)}
              />
            </Field>
            <Field label="Punch Size">
              <TextInput
                value={form.punchSize}
                onChange={(v) => set("punchSize", v)}
              />
            </Field>

            <Field label="Proposed Size">
              <TextInput
                value={form.proposedSize}
                onChange={(v) => set("proposedSize", v)}
              />
            </Field>
            <Field label="Grade">
              <TextInput
                value={form.gradeName}
                onChange={(v) => set("gradeName", v)}
              />
            </Field>
            <Field label="Grade Colour">
              <TextInput
                value={form.gradeColour}
                onChange={(v) => set("gradeColour", v)}
              />
            </Field>

            <Field label="Delivery Date">
              <DateInput
                value={form.deliveryDate}
                onChange={(v) => set("deliveryDate", v)}
              />
            </Field>
            <Field label="Weight">
              <TextInput
                value={form.weight}
                onChange={(v) => set("weight", v)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Order Quantity">
              <TextInput
                value={form.orderQuantity}
                onChange={(v) => set("orderQuantity", v)}
                inputMode="numeric"
              />
            </Field>

            <Field label="Height Min">
              <TextInput
                value={form.heightMin}
                onChange={(v) => set("heightMin", v)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Height Max">
              <TextInput
                value={form.heightMax}
                onChange={(v) => set("heightMax", v)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Dispatch Condition">
              <Select
                options={dispatchOptions}
                value={form.dispatchConditionId}
                onValueChange={(v) => set("dispatchConditionId", v)}
                placeholder="Select…"
                ariaLabel="Dispatch Condition"
              />
            </Field>

            <Field label="Planned Qty to be Pressed">
              <TextInput
                value={form.plannedQtyToPress}
                onChange={(v) => set("plannedQtyToPress", v)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Tolerance">
              <Select
                options={toleranceOptions}
                value={form.toleranceId}
                onValueChange={(v) => set("toleranceId", v)}
                placeholder="Select…"
                ariaLabel="Tolerance"
              />
            </Field>
            <Field label="YP No">
              <TextInput value={form.ypNo} onChange={(v) => set("ypNo", v)} />
            </Field>

            <Field label="Support Size Top">
              <TextInput
                value={form.supportSizeTop}
                onChange={(v) => set("supportSizeTop", v)}
              />
            </Field>
            <Field label="Support Size Bottom">
              <TextInput
                value={form.supportSizeBottom}
                onChange={(v) => set("supportSizeBottom", v)}
              />
            </Field>
            <Field label="Pressing Type">
              <Select
                options={pressingOptions}
                value={form.pressingTypeId}
                onValueChange={(v) => set("pressingTypeId", v)}
                placeholder="Select…"
                ariaLabel="Pressing Type"
              />
            </Field>

            <Field label="Make sample for sintering">
              <Select
                options={YES_NO}
                value={form.makeSampleForSintering}
                onValueChange={(v) => set("makeSampleForSintering", v)}
                searchable={false}
                ariaLabel="Make sample for sintering"
              />
            </Field>
            <Field label="Outsource">
              <Select
                options={YES_NO}
                value={form.outsource}
                onValueChange={(v) => set("outsource", v)}
                searchable={false}
                ariaLabel="Outsource"
              />
            </Field>
            <Field label="Supplier / Vendor Name">
              <TextInput
                value={form.supplierVendorName}
                onChange={(v) => set("supplierVendorName", v)}
              />
            </Field>

            <Field label="Process" span={3}>
              <TextInput
                value={form.process}
                onChange={(v) => set("process", v)}
              />
            </Field>
          </FieldGrid>

          {/* Previous Details */}
          <fieldset className="rounded-chip border border-hairline px-4 py-3.5">
            <legend className="px-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
              Previous Details
            </legend>
            <FieldGrid>
              <Field label="Prev Weight">
                <TextInput
                  value={form.prevWeight}
                  onChange={(v) => set("prevWeight", v)}
                  inputMode="decimal"
                />
              </Field>
              <Field label="Prev Pressure">
                <TextInput
                  value={form.prevPressure}
                  onChange={(v) => set("prevPressure", v)}
                />
              </Field>
              <Field label="Prev Grade">
                <TextInput
                  value={form.prevGradeName}
                  onChange={(v) => set("prevGradeName", v)}
                />
              </Field>
            </FieldGrid>
          </fieldset>

          {/* Remarks */}
          <Field label="Remarks">
            <textarea
              value={form.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              rows={3}
              className="w-full rounded-chip border border-hairline bg-surface-card px-3.5 py-2.5 text-[14px] text-ink-strong outline-none transition-all placeholder:text-ink-subtle hover:border-hairline-strong focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          </Field>

          <WorkbenchActions
            onClear={resetForm}
            onSave={onSave}
            onDelete={selectedId && isAdmin ? onDelete : undefined}
            saving={saving}
            deleteLabel="Deactivate"
          />
        </div>
      </WorkbenchPanel>

      <WorkbenchPanel
        title="Job Card Register"
        icon={<ClipboardList size={17} strokeWidth={2.2} />}
        defaultOpen
      >
        <WorkbenchTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={loadRow}
          emptyText="No job cards yet — fill the form above to create one."
        />
      </WorkbenchPanel>

      <RecordPicker<JobCardPickerClient>
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        onSelect={onSelectCustomer}
        title="Select Customer"
        rows={picker.clients}
        getRowId={(c) => c.id}
        getRowLabel={(c) => c.name}
        columns={[
          {
            key: "name",
            header: "Name",
            cell: (c) => (
              <span className="font-semibold text-ink-strong">{c.name}</span>
            ),
            filterValue: (c) => c.name,
            sortValue: (c) => c.name,
          },
          {
            key: "city",
            header: "City",
            cell: (c) => c.city ?? "—",
            filterValue: (c) => c.city ?? "",
          },
          {
            key: "state",
            header: "State",
            cell: (c) => c.state ?? "—",
            filterValue: (c) => c.state ?? "",
          },
          {
            key: "gstin",
            header: "GSTIN",
            cell: (c) => c.gstin ?? "—",
            filterValue: (c) => c.gstin ?? "",
          },
        ]}
      />

      <RecordPicker<JobCardPickerItem>
        open={productOpen}
        onClose={() => setProductOpen(false)}
        onSelect={onSelectProduct}
        title="Select Product"
        rows={picker.items}
        getRowId={(it) => it.id}
        getRowLabel={(it) => it.itemCode}
        columns={[
          {
            key: "itemCode",
            header: "Item Code",
            cell: (it) => (
              <span className="font-semibold text-ink-strong">
                {it.itemCode}
              </span>
            ),
            filterValue: (it) => it.itemCode,
            sortValue: (it) => it.itemCode,
          },
          {
            key: "customerName",
            header: "Customer",
            cell: (it) => it.customerName ?? "—",
            filterValue: (it) => it.customerName ?? "",
          },
          {
            key: "gradeName",
            header: "Grade",
            cell: (it) => it.gradeName ?? "—",
            filterValue: (it) => it.gradeName ?? "",
          },
        ]}
      />
    </div>
  );
}

/* ---------- compact field primitives (dense workbench layout) ---------- */

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  span,
  children,
}: {
  label: string;
  required?: boolean;
  span?: 2 | 3;
  children: React.ReactNode;
}) {
  const spanClass =
    span === 3
      ? "sm:col-span-2 lg:col-span-3"
      : span === 2
        ? "sm:col-span-2"
        : "";
  return (
    <div className={spanClass}>
      <label className="mb-1 block text-[13px] font-medium text-ink-soft">
        {label}
        {required ? <span className="ml-0.5 text-red">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      className="h-11 w-full rounded-chip border border-hairline bg-surface-card px-3.5 text-[15px] text-ink-strong outline-none transition-all placeholder:text-ink-subtle hover:border-hairline-strong focus:border-brand focus:ring-2 focus:ring-brand/25"
    />
  );
}

function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-chip border border-hairline bg-surface-card px-3.5 text-[15px] text-ink-strong outline-none transition-all hover:border-hairline-strong focus:border-brand focus:ring-2 focus:ring-brand/25"
    />
  );
}

function StatusChip({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "inline-flex items-center rounded-full bg-brand/[0.10] px-2.5 py-0.5 text-[11px] font-semibold text-brand"
          : "inline-flex items-center rounded-full bg-ink-subtle/15 px-2.5 py-0.5 text-[11px] font-semibold text-ink-subtle"
      }
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
