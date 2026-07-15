"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState } from "react";
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
  SlidersHorizontal,
  ClipboardCheck,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { ReactNode } from "react";
import { HubSearch } from "@/components/hub/hub-search";
import { ModuleTitleBadge } from "@/components/layout/module-title-badge";
import { draftKindForSegment, FORM_DRAFT_META } from "@/lib/drafts/form-drafts";
import { customEditorForSegment } from "@/lib/custom-lists/registry";
import { cn } from "@/lib/utils";

interface NavDef {
  label: string;
  href: Route;
  Icon: typeof FileText;
  ready: boolean;
  /** returns true when this item should show active for the given path */
  active?: (path: string) => boolean;
  /** Section key - a greyed divider is drawn where this changes. */
  group?: "overview" | "create" | "records" | "config";
}

// "Create New Form" opens the CURRENT form family's own new page - each form
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
// The Contact Person Address Book lives under /contacts but belongs to the
// Client (KYC) family - so its sidebar reads Client Master, not New Enquiry.
function familySeg(pathname: string): string {
  const seg = pathname.split("/")[1] ?? "";
  return seg === "contacts" ? "clients" : seg;
}
function newFormRoute(pathname: string): string {
  return NEW_FORM_ROUTES[familySeg(pathname)] ?? "/enquiries/new";
}

// The register/list page for the current form family - each form has its own.
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
  return REGISTERS[familySeg(pathname)] ?? { label: "Enquiry Register", href: "/enquiries/register" };
}

// Sidebar nav for the module - context-aware: on client routes it reads as the
// Client Master family, otherwise the Enquiry family.
function navFor(pathname: string): NavDef[] {
  const newForm = newFormRoute(pathname);
  // Each form family has its OWN drafts page (kyc/sample/…); enquiry keeps its
  // dedicated /enquiries/drafts. /contacts maps to the clients family.
  const draftKind = draftKindForSegment(familySeg(pathname));
  const draftsRoute = draftKind ? FORM_DRAFT_META[draftKind].draftsRoute : "/enquiries/drafts";
  // Per-form Recycle Bin - only the generic-draft forms have one (enquiry uses
  // its own draft store without recycling).
  const recycleBinRoute = draftKind ? FORM_DRAFT_META[draftKind].recycleBinRoute : null;
  // "Create New Form" reads as the specific form (e.g. "Create New Enquiry").
  const createLabel = draftKind
    ? `Create New ${FORM_DRAFT_META[draftKind].noun}`
    : familySeg(pathname) === "enquiries" || familySeg(pathname) === "inquiries"
      ? "Create New Enquiry"
      : "Create New Form";
  const custom = customEditorForSegment(familySeg(pathname));
  const items: NavDef[] = [
    { label: "Dashboard", href: "/hub" as Route, Icon: LayoutDashboard, ready: false, group: "overview" },
    {
      label: createLabel,
      href: newForm as Route,
      Icon: FilePlus2,
      ready: true,
      active: (p) => p.startsWith(newForm),
      group: "create",
    },
    {
      label: "Drafts",
      href: draftsRoute as Route,
      Icon: Files,
      ready: true,
      active: (p) => p.startsWith(draftsRoute),
      group: "create",
    },
    (() => {
      const reg = registerFor(pathname);
      return {
        label: reg.label,
        href: reg.href as Route,
        Icon: FileText,
        ready: true,
        group: "records" as const,
        active: (p: string) =>
          p === reg.href ||
          (p.startsWith(reg.href) &&
            !p.startsWith(`${reg.href}/new`) &&
            !p.startsWith(`${reg.href}/drafts`) &&
            !p.startsWith(`${reg.href}/recycle-bin`) &&
            !p.startsWith(`${reg.href}/custom`)),
      };
    })(),
    // Contact Person Address Book - only in the Client KYC (clients) family.
    ...((familySeg(pathname) === "clients" || familySeg(pathname) === "contacts")
      ? ([
          {
            label: "Client Address Book",
            href: "/contacts" as Route,
            Icon: Contact,
            ready: true,
            active: (p: string) => p.startsWith("/contacts"),
            group: "records" as const,
          },
        ] as NavDef[])
      : []),
    // Recycle Bin - per form, next to that form's Drafts.
    ...(recycleBinRoute
      ? ([
          {
            label: "Recycle Bin",
            href: recycleBinRoute as Route,
            Icon: Trash2,
            ready: true,
            active: (p: string) => p.startsWith(recycleBinRoute),
            group: "records",
          },
        ] as NavDef[])
      : []),
  ];
  // Primary Feasibility launcher - enquiry family only (pick an SM to verify).
  const fam = familySeg(pathname);
  if (fam === "enquiries" || fam === "inquiries") {
    items.push({
      label: "Primary Feasibility",
      href: "/enquiries/feasibility" as Route,
      Icon: ClipboardCheck,
      ready: true,
      active: (p) => p.startsWith("/enquiries/feasibility"),
      group: "records",
    });
  }
  // Forms with their own "Custom" dropdown lists get a Custom editor entry.
  // The Sample Register family labels it "SAM Dropdown Master"; others keep
  // "CUST Dropdown Master" (e.g. Client KYC).
  if (custom) {
    items.push({
      label:
        custom.formKey === "sample"
          ? "SAM Dropdown Master"
          : custom.formKey === "enquiry"
            ? "ENQ Dropdown Master"
            : "CUST Dropdown Master",
      href: custom.route as Route,
      Icon: SlidersHorizontal,
      ready: true,
      active: (p) => p.startsWith(custom.route),
      group: "config",
    });
  }
  return items;
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
  // The header shows the current form MODULE name (e.g. "Client KYC") on every
  // one of its sub-pages - Master, Drafts, Contact Book, Recycle Bin, Custom -
  // so the top title never just repeats the page's own <h1> below it.
  const headerSeg = familySeg(pathname);
  const headerKind = draftKindForSegment(headerSeg);
  const pageTitle = headerKind
    ? FORM_DRAFT_META[headerKind].noun
    : headerSeg === "enquiries" || headerSeg === "inquiries"
      ? // The enquiry module reads as "New Enquiry" everywhere except the
        // form-selection launchpad, which stays "Forms".
        pathname === "/enquiries"
        ? "Forms"
        : "New Enquiry"
      : title ?? "Forms";
  // Sidebar is hidden entirely on the launchpad (form selection).
  const showSidebar = pathname !== "/enquiries";
  const nav = navFor(pathname);

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f7]">
      {/* ── Top header bar (full width) ─────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#e5e7eb] bg-white px-4">
        {/* Left zone - toggle, Back-to-Forms, Hub, then the module title. On
            form pages it gets extra width + a right buffer so a long title like
            "CLIENT KYC" never collides with the centred search; on the launchpad
            (no sidebar) it stays tight so "FORMS" hugs the Hub button. */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-3",
            showSidebar ? "flex-[1.4] pr-6" : "flex-1",
          )}
        >
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
              className="group flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[#3f3f94] px-3.5 text-[13.5px] font-bold text-white shadow-[0_4px_12px_rgba(63,63,148,0.38)] ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(63,63,148,0.52)] hover:brightness-110 active:translate-y-0 active:scale-95"
              aria-label="Back to all forms"
            >
              <ArrowLeft className="h-[17px] w-[17px] transition-transform duration-200 group-hover:-translate-x-0.5" />
              Back to Forms
            </Link>
          )}
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
          <ModuleTitleBadge title={pageTitle} align={showSidebar ? "center" : "start"} />
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
                {nav.map((n, i) => {
                  const prev = nav[i - 1];
                  // A greyed divider separates each section (overview / create /
                  // records / config) so items read as groups, not floating text.
                  const showDivider =
                    i > 0 && !!n.group && !!prev?.group && n.group !== prev.group;
                  const isActive = n.ready && (n.active ? n.active(pathname) : false);
                  const base =
                    "flex h-[44px] items-center gap-3 rounded-lg px-3.5 text-[14px] transition";
                  return (
                    <Fragment key={n.label}>
                      {showDivider && <div className="my-2 h-[1.5px] rounded-full bg-[#c2c7d6]" />}
                      {!n.ready ? (
                        <span
                          title="Coming soon"
                          className={`${base} cursor-default font-semibold text-[#b3b8c2]`}
                        >
                          <n.Icon className="h-[19px] w-[19px]" />
                          {n.label}
                        </span>
                      ) : (
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
                      )}
                    </Fragment>
                  );
                })}

                {bulkUpload && (
                  <>
                    <div className="my-2 h-[1.5px] rounded-full bg-[#c2c7d6]" />
                    {bulkUpload}
                  </>
                )}
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
        <main className={cn("min-w-0 flex-1 px-8", showSidebar ? "py-8" : "pb-8 pt-4")}>
          {children}
        </main>
      </div>
    </div>
  );
}
