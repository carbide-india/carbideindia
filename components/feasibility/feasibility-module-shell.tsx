"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import type { Route } from "next";
import {
  Bell,
  HelpCircle,
  LifeBuoy,
  ArrowLeft,
  LayoutGrid,
  ClipboardList,
  Columns3,
  Circle,
  CircleHelp,
  CircleX,
  Clock3,
  CircleCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { HubSearch } from "@/components/hub/hub-search";
import { ModuleTitleBadge } from "@/components/layout/module-title-badge";
import { cn } from "@/lib/utils";

/**
 * Primary-Feasibility module shell — its own chrome (like the other form
 * modules). The sidebar is the review pipeline by status: All Reviews, Not
 * Started, Need Info, Not Feasible, Pending Approval, Approved · Costing. Each
 * status links the queue to `/feasibility?status=<value>`.
 */

interface StatusNav {
  label: string;
  /** "" = all reviews (no status filter). */
  status: string;
  Icon: typeof Circle;
  group: "overview" | "pipeline";
}

const NAV: StatusNav[] = [
  { label: "All Reviews", status: "", Icon: ClipboardList, group: "overview" },
  { label: "Kanban View", status: "__kanban", Icon: Columns3, group: "overview" },
  { label: "Not Started", status: "not_started", Icon: Circle, group: "pipeline" },
  { label: "Need Info", status: "need_info", Icon: CircleHelp, group: "pipeline" },
  { label: "Not Feasible", status: "not_feasible", Icon: CircleX, group: "pipeline" },
  { label: "Pending Approval", status: "pending_approval", Icon: Clock3, group: "pipeline" },
  { label: "Approved · Proceed to Costing", status: "proceed_to_costing", Icon: CircleCheck, group: "pipeline" },
];

function hrefFor(status: string): Route {
  if (status === "__kanban") return "/feasibility/kanban" as Route;
  return (status ? `/feasibility?status=${status}` : "/feasibility") as Route;
}

export function FeasibilityModuleShell({
  children,
  userMenu,
}: {
  children: ReactNode;
  userMenu?: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeStatus = searchParams.get("status") ?? "";
  const onQueue = pathname === "/feasibility";
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f7]">
      {/* Top header */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#e5e7eb] bg-white px-4">
        <div className="flex min-w-0 flex-[1.4] items-center gap-3 pr-6">
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
          <Link
            href={"/hub" as Route}
            className="group flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#dcdce8] bg-white px-3 text-[13px] font-bold text-[#3a4152] transition hover:border-[#3f3f94] hover:text-[#3f3f94]"
            aria-label="Back to hub"
          >
            <LayoutGrid className="h-[17px] w-[17px]" strokeWidth={2.4} />
            Hub
          </Link>
          <ModuleTitleBadge title="Primary Feasibility" align="center" />
        </div>

        <HubSearch />

        <div className="flex flex-1 items-center justify-end gap-2.5">
          <Link
            href={"/inbox" as Route}
            className="grid h-9 w-9 place-items-center rounded-full text-[#4b5563] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
            aria-label="Notifications"
          >
            <Bell className="h-[18px] w-[18px]" />
          </Link>
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
            "sticky top-[60px] h-[calc(100vh-60px)] shrink-0 overflow-hidden bg-white transition-[width] duration-300 ease-in-out",
            collapsed ? "w-0 border-r-0" : "w-[260px] border-r border-[#e5e7eb]",
          )}
        >
          <div className="flex h-full w-[260px] flex-col px-4 py-4">
            <Link href={"/hub" as Route} className="flex flex-col items-center gap-1 px-1" aria-label="Carbide India hub">
              <img src="/brand/logo.png" alt="" className="h-24 w-auto" style={{ display: "block" }} />
              <span className="text-[22px] font-extrabold leading-none tracking-tight text-[#3f3f94]">Carbide India</span>
            </Link>

            <nav className="mt-4 flex flex-col gap-1.5">
              {NAV.map((n, i) => {
                const prev = NAV[i - 1];
                const showDivider = i > 0 && !!prev && n.group !== prev.group;
                const isActive =
                  n.status === "__kanban"
                    ? pathname === "/feasibility/kanban"
                    : onQueue && activeStatus === n.status;
                const base = "flex h-[42px] items-center gap-3 rounded-lg px-3.5 text-[13.5px] transition";
                return (
                  <Fragment key={n.label}>
                    {showDivider && <div className="my-2 h-[1.5px] rounded-full bg-[#c2c7d6]" />}
                    <Link
                      href={hrefFor(n.status)}
                      className={
                        isActive
                          ? `${base} bg-[#3f3f94] font-bold text-white shadow-[0_2px_8px_rgba(63,63,148,0.30)]`
                          : `${base} font-semibold text-[#3a4152] hover:bg-[#efeffb] hover:text-[#3f3f94]`
                      }
                    >
                      <n.Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{n.label}</span>
                    </Link>
                  </Fragment>
                );
              })}
            </nav>

            <div className="mt-auto flex flex-col gap-1.5">
              <span title="Coming soon" className="flex h-[42px] cursor-default items-center gap-3 rounded-lg px-3.5 text-[13.5px] font-semibold text-[#9aa0ab]">
                <LifeBuoy className="h-[18px] w-[18px]" />
                Support
              </span>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
