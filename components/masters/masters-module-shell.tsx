"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Route } from "next";
import {
  Bell,
  HelpCircle,
  LifeBuoy,
  Users,
  Factory,
  Package,
  Star,
  Ruler,
  SlidersHorizontal,
  Maximize2,
  Shapes,
  Truck,
  Layers,
  Building2,
  Boxes,
  LayoutGrid,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { ReactNode } from "react";
import { HubSearch } from "@/components/hub/hub-search";
import { ModuleTitleBadge } from "@/components/layout/module-title-badge";
import { MASTER_KINDS, MASTER_KIND_LABELS, type MasterKind } from "@/db/enums";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<MasterKind, typeof Users> = {
  customer_type: Users,
  industry_type: Factory,
  product_type: Package,
  internal_grade: Star,
  tolerance: Ruler,
  condition: SlidersHorizontal,
  department: Building2,
  size: Maximize2,
  shape: Shapes,
  dispatch_condition: Truck,
  pressing_type: Layers,
};

// The module top-bar title is always "Masters" (the module name) on every page
// - the specific page name (Product Master, Customer Type…) is shown by each
// page's own <h1>, so the two never duplicate.
function titleFor(): string {
  return "Masters";
}

export function MastersModuleShell({
  children,
  userMenu,
}: {
  children: ReactNode;
  userMenu?: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const pageTitle = titleFor();

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f7]">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes mstNavIn { from { opacity: 0; transform: translateX(-6px) } to { opacity: 1; transform: none } }
        .mst-nav-item { animation: mstNavIn .38s cubic-bezier(.22,.61,.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .mst-nav-item { animation: none } }
      `,
        }}
      />

      {/* ── Top header bar (full width) ─────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#e5e7eb] bg-white px-4">
        {/* Left zone - toggle, then the master's title. */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
            aria-pressed={!collapsed}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#4b5563] transition hover:bg-[#efeffb] hover:text-[#3f3f94] active:scale-90"
          >
            {/* Re-keyed so the pop animation replays on every toggle. */}
            <span key={collapsed ? "collapsed" : "open"} className="animate-toggle-pop inline-flex">
              {collapsed ? (
                <PanelLeftOpen className="h-[20px] w-[20px]" />
              ) : (
                <PanelLeftClose className="h-[20px] w-[20px]" />
              )}
            </span>
          </button>
          {/* Hub sits immediately before the module title. */}
          <Link
            href={"/hub" as Route}
            className="group flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#3f3f94] px-4 text-[15px] font-extrabold text-white shadow-[0_4px_12px_rgba(63,63,148,0.38)] ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(63,63,148,0.52)] hover:brightness-110 active:translate-y-0 active:scale-95"
            aria-label="Back to hub"
          >
            <ArrowLeft className="h-[16px] w-[16px] transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={2.6} />
            <LayoutGrid className="h-[19px] w-[19px]" strokeWidth={2.4} />
            Hub
          </Link>
          <ModuleTitleBadge title={pageTitle} />
        </div>

        {/* Middle zone - centered search. */}
        <HubSearch />

        {/* Right zone - actions. */}
        <div className="flex flex-1 items-center justify-end gap-2.5">
          <Link
            href={"/inbox" as Route}
            className="grid h-9 w-9 place-items-center rounded-full text-[#4b5563] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
            aria-label="Notifications"
          >
            <Bell className="h-[18px] w-[18px]" />
          </Link>
          <span
            title="Help - coming soon"
            className="grid h-9 w-9 cursor-default place-items-center rounded-full text-[#9aa0ab]"
          >
            <HelpCircle className="h-[18px] w-[18px]" />
          </span>
          {userMenu}
        </div>
      </header>

      {/* ── Body: sidebar + main ────────────────────────────────── */}
      <div className="flex flex-1">
        {/* Sidebar - slides in/out via the header toggle. The inner panel keeps
            a fixed width so its contents don't reflow while the width animates. */}
        <aside
          className={cn(
            "sticky top-[60px] h-[calc(100vh-60px)] shrink-0 overflow-hidden bg-white transition-[width] duration-300 ease-in-out",
            collapsed ? "w-0 border-r-0" : "w-[248px] border-r border-[#e5e7eb]",
          )}
        >
          <div className="flex h-full w-[248px] flex-col overflow-y-auto px-4 py-4">
            {/* Big brand logo → hub, wordmark stacked beneath. */}
            <Link
              href={"/hub" as Route}
              className="flex flex-col items-center gap-1 px-1"
              aria-label="Carbide India hub"
            >
              <img src="/brand/logo.png" alt="" className="h-24 w-auto" style={{ display: "block" }} />
              <span className="text-[22px] font-extrabold leading-none tracking-tight text-[#3f3f94]">
                Carbide India
              </span>
            </Link>

            <span
              className="mt-6 mb-2 block px-2 text-[10.5px] font-bold tracking-[0.18em] text-[#a2a8b4]"
              style={{ fontFamily: "var(--font-mono-display)" }}
            >
              MASTERS
            </span>

            <nav className="flex flex-col gap-2 pb-2">
              {/* Product Master (the Item Master) sits at the very top. */}
              {(() => {
                const base =
                  "mst-nav-item flex h-[44px] items-center gap-3 rounded-xl border px-3.5 text-[13.5px] transition";
                const isActive = pathname.startsWith("/items");
                return (
                  <Link
                    href={"/items" as Route}
                    className={
                      isActive
                        ? `${base} border-[#3f3f94] bg-[#3f3f94] font-bold text-white shadow-[0_2px_8px_rgba(63,63,148,0.25)]`
                        : `${base} border-[#e6e8ec] bg-white font-semibold text-[#3a4152] hover:border-[#c9c9ea] hover:bg-[#f4f4fd] hover:text-[#3f3f94]`
                    }
                  >
                    <Boxes className="h-[18px] w-[18px] shrink-0" />
                    Product Master
                  </Link>
                );
              })()}
              {MASTER_KINDS.map((kind, i) => {
                const href = `/masters/${kind}` as Route;
                const isActive = pathname === `/masters/${kind}`;
                const Icon = KIND_ICON[kind];
                const base =
                  "mst-nav-item flex h-[44px] items-center gap-3 rounded-xl border px-3.5 text-[13.5px] transition";
                return (
                  <Link
                    key={kind}
                    href={href}
                    style={{ animationDelay: `${i * 0.03}s` }}
                    className={
                      isActive
                        ? `${base} border-[#3f3f94] bg-[#3f3f94] font-bold text-white shadow-[0_2px_8px_rgba(63,63,148,0.25)]`
                        : `${base} border-[#e6e8ec] bg-white font-semibold text-[#3a4152] hover:border-[#c9c9ea] hover:bg-[#f4f4fd] hover:text-[#3f3f94]`
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {MASTER_KIND_LABELS[kind]}
                  </Link>
                );
              })}
            </nav>

            <span
              title="Coming soon"
              className="mt-auto flex h-[44px] cursor-default items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#9aa0ab]"
            >
              <LifeBuoy className="h-[19px] w-[19px]" />
              Support
            </span>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
