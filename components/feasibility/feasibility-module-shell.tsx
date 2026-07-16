"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import type { Route } from "next";
import {
  Bell,
  HelpCircle,
  LifeBuoy,
  ArrowLeft,
  LayoutDashboard,
  LayoutGrid,
  ClipboardCheck,
  BadgeCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { HubSearch } from "@/components/hub/hub-search";
import { ModuleTitleBadge } from "@/components/layout/module-title-badge";
import { cn } from "@/lib/utils";

/**
 * Primary-Feasibility module shell — the standalone chrome for the feasibility
 * workspace (its own identity in the Hub, no longer borrowing the enquiry
 * shell). Fixed sidebar: the review Queue + the Approvals inbox.
 */

interface NavDef {
  label: string;
  href: Route;
  Icon: typeof LayoutDashboard;
  active: (p: string) => boolean;
  group: "overview" | "records";
}

const NAV: NavDef[] = [
  { label: "Dashboard", href: "/hub" as Route, Icon: LayoutDashboard, active: () => false, group: "overview" },
  {
    label: "Feasibility Queue",
    href: "/feasibility" as Route,
    Icon: ClipboardCheck,
    active: (p) => p === "/feasibility" || (p.startsWith("/feasibility/") && !p.startsWith("/feasibility/approvals")),
    group: "records",
  },
  {
    label: "Approvals",
    href: "/feasibility/approvals" as Route,
    Icon: BadgeCheck,
    active: (p) => p.startsWith("/feasibility/approvals"),
    group: "records",
  },
];

export function FeasibilityModuleShell({
  children,
  userMenu,
}: {
  children: ReactNode;
  userMenu?: ReactNode;
}) {
  const pathname = usePathname();
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
            href={"/hub" as Route}
            className="group flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#3f3f94] px-4 text-[15px] font-extrabold text-white shadow-[0_4px_12px_rgba(63,63,148,0.38)] ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(63,63,148,0.52)] hover:brightness-110 active:translate-y-0 active:scale-95"
            aria-label="Back to hub"
          >
            <ArrowLeft className="h-[16px] w-[16px] transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={2.6} />
            <LayoutGrid className="h-[19px] w-[19px]" strokeWidth={2.4} />
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
            collapsed ? "w-0 border-r-0" : "w-[248px] border-r border-[#e5e7eb]",
          )}
        >
          <div className="flex h-full w-[248px] flex-col px-4 py-4">
            <Link href={"/hub" as Route} className="flex flex-col items-center gap-1 px-1" aria-label="Carbide India hub">
              <img src="/brand/logo.png" alt="" className="h-24 w-auto" style={{ display: "block" }} />
              <span className="text-[22px] font-extrabold leading-none tracking-tight text-[#3f3f94]">Carbide India</span>
            </Link>

            <nav className="mt-4 flex flex-col gap-1.5">
              {NAV.map((n, i) => {
                const prev = NAV[i - 1];
                const showDivider = i > 0 && !!prev && n.group !== prev.group;
                const isActive = n.active(pathname);
                const base = "flex h-[44px] items-center gap-3 rounded-lg px-3.5 text-[14px] transition";
                return (
                  <Fragment key={n.label}>
                    {showDivider && <div className="my-2 h-[1.5px] rounded-full bg-[#c2c7d6]" />}
                    <Link
                      href={n.href}
                      className={
                        isActive
                          ? `${base} bg-[#3f3f94] font-bold text-white shadow-[0_2px_8px_rgba(63,63,148,0.30)]`
                          : `${base} font-semibold text-[#3a4152] hover:bg-[#efeffb] hover:text-[#3f3f94]`
                      }
                    >
                      <n.Icon className="h-[19px] w-[19px]" />
                      {n.label}
                    </Link>
                  </Fragment>
                );
              })}
            </nav>

            <div className="mt-auto flex flex-col gap-1.5">
              <span title="Coming soon" className="flex h-[44px] cursor-default items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#9aa0ab]">
                <LifeBuoy className="h-[19px] w-[19px]" />
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
