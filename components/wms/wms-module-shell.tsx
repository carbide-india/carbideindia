"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Route } from "next";
import {
  LayoutDashboard,
  CalendarDays,
  ListTodo,
  SquareKanban,
  LifeBuoy,
  LayoutGrid,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { GlobalSearch } from "@/components/header/global-search";
import { NavHistoryButtons } from "@/components/layout/nav-history-buttons";
import { AdminPill } from "@/components/header/admin-pill";
import { ModuleTitleBadge } from "@/components/layout/module-title-badge";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { cn } from "@/lib/utils";

/**
 * WMS module shell — the same left-sidebar chrome the other modules use
 * (Forms / Masters / Feasibility), applied to the work-management surfaces.
 * Sidebar: Dashboard · My Day · Tasks · Kanban. Collapses to a 72px icon rail
 * (icons + tooltips) like the rest of the system. The top bar carries the WMS
 * search, module title, notification bell, New Task and the user menu.
 */

interface WmsNavItem {
  href: Route;
  label: string;
  Icon: LucideIcon;
  active: (pathname: string) => boolean;
  /** Show the live active-tasks badge. */
  showCount?: boolean;
  adminOnly?: boolean;
}

const NAV: WmsNavItem[] = [
  { href: "/" as Route, label: "Dashboard", Icon: LayoutDashboard, active: (p) => p === "/" },
  { href: "/tasks/agenda" as Route, label: "My Day", Icon: CalendarDays, active: (p) => p === "/tasks/agenda" },
  {
    href: "/tasks" as Route,
    label: "Tasks",
    Icon: ListTodo,
    showCount: true,
    active: (p) => p === "/tasks" || (p.startsWith("/tasks/") && p !== "/tasks/agenda" && p !== "/tasks/kanban"),
  },
  { href: "/tasks/kanban" as Route, label: "Kanban", Icon: SquareKanban, adminOnly: true, active: (p) => p === "/tasks/kanban" },
];

export function WmsModuleShell({
  children,
  userMenu,
  newTask,
  activeTasks,
  isAdmin,
}: {
  children: ReactNode;
  userMenu?: ReactNode;
  newTask?: ReactNode;
  activeTasks: number;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

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
            href={"/hub" as Route}
            className="group flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#dcdce8] bg-white px-3 text-[13px] font-bold text-[#3a4152] transition hover:border-[#3f3f94] hover:text-[#3f3f94]"
            aria-label="Back to hub"
          >
            <LayoutGrid className="h-[17px] w-[17px]" strokeWidth={2.4} />
            Hub
          </Link>
          <span className="max-md:hidden">
            <NavHistoryButtons />
          </span>
        </div>

        <GlobalSearch />

        {/* Module title - centered in the gap between the search and the icons. */}
        <div className="flex flex-1 items-center justify-center">
          <ModuleTitleBadge title="WMS" align="start" />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2.5">
          <NotificationBell />
          {newTask}
          {isAdmin && (
            <span className="max-xl:hidden">
              <AdminPill />
            </span>
          )}
          {userMenu}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1">
        <aside
          className={cn(
            "sticky top-[60px] h-[calc(100vh-60px)] shrink-0 overflow-hidden border-r border-[#e5e7eb] bg-white transition-[width] duration-300 ease-in-out",
            collapsed ? "w-[72px]" : "w-[248px]",
          )}
        >
          <div className={cn("flex h-full flex-col py-4", collapsed ? "w-[72px] items-center px-2" : "w-[248px] px-4")}>
            <Link href={"/hub" as Route} className="flex flex-col items-center gap-1 px-1" aria-label="Carbide India hub">
              <img src="/brand/logo.png" alt="" className={cn("w-auto", collapsed ? "h-10" : "h-24")} style={{ display: "block" }} />
              {!collapsed && (
                <span className="text-[22px] font-extrabold leading-none tracking-tight text-[#3f3f94]">Carbide India</span>
              )}
            </Link>

            {!collapsed && (
              <span
                className="mt-6 mb-2 block px-2 text-[10.5px] font-bold tracking-[0.18em] text-[#a2a8b4]"
                style={{ fontFamily: "var(--font-mono-display)" }}
              >
                WORK MANAGEMENT
              </span>
            )}

            <nav className={cn("flex w-full flex-col gap-1.5", collapsed && "mt-4")}>
              {items.map((n) => {
                const isActive = n.active(pathname);
                const base = cn(
                  "flex h-[44px] items-center rounded-lg text-[14px] transition",
                  collapsed ? "justify-center px-0" : "gap-3 px-3.5",
                );
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    title={collapsed ? n.label : undefined}
                    className={
                      isActive
                        ? `${base} bg-[#3f3f94] font-bold text-white shadow-[0_2px_8px_rgba(63,63,148,0.30)]`
                        : `${base} font-semibold text-[#3a4152] hover:bg-[#efeffb] hover:text-[#3f3f94]`
                    }
                  >
                    <n.Icon className="h-[19px] w-[19px] shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
                    {!collapsed && n.showCount && activeTasks > 0 && (
                      <span
                        className={cn(
                          "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-black tabular-nums",
                          isActive ? "bg-white/25 text-white" : "bg-[#eceefb] text-[#3f3f94]",
                        )}
                      >
                        {activeTasks}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto flex w-full flex-col gap-1.5">
              <span
                title="Support - coming soon"
                className={cn(
                  "flex h-[44px] cursor-default items-center rounded-lg text-[14px] font-semibold text-[#9aa0ab]",
                  collapsed ? "justify-center px-0" : "gap-3 px-3.5",
                )}
              >
                <LifeBuoy className="h-[19px] w-[19px]" />
                {!collapsed && "Support"}
              </span>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
