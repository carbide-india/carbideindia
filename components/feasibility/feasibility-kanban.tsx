"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Loader2 } from "lucide-react";
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
  FEASIBILITY_STATUS_LABELS,
  FEASIBILITY_STATUS_COLORS,
  INQUIRY_PRIORITY_LABELS,
  type FeasibilityStatus,
} from "@/db/enums";
import { setFeasibilityStatus } from "@/app/(app)/feasibility/actions";
import { fireToast } from "@/lib/toast";
import { Chip, PRIORITY_TONES } from "@/components/inquiries/chip";
import { cn } from "@/lib/utils";
import type { FeasibilityQueueItem } from "@/lib/queries/feasibility";

/** The 5 pipeline columns (the client's status set). */
const COLUMNS: FeasibilityStatus[] = [
  "not_started",
  "need_info",
  "not_feasible",
  "pending_approval",
  "proceed_to_costing",
];

/**
 * Primary-Feasibility Kanban — drag a review card between the five status
 * columns to change its feasibility status (setFeasibilityStatus). Built on
 * dnd-kit with an optimistic move + a floating drag preview. The "Not Started"
 * column also holds any In-Review rows so nothing disappears from the board.
 */
export function FeasibilityKanban({ rows }: { rows: FeasibilityQueueItem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(rows);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<string | null>(null);

  React.useEffect(() => setItems(rows), [rows]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const bucket = React.useCallback(
    (col: FeasibilityStatus) =>
      items.filter((r) =>
        col === "not_started"
          ? r.status === "not_started" || r.status === "in_review"
          : r.status === col,
      ),
    [items],
  );

  async function moveTo(id: string, status: FeasibilityStatus) {
    const it = items.find((r) => r.id === id);
    if (!it || it.status === status) return;
    const prev = items;
    setItems((cur) => cur.map((r) => (r.id === id ? { ...r, status } : r)));
    setSavingId(id);
    const res = await setFeasibilityStatus(id, status);
    setSavingId(null);
    if (!res.ok) {
      setItems(prev);
      fireToast({ type: "error", message: res.error });
    } else {
      fireToast({ message: `Moved to ${FEASIBILITY_STATUS_LABELS[status]}.` });
      router.refresh();
    }
  }

  const activeCard = activeId ? items.find((r) => r.id === activeId) ?? null : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragOver={(e: DragOverEvent) => setOverCol(e.over ? String(e.over.id) : null)}
      onDragEnd={(e: DragEndEvent) => {
        const id = activeId;
        setActiveId(null);
        setOverCol(null);
        if (e.over && id) void moveTo(id, String(e.over.id) as FeasibilityStatus);
      }}
      onDragCancel={() => {
        setActiveId(null);
        setOverCol(null);
      }}
    >
      <div
        className="flex items-stretch gap-4 overflow-x-auto pb-3"
        style={{ maxHeight: "calc(100dvh - 210px)", minHeight: 460 }}
      >
        {COLUMNS.map((col) => {
          const colRows = bucket(col);
          return (
            <KanbanCol key={col} col={col} count={colRows.length} isOver={overCol === col}>
              {colRows.length === 0 ? (
                <p className="px-2 py-6 text-center text-[13px] text-ink-subtle">Nothing here.</p>
              ) : (
                colRows.map((r) => <KanbanCard key={r.id} r={r} saving={savingId === r.id} />)
              )}
            </KanbanCol>
          );
        })}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2,0.7,0.3,1)" }}>
        {activeCard ? <CardInner r={activeCard} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanCol({
  col,
  count,
  isOver,
  children,
}: {
  col: FeasibilityStatus;
  count: number;
  isOver: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: col });
  const tone = FEASIBILITY_STATUS_COLORS[col];
  return (
    <div
      ref={setNodeRef}
      className="w-[300px] shrink-0 rounded-section p-3.5 transition-colors"
      style={{
        background: isOver ? `var(--color-${tone}-bg)` : "var(--color-surface-soft)",
        border: `1px solid ${isOver ? `var(--color-${tone})` : "var(--color-hairline)"}`,
        boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -18px rgba(15,23,42,0.2)",
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[14px] font-bold" style={{ color: `var(--color-${tone}-deep)` }}>
          <span className="h-3 w-3 rounded-full" style={{ background: `var(--color-${tone})` }} />
          {FEASIBILITY_STATUS_LABELS[col]}
        </span>
        <span className="text-[13px] font-bold tabular-nums text-ink-subtle">{count}</span>
      </div>
      <div className="flex flex-col gap-2 min-h-[40px]">{children}</div>
    </div>
  );
}

function KanbanCard({ r, saving }: { r: FeasibilityQueueItem; saving: boolean }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: r.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
      style={{ opacity: isDragging ? 0.4 : 1, touchAction: "manipulation" }}
    >
      <CardInner r={r} saving={saving} />
    </div>
  );
}

function CardInner({
  r,
  saving,
  dragging,
}: {
  r: FeasibilityQueueItem;
  saving?: boolean;
  dragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-chip border bg-white p-3 transition-all",
        dragging ? "w-[280px] rotate-2 border-brand/40 shadow-2xl" : "border-hairline hover:-translate-y-0.5 hover:shadow-md",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/feasibility/${r.id}` as Route}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-[13px] font-bold text-[#3f3f94] hover:underline"
        >
          {r.smNumber}
        </Link>
        <Chip label={INQUIRY_PRIORITY_LABELS[r.priority]} tone={PRIORITY_TONES[r.priority]} />
      </div>
      <div className="mt-1.5 truncate text-[13.5px] font-bold text-ink-strong">{r.companyName}</div>
      <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-subtle">
        <span className="font-semibold tabular-nums">{r.checksDone}/{r.checksTotal} checks</span>
        {r.checkedByName && <span className="truncate">· {r.checkedByName}</span>}
        {saving && <Loader2 size={12} className="ml-auto animate-spin text-ink-subtle" />}
      </div>
    </div>
  );
}
