"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Route } from "next";
import {
  Bell,
  HelpCircle,
  FileText,
  FilePlus2,
  Files,
  LifeBuoy,
  ArrowLeft,
  LayoutDashboard,
  LayoutGrid,
  Contact,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { ReactNode } from "react";
import { HubSearch } from "@/components/hub/hub-search";
import { draftKindForSegment, FORM_DRAFT_META } from "@/lib/drafts/form-drafts";
import { cn } from "@/lib/utils";

interface NavDef {
  label: string;
  href: Route;
  Icon: typeof FileText;
  ready: boolean;
  /** returns true when this item should show active for the given path */
  active?: (path: string) => boolean;
}

// "Create New Form" opens the CURRENT form family's own new page — each form
// routes to itself (KYC on client routes, Sample on /samples, etc.), falling
// back to New Enquiry.
const NEW_FORM_ROUTES: Record<string, string> = {
  clients: "/clients/new",
  samples: "/samples/new",
  costings: "/costings/new",
  quotations: "/quotations/new",
  negotiations: "/negotiations/new",
  "sales-orders": "/sales-orders/new",
  meetings: "/meetings/new",
};
function newFormRoute(pathname: string): string {
  const seg = pathname.split("/")[1] ?? "";
  return NEW_FORM_ROUTES[seg] ?? "/enquiries/new";
}

// The register/list page for the current form family — each form has its own.
const REGISTERS: Record<string, { label: string; href: string }> = {
  clients: { label: "Client Master", href: "/clients" },
  samples: { label: "Sample Register", href: "/samples" },
  costings: { label: "Costing Register", href: "/costings" },
  quotations: { label: "Quotation Register", href: "/quotations" },
  negotiations: { label: "Negotiation Register", href: "/negotiations" },
  "sales-orders": { label: "Sales Order Register", href: "/sales-orders" },
  meetings: { label: "Meeting Register", href: "/meetings" },
};
function registerFor(pathname: string): { label: string; href: string } {
  const seg = pathname.split("/")[1] ?? "";
  return REGISTERS[seg] ?? { label: "Enquiry Register", href: "/enquiries/register" };
}

// Sidebar nav for the module — context-aware: on client routes it reads as the
// Client Master family, otherwise the Enquiry family.
function navFor(pathname: string): NavDef[] {
  const newForm = newFormRoute(pathname);
  // Each form family has its OWN drafts page (kyc/sample/…); enquiry keeps its
  // dedicated /enquiries/drafts.
  const seg = pathname.split("/")[1] ?? "";
  const draftKind = draftKindForSegment(seg);
  const draftsRoute = draftKind ? FORM_DRAFT_META[draftKind].draftsRoute : "/enquiries/drafts";
  return [
    { label: "Dashboard", href: "/hub" as Route, Icon: LayoutDashboard, ready: false },
    {
      label: "Create New Form",
      href: newForm as Route,
      Icon: FilePlus2,
      ready: true,
      active: (p) => p.startsWith(newForm),
    },
    {
      label: "Drafts",
      href: draftsRoute as Route,
      Icon: Files,
      ready: true,
      active: (p) => p.startsWith(draftsRoute),
    },
    (() => {
      const reg = registerFor(pathname);
      return {
        label: reg.label,
        href: reg.href as Route,
        Icon: FileText,
        ready: true,
        active: (p: string) =>
          p === reg.href ||
          (p.startsWith(reg.href) &&
            !p.startsWith(`${reg.href}/new`) &&
            !p.startsWith(`${reg.href}/drafts`)),
      };
    })(),
    {
      label: "Contact Person",
      href: "/contacts" as Route,
      Icon: Contact,
      ready: true,
      active: (p) => p.startsWith("/contacts"),
    },
  ];
}

export function EnquiryModuleShell({
  children,
  userMenu,
  bulkUpload,
  title,
}: {
  children: ReactNode;
  userMenu?: ReactNode;
  bulkUpload?: ReactNode;
  /** Header title. When omitted it's derived from the route (enquiry pages).
   *  Pass it explicitly to reuse this shell for any other form (KYC, Sample…). */
  title?: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // The page title now lives in the header (beside the search).
  const pageTitle =
    title ?? (pathname.startsWith("/enquiries/new") ? "New Enquiry" : "Enquiries");
  // Sidebar is hidden entirely on the launchpad (form selection).
  const showSidebar = pathname !== "/enquiries";
  const nav = navFor(pathname);

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f7]">
      {/* ── Top header bar (full width) ─────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#e5e7eb] bg-white px-4">
        {/* Left zone — toggle, then the Back-to-Forms shortcut in the gap, then
            the module title. */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {showSidebar && (
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
          )}
          {showSidebar && (
            <Link
              href={"/enquiries" as Route}
              className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#e5e7eb] px-3.5 text-[13.5px] font-bold text-[#3a4152] transition hover:border-[#3f3f94] hover:bg-[#efeffb] hover:text-[#3f3f94] active:scale-95"
              aria-label="Back to all forms"
            >
              <ArrowLeft className="h-[17px] w-[17px]" />
              Back to Forms
            </Link>
          )}
          <span className="ml-1 shrink-0 text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
            {pageTitle}
          </span>
        </div>

        {/* Middle zone — centered search. */}
        <HubSearch />

        {/* Right zone — actions. */}
        <div className="flex flex-1 items-center justify-end gap-2.5">
          <Link
            href={"/hub" as Route}
            className="flex h-10 items-center gap-2 rounded-lg border border-[#dcdce8] px-4 text-[15px] font-extrabold text-[#3f3f94] transition hover:border-[#3f3f94] hover:bg-[#efeffb] active:scale-95"
            aria-label="Back to hub"
          >
            <LayoutGrid className="h-[19px] w-[19px]" strokeWidth={2.4} />
            Hub
          </Link>
          <Link
            href={"/inbox" as Route}
            className="grid h-9 w-9 place-items-center rounded-full text-[#4b5563] transition hover:bg-[#efeffb] hover:text-[#3f3f94]"
            aria-label="Notifications"
          >
            <Bell className="h-[18px] w-[18px]" />
          </Link>
          <span
            title="Help — coming soon"
            className="grid h-9 w-9 cursor-default place-items-center rounded-full text-[#9aa0ab]"
          >
            <HelpCircle className="h-[18px] w-[18px]" />
          </span>
          {userMenu}
        </div>
      </header>

      {/* ── Body: sidebar + main ────────────────────────────────── */}
      <div className="flex flex-1">
        {/* Sidebar — slides in/out via the header toggle. The inner panel keeps
            a fixed width so its contents don't reflow while the width animates. */}
        {showSidebar && (
          <aside
            className={cn(
              "sticky top-[60px] h-[calc(100vh-60px)] shrink-0 overflow-hidden bg-white transition-[width] duration-300 ease-in-out",
              collapsed ? "w-0 border-r-0" : "w-[248px] border-r border-[#e5e7eb]",
            )}
          >
            <div className="flex h-full w-[248px] flex-col px-4 py-4">
              {/* Big brand logo → hub, wordmark stacked beneath. Enlarged while
                  the surrounding spacing is tightened so the nav stays put. */}
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

              <nav className="mt-4 flex flex-col gap-1.5">
                {nav.map((n) => {
                  const isActive = n.ready && (n.active ? n.active(pathname) : false);
                  const base =
                    "flex h-[44px] items-center gap-3 rounded-lg px-3.5 text-[14px] transition";
                  if (!n.ready) {
                    return (
                      <span
                        key={n.label}
                        title="Coming soon"
                        className={`${base} cursor-default font-semibold text-[#b3b8c2]`}
                      >
                        <n.Icon className="h-[19px] w-[19px]" />
                        {n.label}
                      </span>
                    );
                  }
                  return (
                    <Link
                      key={n.label}
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
                  );
                })}

                {bulkUpload}
              </nav>

              <div className="mt-auto flex flex-col gap-1.5">
                <span
                  title="Coming soon"
                  className="flex h-[44px] cursor-default items-center gap-3 rounded-lg px-3.5 text-[14px] font-semibold text-[#9aa0ab]"
                >
                  <LifeBuoy className="h-[19px] w-[19px]" />
                  Support
                </span>
              </div>
            </div>
          </aside>
        )}

        {/* Main */}
        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
