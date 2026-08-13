"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState } from "react";
import type { Route } from "next";
import {
  HelpCircle,
  FileText,
  FilePlus2,
  Files,
  LifeBuoy,
  ArrowLeft,
  LayoutDashboard,
  LayoutGrid,
  Contact,
  Truck,
  FileCheck2,
  SlidersHorizontal,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { ReactNode } from "react";
import { HubSearch } from "@/components/hub/hub-search";
import { HistoryNav } from "@/components/layout/history-nav";
import { ModuleTitleBadge } from "@/components/layout/module-title-badge";
import { NotificationBell } from "@/components/notifications/notification-bell";
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
  /** Hidden from non-admins (the target route is admin-gated server-side). */
  adminOnly?: boolean;
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
  vendors: "/vendors/new",
};
// The Contact Person Address Book lives under /contacts but belongs to the
// Client (KYC) family - so its sidebar reads Client Master, not New Enquiry.
function familySeg(pathname: string): string {
  const seg = pathname.split("/")[1] ?? "";
  if (seg === "contacts") return "clients";
  // Primary Feasibility lives inside the Forms module — it borrows the enquiry
  // family's sidebar (Create New Enquiry, Enquiry Register, Primary Feasibility…).
  if (seg === "feasibility") return "enquiries";
  return seg;
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
  vendors: { label: "Vendor Register", href: "/vendors" },
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
      : familySeg(pathname) === "vendors"
        ? "Create New Vendor"
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
    // Drafts — only for families that actually keep a draft store (any
    // draftKind form, or the Enquiry family with its own store). The Vendors
    // family has no auto-save draft, so it shows no Drafts item.
    ...(draftKind ||
    familySeg(pathname) === "enquiries" ||
    familySeg(pathname) === "inquiries"
      ? ([
          {
            label: "Drafts",
            href: draftsRoute as Route,
            Icon: Files,
            ready: true,
            active: (p: string) => p.startsWith(draftsRoute),
            group: "create" as const,
          },
        ] as NavDef[])
      : []),
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
            !p.startsWith(`${reg.href}/vendors`) &&
            !p.startsWith(`${reg.href}/po-register`) &&
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
    // Vendor Master - shown in the Costing family for convenience, but vendors
    // are now maintained entirely in the Forms-module Vendors area (/vendors),
    // so this jumps straight there (the /costings/vendors routes were removed).
    ...(familySeg(pathname) === "costings"
      ? ([
          {
            label: "Vendor Master",
            href: "/vendors" as Route,
            Icon: Truck,
            ready: true,
            active: (p: string) => p.startsWith("/vendors"),
            group: "records" as const,
          },
        ] as NavDef[])
      : []),
    // Customer PO Register - only in the Negotiation family. Lives under
    // /negotiations/po-register so the Negotiation sidebar stays on it (records).
    ...(familySeg(pathname) === "negotiations"
      ? ([
          {
            label: "Customer PO Register",
            href: "/negotiations/po-register" as Route,
            Icon: FileCheck2,
            ready: true,
            active: (p: string) => p.startsWith("/negotiations/po-register"),
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
  // Primary and Secondary Feasibility are each their OWN module, reached from
  // their own Forms launchpad cards. They are deliberately NOT cross-linked
  // here: New Enquiry's sidebar is about the enquiry you are filling in, and a
  // launcher into another module only muddles that.
  //
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
  isAdmin = false,
  sidebarExtra,
}: {
  children: ReactNode;
  userMenu?: ReactNode;
  bulkUpload?: ReactNode;
  /**
   * Rendered under the nav, inside the sidebar. Lets a module hang its own
   * status-wise distribution off the shared shell (the Costing register lists
   * its buckets with live counts) without every other form growing the same
   * block.
   */
  sidebarExtra?: ReactNode;
  /** Header title. When omitted it's derived from the route (enquiry pages).
   *  Pass it explicitly to reuse this shell for any other form (KYC, Sample…). */
  title?: string;
  /** Gates `adminOnly` nav entries. Defaults to false — a shell that doesn't
   *  pass it simply never shows admin-only links (fail closed). */
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // The header shows the current form MODULE name (e.g. "Client KYC") on every
  // one of its sub-pages - Master, Drafts, Contact Book, Recycle Bin, Custom -
  // so the top title never just repeats the page's own <h1> below it.
  const headerSeg = familySeg(pathname);
  const headerKind = draftKindForSegment(headerSeg);
  const pageTitle = pathname.startsWith("/feasibility")
    ? "Primary Feasibility"
    : headerKind
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
  const nav = navFor(pathname).filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f7]">
      {/* ── Top header bar (full width) ─────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#e5e7eb] bg-white px-4">
        {/* Left zone - toggle, Back-to-Forms, Hub. The module title now sits to
            the RIGHT of the search box (after HubSearch, before the icons). */}
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
          {/* Browser-style back / forward — sits between the sidebar toggle and
              Back-to-Forms, driving real history navigation with depth-aware
              enable/disable. */}
          <HistoryNav />
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
        </div>

        {/* Middle zone - centered search. */}
        <HubSearch />

        {/* Module title - centered in the gap between the search and the icons. */}
        <div className="flex flex-1 items-center justify-center">
          <ModuleTitleBadge title={pageTitle} align="start" />
        </div>

        {/* Right zone - actions. */}
        <div className="flex shrink-0 items-center justify-end gap-2.5">
          <NotificationBell />
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
              "sticky top-[60px] h-[calc(100vh-60px)] shrink-0 overflow-hidden border-r border-[#e5e7eb] bg-white transition-[width] duration-300 ease-in-out",
              collapsed ? "w-[72px]" : "w-[248px]",
            )}
          >
            <div className={cn("flex h-full flex-col py-4", collapsed ? "w-[72px] items-center px-2" : "w-[248px] px-4")}>
              {/* Big brand logo → hub, wordmark stacked beneath. Enlarged while
                  the surrounding spacing is tightened so the nav stays put. */}
              <Link
                href={"/hub" as Route}
                className="flex flex-col items-center gap-1 px-1"
                aria-label="Carbide India hub"
              >
                <img src="/brand/logo.png" alt="" className={cn("w-auto", collapsed ? "h-10" : "h-24")} style={{ display: "block" }} />
                {!collapsed && (
                  <span className="text-[22px] font-extrabold leading-none tracking-tight text-[#3f3f94]">
                    Carbide India
                  </span>
                )}
              </Link>

              <nav className="mt-4 flex w-full flex-col gap-1.5">
                {nav.map((n, i) => {
                  const prev = nav[i - 1];
                  // A greyed divider separates each section (overview / create /
                  // records / config) so items read as groups, not floating text.
                  const showDivider =
                    i > 0 && !!n.group && !!prev?.group && n.group !== prev.group;
                  const isActive = n.ready && (n.active ? n.active(pathname) : false);
                  const base = cn(
                    "flex h-[44px] items-center rounded-lg text-[14px] transition",
                    collapsed ? "justify-center px-0" : "gap-3 px-3.5",
                  );
                  return (
                    <Fragment key={n.label}>
                      {showDivider && <div className="my-2 h-[1.5px] rounded-full bg-[#c2c7d6]" />}
                      {!n.ready ? (
                        <span
                          title={collapsed ? n.label : "Coming soon"}
                          className={`${base} cursor-default font-semibold text-[#b3b8c2]`}
                        >
                          <n.Icon className="h-[19px] w-[19px]" />
                          {!collapsed && n.label}
                        </span>
                      ) : (
                        <Link
                          href={n.href}
                          title={collapsed ? n.label : undefined}
                          className={
                            isActive
                              ? `${base} bg-[#3f3f94] font-bold text-white shadow-[0_2px_8px_rgba(63,63,148,0.30)]`
                              : `${base} font-semibold text-[#3a4152] hover:bg-[#efeffb] hover:text-[#3f3f94]`
                          }
                        >
                          <n.Icon className="h-[19px] w-[19px]" />
                          {!collapsed && n.label}
                        </Link>
                      )}
                    </Fragment>
                  );
                })}

                {/* Bulk-upload button carries a label, so only in the expanded rail. */}
                {bulkUpload && !collapsed && (
                  <>
                    <div className="my-2 h-[1.5px] rounded-full bg-[#c2c7d6]" />
                    {bulkUpload}
                  </>
                )}
              </nav>

              {/* Module-supplied sidebar block (e.g. Costing's status-wise
                  distribution). Hidden while collapsed — there is no room for
                  labelled counts in a 72px rail. */}
              {sidebarExtra && !collapsed && (
                <div className="mt-5 w-full">{sidebarExtra}</div>
              )}

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
        )}

        {/* Main */}
        <main className={cn("min-w-0 flex-1 px-8", showSidebar ? "py-8" : "pb-8 pt-4")}>
          {children}
        </main>
      </div>
    </div>
  );
}
