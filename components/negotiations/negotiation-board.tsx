"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
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
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowUpRight, GripVertical, MessageSquare } from "lucide-react";
import {
  LOST_REASON_LABELS,
  NEGOTIATION_STAGE_BUCKETS,
  NEGOTIATION_STATUS_COLORS,
  NEGOTIATION_STATUS_LABELS,
  type LostReason,
  type NegotiationStatus,
} from "@/db/enums";
import { NEGOTIATION_CLOSED_STATUSES } from "@/lib/negotiations/buckets";
import { daysSince } from "@/lib/negotiations/ageing";
import type { NegotiationBoardCard } from "@/lib/queries/negotiation-board";
import { MoveDialog, type BoardColumn } from "@/components/negotiations/move-dialog";
import { NegotiationThreadPanel } from "@/components/negotiations/negotiation-thread";
import { cn } from "@/lib/utils";

/**
 * The Negotiation board.
 *
 * The design question here was not "how do I draw seven columns" — it was what
 * a salesperson actually comes to this screen to find out. That is not "how many
 * deals are in Follow Up"; it is "which money is going cold". So two things
 * carry the weight:
 *
 *   · every column header states the RUPEES on the table, not just a count —
 *     four small deals and one large one are not the same column;
 *   · a card visibly COOLS as it sits untouched. Fresh cards are white; past 15
 *     days they take an amber edge, past 60 a rose one, and the age is spelled
 *     out. The ageing views Manan asked for are the same computation, so the
 *     board and the sidebar can never disagree about what is stale.
 *
 * Everything else is deliberately quiet: hairlines, tabular numerals, and the
 * status tones the rest of the app already uses. One loud idea, disciplined
 * surroundings.
 *
 * The three closed columns (Won / Lost / Abandoned) never age — a finished deal
 * needs no chasing, and colouring them would bury the live ones.
 */

const CLOSED = new Set<string>(NEGOTIATION_CLOSED_STATUSES);

/** Rupees, in the units Indian sales actually speak: lakh and crore. */
function inr(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** The ageing ramp — the board's one loud idea, in existing tone tokens. */
type Heat = "fresh" | "warm" | "hot" | "cold";
function heatOf(status: NegotiationStatus, lastActivityAt: Date, now: number): Heat {
  if (CLOSED.has(status)) return "cold";
  const age = daysSince(lastActivityAt, new Date(now));
  if (age >= 60) return "hot";
  if (age >= 15) return "warm";
  return "fresh";
}

const HEAT_EDGE: Record<Heat, string> = {
  fresh: "var(--color-slate, #cbd5e1)",
  warm: "var(--color-amber, #f59e0b)",
  hot: "var(--color-rose, #f43f5e)",
  cold: "var(--color-stone, #d6d3d1)",
};

/** The seven board columns. Narrower than NegotiationStatus on purpose: a deal
 *  can HOLD a legacy status (verbal_yes, on_hold) but can only be MOVED to a
 *  column, and the action's schema enforces the same set. */

const COL = (s: string) => `col:${s}`;
const CARD = (id: string) => `card:${id}`;
const parseCol = (id: string) => (id.startsWith("col:") ? id.slice(4) : null);
const parseCard = (id: string) => (id.startsWith("card:") ? id.slice(5) : null);

type Pending = { card: NegotiationBoardCard; target: BoardColumn };

export function NegotiationBoard({ cards }: { cards: NegotiationBoardCard[] }) {
  const router = useRouter();
  // Frozen at mount so every card ages against the same instant — otherwise two
  // cards rendered a tick apart could disagree about the day.
  const [now] = React.useState(() => Date.now());
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Pending | null>(null);
  // Which deal's remark thread is open. Held on the BOARD, not the card, so the
  // panel survives the card re-rendering under it after a refresh.
  const [threadFor, setThreadFor] = React.useState<NegotiationBoardCard | null>(null);

  const byStatus = React.useMemo(() => {
    const map = new Map<string, NegotiationBoardCard[]>();
    for (const s of NEGOTIATION_STAGE_BUCKETS) map.set(s, []);
    for (const c of cards) {
      // A deal on a status that is not a column (verbal_yes, on_hold, the
      // approval values) still has to appear somewhere, or it silently vanishes
      // from the board. Not Started is the honest home for it.
      (map.get(c.negotiationStatus) ?? map.get("to_start"))?.push(c);
    }
    return map;
  }, [cards]);

  const activeCard = activeId ? cards.find((c) => c.id === activeId) ?? null : null;

  function handleEnd(e: DragEndEvent) {
    const id = parseCard(String(e.active.id));
    const overId = e.over ? String(e.over.id) : null;
    setActiveId(null);
    setOverCol(null);
    if (!id || !overId) return;

    let target = parseCol(overId);
    if (!target) {
      const hostId = parseCard(overId);
      target = cards.find((c) => c.id === hostId)?.negotiationStatus ?? null;
    }
    if (!target) return;

    const card = cards.find((c) => c.id === id);
    if (!card || card.negotiationStatus === target) return;
    // Every move demands a remark, so a drop opens the dialog rather than
    // writing straight through.
    setPending({ card, target: target as BoardColumn });
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e: DragStartEvent) => setActiveId(parseCard(String(e.active.id)))}
        onDragOver={(e: DragOverEvent) => {
          const overId = e.over ? String(e.over.id) : null;
          if (!overId) return setOverCol(null);
          const col = parseCol(overId);
          if (col) return setOverCol(col);
          const hostId = parseCard(overId);
          setOverCol(cards.find((c) => c.id === hostId)?.negotiationStatus ?? null);
        }}
        onDragEnd={handleEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOverCol(null);
        }}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {NEGOTIATION_STAGE_BUCKETS.map((status) => (
            <Column
              key={status}
              status={status}
              cards={byStatus.get(status) ?? []}
              isOver={overCol === status}
              draggingId={activeId}
              now={now}
              onOpenThread={setThreadFor}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeCard ? <Card card={activeCard} now={now} floating /> : null}
        </DragOverlay>
      </DndContext>

      {threadFor && (
        <NegotiationThreadPanel
          negotiationId={threadFor.id}
          title={threadFor.smNumber ?? threadFor.negotiationNo}
          subtitle={threadFor.companyName}
          onClose={() => setThreadFor(null)}
        />
      )}

      {pending && (
        <MoveDialog
          card={pending.card}
          target={pending.target}
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
  cards,
  isOver,
  draggingId,
  now,
  onOpenThread,
}: {
  status: BoardColumn;
  cards: NegotiationBoardCard[];
  isOver: boolean;
  draggingId: string | null;
  now: number;
  onOpenThread: (card: NegotiationBoardCard) => void;
}) {
  const { setNodeRef } = useDroppable({ id: COL(status) });
  const tone = NEGOTIATION_STATUS_COLORS[status];
  const value = cards.reduce((n, c) => n + c.quotedValue, 0);
  const closed = CLOSED.has(status);

  return (
    <section
      ref={setNodeRef}
      aria-label={NEGOTIATION_STATUS_LABELS[status]}
      className={cn(
        "flex w-[268px] shrink-0 flex-col rounded-2xl border bg-[#fbfbfd] transition-shadow",
        isOver ? "border-[#3f3f94] shadow-[0_10px_28px_rgba(63,63,148,0.18)]" : "border-hairline",
      )}
    >
      <header
        className="rounded-t-2xl border-b border-hairline px-3 py-2.5"
        style={{ background: `var(--color-${tone}-bg, #f4f5fa)` }}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: `var(--color-${tone})` }}
          />
          <h3
            className="min-w-0 flex-1 truncate text-[12.5px] font-black tracking-tight"
            style={{ color: `var(--color-${tone}-deep)` }}
          >
            {NEGOTIATION_STATUS_LABELS[status]}
          </h3>
          <span
            className="tabular-nums text-[12px] font-black"
            style={{ color: `var(--color-${tone}-deep)` }}
          >
            {cards.length}
          </span>
        </div>
        {/* The number that matters: four small deals and one large one are not
            the same column. */}
        <p
          className="mt-0.5 font-mono text-[13px] font-black tabular-nums"
          style={{ color: `var(--color-${tone}-deep)`, opacity: 0.85 }}
        >
          {inr(value)}
        </p>
      </header>

      <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
        {cards.length === 0 ? (
          <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-hairline px-2 py-6 text-center text-[11.5px] font-semibold text-ink-subtle">
            {closed ? "Nothing here" : "Drop a deal here"}
          </p>
        ) : (
          cards.map((c) => (
            <DraggableCard
              key={c.id}
              card={c}
              dimmed={draggingId === c.id}
              now={now}
              onOpenThread={onOpenThread}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DraggableCard({
  card,
  dimmed,
  now,
  onOpenThread,
}: {
  card: NegotiationBoardCard;
  dimmed: boolean;
  now: number;
  onOpenThread: (card: NegotiationBoardCard) => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: CARD(card.id) });
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(dimmed && "opacity-35")}
      {...attributes}
      {...listeners}
    >
      <Card card={card} now={now} onOpenThread={onOpenThread} />
    </div>
  );
}

function Card({
  card,
  now,
  floating,
  onOpenThread,
}: {
  card: NegotiationBoardCard;
  now: number;
  floating?: boolean;
  /** Absent in the drag overlay, where nothing is clickable. */
  onOpenThread?: (card: NegotiationBoardCard) => void;
}) {
  const heat = heatOf(card.negotiationStatus, card.lastActivityAt, now);
  const age = daysSince(card.lastActivityAt, new Date(now));

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-white pl-3 pr-2.5 py-2.5 transition-shadow",
        floating ? "shadow-[0_16px_40px_rgba(15,23,42,0.24)]" : "hover:shadow-md",
        heat === "cold" ? "border-hairline opacity-75" : "border-hairline",
      )}
    >
      {/* The heat edge — the board's signature. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: HEAT_EDGE[heat] }}
      />

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[12px] font-black tabular-nums text-[#3f3f94]">
              {card.smNumber ?? card.negotiationNo}
            </span>
            {heat !== "fresh" && heat !== "cold" && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-wide"
                style={{
                  background: heat === "hot" ? "var(--color-rose-bg)" : "var(--color-amber-bg)",
                  color: heat === "hot" ? "var(--color-rose-deep)" : "var(--color-amber-deep)",
                }}
              >
                {age}d cold
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[13px] font-bold text-ink-strong">
            {card.companyName ?? "—"}
          </p>
        </div>
        <GripVertical
          size={14}
          className="mt-0.5 shrink-0 cursor-grab text-[#c6cbdd] opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>

      <p className="mt-1.5 font-mono text-[15px] font-black tabular-nums text-ink-strong">
        {inr(card.quotedValue)}
      </p>

      {card.lostReason && (
        <p className="mt-1 text-[11px] font-bold text-[#be123c]">
          {LOST_REASON_LABELS[card.lostReason]}
        </p>
      )}

      {card.latestRemark && (
        <p className="mt-1.5 line-clamp-2 border-l-2 border-hairline pl-2 text-[11.5px] leading-snug text-ink-soft">
          {card.latestRemark}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] font-semibold text-ink-subtle">
        {floating || !onOpenThread ? (
          <span className="inline-flex items-center gap-1">
            <MessageSquare size={11} strokeWidth={2.4} />
            {card.remarkCount}
          </span>
        ) : (
          <button
            type="button"
            // stopPropagation on pointerdown, or the drag sensor claims the
            // press and the click never lands.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenThread(card);
            }}
            title="Read the remark thread"
            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-bold transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
          >
            <MessageSquare size={11} strokeWidth={2.4} />
            {card.remarkCount}
          </button>
        )}
        <span className="truncate">{card.salesPersonName ?? "Unassigned"}</span>
        {!floating && (
          <Link
            href={`/negotiations/${card.id}` as Route}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="shrink-0 text-[#3f3f94] opacity-0 transition-opacity group-hover:opacity-100"
            aria-label={`Open ${card.negotiationNo}`}
          >
            <ArrowUpRight size={13} strokeWidth={2.6} />
          </Link>
        )}
      </div>
    </article>
  );
}
