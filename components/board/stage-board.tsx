"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowUpRight, Loader2, Lock } from "lucide-react";
import { moveOnBoard } from "@/app/(app)/board-actions";
import type { BoardCard, BoardModule } from "@/lib/board/registry";
import { fireToast } from "@/lib/toast";

/**
 * The stage board — one Kanban serving every pipeline stage.
 *
 * The columns are the stage's OWN status buckets, handed in by the caller from
 * `lib/board/registry`, which is the same array its sidebar counts. So a board
 * can never show a column the sidebar doesn't, or miss one it does.
 *
 * Two rules are enforced here rather than left to each stage:
 *
 *   · A move demands a reason. Dropping a card opens a remark box and nothing
 *     is written until it is filled — the status change and the remark are one
 *     transaction server-side. A board that let you move work silently would
 *     record where everything is and never why it got there.
 *   · Cards cool as they sit. Past 15 days untouched a card takes an amber
 *     edge, past 60 a rose one, with the age spelled out. Borrowed from the
 *     Negotiation board, because "which work is going stale" is the question
 *     every stage is asked in a review, not just deals.
 *
 * Approval columns are still gated server-side (`approvalRefusal`): a non-approver
 * can drag a card there, and the move comes back refused with the reason. The
 * gate lives in one place and the board does not get to reimplement it.
 */

const CARD = (id: string) => `card:${id}`;
const COL = (s: string) => `col:${s}`;
const parseCol = (id: string) => (id.startsWith("col:") ? id.slice(4) : null);
const parseCard = (id: string) => (id.startsWith("card:") ? id.slice(5) : null);

/** Days since a card last moved — null when never stamped. */
function ageDays(updatedAt: string | null): number | null {
  if (!updatedAt) return null;
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function ageTone(days: number | null): { border: string; label: string } | null {
  if (days == null) return null;
  if (days >= 60) return { border: "#f0c2c8", label: `${days}d` };
  if (days >= 15) return { border: "#f0d3a4", label: `${days}d` };
  return null;
}

export function StageBoard({
  module,
  cards,
  buckets,
  labels,
  tones,
  unit,
}: {
  module: BoardModule;
  cards: BoardCard[];
  buckets: readonly string[];
  labels: Record<string, string>;
  tones: Record<string, string>;
  unit: string;
}) {
  const router = useRouter();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // The pending move, held while the reason is typed. Nothing is sent until
  // the remark clears validation.
  const [pending, setPending] = React.useState<{
    card: BoardCard;
    to: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const byBucket = React.useMemo(() => {
    const m = new Map<string, BoardCard[]>();
    for (const b of buckets) m.set(b, []);
    for (const c of cards) {
      // A card whose status is not a column on this board (a legacy value)
      // would otherwise vanish; park it in the first column so it is visible
      // and can be dragged somewhere real.
      const key = m.has(c.bucket) ? c.bucket : (buckets[0] ?? c.bucket);
      m.get(key)?.push(c);
    }
    return m;
  }, [cards, buckets]);

  function handleEnd(e: DragEndEvent) {
    setActiveId(null);
    const cardId = parseCard(String(e.active.id));
    const to = e.over ? parseCol(String(e.over.id)) : null;
    if (!cardId || !to) return;
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.bucket === to) return;
    if (card.lockedReason) {
      fireToast({ type: "error", message: card.lockedReason });
      return;
    }
    setPending({ card, to });
  }

  const active = activeId ? cards.find((c) => c.id === activeId) ?? null : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setActiveId(parseCard(String(e.active.id)))}
        onDragEnd={handleEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-3">
          {buckets.map((b) => (
            <Column
              key={b}
              status={b}
              label={labels[b] ?? b}
              tone={tones[b] ?? "slate"}
              cards={byBucket.get(b) ?? []}
              unit={unit}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {active ? <CardFace card={active} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {pending && (
        <MoveDialog
          module={module}
          card={pending.card}
          to={pending.to}
          toLabel={labels[pending.to] ?? pending.to}
          onClose={() => setPending(null)}
          onDone={() => {
            setPending(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Column({
  status,
  label,
  tone,
  cards,
  unit,
}: {
  status: string;
  label: string;
  tone: string;
  cards: BoardCard[];
  unit: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: COL(status) });
  return (
    <section
      ref={setNodeRef}
      className="flex w-[248px] shrink-0 flex-col rounded-xl border transition-colors"
      style={{
        borderColor: isOver ? `var(--color-${tone})` : "var(--color-hairline)",
        background: isOver
          ? `color-mix(in srgb, var(--color-${tone}) 7%, var(--color-surface-soft))`
          : "var(--color-surface-soft)",
      }}
    >
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <span
          className="h-3 w-1.5 shrink-0 rounded-full"
          style={{ background: `var(--color-${tone})` }}
        />
        <span className="min-w-0 flex-1 truncate text-[12px] font-black uppercase tracking-[0.08em] text-ink-soft">
          {label}
        </span>
        <span className="shrink-0 text-[12px] font-black tabular-nums text-ink-subtle">
          {cards.length}
        </span>
      </header>

      <div className="flex min-h-[80px] flex-col gap-2 p-2">
        {cards.length === 0 ? (
          <p className="px-1 py-3 text-center text-[12px] text-ink-subtle">
            No {unit}s here
          </p>
        ) : (
          cards.map((c) => <DraggableCard key={c.id} card={c} />)
        )}
      </div>
    </section>
  );
}

function DraggableCard({ card }: { card: BoardCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: CARD(card.id),
    disabled: Boolean(card.lockedReason),
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.35 : 1,
      }}
      className={card.lockedReason ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}
    >
      <CardFace card={card} />
    </div>
  );
}

function CardFace({ card, dragging }: { card: BoardCard; dragging?: boolean }) {
  const age = ageDays(card.updatedAt);
  const tone = ageTone(age);
  return (
    <article
      className="rounded-lg border bg-surface-card px-2.5 py-2"
      style={{
        borderColor: tone?.border ?? "var(--color-hairline)",
        boxShadow: dragging
          ? "0 12px 28px -10px rgba(15,23,42,0.35)"
          : "0 1px 2px rgba(15,23,42,0.05)",
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-strong"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {card.title}
        </span>
        {card.lockedReason ? (
          <Lock size={12} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
        ) : (
          <Link
            href={card.href as Route}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Open ${card.title}`}
            className="shrink-0 text-ink-subtle transition-colors hover:text-brand"
          >
            <ArrowUpRight size={13} strokeWidth={2.4} />
          </Link>
        )}
      </div>
      {card.subtitle && (
        <p className="mt-0.5 truncate text-[12px] font-semibold text-ink-soft">
          {card.subtitle}
        </p>
      )}
      <div className="mt-1 flex items-center gap-2">
        {card.meta && (
          <span className="min-w-0 flex-1 truncate text-[11.5px] tabular-nums text-ink-muted">
            {card.meta}
          </span>
        )}
        {tone && (
          <span
            className="ml-auto shrink-0 rounded-pill px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums"
            style={{ background: `${tone.border}55`, color: "#7a4a08" }}
            title={`Untouched for ${age} days`}
          >
            {tone.label}
          </span>
        )}
      </div>
    </article>
  );
}

/** The reason box. A move is not sent until this is filled. */
function MoveDialog({
  module,
  card,
  to,
  toLabel,
  onClose,
  onDone,
}: {
  module: BoardModule;
  card: BoardCard;
  to: string;
  toLabel: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [remark, setRemark] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => ref.current?.focus(), []);

  async function submit() {
    if (remark.trim().length < 3) {
      setError("Say why this moved — a remark is required on every move.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await moveOnBoard({ module, id: card.id, toStatus: to, remark });
    setBusy(false);
    if (res.ok) {
      fireToast({ message: `${card.title} moved to ${toLabel}.` });
      onDone();
    } else {
      setError(res.error);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-[rgba(15,23,42,0.45)] p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="w-full max-w-[440px] rounded-section border border-hairline bg-surface-card p-5 shadow-2xl">
        <h2 className="text-[16px] font-black tracking-tight text-ink-strong">
          Move to {toLabel}
        </h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          <span className="font-semibold text-ink-soft">{card.title}</span>
          {card.subtitle ? ` · ${card.subtitle}` : ""}
        </p>

        <label
          htmlFor="board-remark"
          className="mt-4 block text-[12px] font-bold uppercase tracking-[0.08em] text-ink-subtle"
        >
          Why is it moving?
        </label>
        <textarea
          id="board-remark"
          ref={ref}
          rows={3}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          placeholder="e.g. Customer confirmed the revised rate on call"
          className="nt-input mt-1.5 w-full"
        />

        {error && (
          <p className="mt-2 text-[13px] font-semibold" style={{ color: "var(--color-red-deep)" }}>
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-pill border border-hairline px-4 py-2 text-[13px] font-bold text-ink-soft transition-colors hover:text-ink-strong disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-extrabold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, rgb(63,63,148), rgb(47,47,111))" }}
          >
            {busy && <Loader2 size={13} style={{ animation: "spinFast 0.8s linear infinite" }} />}
            Move card
          </button>
        </div>
      </div>
    </div>
  );
}
