import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ListTodo,
  CalendarDays,
  SquareKanban,
  Boxes,
  Layers,
  Building2,
  ClipboardList,
  FileText,
  Handshake,
  PackageCheck,
  FlaskConical,
  CalendarRange,
  ClipboardCheck,
  BadgeCheck,
} from "lucide-react";

/**
 * The four workspaces of the Hub launchpad. Navigation is module-scoped: the
 * header shows ONLY the current module's items, derived from the active route
 * via {@link moduleForPath}. This is the source of truth for which section
 * lives in which module - moving an item between modules is a one-line edit.
 */
export type ModuleKey = "wms" | "enquiries" | "feasibility" | "masters" | "admin";

export interface NavItem {
  href: Route;
  label: string;
  Icon: LucideIcon;
  /** Hidden from non-admins. */
  adminOnly?: boolean;
  /** Renders the live active-tasks count badge. */
  taskCount?: boolean;
  /** Active only on an exact path match (e.g. the WMS Dashboard at "/"). */
  exact?: boolean;
}

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  home: Route;
  /** Route prefixes owned by this module (used to resolve the current module). */
  match: string[];
  items: NavItem[];
  /** Enquiries renders the Forms launcher button alongside its items. */
  hasForms?: boolean;
}

export const MODULES: ModuleDef[] = [
  {
    key: "wms",
    label: "WMS",
    home: "/",
    // WMS is the default module; "/" + task surfaces.
    match: ["/tasks"],
    items: [
      { href: "/" as Route, label: "Dashboard", Icon: LayoutDashboard, exact: true },
      { href: "/tasks/agenda" as Route, label: "My Day", Icon: CalendarDays },
      { href: "/tasks" as Route, label: "Tasks", Icon: ListTodo, taskCount: true },
      { href: "/tasks/kanban" as Route, label: "Kanban", Icon: SquareKanban, adminOnly: true },
    ],
  },
  {
    key: "enquiries",
    label: "Enquiries",
    home: "/inquiries",
    match: ["/inquiries", "/quotations", "/negotiations", "/sales-orders", "/samples", "/meetings", "/costings"],
    hasForms: true,
    items: [
      { href: "/samples" as Route, label: "Samples", Icon: FlaskConical },
      { href: "/inquiries" as Route, label: "Enquiries", Icon: FileText },
      { href: "/quotations" as Route, label: "Quotations", Icon: FileText },
      { href: "/negotiations" as Route, label: "Negotiations", Icon: Handshake },
      { href: "/sales-orders" as Route, label: "Sales Orders", Icon: PackageCheck },
      { href: "/meetings" as Route, label: "Meetings", Icon: CalendarRange },
    ],
  },
  {
    key: "feasibility",
    label: "Primary Feasibility",
    home: "/feasibility" as Route,
    match: ["/feasibility"],
    items: [
      { href: "/feasibility" as Route, label: "Feasibility Queue", Icon: ClipboardCheck },
      { href: "/feasibility/approvals" as Route, label: "Approvals", Icon: BadgeCheck },
    ],
  },
  {
    key: "masters",
    label: "Masters",
    home: "/masters",
    match: ["/masters", "/items", "/clients", "/job-cards"],
    items: [
      { href: "/masters" as Route, label: "Masters", Icon: Layers, adminOnly: true },
      { href: "/items" as Route, label: "Item Master", Icon: Boxes },
      { href: "/clients" as Route, label: "Client Master", Icon: Building2, adminOnly: true },
      { href: "/job-cards" as Route, label: "Job Cards", Icon: ClipboardList },
    ],
  },
  {
    key: "admin",
    label: "Admin Panel",
    home: "/admin",
    match: ["/admin"],
    items: [], // Admin keeps its own dedicated layout + sidebar.
  },
];

/** Resolve which module a pathname belongs to. WMS is the default/fallback. */
export function moduleForPath(pathname: string): ModuleKey {
  for (const m of MODULES) {
    if (m.key === "wms") continue; // resolved last, as the fallback
    if (m.match.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return m.key;
    }
  }
  return "wms";
}

export function getModule(key: ModuleKey): ModuleDef {
  return MODULES.find((m) => m.key === key) ?? MODULES[0]!;
}
