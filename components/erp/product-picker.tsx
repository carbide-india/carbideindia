"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, Plus, Boxes, Check, X, RefreshCcw } from "lucide-react";
import { StatusPill, ITEM_STATUS_PILL } from "@/components/erp/status-pill";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fireToast } from "@/lib/toast";
import {
  DIM_FIELDS,
  DIM_LABELS,
  defaultShapeConfig,
  requiredDims,
  visibleDims,
  type ShapeConfig,
} from "@/lib/masters/shape-config";
import {
  searchItemsAction,
  createMaterialAction,
  checkMaterialDedupAction,
  type MaterialPrefill,
} from "@/app/(app)/_actions/product-picker";
import type { MaterialHit } from "@/lib/queries/item-search";
import type { MasterOptionItem } from "@/lib/queries/masters";

/**
 * Product Picker - SAP-style Material Search (ERP redesign - Phase 9a, §7).
 *
 * The primary way to add a product to an enquiry line: you never TYPE a product,
 * you FIND the material. Searches existing Items by code / part / dims / grade /
 * shape / tolerance / customer; each hit shows a rich preview (code, spec, status
 * pill, customers, `reused N×` trust chip). On select the parent line attaches
 * the existing item's spec (→ createInquiry's in-tx sync dedups back to it).
 *
 * If nothing matches, a "Create new material" affordance opens the shape-driven
 * mini-form (required dims computed live from the shape config), runs a live
 * dedup check, and saves via the SHARED createItem path - then auto-selects the
 * returned item and returns control, zero navigation away.
 */

export interface PickerMasters {
  shapes: Array<{ id: string; name: string }>;
  grades: MasterOptionItem[];
  tolerances: MasterOptionItem[];
  conditions: MasterOptionItem[];
  /** Shape dimension config keyed by shape id (for the create mini-form). */
  shapeProfilesById: Record<string, ShapeConfig>;
}

interface ProductPickerProps {
  masters: PickerMasters;
  /** The currently-selected item (pinned chip), if the line already has one. */
  selected?: { itemId: string; itemCode: string } | null;
  /** Fired when a material is chosen (existing or freshly created). */
  onSelect: (prefill: MaterialPrefill) => void;
  /** Clear the current selection (re-open a fresh search). */
  onClear?: () => void;
}

export function ProductPicker({
  masters,
  selected,
  onSelect,
  onClear,
}: ProductPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const deferred = React.useDeferredValue(query);
  const q = deferred.trim();
  const boxRef = React.useRef<HTMLDivElement>(null);

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["material-search", q],
    // Empty q browses the newest Product Master items; typing filters them.
    queryFn: () => searchItemsAction({ q, limit: 10 }),
    enabled: open,
    staleTime: 20_000,
    placeholderData: (prev) => prev,
  });

  // Close the results panel on outside click (create sheet stays open).
  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(prefill: MaterialPrefill, reused: boolean) {
    onSelect(prefill);
    setOpen(false);
    setCreating(false);
    setQuery("");
    fireToast({
      message: `${reused ? "Existing material attached" : "Material created"} - ${prefill.itemCode}`,
      type: "success",
    });
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-chip border border-brand/40 bg-brand/6 px-3.5 py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <Boxes size={15} strokeWidth={2.2} className="shrink-0 text-brand" />
          <span className="font-mono text-[13px] font-bold text-ink-strong">
            {selected.itemCode}
          </span>
          <span className="text-[12px] text-ink-subtle">attached</span>
        </span>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-chip border border-hairline px-2.5 py-1 text-[12px] font-semibold text-ink-muted transition-colors hover:border-brand hover:text-brand"
          >
            <RefreshCcw size={12} strokeWidth={2.4} />
            Replace
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2.5 rounded-chip border border-hairline bg-surface-card px-3.5 focus-within:border-brand">
        <Search size={16} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Search materials by code, size, grade, customer"
          className="h-11 flex-1 bg-transparent text-[14px] text-ink-strong outline-none placeholder:text-ink-subtle"
        />
        {isFetching && (
          <Loader2 size={15} className="shrink-0 animate-spin text-ink-subtle" />
        )}
      </div>

      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-section border border-hairline-strong bg-surface-card"
          style={{ boxShadow: "0 20px 48px -16px rgba(15,23,42,0.32)" }}
        >
          <div className="max-h-[340px] overflow-y-auto p-1.5">
            {hits.length === 0 && !isFetching ? (
              <p className="px-3 py-6 text-center text-[13px] text-ink-subtle">
                {q.length >= 2
                  ? `No material matches “${q}”.`
                  : "No products in the Product Master yet."}
              </p>
            ) : (
              <>
                {q.length < 2 && (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                    Recent products from the Product Master
                  </p>
                )}
                {hits.map((h) => <HitRow key={h.id} hit={h} onPick={pick} />)}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2 border-t border-hairline bg-surface-soft px-4 py-3 text-left text-[13px] font-semibold text-brand transition-colors hover:bg-brand/8"
          >
            <Plus size={15} strokeWidth={2.4} className="shrink-0" />
            Create new material{q ? ` "${q}"` : ""}
          </button>
        </div>
      )}

      {creating && (
        <CreateMaterialSheet
          masters={masters}
          onClose={() => setCreating(false)}
          onCreated={pick}
        />
      )}
    </div>
  );
}

/* ── One rich hit row ──────────────────────────────────────────────────────── */

function HitRow({
  hit,
  onPick,
}: {
  hit: MaterialHit;
  onPick: (prefill: MaterialPrefill, reused: boolean) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const pill = ITEM_STATUS_PILL[hit.status] ?? ITEM_STATUS_PILL.active;

  async function choose() {
    if (busy) return;
    setBusy(true);
    const { getMaterialSpecForPrefill } = await import(
      "@/app/(app)/_actions/product-picker"
    );
    const prefill = await getMaterialSpecForPrefill(hit.id);
    setBusy(false);
    if (prefill) onPick(prefill, true);
    else fireToast({ message: "Could not load material", type: "error" });
  }

  const classification = [hit.gradeName, hit.shapeName, hit.toleranceName, hit.conditionName]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={choose}
      disabled={busy}
      className={cn(
        "flex w-full flex-col gap-1 rounded-chip px-3 py-2.5 text-left transition-colors hover:bg-surface-soft",
        !hit.isActive && "opacity-60",
      )}
    >
      <span className="flex items-center gap-2">
        <Boxes size={15} strokeWidth={2.1} className="shrink-0 text-ink-subtle" />
        <span className="font-mono text-[13px] font-bold text-ink-strong">
          {hit.itemCode}
        </span>
        <StatusPill tone={pill.tone} size="sm">
          {pill.label}
        </StatusPill>
        {hit.reusedCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-bg px-2 py-0.5 text-[11px] font-bold text-green-deep">
            reused {hit.reusedCount}×
          </span>
        )}
        {busy && <Loader2 size={13} className="animate-spin text-ink-subtle" />}
      </span>
      {(classification || hit.dimensions) && (
        <span className="pl-[23px] text-[12px] text-ink-muted">
          {classification}
          {hit.dimensions && (
            <>
              {classification && <span className="mx-1.5 text-ink-subtle">·</span>}
              <span className="font-mono">{hit.dimensions}</span>
            </>
          )}
        </span>
      )}
      {(hit.customers.length > 0 || hit.hsnCode) && (
        <span className="flex flex-wrap items-center gap-x-2 pl-[23px] text-[11px] text-ink-subtle">
          {hit.customers.length > 0 && (
            <span>Used by: {hit.customers.slice(0, 3).join(", ")}
              {hit.customers.length > 3 ? ` +${hit.customers.length - 3}` : ""}
            </span>
          )}
          {hit.hsnCode && <span>HSN {hit.hsnCode}</span>}
          {hit.uom && <span>{hit.uom}</span>}
        </span>
      )}
    </button>
  );
}

/* ── Inline create-new mini-form (shape-driven) ────────────────────────────── */

function CreateMaterialSheet({
  masters,
  onClose,
  onCreated,
}: {
  masters: PickerMasters;
  onClose: () => void;
  onCreated: (prefill: MaterialPrefill, reused: boolean) => void;
}) {
  const [shapeId, setShapeId] = React.useState<string>("");
  const [gradeId, setGradeId] = React.useState<string>("");
  const [toleranceId, setToleranceId] = React.useState<string>("");
  const [conditionId, setConditionId] = React.useState<string>("");
  const [dims, setDims] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [dedup, setDedup] = React.useState<
    { status: "new" } | { status: "exists"; itemCode: string; id: string } | null
  >(null);

  const cfg: ShapeConfig =
    (shapeId && masters.shapeProfilesById[shapeId]) || defaultShapeConfig();
  const shown = visibleDims(cfg);
  const required = requiredDims(cfg);

  const numDims = React.useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of DIM_FIELDS) {
      const raw = dims[d];
      if (raw != null && raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n)) out[d] = n;
      }
    }
    return out;
  }, [dims]);

  const missing = required.filter((d) => numDims[d] == null);
  const canSave = shapeId !== "" && missing.length === 0 && !saving;

  // Live dedup check (debounced) whenever the fingerprint inputs change. All
  // state updates happen inside the debounce timer (never synchronously in the
  // effect body) so the panel reflects the settled inputs without cascading.
  const incomplete = !shapeId || missing.length > 0;
  React.useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      if (incomplete || !shapeId) {
        setDedup(null);
        return;
      }
      void checkMaterialDedupAction({
        shapeId,
        internalGradeId: gradeId || undefined,
        conditionId: conditionId || undefined,
        toleranceId: toleranceId || undefined,
        outerDia: numDims.outerDia,
        innerDia: numDims.innerDia,
        length: numDims.length,
        width: numDims.width,
        thickness: numDims.thickness,
      }).then((res) => {
        if (cancelled) return;
        setDedup(
          res.status === "exists" && res.existing
            ? { status: "exists", itemCode: res.existing.itemCode, id: res.existing.id }
            : { status: "new" },
        );
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeId, gradeId, toleranceId, conditionId, JSON.stringify(numDims), incomplete]);

  async function attachExisting(id: string) {
    const { getMaterialSpecForPrefill } = await import(
      "@/app/(app)/_actions/product-picker"
    );
    const prefill = await getMaterialSpecForPrefill(id);
    if (prefill) onCreated(prefill, true);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const res = await createMaterialAction({
      shapeId,
      internalGradeId: gradeId || undefined,
      toleranceId: toleranceId || undefined,
      conditionId: conditionId || undefined,
      outerDia: numDims.outerDia,
      innerDia: numDims.innerDia,
      length: numDims.length,
      width: numDims.width,
      thickness: numDims.thickness,
      dimensionNotes: notes || undefined,
    });
    setSaving(false);
    if (res.ok) onCreated(res.prefill, res.reused);
    else fireToast({ message: `Could not create material - ${res.error}`, type: "error" });
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-[rgba(15,23,42,0.4)] px-4 py-[8vh]">
      <div
        className="w-[min(560px,100%)] overflow-hidden rounded-section border border-hairline-strong bg-surface-card"
        style={{ boxShadow: "0 24px 60px -16px rgba(15,23,42,0.4)" }}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
              New Material
            </div>
            <div className="mt-0.5 text-[15px] font-bold text-ink-strong">
              Create item spec
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="max-h-[64vh] overflow-y-auto p-5">
          <div className="flex flex-col gap-4">
            <Labeled label="Shape *">
              <Select
                value={shapeId}
                onValueChange={(v) => {
                  setShapeId(v);
                  // Clear hidden dims when the shape changes.
                  const next = (v && masters.shapeProfilesById[v]) || defaultShapeConfig();
                  setDims((prev) => {
                    const cp = { ...prev };
                    for (const d of DIM_FIELDS) if (next.dims[d] === "hidden") delete cp[d];
                    return cp;
                  });
                }}
                placeholder="Select a shape"
                options={masters.shapes.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Labeled>

            {shown.length > 0 && (
              <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2">
                {shown.map((d) => {
                  const req = cfg.dims[d] === "required";
                  return (
                    <Labeled key={d} label={`${DIM_LABELS[d]}${req ? " *" : ""}`}>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={dims[d] ?? ""}
                          onChange={(e) =>
                            setDims((prev) => ({ ...prev, [d]: e.target.value }))
                          }
                          placeholder="e.g. 12"
                          className="nt-input pr-12"
                        />
                        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-ink-subtle">
                          mm
                        </span>
                      </div>
                    </Labeled>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
              <Labeled label="Grade (Internal)">
                <Select
                  value={gradeId}
                  onValueChange={setGradeId}
                  placeholder="Select"
                  options={masters.grades.map((o) => ({ value: o.id, label: o.name }))}
                />
              </Labeled>
              <Labeled label="Tolerance">
                <Select
                  value={toleranceId}
                  onValueChange={setToleranceId}
                  placeholder="Select"
                  options={masters.tolerances.map((o) => ({ value: o.id, label: o.name }))}
                />
              </Labeled>
              <Labeled label="Condition">
                <Select
                  value={conditionId}
                  onValueChange={setConditionId}
                  placeholder="Select"
                  options={masters.conditions.map((o) => ({ value: o.id, label: o.name }))}
                />
              </Labeled>
            </div>

            <Labeled label="Dimension Notes">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className="nt-input"
              />
            </Labeled>

            {/* Live dedup panel */}
            {missing.length > 0 ? (
              <DedupPanel tone="incomplete">
                Add {missing.map((f) => DIM_LABELS[f]).join(", ")} to continue.
              </DedupPanel>
            ) : dedup?.status === "exists" ? (
              <DedupPanel tone="exists">
                <span>
                  An identical material already exists:{" "}
                  <span className="font-mono font-bold">{dedup.itemCode}</span>.
                </span>
                <button
                  type="button"
                  onClick={() => attachExisting(dedup.id)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-chip border border-amber-deep/40 px-3 py-1.5 text-[12px] font-bold text-amber-deep hover:bg-amber-bg"
                >
                  <Check size={13} strokeWidth={2.6} />
                  Attach existing instead
                </button>
              </DedupPanel>
            ) : dedup?.status === "new" ? (
              <DedupPanel tone="new">This will mint a new material.</DedupPanel>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-hairline px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-hairline px-3.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-hairline-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave || dedup?.status === "exists"}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-bold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create &amp; attach
          </button>
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function DedupPanel({
  tone,
  children,
}: {
  tone: "new" | "exists" | "incomplete";
  children: React.ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    new: "border-green-deep/30 bg-green-bg text-green-deep",
    exists: "border-amber-deep/30 bg-amber-bg text-amber-deep",
    incomplete: "border-hairline-strong bg-surface-soft text-ink-subtle",
  };
  return (
    <div className={cn("flex flex-col rounded-chip border px-3.5 py-2.5 text-[12.5px] font-medium", styles[tone])}>
      {children}
    </div>
  );
}
