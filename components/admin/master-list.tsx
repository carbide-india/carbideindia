"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { Layers, Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  createMasterOption,
  createMasterOptionsBulk,
  updateMasterOption,
  deleteMasterOption,
} from "@/app/(admin)/admin/masters/actions";
import { MASTER_KINDS, MASTER_KIND_LABELS, type MasterKind } from "@/db/enums";
import type { MasterOption } from "@/db/schema";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { WorkbenchActions } from "@/components/workbench/workbench-actions";
import {
  WorkbenchTable,
  type WbColumn,
} from "@/components/workbench/workbench-table";
import {
  DIM_FIELDS,
  DIM_LABELS,
  resolveShapeConfig,
  defaultShapeConfig,
  type DimRule,
  type ShapeConfig,
} from "@/lib/masters/shape-config";

const DIM_RULES: DimRule[] = ["required", "optional", "hidden"];
const DIM_RULE_LABELS: Record<DimRule, string> = {
  required: "Required",
  optional: "Optional",
  hidden: "Hidden",
};

interface Props {
  items: MasterOption[];
}

/** Kinds whose data hasn't arrived yet — the empty-state names the source. */
const PENDING_DATA_KINDS: ReadonlySet<MasterKind> = new Set([
  "internal_grade",
  "tolerance",
]);

const BLANK_DIMS = defaultShapeConfig().dims;

export function MasterList({ items }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowPending, startRowAction] = useTransition();

  const [kindRaw, setKind] = useQueryState("kind", {
    defaultValue: "customer_type",
    parse: (v): MasterKind =>
      (MASTER_KINDS as readonly string[]).includes(v)
        ? (v as MasterKind)
        : "customer_type",
  });
  const kind = kindRaw as MasterKind;

  // Form state. selectedId === null => "new"; otherwise "edit".
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(100);
  const [active, setActive] = useState<boolean>(true);
  const [dims, setDims] = useState<ShapeConfig["dims"]>(BLANK_DIMS);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const isShape = kind === "shape";

  const rows = useMemo(() => items.filter((o) => o.kind === kind), [items, kind]);
  const activeCount = rows.filter((o) => o.isActive).length;

  const selected = useMemo(
    () => (selectedId ? (rows.find((o) => o.id === selectedId) ?? null) : null),
    [rows, selectedId],
  );

  function resetForm() {
    setSelectedId(null);
    setName("");
    setSortOrder(100);
    setActive(true);
    setDims(BLANK_DIMS);
    setError(null);
  }

  // Reset the form whenever the active kind tab changes.
  useEffect(() => {
    resetForm();
  }, [kind]);

  function loadRow(o: MasterOption) {
    setSelectedId(o.id);
    setName(o.name);
    setSortOrder(o.sortOrder);
    setActive(o.isActive);
    setDims(resolveShapeConfig(o.config).dims);
    setError(null);
  }

  function onSave() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }

    startSaving(async () => {
      if (!selected) {
        // CREATE
        const res = await createMasterOption({ kind, name: trimmed, sortOrder });
        if (!res.ok) {
          setError(res.error ?? "Something went wrong");
          return;
        }
        fireToast({ message: `${trimmed} created.` });
        resetForm();
        return;
      }

      // UPDATE — only send changed fields.
      const patch: {
        name?: string;
        sortOrder?: number;
        isActive?: boolean;
        config?: ShapeConfig;
      } = {};
      if (trimmed !== selected.name) patch.name = trimmed;
      if (sortOrder !== selected.sortOrder) patch.sortOrder = sortOrder;
      if (active !== selected.isActive) patch.isActive = active;
      if (isShape) {
        const original = resolveShapeConfig(selected.config).dims;
        if (JSON.stringify(dims) !== JSON.stringify(original)) {
          patch.config = { dims };
        }
      }

      if (Object.keys(patch).length === 0) {
        setError("No changes to save.");
        return;
      }

      const res = await updateMasterOption(selected.id, patch);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${trimmed} updated.` });
      resetForm();
    });
  }

  function onDeactivate() {
    if (!selected) return;
    setError(null);
    startSaving(async () => {
      const res = await updateMasterOption(selected.id, { isActive: false });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${selected.name} deactivated.` });
      resetForm();
    });
  }

  // ── Per-row actions (discoverable Edit / toggle / Delete on every row) ──

  function onRowEdit(o: MasterOption) {
    loadRow(o);
    // Bring the form (above the table) back into view for editing.
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onRowToggleActive(o: MasterOption) {
    const next = !o.isActive;
    setRowBusyId(o.id);
    startRowAction(async () => {
      const res = await updateMasterOption(o.id, { isActive: next });
      setRowBusyId(null);
      if (!res.ok) {
        fireToast({ type: "error", message: res.error ?? "Something went wrong" });
        return;
      }
      fireToast({ message: `${o.name} ${next ? "reactivated" : "deactivated"}.` });
      router.refresh();
    });
  }

  function onRowDelete(o: MasterOption) {
    if (!window.confirm(`Delete "${o.name}"? This cannot be undone.`)) return;
    setRowBusyId(o.id);
    startRowAction(async () => {
      const res = await deleteMasterOption(o.id);
      setRowBusyId(null);
      if (!res.ok) {
        fireToast({ type: "error", message: res.error ?? "Something went wrong" });
        return;
      }
      fireToast({ message: "Deleted." });
      router.refresh();
    });
  }

  const columns: WbColumn<MasterOption>[] = [
    {
      key: "name",
      header: "Name",
      cell: (o) => <span className="font-medium text-ink-strong">{o.name}</span>,
      filterValue: (o) => o.name,
      sortValue: (o) => o.name.toLowerCase(),
    },
    {
      key: "sortOrder",
      header: "Sort",
      align: "right",
      cell: (o) => <span className="tabular-nums text-ink-soft">{o.sortOrder}</span>,
      sortValue: (o) => o.sortOrder,
    },
    {
      key: "status",
      header: "Status",
      cell: (o) => <StatusChip active={o.isActive} />,
      filterValue: (o) => (o.isActive ? "Active" : "Inactive"),
      sortValue: (o) => (o.isActive ? 0 : 1),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (o) => (
        <RowActions
          option={o}
          busy={rowPending && rowBusyId === o.id}
          onEdit={onRowEdit}
          onToggleActive={onRowToggleActive}
          onDelete={onRowDelete}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Kind tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Master kinds">
        {MASTER_KINDS.map((k) => {
          const isActiveTab = kind === k;
          const count = items.filter((o) => o.kind === k).length;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={isActiveTab}
              onClick={() => setKind(k)}
              className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2"
              style={
                isActiveTab
                  ? { background: "var(--color-brand)", color: "#fff" }
                  : {
                      background: "var(--color-surface-card)",
                      color: "var(--color-ink-soft)",
                      border: "1px solid var(--color-hairline)",
                    }
              }
            >
              {MASTER_KIND_LABELS[k]}
              <span
                className="inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums"
                style={
                  isActiveTab
                    ? { background: "rgba(255,255,255,0.22)", color: "#fff" }
                    : {
                        background: "var(--color-surface-soft)",
                        color: "var(--color-ink-subtle)",
                      }
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Entry form */}
      <div ref={formRef}>
      <WorkbenchPanel
        title={`${selected ? "Edit" : "New"} ${MASTER_KIND_LABELS[kind]} Option`}
        icon={<Layers size={17} strokeWidth={2.2} />}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-[260px] flex-1">
              <label className="block text-[13px] font-semibold text-ink-strong mb-1.5">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder={`${MASTER_KIND_LABELS[kind]} name`}
                className="nt-input w-full"
              />
            </div>
            <div className="w-32">
              <label className="block text-[13px] font-semibold text-ink-strong mb-1.5">
                Sort Order
              </label>
              <input
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="nt-input w-full tabular-nums"
              />
            </div>
            <div className="w-40">
              <label className="block text-[13px] font-semibold text-ink-strong mb-1.5">
                Active
              </label>
              <div className="inline-flex rounded-chip border border-hairline-strong overflow-hidden">
                {[
                  { v: true, label: "Yes" },
                  { v: false, label: "No" },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setActive(opt.v)}
                    aria-pressed={active === opt.v}
                    className={`h-[38px] px-4 text-[13px] font-semibold transition-colors ${
                      active === opt.v
                        ? "bg-[var(--color-brand)] text-white"
                        : "bg-surface-card text-ink-soft hover:bg-surface-soft"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {!selected ? (
                <p className="mt-1 text-[11.5px] text-ink-subtle">
                  New options are created active.
                </p>
              ) : null}
            </div>
          </div>

          {isShape ? (
            <div className="rounded-chip border border-hairline bg-surface-soft p-4">
              <label className="block text-[13px] font-semibold text-ink-strong">
                Dimension matrix
              </label>
              <p
                className="mt-1 text-[12px] text-ink-subtle"
                style={{ lineHeight: 1.5 }}
              >
                Controls which dimension inputs the Item &amp; Enquiry forms show
                for this shape.{" "}
                {selected ? null : "Select a shape below to edit its matrix."}
              </p>
              <div className="mt-3 divide-y divide-hairline rounded-chip border border-hairline bg-surface-card">
                {DIM_FIELDS.map((d) => (
                  <div
                    key={d}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <span className="text-[13px] font-medium text-ink-strong">
                      {DIM_LABELS[d]}
                    </span>
                    <div className="inline-flex rounded-chip border border-hairline-strong overflow-hidden">
                      {DIM_RULES.map((r) => (
                        <button
                          key={r}
                          type="button"
                          disabled={!selected}
                          onClick={() => setDims((prev) => ({ ...prev, [d]: r }))}
                          aria-pressed={dims[d] === r}
                          className={`px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                            dims[d] === r
                              ? "bg-[var(--color-brand)] text-white"
                              : "bg-surface-card text-ink-soft hover:bg-surface-soft"
                          }`}
                        >
                          {DIM_RULE_LABELS[r]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-chip border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#B71C1C]"
            >
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <WorkbenchActions
              onClear={resetForm}
              onSave={onSave}
              onDelete={selected ? onDeactivate : undefined}
              saving={saving}
              deleteLabel="Deactivate"
              className="flex-1"
            />
            <BulkCreateMasterDialog kind={kind} />
          </div>
        </div>
      </WorkbenchPanel>
      </div>

      {/* List */}
      <div>
        <div className="mb-3 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[16px] font-bold tracking-tight text-ink-strong">
              {MASTER_KIND_LABELS[kind]}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-subtle tabular-nums">
              {rows.length} {rows.length === 1 ? "option" : "options"} ·{" "}
              {activeCount} active
            </p>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState kind={kind} />
        ) : (
          <WorkbenchTable<MasterOption>
            rows={rows}
            columns={columns}
            getRowId={(o) => o.id}
            onRowClick={loadRow}
            emptyText="No options match the filters."
          />
        )}
      </div>
    </div>
  );
}

function RowActions({
  option,
  busy,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  option: MasterOption;
  busy: boolean;
  onEdit: (o: MasterOption) => void;
  onToggleActive: (o: MasterOption) => void;
  onDelete: (o: MasterOption) => void;
}) {
  const btn =
    "inline-flex h-7 w-7 items-center justify-center rounded-chip border border-hairline bg-surface-card text-ink-soft transition-colors hover:border-brand/40 hover:text-ink-strong disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="inline-flex items-center justify-end gap-1.5">
      <button
        type="button"
        aria-label="Edit"
        title="Edit"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onEdit(option);
        }}
        className={btn}
      >
        <Pencil size={14} strokeWidth={2.2} />
      </button>
      <button
        type="button"
        aria-label={option.isActive ? "Deactivate" : "Reactivate"}
        title={option.isActive ? "Deactivate" : "Reactivate"}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onToggleActive(option);
        }}
        className={btn}
      >
        {option.isActive ? (
          <Power size={14} strokeWidth={2.2} />
        ) : (
          <RotateCcw size={14} strokeWidth={2.2} />
        )}
      </button>
      <button
        type="button"
        aria-label="Delete"
        title="Delete"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(option);
        }}
        className={btn}
        style={{ color: "var(--color-red)" }}
      >
        <Trash2 size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function StatusChip({ active }: { active: boolean }) {
  return active ? (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: "var(--color-green-bg)", color: "var(--color-green-deep)" }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--color-green)" }}
      />
      Active
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: "rgba(15, 23, 42, 0.05)", color: "var(--color-ink-subtle)" }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--color-ink-subtle)" }}
      />
      Inactive
    </span>
  );
}

function EmptyState({ kind }: { kind: MasterKind }) {
  return (
    <div
      className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <p
        className="font-serif text-ink-strong"
        style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
      >
        {PENDING_DATA_KINDS.has(kind)
          ? "No entries yet — data expected from Alok sir."
          : `No ${MASTER_KIND_LABELS[kind]} options yet`}
      </p>
      <p
        className="text-[14px] text-ink-subtle mt-2 max-w-sm mx-auto"
        style={{ lineHeight: 1.5 }}
      >
        Add the first one with the form above. It then shows up in the{" "}
        {MASTER_KIND_LABELS[kind]} dropdown on the KYC / inquiry forms.
      </p>
    </div>
  );
}

/** Split raw textarea text into trimmed, deduped (case-insensitive) values. */
function parseBulkValues(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[\n,]/)) {
    const value = piece.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function BulkCreateMasterDialog({ kind }: { kind: MasterKind }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setRaw("");
    setError(null);
  }

  const rawCount = raw.split(/[\n,]/).filter((p) => p.trim().length > 0).length;
  const parsed = parseBulkValues(raw);
  const parsedCount = parsed.length;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (parsed.length === 0) return;
    startTransition(async () => {
      const res = await createMasterOptionsBulk({ kind, names: parsed });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({
        message: `Added ${res.created}, skipped ${res.skipped} duplicate(s).`,
      });
      reset();
      setOpen(false);
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center rounded-chip border border-hairline-strong bg-surface-card px-4 text-[14px] font-medium text-ink-soft transition-colors hover:border-brand/40 hover:text-ink-strong"
        >
          Bulk add
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Bulk add · {MASTER_KIND_LABELS[kind]}
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            Paste many values at once. Duplicates (existing or repeated) are
            skipped automatically.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                Values
              </label>
              <textarea
                autoFocus
                rows={8}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={"Paste values — one per line, or comma-separated"}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[14px] font-mono resize-y max-h-[40vh]"
              />
              <p className="mt-1.5 text-[13px] text-[#94A3B8] tabular-nums">
                {rawCount} {rawCount === 1 ? "value" : "values"} · {parsedCount}{" "}
                after removing blanks/dupes
              </p>
            </div>
            {error ? (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#B71C1C]"
              >
                {error}
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                  disabled={pending}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending || parsedCount === 0}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
                }}
              >
                {pending
                  ? "Adding…"
                  : parsedCount > 0
                    ? `Add ${parsedCount}`
                    : "Add"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
