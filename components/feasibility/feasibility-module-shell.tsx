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
  ClipboardList,
  Circle,
  GitCompareArrows,
  PanelLeftClose,
  PanelLeftOpen,
  KanbanSquare,
  LayoutGrid,
  Table,
  Trash2,
} from "lucide-react";
import { BUCKET_ICONS } from "@/components/layout/bucket-icon";
import { HubSearch } from "@/components/hub/hub-search";
import { ModuleBrand } from "@/components/layout/module-brand";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { FEASIBILITY_STAGE_BUCKETS, FEASIBILITY_STATUS_LABELS } from "@/db/enums";
import { cn } from "@/lib/utils";
import { ModuleStepButtons } from "@/components/layout/next-module-button";

/**
 * Primary Feasibility module shell — its own chrome (like the other form
 * modules). The sidebar is the single Primary destination (`/feasibility`, the
 * 5-check DFM queue) with its status filters (Not Started / Need Info / …)
 * nested under it, linking the queue to `/feasibility?status=<value>`.
 * Secondary Feasibility and the Confirmed Feasibility register are a SEPARATE
 * module at /secondary-feasibility with its own shell and Forms launchpad card
 * — confirming a line IS the Secondary-done step, so the register belongs there.
 */

/** A status filter nested under the Primary Feasibility destination. */
interface StatusNav {
  label: string;
  /** The `?status=` value, or "variance" for the `?variance=1` view. */
  status: string;
  Icon: typeof Circle;
}

/** Re-exported so Secondary's shell keeps its existing import path. The map
 *  itself now lives in components/layout/bucket-icon.tsx, shared with every
 *  other module sidebar — one glyph per bucket, everywhere. */
export { BUCKET_ICONS };

/**
 * The Primary sidebar filters, built straight off FEASIBILITY_STAGE_BUCKETS so
 * the sidebar, the dashboard strip and the table pill can never drift apart.
 * Labels come from FEASIBILITY_STATUS_LABELS (the single source of truth) —
 * the approved bucket therefore reads "Feasibility Approved".
 */
const ALL_PRIMARY_NAV: StatusNav[] = FEASIBILITY_STAGE_BUCKETS.map((b) => ({
  label: FEASIBILITY_STATUS_LABELS[b],
  status: b as string,
  Icon:
    b === "proceed_to_costing"
      ? BUCKET_ICONS.approved
      : BUCKET_ICONS[b as keyof typeof BUCKET_ICONS],
}));

/** Where work still SITS — nested under the queue destination. */
const PRIMARY_STATUS_NAV = ALL_PRIMARY_NAV.filter(
  (n) => n.status !== "proceed_to_costing",
);

/** Where work has GONE — the handover to Secondary Feasibility, its own row at
 *  the end, outside the sequence above. */
const PRIMARY_APPROVED = ALL_PRIMARY_NAV.find(
  (n) => n.status === "proceed_to_costing",
)!;

function primaryHrefFor(status: string): Route {
  if (status === "variance") return "/feasibility?variance=1" as Route;
  return (status ? `/feasibility?status=${status}` : "/feasibility") as Route;
}

export function FeasibilityModuleShell({
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
  const onQueue = pathname === "/feasibility";
  const [collapsed, setCollapsed] = useState(false);
  // The nested status filters collapse into their parent like an accordion.
  // Default open so nothing that was visible before is hidden on first load.
  const [filtersOpen, setFiltersOpen] = useState(true);

  return (
    <div className="drafting-grid flex min-h-screen flex-col">
      {/* Top header */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#e2dfdc] bg-[#f4f0e8] px-4">
        {/* Left — toggle + the brand, which sits directly above the sidebar's
            first row. No module-title pill in the middle any more: the sidebar
            names the module one row below, and the two read as a stutter. */}
        <div className={cn("flex shrink-0 items-center gap-2", collapsed ? "min-w-[56px]" : "min-w-[232px]")}>
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
          {/* On the cream sheet the brand lives in the sidebar masthead — keep it
              here only when collapsed (the sidebar block is hidden then). */}
          {collapsed && <ModuleBrand collapsed={collapsed} />}
        </div>

        {/* Module title lives in the sidebar masthead on the cream sheet, so the
            header title would double it — omitted (matches the other modules). */}

        {/* Search - pushed right, just before the action icons. */}
        <div className="ml-auto flex min-w-0 flex-1 justify-end pl-4">
          <HubSearch />
        </div>

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
            <HelpCircle className="h-[16px] w-[16px]" />
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
                    Primary Feasibility
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
                  const primaryActive = onQueue; // any /feasibility?status=… view
                  return (
                    <>
                      {/* Destination 1 — Primary Feasibility. In the expanded rail
                        its status filters collapse into it like an accordion (the
                        chevron toggles them); the row itself still links to the
                        unfiltered queue. In the 72px rail there is no room to
                        nest, so the filters simply stack as icons, unchanged. */}
                      {(() => {
                        // The accordion header is a pure toggle now — the explicit
                        // "Register" link below owns the unfiltered-queue active state,
                        // so the header never highlights (avoids double-highlight).
                        const headerActive = false;
                        const filterList = (
                          <div className={cn("flex flex-col gap-0.5", !collapsed && "ml-3 border-l border-[#e2dfdc] pl-2")}>
                            {PRIMARY_STATUS_NAV.map((n) => {
                              const isActive = primaryActive && activeStatus === n.status;
                              return (
                                <Link
                                  key={n.status}
                                  href={primaryHrefFor(n.status)}
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
                                href={primaryHrefFor("")}
                                title="Primary Feasibility"
                                className={headerActive ? activeCls : idleCls}
                              >
                                <ClipboardList className="h-[16px] w-[16px] shrink-0" />
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
                                anywhere on the tab), so it is a button rather than
                                a link to the unfiltered queue. */}
                            <button
                              type="button"
                              onClick={() => setFiltersOpen((o) => !o)}
                              aria-label={filtersOpen ? "Collapse status filters" : "Expand status filters"}
                              aria-expanded={filtersOpen}
                              className={headerCls}
                            >
                              <ClipboardList className="h-[16px] w-[16px] shrink-0" />
                              <span className="min-w-0 flex-1 truncate">Primary Feasibility</span>
                              <ChevronDown
                                className={cn(
                                  "h-[15px] w-[15px] shrink-0 opacity-70 transition-transform duration-200",
                                  filtersOpen ? "" : "-rotate-90",
                                )}
                              />
                            </button>
                            {/* grid-rows 1fr↔0fr gives a measured-free height
                                animation; the inner overflow-hidden clips the rows
                                while they slide shut. */}
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

                      {/* Register — the full queue table (unfiltered). */}
                      <Link
                        href={"/feasibility" as Route}
                        title={collapsed ? "Register" : undefined}
                        className={cn(
                          base,
                          onQueue && activeStatus === ""
                            ? "bg-[#1f2547] font-bold text-white shadow-[0_2px_8px_rgba(31,37,71,0.30)]"
                            : "font-semibold text-[#777985] hover:bg-[#e2dfdc] hover:text-[#1f2547]",
                        )}
                      >
                        <Table className="h-[16px] w-[16px] shrink-0" />
                        {!collapsed && <span className="truncate">Register</span>}
                      </Link>

                      {/* The stage BOARD — the same queue arranged by status,
                        with a remark demanded on every move. */}
                      <div className="my-1 h-[1.5px] rounded-full bg-[#e2dfdc]" />
                      <Link
                        href={"/feasibility/board" as Route}
                        title={collapsed ? "Feasibility Kanban" : undefined}
                        className={cn(
                          base,
                          pathname.startsWith("/feasibility/board")
                            ? "bg-[#1f2547] font-bold text-white shadow-[0_2px_8px_rgba(31,37,71,0.30)]"
                            : "font-semibold text-[#777985] hover:bg-[#e2dfdc] hover:text-[#1f2547]",
                        )}
                      >
                        <KanbanSquare className="h-[16px] w-[16px] shrink-0" />
                        {!collapsed && <span className="truncate">Feasibility Kanban</span>}
                      </Link>

                      {/* Pipeline Tracker — the cross-stage register (every SM and
                          where it sits), with per-inquiry approver actions. */}
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
                        {!collapsed && <span className="truncate">Pipeline Tracker</span>}
                      </Link>

                      {/* Recycle Bin — soft-deleted enquiries (whole pipeline). */}
                      <Link
                        href={"/pipeline/recycle-bin" as Route}
                        title={collapsed ? "Recycle Bin" : undefined}
                        className={cn(
                          base,
                          pathname.startsWith("/pipeline/recycle-bin")
                            ? "bg-[#1f2547] font-bold text-white shadow-[0_2px_8px_rgba(31,37,71,0.30)]"
                            : "font-semibold text-[#777985] hover:bg-[#e2dfdc] hover:text-[#1f2547]",
                        )}
                      >
                        <Trash2 className="h-[16px] w-[16px] shrink-0" />
                        {!collapsed && <span className="truncate">Recycle Bin</span>}
                      </Link>

                      {/* Destination 2 — Spec Variance. Promoted out of the status
                        filters: it is not a bucket of the queue but a standing
                        exception report ("what did somebody change after the
                        enquiry was signed off"), so it reads as its own place
                        and is tinted amber to be noticed. */}
                      <div className="my-1 h-[1.5px] rounded-full bg-[#e2dfdc]" />
                      <Link
                        href={primaryHrefFor("variance")}
                        title={collapsed ? "Spec Variance" : undefined}
                        className={cn(
                          base,
                          primaryActive && activeStatus === "variance"
                            ? "border-[1.5px] border-[#b45309] bg-[#b45309] font-bold text-white shadow-[0_2px_8px_rgba(180,83,9,0.30)]"
                            : "border-[1.5px] border-[#f0d3a4] bg-[#fdf6e7] font-bold text-[#8a5a08] hover:border-[#b45309] hover:bg-[#f9ecd2]",
                        )}
                      >
                        <GitCompareArrows className="h-[16px] w-[16px] shrink-0" />
                        {!collapsed && <span className="truncate">Spec Variance</span>}
                      </Link>

                      {/* The EXIT — enquiries that have cleared Primary and moved
                        on to Secondary Feasibility. Green, like the approved
                        chip everywhere else. */}
                      <Link
                        href={primaryHrefFor(PRIMARY_APPROVED.status)}
                        title={collapsed ? PRIMARY_APPROVED.label : undefined}
                        className={cn(
                          base,
                          primaryActive && activeStatus === PRIMARY_APPROVED.status
                            ? activeCls
                            : "border-[1.5px] border-[#b7e0c6] bg-[#eef8f2] font-bold text-[#1c7a44] hover:border-[#16a34a] hover:bg-[#e2f3ea]",
                        )}
                      >
                        <PRIMARY_APPROVED.Icon className="h-[16px] w-[16px] shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="min-w-0 flex-1 truncate">
                              {PRIMARY_APPROVED.label}
                            </span>
                            {counts?.[PRIMARY_APPROVED.status] !== undefined && (
                              <span className="shrink-0 tabular-nums font-black text-[#1c7a44]">
                                {counts[PRIMARY_APPROVED.status]}
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
