"use client";

import * as React from "react";
import { Paperclip, Pencil, GripVertical } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  ACTIVE_RECHECK_STATES,
  RECHECK_STATE_LABELS,
  RECHECK_STATE_TONES,
  isApproverOnlyCheckState,
  type RecheckState,
} from "@/db/enums";
import { NotesField } from "@/components/ui/notes-field";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Public API ────────────────────────────────────────────────────────── */
export interface CheckItem {
  key: string;
  label: string;
  value: RecheckState;
  notes: string;
}

/** The three statuses whose meaning demands a written justification. */
const NEEDS_REASON = new Set<RecheckState>([
  "need_info", "not_feasible", "assumed", "not_approved",
]);

/** A reason is *required* (blocks Confirm) for these; `assumed` is encouraged. */
const REASON_REQUIRED = new Set<RecheckState>([
  "need_info", "not_feasible", "not_approved",
]);

const REASON_PLACEHOLDER: Partial<Record<RecheckState, string>> = {
  need_info: "What information is needed?",
  not_feasible: "Why is this not feasible?",
  assumed: "What did you assume?",
  not_approved: "Why is this sent back?",
};

const REASON_TITLE: Partial<Record<RecheckState, string>> = {
  need_info: "What information is needed to complete Primary Feasibility?",
  not_feasible: "Why is this not feasible?",
  assumed: "What did you assume?",
  not_approved: "Why are you sending this check back?",
};

/* dnd-kit ids are namespaced so a check key can never collide with a status. */
const COL = (s: RecheckState) => `col:${s}`;
const CARD = (k: string) => `card:${k}`;
const parseCol = (id: string): RecheckState | null =>
  id.startsWith("col:") ? (id.slice(4) as RecheckState) : null;
const parseCard = (id: string): string | null =>
  id.startsWith("card:") ? id.slice(5) : null;

/* Tone → CSS var helpers. */
const fill = (tone: string) => `var(--color-${tone})`;
const deep = (tone: string) => `var(--color-${tone}-deep)`;
const lightBg = (tone: string) => `var(--color-${tone}-bg)`;

type PendingDrop = { key: string; label: string; target: RecheckState; reason: string };

/* ────────────────────────────────────────────────────────────────────────
 * FeasibilityChecksBoard
 *   Drag the five check cards between the five status columns to set each
 *   check's status. Dropping into a status that needs justification opens an
 *   animated popup that captures the reason (stored on the check's notes).
 * ──────────────────────────────────────────────────────────────────────── */
export function FeasibilityChecksBoard({
  items,
  onChange,
  canApprove = false,
}: {
  items: CheckItem[];
  onChange: (key: string, patch: { value?: RecheckState; notes?: string }) => void;
  /**
   * Whether this viewer may move a check into Approved / Not Approved.
   * Anyone can work a check up to Done; only an approver signs it off
   * (Manan, 2026-08-13). False locks the two columns here — but the real
   * gate is server-side in the save action, because hiding a column is
   * convenience, never security.
   */
  canApprove?: boolean;
}) {
  /** A column this viewer may not drop into. */
  const locked = React.useCallback(
    (s: RecheckState) => !canApprove && isApproverOnlyCheckState(s),
    [canApprove],
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<RecheckState | null>(null);
  const [pending, setPending] = React.useState<PendingDrop | null>(null);

  const byStatus = React.useMemo(() => {
    const map = new Map<RecheckState, CheckItem[]>();
    for (const s of ACTIVE_RECHECK_STATES) map.set(s, []);
    for (const it of items) {
      // Fold any legacy/out-of-board value into the first column so nothing
      // silently disappears from the board.
      const bucket = map.get(it.value) ?? map.get(ACTIVE_RECHECK_STATES[0]);
      bucket?.push(it);
    }
    return map;
  }, [items]);

  const activeItem = activeKey ? items.find((i) => i.key === activeKey) ?? null : null;

  // ── Keyboard operability ────────────────────────────────────────────────
  // Drag-and-drop is mouse/touch only, so the board is also fully operable by
  // keyboard: each card is focusable and Left/Right (or Up/Down) arrow keys
  // move the check between status columns — opening the same reason popup when
  // the target status needs a justification. We keep a node map so focus
  // follows a card as it re-buckets into a new column, and so focus returns to
  // the originating card when the reason popup closes.
  const cardNodes = React.useRef(new Map<string, HTMLDivElement | null>());
  const registerCard = React.useCallback((key: string, node: HTMLDivElement | null) => {
    if (node) cardNodes.current.set(key, node);
    else cardNodes.current.delete(key);
  }, []);
  const focusCard = React.useCallback((key: string) => {
    requestAnimationFrame(() => cardNodes.current.get(key)?.focus());
  }, []);

  const moveCheck = React.useCallback(
    (key: string, dir: 1 | -1) => {
      const item = items.find((i) => i.key === key);
      if (!item) return;
      const order = ACTIVE_RECHECK_STATES as readonly RecheckState[];
      const curIdx = Math.max(0, order.indexOf(item.value)); // fold legacy → col 0
      // Step over any column this viewer may not use, rather than stopping
      // dead on it — arrowing right from Assumed should still do nothing for a
      // non-approver, but it must never land them somewhere they can't save.
      let nextIdx = curIdx + dir;
      while (nextIdx >= 0 && nextIdx < order.length && locked(order[nextIdx]!)) {
        nextIdx += dir;
      }
      if (nextIdx < 0 || nextIdx >= order.length) return; // at an edge
      const target = order[nextIdx];
      if (!target || target === item.value) return;
      if (NEEDS_REASON.has(target)) {
        setPending({ key, label: item.label, target, reason: item.notes ?? "" });
        return;
      }
      onChange(key, { value: target });
      focusCard(key);
    },
    [items, onChange, focusCard, locked],
  );

  function handleStart(e: DragStartEvent) {
    setActiveKey(parseCard(String(e.active.id)));
  }

  function handleOver(e: DragOverEvent) {
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) {
      setOverCol(null);
      return;
    }
    // `over` can be a column OR a card sitting inside a column.
    const col = parseCol(overId);
    if (col) {
      setOverCol(locked(col) ? null : col);
      return;
    }
    const cardKey = parseCard(overId);
    const host = cardKey ? items.find((i) => i.key === cardKey) : undefined;
    setOverCol(host ? host.value : null);
  }

  function handleEnd(e: DragEndEvent) {
    const key = parseCard(String(e.active.id));
    const overId = e.over ? String(e.over.id) : null;
    setActiveKey(null);
    setOverCol(null);
    if (!key || !overId) return;

    // Resolve the target column whether we dropped on the column or on a card.
    let target = parseCol(overId);
    if (!target) {
      const cardKey = parseCard(overId);
      const host = cardKey ? items.find((i) => i.key === cardKey) : undefined;
      target = host ? host.value : null;
    }
    if (!target) return;

    const item = items.find((i) => i.key === key);
    if (!item || item.value === target) return; // same column → no-op
    if (locked(target)) return; // approver-only column — drop is a no-op

    if (NEEDS_REASON.has(target)) {
      setPending({ key, label: item.label, target, reason: item.notes ?? "" });
      return;
    }
    onChange(key, { value: target });
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleStart}
        onDragOver={handleOver}
        onDragEnd={handleEnd}
        onDragCancel={() => {
          setActiveKey(null);
          setOverCol(null);
        }}
      >
        <div className="flex gap-3 overflow-x-auto pb-1">
          {ACTIVE_RECHECK_STATES.map((status) => (
            <StatusColumn
              key={status}
              status={status}
              items={byStatus.get(status) ?? []}
              isOver={overCol === status}
              draggingKey={activeKey}
              onMove={moveCheck}
              registerCard={registerCard}
              locked={locked(status)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <CheckCard item={activeItem} tone={RECHECK_STATE_TONES[activeItem.value]} floating />
          ) : null}
        </DragOverlay>
      </DndContext>

      {pending && (
        <ReasonPopup
          pending={pending}
          onReason={(reason) => setPending((p) => (p ? { ...p, reason } : p))}
          onCancel={() => {
            const k = pending.key;
            setPending(null);
            focusCard(k);
          }}
          onConfirm={() => {
            const k = pending.key;
            onChange(pending.key, { value: pending.target, notes: pending.reason.trim() });
            setPending(null);
            focusCard(k);
          }}
        />
      )}
    </>
  );
}

/* ── Status column (droppable) ─────────────────────────────────────────── */
function StatusColumn({
  status,
  items,
  isOver,
  draggingKey,
  onMove,
  registerCard,
  locked = false,
}: {
  status: RecheckState;
  items: CheckItem[];
  isOver: boolean;
  draggingKey: string | null;
  onMove: (key: string, dir: 1 | -1) => void;
  registerCard: (key: string, node: HTMLDivElement | null) => void;
  /** Approver-only column this viewer cannot drop into. */
  locked?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: COL(status) });
  const tone = RECHECK_STATE_TONES[status];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-[150px] flex-1 flex-col rounded-2xl bg-white transition-all duration-150",
        isOver ? "shadow-[0_10px_28px_rgba(0,0,0,0.12)]" : "shadow-sm",
      )}
      style={{
        borderStyle: "solid",
        borderWidth: isOver ? 3 : 2,
        borderColor: isOver
          ? fill(tone)
          : `color-mix(in srgb, ${fill(tone)} 55%, #ffffff)`,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 rounded-t-2xl border-b px-3 py-2.5"
        style={{ background: lightBg(tone), borderColor: "rgba(0,0,0,0.05)" }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: fill(tone) }}
        />
        <span
          className="truncate text-[12.5px] font-extrabold tracking-tight"
          style={{ color: deep(tone) }}
        >
          {RECHECK_STATE_LABELS[status]}
        </span>
        {locked && (
          <Lock
            size={12}
            strokeWidth={2.6}
            aria-hidden
            className="shrink-0 opacity-55"
            style={{ color: deep(tone) }}
          />
        )}
        <span
          className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-black tabular-nums text-white"
          style={{ background: fill(tone) }}
        >
          {items.length}
        </span>
      </div>

      {/* Body */}
      <div
        className={cn(
          "flex min-h-[104px] flex-1 flex-col gap-2 p-2 transition-colors duration-150",
          isOver && "rounded-b-2xl",
        )}
        style={isOver ? { background: lightBg(tone) } : undefined}
      >
        {items.length === 0 ? (
          <div
            className="flex flex-1 items-center justify-center rounded-xl border px-2 py-6 text-center text-[11px] font-bold"
            style={{
              borderColor: `color-mix(in srgb, ${fill(tone)} 30%, #ffffff)`,
              background: `color-mix(in srgb, ${lightBg(tone)} 40%, #ffffff)`,
              color: `color-mix(in srgb, ${deep(tone)} 70%, #8b8ba3)`,
            }}
          >
            {locked ? "Approver only" : "Drop a check here"}
          </div>
        ) : (
          items.map((it) => (
            <DraggableCard
              key={it.key}
              item={it}
              tone={tone}
              dimmed={draggingKey === it.key}
              onMove={onMove}
              registerCard={registerCard}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ── Draggable wrapper ─────────────────────────────────────────────────── */
function DraggableCard({
  item,
  tone,
  dimmed,
  onMove,
  registerCard,
}: {
  item: CheckItem;
  tone: string;
  dimmed: boolean;
  onMove: (key: string, dir: 1 | -1) => void;
  registerCard: (key: string, node: HTMLDivElement | null) => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: CARD(item.key) });

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      registerCard(item.key, node);
    },
    [setNodeRef, registerCard, item.key],
  );

  const idx = (ACTIVE_RECHECK_STATES as readonly RecheckState[]).indexOf(item.value);
  const posLabel = idx >= 0 ? `, column ${idx + 1} of ${ACTIVE_RECHECK_STATES.length}` : "";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      onMove(item.key, -1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      onMove(item.key, 1);
    }
  };

  return (
    <div
      ref={setRefs}
      {...listeners}
      {...attributes}
      // Own accessibility/keyboard wins over dnd-kit's generic draggable attrs.
      role="button"
      aria-roledescription="Feasibility check — press Left or Right arrow to change status"
      aria-label={`${item.label}: ${RECHECK_STATE_LABELS[item.value]}${posLabel}. Use arrow keys to change status.`}
      onKeyDown={handleKeyDown}
      className={cn(
        "touch-none rounded-xl outline-none",
        "focus-visible:ring-2 focus-visible:ring-[#3f3f94] focus-visible:ring-offset-1",
        (isDragging || dimmed) && "opacity-40",
      )}
    >
      <CheckCard item={item} tone={tone} />
    </div>
  );
}

/* ── Card visual ───────────────────────────────────────────────────────── */
function CheckCard({
  item,
  tone,
  floating = false,
}: {
  item: CheckItem;
  tone: string;
  floating?: boolean;
}) {
  const hasNote = Boolean(item.notes && item.notes.trim());
  return (
    <div
      className={cn(
        "group flex cursor-grab select-none items-start gap-2 rounded-xl px-3 py-2.5 transition-all active:cursor-grabbing",
        floating
          ? "rotate-[1.5deg] cursor-grabbing shadow-[0_14px_32px_rgba(63,63,148,0.28)]"
          : "shadow-sm hover:-translate-y-px hover:shadow-md",
      )}
      style={{
        borderStyle: "solid",
        borderWidth: 2,
        borderColor: `color-mix(in srgb, ${fill(tone)} 50%, #ffffff)`,
        borderLeftWidth: 5,
        borderLeftColor: fill(tone),
        background: `color-mix(in srgb, ${lightBg(tone)} 55%, #ffffff)`,
      }}
    >
      <GripVertical className="mt-0.5 h-4 w-4 shrink-0" style={{ color: fill(tone) }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-extrabold text-ink-strong">{item.label}</div>
        {hasNote ? (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-ink-soft">
            <Paperclip className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.notes}</span>
          </div>
        ) : (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-subtle/70">
            <Pencil className="h-3 w-3 shrink-0" />
            <span>Drag or use ← → keys</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Animated reason popup ─────────────────────────────────────────────── */
const POP_ANIM = "feas-reason-pop";

function ReasonPopup({
  pending,
  onReason,
  onCancel,
  onConfirm,
}: {
  pending: PendingDrop;
  onReason: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tone = RECHECK_STATE_TONES[pending.target];
  const required = REASON_REQUIRED.has(pending.target);
  const blocked = required && !pending.reason.trim();
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Escape closes (Cancel).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // On open, move focus into the reason textarea so the modal is immediately
  // usable from the keyboard (focus is restored to the originating card by the
  // board when the popup closes).
  React.useEffect(() => {
    dialogRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }, []);

  const focusablesInDialog = () => {
    const root = dialogRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
  };

  // Keep the modal a focus trap and stop Enter from bubbling to the form-level
  // Ctrl/Cmd+Enter submit handler on the workspace container.
  const onDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      return;
    }
    if (e.key !== "Tab") return;
    const list = focusablesInDialog();
    if (list.length === 0) return;
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={onDialogKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <style>{`
@keyframes ${POP_ANIM}-overlay { from { opacity: 0 } to { opacity: 1 } }
@keyframes ${POP_ANIM}-card {
  from { opacity: 0; transform: translateY(8px) scale(.96) }
  to   { opacity: 1; transform: none }
}`}</style>

      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/40"
        style={{ animation: `${POP_ANIM}-overlay 160ms ease-out both` }}
        aria-hidden
      />

      {/* Card */}
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ animation: `${POP_ANIM}-card 180ms cubic-bezier(.22,.61,.36,1) both` }}
      >
        {/* Accent bar */}
        <div className="h-1.5 w-full" style={{ background: fill(tone) }} />

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-4">
          <span
            className="mt-1 h-3 w-3 shrink-0 rounded-full"
            style={{ background: fill(tone) }}
          />
          <div className="min-w-0">
            <h2
              className="text-[16px] font-extrabold leading-tight"
              style={{ color: deep(tone) }}
            >
              {REASON_TITLE[pending.target] ?? `Why "${RECHECK_STATE_LABELS[pending.target]}"?`}
            </h2>
            <p className="mt-0.5 truncate text-[12.5px] font-semibold text-ink-soft">
              {pending.label}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 pb-1 pt-3">
          <NotesField
            id="feas-reason"
            rows={3}
            placeholder={REASON_PLACEHOLDER[pending.target] ?? "Reason"}
            value={pending.reason}
            onChange={onReason}
          />
          {required && (
            <p className="mt-1.5 text-[11px] font-semibold text-ink-subtle">
              A reason is required to set{" "}
              <span style={{ color: deep(tone) }}>{RECHECK_STATE_LABELS[pending.target]}</span>.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-pill border border-[#dcdce8] bg-white px-4 text-[13px] font-bold text-ink-soft transition hover:border-ink-subtle"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={blocked}
            className="inline-flex h-10 items-center rounded-pill px-5 text-[13px] font-extrabold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
            style={{ background: fill(tone) }}
          >
            Set {RECHECK_STATE_LABELS[pending.target]}
          </button>
        </div>
      </div>
    </div>
  );
}
