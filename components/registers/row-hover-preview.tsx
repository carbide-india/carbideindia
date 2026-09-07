"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * Row hover-preview, shared by the hand-rolled registers (Client Master, Sample
 * Register) so they behave like the RegisterDataTable ones: hover a row for a
 * moment → a card of the row's key fields pops up near the cursor, portalled to
 * the body so the table's scroll container never clips it.
 */
export function useRowHoverPreview<T>() {
  const [preview, setPreview] = React.useState<{ row: T; x: number; y: number } | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const onRowEnter = React.useCallback((row: T, e: React.MouseEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPreview({ row, x, y }), 400);
  }, []);
  const onRowLeave = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPreview(null);
  }, []);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { preview, onRowEnter, onRowLeave };
}

export interface PreviewField {
  label: string;
  value: React.ReactNode;
}

export function RowHoverCard({
  x,
  y,
  fields,
}: {
  x: number;
  y: number;
  fields: PreviewField[];
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="pointer-events-none fixed z-[60] max-h-[72vh] w-[320px] overflow-hidden rounded-xl border border-[#e4e5ef] bg-white p-3.5 shadow-[0_20px_50px_-18px_rgba(15,23,42,0.4)]"
      style={{
        left: Math.min(x + 18, window.innerWidth - 336),
        top: Math.min(y + 12, Math.max(12, window.innerHeight - 360)),
      }}
    >
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8a8da6]">
        Quick preview
      </div>
      <div className="flex flex-col gap-1.5">
        {fields.map((f, i) => (
          <div key={i} className="flex items-start justify-between gap-3 text-[13px] leading-tight">
            <span className="shrink-0 text-[#8a8da6]">{f.label}</span>
            <span className="min-w-0 text-right font-semibold text-[#16172b]">{f.value}</span>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
