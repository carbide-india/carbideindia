"use client";

import { useEffect, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { useQueryState } from "nuqs";
import { fireToast } from "@/lib/toast";
import {
  createMasterOption,
  createMasterOptionsBulk,
  updateMasterOption,
} from "@/app/(admin)/admin/masters/actions";
import { MASTER_KINDS, MASTER_KIND_LABELS, type MasterKind } from "@/db/enums";
import type { MasterOption } from "@/db/schema";
import {
  DIM_FIELDS,
  DIM_LABELS,
  resolveShapeConfig,
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

export function MasterList({ items }: Props) {
  const [kind, setKind] = useQueryState("kind", {
    defaultValue: "customer_type",
    parse: (v): MasterKind =>
      (MASTER_KINDS as readonly string[]).includes(v)
        ? (v as MasterKind)
        : "customer_type",
  });
  const [editing, setEditing] = useState<MasterOption | null>(null);

  return (
    <>
      <Tabs.Root value={kind} onValueChange={(v) => setKind(v as MasterKind)}>
        <Tabs.List
          className="mb-8 flex flex-wrap gap-2"
          aria-label="Master kinds"
        >
          {MASTER_KINDS.map((k) => {
            const active = kind === k;
            const count = items.filter((o) => o.kind === k).length;
            return (
              <Tabs.Trigger
                key={k}
                value={k}
                className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2"
                style={
                  active
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
                    active
                      ? { background: "rgba(255,255,255,0.22)", color: "#fff" }
                      : { background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }
                  }
                >
                  {count}
                </span>
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
        {MASTER_KINDS.map((k) => {
          const rows = items.filter((o) => o.kind === k);
          return (
            <Tabs.Content key={k} value={k} forceMount hidden={kind !== k}>
              <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-[18px] font-bold tracking-tight text-ink-strong">
                    {MASTER_KIND_LABELS[k]}
                  </h2>
                  <p className="mt-0.5 text-[13px] text-ink-subtle tabular-nums">
                    {rows.length} {rows.length === 1 ? "option" : "options"} ·{" "}
                    {rows.filter((o) => o.isActive).length} active
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <BulkCreateMasterDialog kind={k} />
                  <CreateMasterDialog kind={k} />
                </div>
              </div>
              {rows.length === 0 ? (
                <EmptyState kind={k} />
              ) : (
                <div
                  className="overflow-hidden rounded-section border border-hairline bg-surface-card"
                  style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
                >
                  <table className="w-full text-[15px]">
                    <thead>
                      <tr
                        className="text-left text-[12px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
                        style={{ background: "var(--color-surface-soft)" }}
                      >
                        <th className="px-5 py-4">Name</th>
                        <th className="px-5 py-4 tabular-nums">Sort</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4 text-right">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((o, i) => (
                        <MasterRow
                          key={o.id}
                          option={o}
                          rowIndex={i}
                          onEdit={() => setEditing(o)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Tabs.Content>
          );
        })}
      </Tabs.Root>
      <EditMasterDialog option={editing} onClose={() => setEditing(null)} />
    </>
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
      <p className="text-[14px] text-ink-subtle mt-2 max-w-sm mx-auto" style={{ lineHeight: 1.5 }}>
        Add the first one with the button above. It then shows up in the{" "}
        {MASTER_KIND_LABELS[kind]} dropdown on the KYC / inquiry forms.
      </p>
    </div>
  );
}

function MasterRow({
  option,
  rowIndex,
  onEdit,
}: {
  option: MasterOption;
  rowIndex: number;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      const res = await updateMasterOption(option.id, { isActive: !option.isActive });
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message: option.isActive
          ? `${option.name} deactivated.`
          : `${option.name} reactivated.`,
      });
    });
  }

  return (
    <tr
      className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
      style={{ background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined }}
    >
      <td className="px-5 py-4 text-ink-strong font-medium">{option.name}</td>
      <td className="px-5 py-4 tabular-nums text-ink-soft">{option.sortOrder}</td>
      <td className="px-5 py-4">
        {option.isActive ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
            style={{ background: "var(--color-green-bg)", color: "var(--color-green-deep)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-green)" }} />
            Active
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
            style={{ background: "rgba(15, 23, 42, 0.05)", color: "var(--color-ink-subtle)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-ink-subtle)" }} />
            Inactive
          </span>
        )}
      </td>
      <td className="px-5 py-4 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-surface-soft hover:text-ink-strong transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={toggleActive}
            className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-surface-soft hover:text-ink-strong transition-colors disabled:opacity-50"
          >
            {option.isActive ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function CreateMasterDialog({ kind }: { kind: MasterKind }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(100);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setSortOrder(100);
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createMasterOption({ kind, name: name.trim(), sortOrder });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${name.trim()} created.` });
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
          className="inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
          style={{ background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))" }}
        >
          + New option
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            New option · {MASTER_KIND_LABELS[kind]}
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4" style={{ lineHeight: 1.5 }}>
            This appears in the {MASTER_KIND_LABELS[kind]} dropdown on the KYC /
            inquiry forms.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Name">
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </Field>
            <Field
              label="Sort order"
              hint="Lower numbers appear first when sort ties. Default 100."
            >
              <input
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-28 rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
              />
            </Field>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#B71C1C]"
              >
                {error}
              </div>
            )}
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
                disabled={pending}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))" }}
              >
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
          className="inline-flex h-10 items-center rounded-lg border border-hairline bg-surface-card px-4 text-[14px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
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
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4" style={{ lineHeight: 1.5 }}>
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
                {rawCount} {rawCount === 1 ? "value" : "values"} ·{" "}
                {parsedCount} after removing blanks/dupes
              </p>
            </div>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#B71C1C]"
              >
                {error}
              </div>
            )}
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
                style={{ background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))" }}
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

function EditMasterDialog({
  option,
  onClose,
}: {
  option: MasterOption | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(option?.name ?? "");
  const [sortOrder, setSortOrder] = useState<number>(option?.sortOrder ?? 100);
  const [dims, setDims] = useState<ShapeConfig["dims"]>(
    () => resolveShapeConfig(option?.config).dims,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isShape = option?.kind === "shape";

  useEffect(() => {
    setName(option?.name ?? "");
    setSortOrder(option?.sortOrder ?? 100);
    setDims(resolveShapeConfig(option?.config).dims);
    setError(null);
  }, [option?.id, option?.name, option?.sortOrder, option?.config]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!option) return;
    setError(null);

    const patch: {
      name?: string;
      sortOrder?: number;
      config?: ShapeConfig;
    } = {};
    const trimmedName = name.trim();
    if (trimmedName !== option.name) patch.name = trimmedName;
    if (sortOrder !== option.sortOrder) patch.sortOrder = sortOrder;
    if (isShape) {
      const original = resolveShapeConfig(option.config).dims;
      if (JSON.stringify(dims) !== JSON.stringify(original)) {
        patch.config = { dims };
      }
    }

    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }

    startTransition(async () => {
      const res = await updateMasterOption(option.id, patch);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: `${trimmedName} updated.` });
      onClose();
    });
  }

  return (
    <Dialog.Root open={option !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Edit option
          </Dialog.Title>
          <Dialog.Description className="text-[15px] text-[#64748B] mb-4">
            Renaming updates the {option ? MASTER_KIND_LABELS[option.kind] : ""}{" "}
            value everywhere it is referenced.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                Name
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </div>
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                Sort order
              </label>
              <input
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-28 rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
              />
            </div>
            {isShape && (
              <div className="rounded-lg border border-hairline bg-surface-soft p-4">
                <label className="block text-[14px] font-semibold text-[#0F172A]">
                  Dimension matrix
                </label>
                <p className="mt-1 text-[12.5px] text-[#64748B]" style={{ lineHeight: 1.5 }}>
                  Controls which dimension inputs the Item &amp; Enquiry forms
                  show for this shape.
                </p>
                <div className="mt-3 divide-y divide-hairline rounded-lg border border-hairline bg-white">
                  {DIM_FIELDS.map((d) => (
                    <div key={d} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span className="text-[13.5px] font-medium text-[#0F172A]">
                        {DIM_LABELS[d]}
                      </span>
                      <div className="inline-flex rounded-md border border-[#CBD5E1] overflow-hidden">
                        {DIM_RULES.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setDims((prev) => ({ ...prev, [d]: r }))}
                            aria-pressed={dims[d] === r}
                            className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                              dims[d] === r
                                ? "bg-[#3F3F94] text-white"
                                : "bg-white text-[#64748B] hover:bg-[#F1F5F9]"
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
            )}
            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#B71C1C]"
              >
                {error}
              </div>
            )}
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
                disabled={pending}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))" }}
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[13px] text-[#94A3B8]">{hint}</p>}
    </div>
  );
}
