"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Route } from "next";
import {
  HelpCircle,
  LifeBuoy,
  ArrowLeft,
  Layers,
  Circle,
  GitCompareArrows,
  BadgeCheck,
  PanelLeftClose,
  PanelLeftOpen,
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

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f7]">
      {/* Top header */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#e5e7eb] bg-white px-4">
        <div className="flex shrink-0 items-center gap-2">
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
          <ModuleBrand collapsed={collapsed} />
        </div>

        <HubSearch />

        <div className="flex shrink-0 items-center justify-end gap-2.5">
          <Link
            href={"/enquiries" as Route}
            className="group flex h-9 shrink-0 items-center gap-1.5 rounded-lg border-[1.5px] border-[#c7cae6] bg-white px-3 text-[13px] font-bold text-[#3f3f94] transition-colors hover:border-[#3f3f94] hover:bg-[#f3f3fb] max-md:hidden"
            aria-label="Back to all forms"
          >
            <ArrowLeft className="h-[15px] w-[15px] transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={2.6} />
            Back to Forms
          </Link>
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
                // Each destination matches ONLY its own route — the queue (exact
                // /secondary-feasibility) must not stay active on Confirmed.
                const onConfirmed = pathname === "/secondary-feasibility/confirmed";
                return (
                  <>
                    <Link
                      href={queueHrefFor("")}
                      title={collapsed ? "Secondary Feasibility" : undefined}
                      className={onQueue && activeStatus === "" ? activeCls : idleCls}
                    >
                      <Layers className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">Secondary Feasibility</span>}
                    </Link>
                    <div className={cn("flex flex-col gap-1", collapsed ? "" : "ml-3 border-l border-[#e5e7eb] pl-2")}>
                      {!collapsed && counts?.all !== undefined && (
                        <p className="px-3.5 pb-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#9aa0ab]">
                          {counts.all} line{counts.all === 1 ? "" : "s"} by status
                        </p>
                      )}
                      {SECONDARY_STATUS_NAV.map((n) => {
                        const isActive = onQueue && activeStatus === n.status;
                        return (
                          <Link
                            key={n.status}
                            href={queueHrefFor(n.status)}
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

                    <div className="my-2 h-[1.5px] rounded-full bg-[#c2c7d6]" />

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
                      <GitCompareArrows className="h-[18px] w-[18px] shrink-0" />
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
                      <BadgeCheck className="h-[18px] w-[18px] shrink-0" />
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
