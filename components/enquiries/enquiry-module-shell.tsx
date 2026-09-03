"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState } from "react";
import type { Route } from "next";
import {
  ArrowLeft,
  ChevronDown,
  Contact,
  FileCheck2,
  FileClock,
  FilePlus2,
  FileText,
  GitCompareArrows,
  HelpCircle,
  KanbanSquare,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Trash2,
  Truck,
} from "lucide-react";
import type { ReactNode } from "react";
import { HubSearch } from "@/components/hub/hub-search";
import { HistoryNav } from "@/components/layout/history-nav";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { draftKindForSegment, FORM_DRAFT_META } from "@/lib/drafts/form-drafts";
import { customEditorForSegment } from "@/lib/custom-lists/registry";
import { cn } from "@/lib/utils";
import { ModuleStepButtons } from "@/components/layout/next-module-button";
import { ModuleTitleSlot } from "@/components/shell/module-title";

interface NavDef {
  /** Stable handle — `"register"` is where `registerChildren` is nested. */
  id?: string;
  label: string;
  href: Route;
  Icon: typeof FileText;
  ready: boolean;
  /** returns true when this item should show active for the given path */
  active?: (path: string) => boolean;
  /** Section key - a greyed divider is drawn where this changes. */
  group?: "overview" | "create" | "records" | "config" | "bottom";
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
/**
 * The stage board per form family. Every pipeline module has one; the masters
 * (clients, samples, vendors) do not — a board of records that never change
 * status would just be a slower register.
 */
const BOARD_NAV: Record<string, { label: string; href: string }> = {
  enquiries: { label: "Enquiry Kanban", href: "/enquiries/board" },
  feasibility: { label: "Feasibility Kanban", href: "/feasibility/board" },
  "secondary-feasibility": { label: "Secondary Kanban", href: "/secondary-feasibility/board" },
  costings: { label: "Costing Kanban", href: "/costings/board" },
  quotations: { label: "Quotation Kanban", href: "/quotations/board" },
  negotiations: { label: "Negotiation Kanban", href: "/negotiations/board" },
  "sales-orders": { label: "Sales Order Kanban", href: "/sales-orders/board" },
};

function registerFor(pathname: string): { label: string; href: string } {
  return REGISTERS[familySeg(pathname)] ?? { label: "Enquiry Register", href: "/enquiries/register" };
}

// Sidebar nav for the module - context-aware: on client routes it reads as the
// Client Master family, otherwise the Enquiry family.
function navFor(pathname: string): NavDef[] {
  const newForm = newFormRoute(pathname);
  // Which form family this route belongs to; drives the create label and the
  // per-form Recycle Bin. /contacts maps to the clients family.
  const draftKind = draftKindForSegment(familySeg(pathname));
  // Per-form Recycle Bin - only the generic-draft forms have one (enquiry uses
  // its own draft store without recycling).
  const recycleBinRoute = draftKind ? FORM_DRAFT_META[draftKind].recycleBinRoute : null;
  // Per-form Drafts (unfinished, autosaved forms). The 7 generic-draft forms
  // read their route from the meta; Enquiry keeps its own draft store at a fixed
  // path. Everything else (e.g. vendors) has no draft list.
  const draftsRoute = draftKind
    ? FORM_DRAFT_META[draftKind].draftsRoute
    : familySeg(pathname) === "enquiries" || familySeg(pathname) === "inquiries"
      ? "/enquiries/drafts"
      : null;
  // "Create New Form" reads as the specific form (e.g. "Create New Enquiry").
  const createLabel = draftKind
    ? (FORM_DRAFT_META[draftKind].createLabel ??
       `Create New ${FORM_DRAFT_META[draftKind].noun}`)
    : familySeg(pathname) === "enquiries" || familySeg(pathname) === "inquiries"
      ? "Create New Enquiry"
      : familySeg(pathname) === "vendors"
        ? "Create New Vendor"
        : "Create New Form";
  const custom = customEditorForSegment(familySeg(pathname));
  const items: NavDef[] = [
    { label: "Dashboard", href: "/hub" as Route, Icon: LayoutDashboard, ready: false, group: "overview" },
    // Costing has NO "create" entry, and deliberately so. You do not invent a
    // costing out of nothing — you pick a product line that hasn't been costed,
    // which is exactly what the register's Not Started bucket already lists
    // ("costable lines with no cost sheet yet"). "Cost a New Line" was a second
    // door onto that same list: same rows, same action ("Start costing" sits on
    // every register row), one extra hop. Every other form really is created
    // from blank, so they keep theirs.
    ...(familySeg(pathname) === "costings"
      ? []
      : ([
          {
            label: createLabel,
            href: newForm as Route,
            Icon: FilePlus2,
            ready: true,
            active: (p: string) => p.startsWith(newForm),
            group: "create" as const,
          },
        ] as NavDef[])),
    // "Unfinished Forms" USED TO SIT HERE and was removed on 2026-08-13.
    //
    // It was not a second view of the Draft bucket, it was a pile of autosave
    // residue: every visit to a new-form page mints a fresh draft id and starts
    // saving, so opening the form and typing one character leaves a row. The
    // numbers said it plainly — 57 unfinished quotation forms against 2 real
    // quotations, 25 unfinished negotiations against 0 negotiations. Nobody was
    // resuming them; the list was only ever growing.
    //
    // The DRAFT bucket is the real one: a saved record somebody deliberately
    // parked. Autosave still runs (see components/drafts/use-form-draft.ts) and
    // the /…/drafts routes still resolve — only the sidebar entry is gone.
    (() => {
      const reg = registerFor(pathname);
      return {
        id: "register",
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
            !p.startsWith(`${reg.href}/revisions`) &&
            !p.startsWith(`${reg.href}/board`) &&
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
            // Bottom of the sidebar, below the status buckets: it is a
            // reference list, not a step of the costing flow.
            group: "bottom" as const,
          },
        ] as NavDef[])
      : []),
    // The stage BOARD — every pipeline module has one now, not just
    // Negotiation. It is a second view of the same register (same rows,
    // arranged by status), so it sits beside it in `records`. The href comes
    // from the shared registry so a board can never be linked at a path that
    // doesn't exist.
    ...((): NavDef[] => {
      const seg = familySeg(pathname);
      const board = BOARD_NAV[seg];
      if (!board) return [];
      return [
        {
          label: board.label,
          href: board.href as Route,
          Icon: KanbanSquare,
          ready: true,
          active: (p: string) => p.startsWith(board.href),
          group: "records" as const,
        },
      ];
    })(),
    // Revision Log — only in the Quotation family. The matrix of every re-quote
    // (latest → original, changes highlighted), sitting beside the Kanban.
    ...(familySeg(pathname) === "quotations"
      ? ([
          {
            label: "Revision Log",
            href: "/quotations/revisions" as Route,
            Icon: GitCompareArrows,
            ready: true,
            active: (p: string) => p.startsWith("/quotations/revisions"),
            group: "records" as const,
          },
        ] as NavDef[])
      : []),
    // Pipeline Tracker - the cross-stage view (start→current stage per enquiry,
    // plus the On Hold / Cancelled buckets). Feasibility already links it; the
    // downstream pipeline modules (Costing → Sales Order) + Meetings get parity.
    ...((): NavDef[] => {
      const PIPELINE_FAMILIES = new Set([
        "costings",
        "quotations",
        "negotiations",
        "sales-orders",
        "meetings",
      ]);
      if (!PIPELINE_FAMILIES.has(familySeg(pathname))) return [];
      return [
        {
          label: "Pipeline Tracker",
          href: "/pipeline" as Route,
          Icon: LayoutGrid,
          ready: true,
          active: (p: string) => p.startsWith("/pipeline"),
          group: "records" as const,
        },
      ];
    })(),
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
    // Drafts - the form's unfinished, autosaved records. Sits next to Recycle
    // Bin in the housekeeping group at the bottom of the sidebar.
    ...(draftsRoute
      ? ([
          {
            label: "Drafts",
            href: draftsRoute as Route,
            Icon: FileClock,
            ready: true,
            active: (p: string) => p.startsWith(draftsRoute),
            group: "bottom",
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
            group: "bottom",
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
            : "Client Master DD",
      href: custom.route as Route,
      Icon: SlidersHorizontal,
      ready: true,
      active: (p) => p.startsWith(custom.route),
      group: "config",
    });
  }
  // "bottom" always sinks below everything else (Vendor Master, Recycle Bin),
  // whatever order the conditional builders above happened to push them in.
  const rank = (n: NavDef) => (n.group === "bottom" ? 1 : 0);
  return items.sort((a, b) => rank(a) - rank(b));
}

export function EnquiryModuleShell({
  children,
  userMenu,
  bulkUpload,
  title,
  isAdmin = false,
  registerChildren,
  sidebarExtra,
}: {
  children: ReactNode;
  userMenu?: ReactNode;
  bulkUpload?: ReactNode;
  /**
   * Rendered immediately under the register nav item — the buckets read as "the
   * register, split by status" instead of a second, unrelated list. The child
   * owns its own indentation, because the stage's Approved row must sit OUTSIDE
   * the nested sequence. Hidden while collapsed: there is no room for labelled
   * counts in a 72px rail.
   */
  registerChildren?: ReactNode;
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
  // The register's status distribution collapses into the Register row like an
  // accordion. Default open so nothing that was visible before is hidden on load.
  const [registerOpen, setRegisterOpen] = useState(true);
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

  // ── Drafting-sheet theme (the /login look) ────────────────────────────────
  // Applied to every module page the shell renders (all pipeline forms + their
  // registers/boards) for one consistent look — everything except the Forms
  // launchpad, which keeps its own layout (and has no sidebar).
  const themed = showSidebar;
  // Active nav pill: navy on the cream sheet, indigo on the default white shell.
  const activeNav = themed
    ? "bg-[#1E2447] font-bold text-white shadow-[0_2px_8px_rgba(31,37,71,0.30)]"
    : "bg-[#454595] font-bold text-white shadow-[0_2px_8px_rgba(69,69,149,0.30)]";
  const idleNav = themed
    ? "font-semibold text-[#777985] hover:bg-[#e2dfdc] hover:text-[#1f2547]"
    : "font-semibold text-[#777985] hover:bg-[#e2dfdc] hover:text-[#454595]";
  const dividerCls = themed ? "bg-[#e2dfdc]" : "bg-[#e2dfdc]";
  // The module name shown in the sidebar brand block (uppercased in the mockup).
  const brandTitle = title ?? pageTitle;

  return (
    <div className={cn("flex min-h-screen flex-col", themed ? "drafting-grid" : "bg-[#f4f5f7]")}>
      {/* ── Top header bar (full width) ─────────────────────────── */}
      <header className={cn(
        "sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b px-4",
        themed ? "border-[#e2dfdc] bg-[#f4f0e8]" : "border-[#e5e7eb] bg-white",
      )}>
        {/* Left zone - toggle, history, brand. Sized to the sidebar (minus the
            header's own px-4) so the module title that follows starts exactly
            where the white side panel ends. min-w, not w: if the brand ever
            needs more room the title slides right rather than being clipped. */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-3",
            showSidebar && (collapsed ? "min-w-[56px]" : "min-w-[232px]"),
          )}
        >
          {showSidebar && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
              aria-pressed={!collapsed}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#777985] transition hover:bg-[#e2dfdc] hover:text-[#454595] active:scale-90"
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
          {/* Brand logo lives up here in the top bar now (moved out of the
              sidebar). Click → Hub. */}
          <Link href={"/hub" as Route} aria-label="Carbide India — back to the Hub" title="Back to the Hub" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo.png" alt="Carbide India" className="h-8 w-auto max-w-[118px] object-contain" />
          </Link>
        </div>

        {/* Module title — published by the page (a register names itself) with
            the route-derived module name as the fallback. On the cream sheet the
            module name already sits in the sidebar masthead, so the header title
            would double it — hide it there (matches the mockup's clean header). */}
        {!themed && (
          <div className="flex min-w-0 shrink items-center">
            <ModuleTitleSlot fallback={pageTitle} />
          </div>
        )}

        {/* Search - pushed to the right, just before the action icons. */}
        <div className="ml-auto flex min-w-0 flex-1 justify-end pl-4">
          <HubSearch />
        </div>

        {/* Right zone - actions. */}
        <div className="flex shrink-0 items-center justify-end gap-2.5">
          {showSidebar && (
            <Link
              href={"/enquiries" as Route}
              className="group flex h-9 shrink-0 items-center gap-1.5 rounded-lg border-[1.5px] border-[#e2dfdc] bg-white px-3 text-[13px] font-bold text-[#454595] transition-colors hover:border-[#454595] hover:bg-[#f4f0e8] max-md:hidden"
              aria-label="Back to all forms"
            >
              <ArrowLeft className="h-[15px] w-[15px] transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={2.6} />
              Back to Forms
            </Link>
          )}
          <NotificationBell />
          <span
            title="Help - coming soon"
            className="grid h-9 w-9 cursor-default place-items-center rounded-full text-[#a8a8a8]"
          >
            <HelpCircle className="h-[16px] w-[16px]" />
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
              "sticky top-[60px] h-[calc(100vh-60px)] shrink-0 overflow-hidden border-r transition-[width] duration-300 ease-in-out",
              themed ? "border-[#e2dfdc] bg-[#f4f0e8]" : "border-[#e5e7eb] bg-white",
              collapsed ? "w-[72px]" : "w-[248px]",
            )}
          >
            <div className={cn("relative flex h-full flex-col py-3", collapsed ? "w-[72px] items-center px-2" : "w-[248px] px-4")}>
              {/* Blueprint diamond cluster — the drafting-sheet flourish from the
                  mockup. Purely decorative: behind the nav, non-interactive, and
                  clipped by the aside's overflow-hidden so it never spills. */}
              {themed && !collapsed && (
                <div aria-hidden className="pointer-events-none absolute -bottom-3 -left-2 z-0 grid grid-cols-5 gap-2 opacity-80">
                  {[
                    "#e2dfdc", "#a8a8a8", "#1f2547", "#e2dfdc", "#a8a8a8",
                    "#1f2547", "#e2dfdc", "#d03232", "#a8a8a8", "#e2dfdc",
                    "#a8a8a8", "#e2dfdc", "#1f2547", "#e2dfdc", "#d03232",
                  ].map((c, i) => (
                    <span key={i} className="h-3.5 w-3.5 rotate-45 rounded-[2px]" style={{ background: c, opacity: 0.5 }} />
                  ))}
                </div>
              )}
              {/* Cream-sheet brand block: the Carbide India logo, the module name
                  and the tagline — the sidebar masthead from the mockup. Only on
                  the themed shell and only when expanded (no room in the rail). */}
              {themed && !collapsed && (
                <Link
                  href={"/hub" as Route}
                  aria-label="Carbide India — back to the Hub"
                  className="mb-3 flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-1 py-1 transition-colors hover:bg-[#e2dfdc]"
                >
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-[14px] font-extrabold uppercase tracking-[0.04em] text-[#1f2547]">
                      {brandTitle}
                    </span>
                    <span className="truncate text-[9.5px] leading-tight text-[#777985]">
                      Your Tungsten Carbide &amp; Tungsten Copper Partners
                    </span>
                  </span>
                </Link>
              )}
              {/* Big brand logo → hub, wordmark stacked beneath. Enlarged while
                  the surrounding spacing is tightened so the nav stays put. */}
              {/* Scrolls on its own so the footer below stays pinned in view.
                  Without this the nav pushed "Go to next module" past the
                  bottom of a 100vh aside with `overflow-hidden`, which clipped
                  it away entirely on the longer modules (KYC, Costing). */}
              <div className="relative z-10 mt-2.5 flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
              <nav className="flex w-full flex-col gap-1">
                {nav.map((n, i) => {
                  const prev = nav[i - 1];
                  // A greyed divider separates each section (overview / create /
                  // records / config) so items read as groups, not floating text.
                  const showDivider =
                    i > 0 && !!n.group && !!prev?.group && n.group !== prev.group;
                  const isActive = n.ready && (n.active ? n.active(pathname) : false);
                  const base = cn(
                    "flex h-[34px] items-center rounded-lg text-[12.5px] transition",
                    collapsed ? "justify-center px-0" : "gap-2.5 px-3",
                  );
                  // The Register row becomes an accordion header when it carries a
                  // status distribution (the expanded rail only) — a chevron on
                  // the right toggles the buckets while the label still links to
                  // the register itself.
                  const isRegisterHeader =
                    n.id === "register" && !!registerChildren && !collapsed;
                  return (
                    <Fragment key={n.label}>
                      {showDivider && <div className={cn("my-2 h-[1.5px] rounded-full", dividerCls)} />}
                      {!n.ready ? (
                        <span
                          title={collapsed ? n.label : "Coming soon"}
                          className={`${base} cursor-default font-semibold text-[#a8a8a8]`}
                        >
                          <n.Icon className="h-[16px] w-[16px]" />
                          {!collapsed && n.label}
                        </span>
                      ) : isRegisterHeader ? (
                        // The whole Register row toggles its status distribution
                        // (clicking anywhere on the tab), so it is a button rather
                        // than a link to the register table.
                        <button
                          type="button"
                          onClick={() => setRegisterOpen((o) => !o)}
                          aria-label={registerOpen ? "Collapse status filters" : "Expand status filters"}
                          aria-expanded={registerOpen}
                          className={cn(
                            "flex h-[34px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-[12.5px] transition",
                            isActive ? activeNav : idleNav,
                          )}
                        >
                          <n.Icon className="h-[16px] w-[16px] shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{n.label}</span>
                          <ChevronDown
                            className={cn(
                              "h-[15px] w-[15px] shrink-0 opacity-70 transition-transform duration-200",
                              registerOpen ? "" : "-rotate-90",
                            )}
                          />
                        </button>
                      ) : (
                        <Link
                          href={n.href}
                          title={collapsed ? n.label : undefined}
                          className={cn(base, isActive ? activeNav : idleNav)}
                        >
                          <n.Icon className="h-[16px] w-[16px]" />
                          {!collapsed && n.label}
                        </Link>
                      )}
                      {/* The register's status buckets, collapsing into the row
                          above like an accordion. `SidebarBuckets` still owns the
                          nesting/indentation within (the Approved exit sits
                          outside the nested working sequence); this only wraps the
                          whole block so the chevron can slide it shut. */}
                      {n.id === "register" && registerChildren && !collapsed && (
                        <div
                          className={cn(
                            "grid transition-[grid-template-rows] duration-200 ease-in-out",
                            registerOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                          )}
                        >
                          <div className="overflow-hidden">{registerChildren}</div>
                        </div>
                      )}
                    </Fragment>
                  );
                })}

                {/* Bulk-upload button carries a label, so only in the expanded rail. */}
                {bulkUpload && !collapsed && (
                  <>
                    <div className={cn("my-2 h-[1.5px] rounded-full", dividerCls)} />
                    {bulkUpload}
                  </>
                )}
              </nav>

              {/* Module-supplied sidebar block (e.g. Costing's status-wise
                  distribution). Hidden while collapsed — there is no room for
                  labelled counts in a 72px rail. */}
              {sidebarExtra && !collapsed && (
                <div className="mt-3 w-full">{sidebarExtra}</div>
              )}
              </div>

              <div className={cn("relative z-10 mt-2 flex w-full shrink-0 flex-col gap-1 border-t pt-2", themed ? "border-[#e2dfdc]" : "border-[#e5e7eb]")}>
                <ModuleStepButtons collapsed={collapsed} />
                <span
                  title="Support - coming soon"
                  className={cn(
                    "flex h-[44px] cursor-default items-center rounded-lg text-[14px] font-semibold text-[#a8a8a8]",
                    collapsed ? "justify-center px-0" : "gap-2.5 px-3",
                  )}
                >
                  <LifeBuoy className="h-[16px] w-[16px]" />
                  {!collapsed && "Support"}
                </span>
              </div>
            </div>
          </aside>
        )}

        {/* Main */}
        <main className={cn("min-w-0 flex-1 px-8", showSidebar ? "py-8" : "pb-8 pt-4", themed && "nt-sheet")}>
          {children}
        </main>
      </div>
    </div>
  );
}
