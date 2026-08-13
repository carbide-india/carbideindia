"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import type { NeonKey } from "./kpi-card";
import { KpiDetailPanel } from "./kpi-detail-panel";
import type { KpiSet, WmsSummary } from "@/lib/types";

interface Entry {
  key: keyof KpiSet;
  label: string;
  sublabel: string;
  neonKey: NeonKey;
  href: Route;
}

// One card per KPI, laid out 3 across × 2 down (the approved dashboard design).
// The first (Total) reads as the anchor; the rest follow in the operational
// reading order, so the top row is the summary and the bottom row is the states
// you act on.
const ITEMS: Entry[] = [
  { key: "total", label: "Total", sublabel: "All Tasks", neonKey: "total", href: "/tasks" },
  { key: "needHelp", label: "Need Info", sublabel: "Awaiting info", neonKey: "need-help", href: "/tasks?status=need_info" },
  { key: "notApproved", label: "Not Approved", sublabel: "Sent Back", neonKey: "not-approved", href: "/tasks?status=not_approved" },
  { key: "done", label: "Done", sublabel: "Done + Approved", neonKey: "done", href: "/tasks?status=done,approved" },
  { key: "pending", label: "Pending", sublabel: "In Progress", neonKey: "pending", href: "/tasks?status=initiated,follow_up" },
  { key: "notStarted", label: "Not Started", sublabel: "Awaiting Pickup", neonKey: "not-started", href: "/tasks?status=not_started" },
];

export function KpiStrip({ kpis, summary }: { kpis: KpiSet; summary: WmsSummary }) {
  const [expanded, setExpanded] = React.useState<keyof KpiSet | null>(null);
  const active = expanded ? ITEMS.find((i) => i.key === expanded) ?? null : null;

  return (
    // Layout-agnostic: the page owns the page gutter and decides where this
    // block sits, so the KPI grid can share a row with the analytics panels.
    <section aria-label="Task summary">
      <div
        className="grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-sm:grid-cols-1"
        role="list"
      >
        {ITEMS.map((item) => {
          const kpi = kpis[item.key];
          const delta = kpi.current - kpi.previous;
          const up = delta > 0;
          const flat = delta === 0;
          const arrow = up ? "▲" : flat ? "→" : "▼";
          const deltaColor = flat
            ? "var(--color-ink-subtle)"
            : up
              ? "var(--color-green-deep)"
              : "var(--color-red-deep)";
          const isOpen = expanded === item.key;
          const neon = `var(--kpi-neon-${item.neonKey})`;
          const neonDeep = `var(--kpi-neon-${item.neonKey}-deep)`;

          return (
            <div role="listitem" key={item.key}>
              {/* The whole card carries its channel colour as a tinted border —
                  the design's signature — rather than a top rail. */}
              <div
                className="group relative overflow-hidden rounded-2xl transition-all duration-200"
                style={{
                  background: "var(--color-surface-card)",
                  border: `1.5px solid rgb(${neon} / ${isOpen ? 1 : 0.55})`,
                  boxShadow: isOpen
                    ? `0 0 0 1px rgb(${neonDeep}), 0 12px 28px -16px rgb(${neon} / 0.6)`
                    : "0 1px 2px rgba(15,23,42,0.04)",
                }}
              >
                <div className="flex items-start justify-between gap-3 px-5 pt-4.5 pb-5">
                  {/* Card body toggles the detail panel; the View pill navigates. */}
                  <button
                    type="button"
                    onClick={() => setExpanded((cur) => (cur === item.key ? null : item.key))}
                    aria-expanded={isOpen}
                    aria-label={
                      isOpen ? `Collapse ${item.label} details` : `Expand ${item.label} details`
                    }
                    className="min-w-0 flex-1 text-left outline-none"
                  >
                    <span
                      className="block uppercase font-black tracking-[0.07em] leading-none"
                      style={{ fontSize: 12.5, color: `rgb(${neonDeep})` }}
                    >
                      {item.label}
                    </span>
                    <span
                      className="block tabular-nums leading-none mt-5 text-ink-strong"
                      style={{
                        fontFamily: "var(--font-display), system-ui, sans-serif",
                        fontWeight: 900,
                        fontSize: 46,
                        letterSpacing: "-0.03em",
                      }}
                    >
                      {kpi.current.toLocaleString()}
                    </span>
                    <span
                      className="mt-5 inline-flex items-center gap-1 tabular-nums font-extrabold"
                      style={{ fontSize: 12.5, color: deltaColor }}
                    >
                      {arrow} {Math.abs(delta)}
                      <span className="font-semibold opacity-60">vs last week</span>
                    </span>
                  </button>

                  <Link
                    href={item.href}
                    className="group/link inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 font-bold transition-colors"
                    style={{
                      fontSize: 11.5,
                      color: `rgb(${neonDeep})`,
                      borderColor: `rgb(${neon} / 0.55)`,
                      background: `color-mix(in srgb, rgb(${neon}) 8%, transparent)`,
                    }}
                    aria-label={`View ${item.label} tasks`}
                  >
                    View
                    <ArrowUpRight
                      size={12}
                      strokeWidth={3}
                      className="opacity-0 -translate-x-0.5 transition-all group-hover/link:opacity-100 group-hover/link:translate-x-0"
                    />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Single per-card detail panel - animates open via the 0fr→1fr grid trick. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: active ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {active && (
            <div className="pt-4">
              <KpiDetailPanel
                label={active.label}
                sublabel={active.sublabel}
                value={kpis[active.key].current}
                kpi={kpis[active.key]}
                summary={summary}
                neon={`var(--kpi-neon-${active.neonKey})`}
                neonDeep={`var(--kpi-neon-${active.neonKey}-deep)`}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
