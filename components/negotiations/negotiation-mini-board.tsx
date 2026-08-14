"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  NEGOTIATION_STAGE_BUCKETS,
  NEGOTIATION_STATUS_COLORS,
  NEGOTIATION_STATUS_LABELS,
} from "@/db/enums";
import type { NegotiationBoardCard } from "@/lib/queries/negotiation-board";
import { daysSince } from "@/lib/negotiations/ageing";
import { NEGOTIATION_CLOSED_STATUSES } from "@/lib/negotiations/buckets";
import { MoveDialog, type BoardColumn } from "@/components/negotiations/move-dialog";
import { cn } from "@/lib/utils";

/**
 * The sidebar kanban — "a separate kanban on left side below all these options
 * for free movement swiftly" (Hetesh, 2026-08-13).
 *
 * The full board at /negotiations/board is where you THINK about the pipeline.
 * This is where you MOVE things while you are doing something else: you are
 * reading the register, you remember the customer called, you drag the deal one
 * lane down without losing the page you were on.
 *
 * That difference drives every decision here. A 250px rail cannot hold cards, so
 * a deal becomes a chip — SM number and value, nothing else — and the columns
 * turn on their side into LANES, because vertical stacking is the only shape
 * that survives the width. What it keeps from the big board is the part that
 * matters: the same drop → same dialog → same compulsory remark. Nothing moves
 * here more cheaply than it moves there.
 *
 * Empty lanes still render at full height. A board you cannot drop a deal INTO
 * because nothing is there yet would be broken exactly when you need it — the
 * first Won of the month.
 */

const CLOSED: ReadonlySet<string> = new Set(NEGOTIATION_CLOSED_STATUSES);

const LANE = (s: string) => `lane:${s}`;
const CHIP = (id: string) => `chip:${id}`;
const parseLane = (id: string) => (id.startsWith("lane:") ? id.slice(5) : null);
const parseChip = (id: string) => (id.startsWith("chip:") ? id.slice(5) : null);

/** ₹ short enough for a chip — a full rupee figure does not fit beside a name. */
function shortInr(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}

export function NegotiationMiniBoard({ cards }: { cards: NegotiationBoardCard[] }) {
  const router = useRouter();
  const [now] = React.useState(() => Date.now());
  const sensors = useSensors(
    // A shorter drag threshold than the full board: the lanes are close
    // together, so a long "commit" distance would feel sticky.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overLane, setOverLane] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<{
    card: NegotiationBoardCard;
    target: BoardColumn;
  } | null>(null);

  const byStatus = React.useMemo(() => {
    const map = new Map<string, NegotiationBoardCard[]>();
    for (const s of NEGOTIATION_STAGE_BUCKETS) map.set(s, []);
    for (const c of cards) {
      // Same rule as the full board: a deal on a retired status has no lane of
      // its own, and dropping it out of the list entirely would hide it.
      (map.get(c.negotiationStatus) ?? map.get("to_start"))?.push(c);
    }
    return map;
  }, [cards]);

  const activeCard = activeId ? (cards.find((c) => c.id === activeId) ?? null) : null;

  function laneUnder(overId: string | null): string | null {
    if (!overId) return null;
    const lane = parseLane(overId);
    if (lane) return lane;
    const hostId = parseChip(overId);
    return cards.find((c) => c.id === hostId)?.negotiationStatus ?? null;
  }

  function handleEnd(e: DragEndEvent) {
    const id = parseChip(String(e.active.id));
    const target = laneUnder(e.over ? String(e.over.id) : null);
    setActiveId(null);
    setOverLane(null);
    if (!id || !target) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.negotiationStatus === target) return;
    setPending({ card, target: target as BoardColumn });
  }

  if (cards.length === 0) return null;

  return (
    <section aria-label="Negotiation board" className="w-full">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#9aa0ab]">
          Move a deal
        </p>
        <Link
          href={"/negotiations/board" as Route}
          className="inline-flex items-center gap-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#6b7280] hover:text-[#3f3f94]"
        >
          Full board
          <ArrowUpRight size={11} strokeWidth={2.6} />
        </Link>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e: DragStartEvent) => setActiveId(parseChip(String(e.active.id)))}
        onDragOver={(e: DragOverEvent) =>
          setOverLane(laneUnder(e.over ? String(e.over.id) : null))
        }
        onDragEnd={handleEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOverLane(null);
        }}
      >
        {/* One bounded scroller rather than a scrollbar per lane: seven tiny
            scroll areas in a 250px rail is unusable, and a lane that clips its
            own contents hides deals. */}
        <div className="flex max-h-[420px] flex-col gap-1 overflow-y-auto rounded-xl border border-[#e5e7eb] bg-[#fbfbfd] p-1.5">
          {NEGOTIATION_STAGE_BUCKETS.map((status) => (
            <Lane
              key={status}
              status={status}
              cards={byStatus.get(status) ?? []}
              isOver={overLane === status}
              dragging={activeId !== null}
              now={now}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeCard ? <Chip card={activeCard} now={now} floating /> : null}
        </DragOverlay>
      </DndContext>

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
    </section>
  );
}

function Lane({
  status,
  cards,
  isOver,
  dragging,
  now,
}: {
  status: BoardColumn;
  cards: NegotiationBoardCard[];
  isOver: boolean;
  dragging: boolean;
  now: number;
}) {
  const { setNodeRef } = useDroppable({ id: LANE(status) });
  const tone = NEGOTIATION_STATUS_COLORS[status];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border-[1.5px] px-1.5 py-1 transition-colors",
        isOver
          ? "border-[#3f3f94] bg-[#eeeefb]"
          : // While a drag is live, every lane shows its edge — you should be
            // able to see where a deal CAN go without hunting for it.
            dragging
            ? "border-dashed border-[#c7c9d6] bg-white"
            : "border-transparent",
      )}
    >
      <div className="flex items-center gap-1.5 px-0.5 py-0.5">
        <span
          aria-hidden
          className="h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ background: `var(--color-${tone}-deep)` }}
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-[#3a4152]">
          {NEGOTIATION_STATUS_LABELS[status]}
        </span>
        <span className="shrink-0 tabular-nums text-[11px] font-black text-[#9aa0ab]">
          {cards.length}
        </span>
      </div>

      <div className="flex flex-col gap-1 pt-0.5">
        {cards.length === 0 ? (
          // Keeps the lane a target with a real height when it is empty.
          <div className="h-[22px] rounded-md" />
        ) : (
          cards.map((c) => <DraggableChip key={c.id} card={c} now={now} />)
        )}
      </div>
    </div>
  );
}

function DraggableChip({ card, now }: { card: NegotiationBoardCard; now: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: CHIP(card.id),
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("cursor-grab touch-none active:cursor-grabbing", isDragging && "opacity-35")}
    >
      <Chip card={card} now={now} />
    </div>
  );
}

function Chip({
  card,
  now,
  floating,
}: {
  card: NegotiationBoardCard;
  now: number;
  /** Rendered in the drag overlay — lifted off the rail. */
  floating?: boolean;
}) {
  const value = shortInr(card.quotedValue);
  // Only the two states worth interrupting a scan for: quiet a long time, and
  // quiet a very long time. Anything finer would be noise at this size.
  const age = CLOSED.has(card.negotiationStatus)
    ? 0
    : daysSince(card.lastActivityAt, new Date(now));
  const cold = age >= 60 ? "#e11d48" : age >= 15 ? "#d97706" : null;

  return (
    <div
      title={`${card.smNumber ?? card.negotiationNo}${card.companyName ? ` · ${card.companyName}` : ""}${age >= 15 ? ` · ${age} days untouched` : ""}`}
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-[#e5e7eb] bg-white px-1.5 py-[5px]",
        floating && "shadow-[0_10px_24px_rgba(15,23,42,0.22)]",
      )}
      style={cold ? { borderLeft: `3px solid ${cold}` } : undefined}
    >
      <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-[#3a4152]">
        {card.smNumber ?? card.negotiationNo}
      </span>
      {value && (
        <span className="shrink-0 tabular-nums text-[11px] font-black text-[#6b7280]">
          ₹{value}
        </span>
      )}
    </div>
  );
}
