"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AppShell (ERP redesign - Phase 3).
 *
 * Opt-in workspace chrome: a collapsible left nav rail (icon + label), a top
 * context bar (breadcrumb + "where am I"), a main content area, and an optional
 * right slot for a ContextDrawer host. Desktop-first, capped to a wide density
 * max-width.
 *
 * NON-BREAKING: this does NOT replace `(app)/layout.tsx`. Only the reference
 * Item Workspace wraps its content in <AppShell> this phase. The global layout
 * swap is Phase 9.
 *
 * Composable: `nav` (rail items), `breadcrumb` (context bar), `children` (main),
 * optional `rightSlot`.
 */

export interface RailItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Optional live count badge. */
  count?: number;
  /** Force-active override (else derived from pathname prefix). */
  active?: boolean;
}

export interface RailGroup {
  /** Group heading (e.g. SALES / PRODUCT / ADMIN). */
  label?: string;
  items: ReadonlyArray<RailItem>;
}

export interface Breadcrumb {
  label: string;
  href?: string;
}

interface AppShellProps {
  /** Nav-rail groups. */
  nav: ReadonlyArray<RailGroup>;
  /** Breadcrumb trail for the context bar. Last entry is the current page. */
  breadcrumb?: ReadonlyArray<Breadcrumb>;
  /** Extra content for the context bar (e.g. a Stepper), right-aligned area. */
  contextBarExtra?: React.ReactNode;
  /** Main content. */
  children: React.ReactNode;
  /** Optional right context slot (a ContextDrawer host or sticky rail). */
  rightSlot?: React.ReactNode;
  /** localStorage key for the collapse preference. */
  collapseKey?: string;
}

const COLLAPSE_KEY_DEFAULT = "erp-shell-collapsed";

export function AppShell({
  nav,
  breadcrumb,
  contextBarExtra,
  children,
  rightSlot,
  collapseKey = COLLAPSE_KEY_DEFAULT,
}: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  // Restore collapse preference (client-only; avoids hydration flash by reading
  // in an effect and defaulting to expanded).
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(collapseKey);
      if (saved === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, [collapseKey]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(collapseKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function isActive(item: RailItem): boolean {
    if (item.active !== undefined) return item.active;
    if (item.href === "/") return pathname === "/";
    return pathname.startsWith(item.href);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] gap-0 px-4 py-6 max-md:px-2">
      {/* ── Left nav rail ─────────────────────────────────────────── */}
      <aside
        className={cn(
          "sticky top-6 hidden h-[calc(100dvh-3rem)] shrink-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-hairline bg-surface-card p-3 transition-[width] duration-200 md:flex",
          collapsed ? "w-[64px]" : "w-[220px]",
        )}
        style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        aria-label="Workspace navigation"
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="flex items-center justify-center rounded-lg p-2 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>

        <nav className="flex flex-col gap-3">
          {nav.map((group, gi) => (
            <div key={group.label ?? gi} className="flex flex-col gap-1">
              {group.label && !collapsed && (
                <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href as Route}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "erp-rail-item",
                      active && "erp-rail-item-active",
                      collapsed && "justify-center",
                    )}
                  >
                    <item.Icon size={18} strokeWidth={2.1} className="shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && item.count != null && item.count > 0 && (
                      <span className="ml-auto rounded-full bg-surface-track px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-ink-muted">
                        {item.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Center content ────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 md:pl-4">
        {/* Context bar */}
        {(breadcrumb?.length || contextBarExtra) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-card px-4 py-2.5">
            {breadcrumb && breadcrumb.length > 0 && (
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
                {breadcrumb.map((c, i) => {
                  const last = i === breadcrumb.length - 1;
                  return (
                    <React.Fragment key={`${c.label}-${i}`}>
                      {i > 0 && (
                        <ChevronRight size={14} className="shrink-0 text-ink-subtle" aria-hidden />
                      )}
                      {c.href && !last ? (
                        <Link
                          href={c.href as Route}
                          className="truncate text-ink-subtle hover:text-brand"
                        >
                          {c.label}
                        </Link>
                      ) : (
                        <span
                          className={cn(
                            "truncate",
                            last ? "font-semibold text-ink-strong" : "text-ink-subtle",
                          )}
                          aria-current={last ? "page" : undefined}
                        >
                          {c.label}
                        </span>
                      )}
                    </React.Fragment>
                  );
                })}
              </nav>
            )}
            {contextBarExtra && <div className="min-w-0">{contextBarExtra}</div>}
          </div>
        )}

        {/* Main + optional right slot */}
        <div className="flex min-w-0 flex-1 gap-4">
          <main className="min-w-0 flex-1">{children}</main>
          {rightSlot && (
            <div className="hidden w-[300px] shrink-0 xl:block">{rightSlot}</div>
          )}
        </div>
      </div>
    </div>
  );
}
