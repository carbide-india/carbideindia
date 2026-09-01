"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Route } from "next";
import {
  HelpCircle,
  LifeBuoy,
  ArrowLeft,
  ChevronDown,
  Layers,
  Circle,
  GitCompareArrows,
  BadgeCheck,
  PanelLeftClose,
  PanelLeftOpen,
  KanbanSquare,
  LayoutGrid,
} from "lucide-react";
import { HubSearch } from "@/components/hub/hub-search";
import { ModuleBrand } from "@/components/layout/module-brand";
import { NotificationBell } from "@/components/notifications/notification-bell";
import {
  SECONDARY_FEASIBILITY_STAGE_BUCKETS,
  SECONDARY_FEASIBILITY_STATUS_LABELS,
} from "@/db/enums";
import { BUCKET_ICONS } from "@/components/feasibility/feasibility-module-shell";
import { cn } from "@/lib/utils";
import { ModuleStepButtons } from "@/components/layout/next-module-button";

/**
 * Secondary Feasibility module shell — its OWN chrome, separate from the Primary
 * Feasibility module (which no longer carries either destination below). Reached
 * from its own Forms launchpad card. Two top-level destinations:
 *   • Secondary Feasibility → /secondary-feasibility           (the line queue,
 *     with Pending / Done nested under it as `?status=<value>` filters)
 *   • Confirmed Feasibility → /secondary-feasibility/confirmed (the register —
 *     marking Secondary done IS what confirms a line, so it belongs here)
 */

interface StatusNav {
  label: string;
  status: string;
  Icon: typeof Circle;
}

/**
 * The Secondary queue's status filters — literally the SAME menu as Primary
 * ("ये सेम मेनू आएगा सेकेंडरी में"), built off the stage's own bucket array so
 * labels and order can never drift from the dashboard strip or the table pill.
 */
/** Where work still SITS. The approved bucket is NOT here: it is the stage's
 *  exit and lives at the end as "Confirmed Feasibility", outside the sequence.
 *  Spec Variance is likewise promoted out — it is a standing exception report,
 *  not a bucket of the queue. */
const SECONDARY_STATUS_NAV: StatusNav[] = SECONDARY_FEASIBILITY_STAGE_BUCKETS.filter(
  (b) => b !== "secondary_feasibility_approved",
).map((b) => ({
  label: SECONDARY_FEASIBILITY_STATUS_LABELS[b],
  status: b as string,
  Icon: BUCKET_ICONS[b as keyof typeof BUCKET_ICONS],
}));

function queueHrefFor(status: string): Route {
  if (status === "variance") return "/secondary-feasibility?variance=1" as Route;
  return (status ? `/secondary-feasibility?status=${status}` : "/secondary-feasibility") as Route;
}

export function SecondaryFeasibilityModuleShell({
  children,
  userMenu,
  counts,
}: {
  children: ReactNode;
  userMenu?: ReactNode;
  /**
   * Bucket -> count for the status filters, plus `all`. Supplied by the module
   * layout. The bucket STRIP that used to carry these numbers was the same list
   * twice over and has been dropped, so the sidebar is now the only place they
   * appear — omitting them would simply lose the information.
   */
  counts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // `?variance=1` is a view of the same queue, so it shares the nested-filter slot.
  const activeStatus =
    searchParams.get("variance") === "1" ? "variance" : (searchParams.get("status") ?? "");
  const onQueue = pathname === "/secondary-feasibility";
  const [collapsed, setCollapsed] = useState(false);
  // The nested status filters collapse into their parent like an accordion.
  // Default open so nothing that was visible before is hidden on first load.
  const [filtersOpen, setFiltersOpen] = useState(true);

  return (
    <div className="drafting-grid flex min-h-screen flex-col">
      {/* Top header */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#e2dfdc] bg-[#f4f0e8] px-4">
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
            aria-pressed={!collapsed}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#777985] transition hover:bg-[#e2dfdc] hover:text-[#454595] active:scale-90"
          >
            <span key={collapsed ? "collapsed" : "open"} className="animate-toggle-pop inline-flex">
              {collapsed ? <PanelLeftOpen className="h-[20px] w-[20px]" /> : <PanelLeftClose className="h-[20px] w-[20px]" />}
            </span>
          </button>
          {/* Brand lives in the sidebar masthead on the cream sheet — keep it in
              the header only when collapsed (the sidebar block is hidden then). */}
          {collapsed && <ModuleBrand collapsed={collapsed} />}
        </div>

        <HubSearch />

        <div className="flex shrink-0 items-center justify-end gap-2.5">
          <Link
            href={"/enquiries" as Route}
            className="group flex h-9 shrink-0 items-center gap-1.5 rounded-lg border-[1.5px] border-[#e2dfdc] bg-white px-3 text-[13px] font-bold text-[#454595] transition-colors hover:border-[#454595] hover:bg-[#f4f0e8] max-md:hidden"
            aria-label="Back to all forms"
          >
            <ArrowLeft className="h-[15px] w-[15px] transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={2.6} />
            Back to Forms
          </Link>
          <NotificationBell />
          <span title="Help - coming soon" className="grid h-9 w-9 cursor-default place-items-center rounded-full text-[#a8a8a8]">
            <HelpCircle className="h-[18px] w-[18px]" />
          </span>
          {userMenu}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1">
        <aside
          className={cn(
            "sticky top-[60px] h-[calc(100vh-60px)] shrink-0 overflow-hidden border-r border-[#e2dfdc] bg-[#f4f0e8] transition-[width] duration-300 ease-in-out",
            collapsed ? "w-[72px]" : "w-[248px]",
          )}
        >
          <div className={cn("relative flex h-full flex-col py-3", collapsed ? "w-[72px] items-center px-2" : "w-[248px] px-4")}>
            {/* Cream-sheet brand block: logo + module name + tagline masthead. */}
            {!collapsed && (
              <Link
                href={"/hub" as Route}
                aria-label="Carbide India — back to the Hub"
                className="mb-3 flex items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-[#e2dfdc]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo.png" alt="Carbide India" className="h-10 w-auto shrink-0" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[14px] font-extrabold uppercase tracking-[0.04em] text-[#1f2547]">
                    Secondary Feasibility
                  </span>
                  <span className="truncate text-[9.5px] leading-tight text-[#777985]">
                    Your Tungsten Carbide &amp; Tungsten Copper Partners
                  </span>
                </span>
              </Link>
            )}
            {/* Blueprint diamond cluster — decorative, behind the nav, clipped by
                the aside's overflow-hidden. */}
            {!collapsed && (
              <div aria-hidden className="pointer-events-none absolute -bottom-3 -left-2 z-0 grid grid-cols-5 gap-2 opacity-80">
                {[
                  "#e2dfdc", "#a8a8a8", "#1f2547", "#e2dfdc", "#a8a8a8",
                  "#1f2547", "#e2dfdc", "#d03232", "#a8a8a8", "#e2dfdc",
                  "#a8a8a8", "#e2dfdc", "#1f2547", "#e2dfdc", "#d03232",
                ].map((c, i) => (
                  <span key={i} className="h-3.5 w-3.5 rotate-45 rounded-[2px]" style={{ background: c, opacity: 0.5 }} />
                ))}
              </div>
            )}
            {/* Scrolls on its own so the footer below stays pinned in view —
                a 100vh aside with `overflow-hidden` otherwise clips the
                "Go to next module" button away on the longer modules. */}
            <div className="relative z-10 mt-2.5 flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
            <nav className="flex w-full flex-col gap-1">
              {(() => {
                const base = cn(
                  "flex h-[34px] items-center rounded-lg text-[12.5px] transition",
                  collapsed ? "justify-center px-0" : "gap-2.5 px-3",
                );
                const activeCls = `${base} bg-[#1f2547] font-bold text-white shadow-[0_2px_8px_rgba(31,37,71,0.30)]`;
                const idleCls = `${base} font-semibold text-[#777985] hover:bg-[#e2dfdc] hover:text-[#1f2547]`;
                // Each destination matches ONLY its own route — the queue (exact
                // /secondary-feasibility) must not stay active on Confirmed.
                const onConfirmed = pathname === "/secondary-feasibility/confirmed";
                return (
                  <>
                    {/* Secondary Feasibility + its status filters, collapsible
                        like an accordion in the expanded rail — the same pattern
                        as the Primary shell. The row still links to the
                        unfiltered queue; the chevron only toggles the filters. */}
                    {(() => {
                      const headerActive = onQueue && activeStatus === "";
                      const filterList = (
                        <div className={cn("flex flex-col gap-0.5", !collapsed && "ml-3 border-l border-[#e2dfdc] pl-2")}>
                          {SECONDARY_STATUS_NAV.map((n) => {
                            const isActive = onQueue && activeStatus === n.status;
                            return (
                              <Link
                                key={n.status}
                                href={queueHrefFor(n.status)}
                                title={collapsed ? n.label : undefined}
                                className={cn(
                                  isActive ? activeCls : idleCls,
                                  !collapsed && "h-[30px] text-[12px]",
                                )}
                              >
                                <n.Icon className="h-[15px] w-[15px] shrink-0" />
                                {!collapsed && (
                                  <>
                                    <span className="min-w-0 flex-1 truncate">{n.label}</span>
                                    {counts?.[n.status] !== undefined && (
                                      <span
                                        className={cn(
                                          "shrink-0 tabular-nums font-black",
                                          isActive ? "" : "text-[#777985]",
                                        )}
                                      >
                                        {counts[n.status]}
                                      </span>
                                    )}
                                  </>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      );

                      if (collapsed) {
                        return (
                          <>
                            <Link
                              href={queueHrefFor("")}
                              title="Secondary Feasibility"
                              className={headerActive ? activeCls : idleCls}
                            >
                              <Layers className="h-[16px] w-[16px] shrink-0" />
                            </Link>
                            {filterList}
                          </>
                        );
                      }

                      const headerBase =
                        "flex h-[34px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-[12.5px] transition";
                      const headerCls = headerActive
                        ? `${headerBase} bg-[#1f2547] font-bold text-white shadow-[0_2px_8px_rgba(31,37,71,0.30)]`
                        : `${headerBase} font-semibold text-[#777985] hover:bg-[#e2dfdc] hover:text-[#1f2547]`;
                      return (
                        <>
                          {/* The whole row toggles the accordion (clicking
                              anywhere on the tab), so it is a button rather than a
                              link to the unfiltered queue. */}
                          <button
                            type="button"
                            onClick={() => setFiltersOpen((o) => !o)}
                            aria-label={filtersOpen ? "Collapse status filters" : "Expand status filters"}
                            aria-expanded={filtersOpen}
                            className={headerCls}
                          >
                            <Layers className="h-[16px] w-[16px] shrink-0" />
                            <span className="min-w-0 flex-1 truncate">Secondary Feasibility</span>
                            <ChevronDown
                              className={cn(
                                "h-[15px] w-[15px] shrink-0 opacity-70 transition-transform duration-200",
                                filtersOpen ? "" : "-rotate-90",
                              )}
                            />
                          </button>
                          <div
                            className={cn(
                              "grid transition-[grid-template-rows] duration-200 ease-in-out",
                              filtersOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                            )}
                          >
                            <div className="overflow-hidden">{filterList}</div>
                          </div>
                        </>
                      );
                    })()}

                    <div className="my-1 h-[1.5px] rounded-full bg-[#e2dfdc]" />

                    {/* The stage BOARD — the same lines arranged by status,
                        with a remark demanded on every move. */}
                    <Link
                      href={"/secondary-feasibility/board" as Route}
                      title={collapsed ? "Secondary Kanban" : undefined}
                      className={cn(
                        base,
                        pathname.startsWith("/secondary-feasibility/board")
                          ? "bg-[#1f2547] font-bold text-white shadow-[0_2px_8px_rgba(31,37,71,0.30)]"
                          : "font-semibold text-[#777985] hover:bg-[#e2dfdc] hover:text-[#1f2547]",
                      )}
                    >
                      <KanbanSquare className="h-[16px] w-[16px] shrink-0" />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">Secondary Kanban</span>}
                    </Link>

                    {/* Pipeline Tracker — cross-stage register + approver actions. */}
                    <Link
                      href={"/pipeline" as Route}
                      title={collapsed ? "Pipeline Tracker" : undefined}
                      className={cn(
                        base,
                        pathname.startsWith("/pipeline")
                          ? "bg-[#1f2547] font-bold text-white shadow-[0_2px_8px_rgba(31,37,71,0.30)]"
                          : "font-semibold text-[#777985] hover:bg-[#e2dfdc] hover:text-[#1f2547]",
                      )}
                    >
                      <LayoutGrid className="h-[16px] w-[16px] shrink-0" />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">Pipeline Tracker</span>}
                    </Link>

                    {/* Spec Variance — a standing exception report ("what did
                        somebody change after Primary signed it off"), not a
                        bucket of the queue. */}
                    <Link
                      href={queueHrefFor("variance")}
                      title={collapsed ? "Spec Variance" : undefined}
                      className={cn(
                        base,
                        onQueue && activeStatus === "variance"
                          ? "border-[1.5px] border-[#b45309] bg-[#b45309] font-bold text-white shadow-[0_2px_8px_rgba(180,83,9,0.30)]"
                          : "border-[1.5px] border-[#f0d3a4] bg-[#fdf6e7] font-bold text-[#8a5a08] hover:border-[#b45309] hover:bg-[#f9ecd2]",
                      )}
                    >
                      <GitCompareArrows className="h-[16px] w-[16px] shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="min-w-0 flex-1 truncate">Spec Variance</span>
                          {counts?.variance !== undefined && (
                            <span className="shrink-0 tabular-nums font-black text-[#8a5a08]">
                              {counts.variance}
                            </span>
                          )}
                        </>
                      )}
                    </Link>

                    {/* The EXIT — lines that have cleared Secondary and gone on
                        to Costing. Confirming a line IS the Secondary-done step,
                        so this register is the stage's approved bucket. */}
                    <Link
                      href={"/secondary-feasibility/confirmed" as Route}
                      title={collapsed ? "Confirmed Feasibility" : undefined}
                      className={cn(
                        base,
                        onConfirmed
                          ? activeCls
                          : "border-[1.5px] border-[#b7e0c6] bg-[#eef8f2] font-bold text-[#1c7a44] hover:border-[#16a34a] hover:bg-[#e2f3ea]",
                      )}
                    >
                      <BadgeCheck className="h-[16px] w-[16px] shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="min-w-0 flex-1 truncate">Confirmed Feasibility</span>
                          {counts?.secondary_feasibility_approved !== undefined && (
                            <span className="shrink-0 tabular-nums font-black text-[#1c7a44]">
                              {counts.secondary_feasibility_approved}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </>
                );
              })()}
            </nav>
            </div>

            <div className="relative z-10 mt-2 flex w-full shrink-0 flex-col gap-1 border-t border-[#e2dfdc] pt-2">
              <ModuleStepButtons collapsed={collapsed} />
              <span
                title="Support - coming soon"
                className={cn(
                  "flex h-[44px] cursor-default items-center rounded-lg text-[14px] font-semibold text-[#a8a8a8]",
                  collapsed ? "justify-center px-0" : "gap-2.5 px-3",
                )}
              >
                <LifeBuoy className="h-[16px] w-[16px]" />
                {!collapsed && "Support"}
              </span>
            </div>
          </div>
        </aside>

        <main className="nt-sheet min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
