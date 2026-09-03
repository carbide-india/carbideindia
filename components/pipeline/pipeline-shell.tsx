"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Route } from "next";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  CircleDot,
  HelpCircle,
  LayoutGrid,
  LifeBuoy,
  ListChecks,
  Loader2,
  PauseCircle,
  Trash2,
  XCircle,
} from "lucide-react";
import { HubSearch } from "@/components/hub/hub-search";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { cn } from "@/lib/utils";

/**
 * Pipeline Tracker (Forms Admin Panel) shell — its OWN clean chrome, separate
 * from the enquiry module sidebar (which read as clutter here). A cream masthead
 * + a short, purpose-built nav: Overview and the three status views.
 */

interface NavItem {
  label: string;
  href: Route;
  Icon: typeof LayoutGrid;
  /** active when the current path+status matches. */
  status?: string;
}

const NAV: NavItem[] = [
  { label: "Overview", href: "/pipeline" as Route, Icon: LayoutGrid },
  { label: "In Progress", href: "/pipeline?status=in_progress" as Route, Icon: Loader2, status: "in_progress" },
  { label: "On Hold", href: "/pipeline?status=on_hold" as Route, Icon: PauseCircle, status: "on_hold" },
  { label: "Completed", href: "/pipeline?status=completed" as Route, Icon: ListChecks, status: "completed" },
  { label: "Dropped", href: "/pipeline?status=dead" as Route, Icon: XCircle, status: "dead" },
];

export function PipelineShell({ children, userMenu }: { children: ReactNode; userMenu?: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const status = params.get("status");
  const onOverview = pathname === "/pipeline";

  return (
    <div className="drafting-grid flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#e2dfdc] bg-[#f4f0e8] px-4">
        <div className="flex min-w-[232px] shrink-0 items-center gap-2.5">
          <Link href={"/hub" as Route} aria-label="Carbide India — back to the Hub" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo.png" alt="Carbide India" className="h-9 w-auto" />
          </Link>
        </div>
        <div className="ml-auto flex min-w-0 flex-1 justify-end pl-4">
          <HubSearch />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2.5">
          <Link
            href={"/enquiries" as Route}
            className="group flex h-9 shrink-0 items-center gap-1.5 rounded-md border-[1.5px] border-[#e2dfdc] bg-white px-3 text-[13px] font-bold text-[#454595] transition-colors hover:border-[#454595] hover:bg-[#f4f0e8] max-md:hidden"
          >
            <ArrowLeft className="h-[15px] w-[15px]" strokeWidth={2.6} />
            Back to Forms
          </Link>
          <NotificationBell />
          <span title="Help" className="grid h-9 w-9 cursor-default place-items-center rounded-full text-[#a8a8a8]">
            <HelpCircle className="h-[16px] w-[16px]" />
          </span>
          {userMenu}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1">
        <aside className="sticky top-[60px] h-[calc(100vh-60px)] w-[248px] shrink-0 overflow-hidden border-r border-[#e2dfdc] bg-[#f7f4ee]">
          <div className="flex h-full flex-col px-4 py-4">
            {/* Masthead */}
            <div className="mb-4 flex items-center gap-2.5 px-1">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#454595] text-white">
                <LayoutGrid className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-extrabold uppercase tracking-[0.04em] text-[#1f2547]">
                  Quick Status
                </div>
                <div className="text-[9.5px] leading-tight text-[#777985]">Pipeline Tracker</div>
              </div>
            </div>

            <nav className="flex flex-col gap-1">
              {NAV.map((n) => {
                const active = n.status
                  ? onOverview && status === n.status
                  : onOverview && !status;
                return (
                  <Link
                    key={n.label}
                    href={n.href}
                    className={cn(
                      "flex h-[36px] items-center gap-2.5 rounded-md px-3 text-[13px] transition-colors",
                      active
                        ? "bg-[#1f2547] font-bold text-white shadow-[0_2px_8px_rgba(31,37,71,0.30)]"
                        : "font-semibold text-[#44403c] hover:bg-[#ece5d8] hover:text-[#1f2547]",
                    )}
                  >
                    <n.Icon className="h-[16px] w-[16px] shrink-0" />
                    {n.label}
                  </Link>
                );
              })}

              <div className="my-2 h-px bg-[#e2dfdc]" />

              <Link
                href={"/pipeline/recycle-bin" as Route}
                className={cn(
                  "flex h-[36px] items-center gap-2.5 rounded-md px-3 text-[13px] transition-colors",
                  pathname === "/pipeline/recycle-bin"
                    ? "bg-[#1f2547] font-bold text-white shadow-[0_2px_8px_rgba(31,37,71,0.30)]"
                    : "font-semibold text-[#44403c] hover:bg-[#ece5d8] hover:text-[#1f2547]",
                )}
              >
                <Trash2 className="h-[16px] w-[16px] shrink-0" />
                Recycle Bin
              </Link>

              <Link
                href={"/enquiries" as Route}
                className="flex h-[36px] items-center gap-2.5 rounded-md px-3 text-[13px] font-semibold text-[#44403c] transition-colors hover:bg-[#ece5d8] hover:text-[#1f2547]"
              >
                <CircleDot className="h-[16px] w-[16px] shrink-0" />
                All Forms
              </Link>
            </nav>

            <div className="mt-auto border-t border-[#e2dfdc] pt-2">
              <span className="flex h-[40px] cursor-default items-center gap-2.5 rounded-md px-3 text-[13px] font-semibold text-[#a8a8a8]">
                <LifeBuoy className="h-[16px] w-[16px]" />
                Support
              </span>
            </div>
          </div>
        </aside>

        <main className="nt-sheet min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
