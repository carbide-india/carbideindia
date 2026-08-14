"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Route } from "next";
import {
  HelpCircle,
  LifeBuoy,
  ArrowLeft,
  ClipboardList,
  Circle,
  GitCompareArrows,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { BUCKET_ICONS } from "@/components/layout/bucket-icon";
import { HubSearch } from "@/components/hub/hub-search";
import { ModuleTitleBadge } from "@/components/layout/module-title-badge";
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

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f7]">
      {/* Top header */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#e5e7eb] bg-white px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
            aria-pressed={!collapsed}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#4b5563] transition hover:bg-[#efeffb] hover:text-[#3f3f94] active:scale-90"
          >
            <span key={collapsed ? "collapsed" : "open"} className="animate-toggle-pop inline-flex">
              {collapsed ? <PanelLeftOpen className="h-[20px] w-[20px]" /> : <PanelLeftClose className="h-[20px] w-[20px]" />}
            </span>
          </button>
          <Link
            href={"/enquiries" as Route}
            className="group flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[#3f3f94] px-3.5 text-[13.5px] font-bold text-white shadow-[0_4px_12px_rgba(63,63,148,0.38)] ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(63,63,148,0.52)] hover:brightness-110 active:translate-y-0 active:scale-95"
            aria-label="Back to all forms"
          >
            <ArrowLeft className="h-[16px] w-[16px] transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={2.6} />
            Back to Forms
          </Link>
        </div>

        <HubSearch />

        {/* Module title - centered in the gap between the search and the icons. */}
        <div className="flex flex-1 items-center justify-center">
          <ModuleTitleBadge title="Primary Feasibility" align="start" />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2.5">
          <NotificationBell />
          <span title="Help - coming soon" className="grid h-9 w-9 cursor-default place-items-center rounded-full text-[#9aa0ab]">
            <HelpCircle className="h-[18px] w-[18px]" />
          </span>
          {userMenu}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1">
        <aside
          className={cn(
            "sticky top-[60px] h-[calc(100vh-60px)] shrink-0 overflow-hidden border-r border-[#e5e7eb] bg-white transition-[width] duration-300 ease-in-out",
            collapsed ? "w-[72px]" : "w-[260px]",
          )}
        >
          <div className={cn("flex h-full flex-col py-4", collapsed ? "w-[72px] items-center px-2" : "w-[260px] px-4")}>
            {/* Scrolls on its own so the footer below stays pinned in view —
                a 100vh aside with `overflow-hidden` otherwise clips the
                "Go to next module" button away on the longer modules. */}
            <div className="mt-4 flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
            <nav className="flex w-full flex-col gap-1.5">
              {(() => {
                const base = cn(
                  "flex h-[42px] items-center rounded-lg text-[13.5px] transition",
                  collapsed ? "justify-center px-0" : "gap-3 px-3.5",
                );
                const activeCls = `${base} bg-[#3f3f94] font-bold text-white shadow-[0_2px_8px_rgba(63,63,148,0.30)]`;
                const idleCls = `${base} font-semibold text-[#3a4152] hover:bg-[#efeffb] hover:text-[#3f3f94]`;
                const primaryActive = onQueue; // any /feasibility?status=… view
                return (
                  <>
                    {/* Destination 1 — Primary Feasibility (+ nested status filters). */}
                    <Link
                      href={primaryHrefFor("")}
                      title={collapsed ? "Primary Feasibility" : undefined}
                      className={primaryActive && activeStatus === "" ? activeCls : idleCls}
                    >
                      <ClipboardList className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">Primary Feasibility</span>}
                    </Link>
                    <div className={cn("flex flex-col gap-1", collapsed ? "" : "ml-3 border-l border-[#e5e7eb] pl-2")}>
                      {!collapsed && counts?.all !== undefined && (
                        <p className="px-3.5 pb-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#9aa0ab]">
                          {counts.all} enquiry{counts.all === 1 ? "" : "s"} by status
                        </p>
                      )}
                      {PRIMARY_STATUS_NAV.map((n) => {
                        const isActive = primaryActive && activeStatus === n.status;
                        return (
                          <Link
                            key={n.status}
                            href={primaryHrefFor(n.status)}
                            title={collapsed ? n.label : undefined}
                            className={cn(
                              isActive ? activeCls : idleCls,
                              !collapsed && "h-[38px] text-[13px]",
                            )}
                          >
                            <n.Icon className="h-[17px] w-[17px] shrink-0" />
                            {!collapsed && (
                              <>
                                <span className="min-w-0 flex-1 truncate">{n.label}</span>
                                {counts?.[n.status] !== undefined && (
                                  <span
                                    className={cn(
                                      "shrink-0 tabular-nums font-black",
                                      isActive ? "" : "text-[#6b7280]",
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

                    {/* Destination 2 — Spec Variance. Promoted out of the status
                        filters: it is not a bucket of the queue but a standing
                        exception report ("what did somebody change after the
                        enquiry was signed off"), so it reads as its own place
                        and is tinted amber to be noticed. */}
                    <div className="my-1 h-[1.5px] rounded-full bg-[#e5e7eb]" />
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
                      <GitCompareArrows className="h-[18px] w-[18px] shrink-0" />
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
                      <PRIMARY_APPROVED.Icon className="h-[18px] w-[18px] shrink-0" />
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

            <div className="mt-3 flex w-full shrink-0 flex-col gap-1.5 border-t border-[#e5e7eb] pt-3">
              <ModuleStepButtons collapsed={collapsed} />
              <span
                title="Support - coming soon"
                className={cn(
                  "flex h-[42px] cursor-default items-center rounded-lg text-[13.5px] font-semibold text-[#9aa0ab]",
                  collapsed ? "justify-center px-0" : "gap-3 px-3.5",
                )}
              >
                <LifeBuoy className="h-[18px] w-[18px]" />
                {!collapsed && "Support"}
              </span>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
