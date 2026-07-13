"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useClerk } from "@clerk/nextjs";
import {
  Bell,
  HelpCircle,
  LifeBuoy,
  LogOut,
  LayoutGrid,
  Users,
  Building2,
  ShieldCheck,
  KeyRound,
  Palette,
  Scale,
  ListChecks,
  Tag,
  Hash,
  Workflow,
  Percent,
  Coins,
  Plug,
  Mail,
  Activity as ActivityIcon,
  MonitorSmartphone,
  ArrowLeftRight,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { HubSearch } from "@/components/hub/hub-search";

const MONO = "var(--font-mono-display)";

interface NavItem {
  label: string;
  Icon: LucideIcon;
  /** Live route. Omit for "coming soon" (inert, muted) items. */
  href?: Route;
  /** Exact-path match (used for Overview → /admin). */
  exact?: boolean;
  /**
   * For settings-backed items that share the /admin/settings pathname but
   * differ by ?tab — active only when the current tab matches. `null` means
   * the default (General / no tab param).
   */
  tab?: string | null;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "PEOPLE & ACCESS",
    items: [
      { label: "Employees", href: "/admin/employees" as Route, Icon: Users },
      { label: "Departments", href: "/admin/departments" as Route, Icon: Building2 },
      { label: "Roles & Permissions", Icon: ShieldCheck },
      { label: "Access Control", Icon: KeyRound },
    ],
  },
  {
    label: "ORGANIZATION",
    items: [
      { label: "Company & Branding", href: "/admin/settings" as Route, Icon: Palette, tab: null },
      { label: "Company & Legal", Icon: Scale },
    ],
  },
  {
    label: "WORKFLOW & DATA",
    items: [
      { label: "Task Statuses", href: "/admin/settings?tab=statuses" as Route, Icon: ListChecks, tab: "statuses" },
      { label: "Subjects", href: "/admin/subjects" as Route, Icon: Tag },
      { label: "Document Numbering", Icon: Hash },
      { label: "Workflow Control", Icon: Workflow },
    ],
  },
  {
    label: "FINANCE",
    items: [
      { label: "Tax & GST", Icon: Percent },
      { label: "Currency & Credit", Icon: Coins },
    ],
  },
  {
    label: "COMMUNICATION",
    items: [
      { label: "Notifications", href: "/admin/notifications" as Route, Icon: Bell },
      { label: "Integrations", href: "/admin/settings?tab=integrations" as Route, Icon: Plug, tab: "integrations" },
      { label: "Templates", Icon: Mail },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { label: "Activity Log", href: "/admin/activity" as Route, Icon: ActivityIcon },
      { label: "Sessions", Icon: MonitorSmartphone },
      { label: "Import / Export", Icon: ArrowLeftRight },
      { label: "Danger Zone", Icon: AlertTriangle },
    ],
  },
];

export function AdminModuleShell({
  children,
  userMenu,
}: {
  children: ReactNode;
  userMenu?: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { signOut } = useClerk();

  const currentTab = searchParams.get("tab") ?? "general";

  function isActive(item: NavItem): boolean {
    if (!item.href) return false;
    // Settings-backed items share /admin/settings, distinguished by ?tab.
    if (item.tab !== undefined) {
      const wanted = item.tab ?? "general";
      return pathname === "/admin/settings" && currentTab === wanted;
    }
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  async function handleSignOut() {
    await signOut({ redirectUrl: "/login" });
  }

  const overviewActive = pathname === "/admin";

  // Running index for staggered entrance across all nav items.
  let stagger = 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f7]">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes admNavIn { from { opacity: 0; transform: translateX(-6px) } to { opacity: 1; transform: none } }
        @keyframes admCardIn { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }
        .adm-nav-item { animation: admNavIn .34s cubic-bezier(.22,.61,.36,1) both; }
        .adm-brand-card { animation: admCardIn .4s cubic-bezier(.22,.61,.36,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .adm-nav-item, .adm-brand-card { animation: none }
        }
      `,
        }}
      />

      {/* ── Top header bar (full width) ─────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-[#e5e7eb] bg-white px-6">
        <Link
          href={"/hub" as Route}
          className="flex shrink-0 items-center gap-2.5"
          aria-label="Carbide India hub"
        >
          <img src="/brand/logo.png" alt="" className="h-8 w-auto" style={{ display: "block" }} />
          <span className="text-[16px] font-extrabold tracking-tight text-[#3f3f94]">
            Carbide India
          </span>
        </Link>
        <HubSearch />
        <div className="flex shrink-0 items-center gap-2.5">
          <Link
            href={"/admin/notifications" as Route}
            className="grid h-9 w-9 place-items-center rounded-full text-[#4b5563] transition hover:bg-[#eef0f3] hover:text-[#3f3f94]"
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
        <aside className="sticky top-[60px] flex h-[calc(100vh-60px)] w-[248px] shrink-0 flex-col overflow-y-auto border-r border-[#e5e7eb] bg-white px-4 py-5">
          {/* Branded Admin Portal card */}
          <div className="adm-brand-card flex items-center gap-3 rounded-2xl border border-[#e6e8ec] bg-gradient-to-br from-[#3f3f94] to-[#5b5bc4] px-3.5 py-3 shadow-[0_8px_22px_-12px_rgba(63,63,148,0.7)]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-[18px] font-black text-white ring-1 ring-inset ring-white/25">
              C
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-extrabold leading-tight tracking-tight text-white">
                Carbide India
              </span>
              <span
                className="mt-0.5 block text-[10px] font-bold tracking-[0.16em] text-white/70"
                style={{ fontFamily: MONO }}
              >
                ADMIN PORTAL
              </span>
            </span>
          </div>

          {/* Overview — pinned above the categories */}
          <nav className="mt-5 flex flex-col gap-2">
            <Link
              href={"/admin" as Route}
              style={{ animationDelay: `${stagger++ * 0.025}s` }}
              className={
                "adm-nav-item flex h-[44px] items-center gap-3 rounded-xl border px-3.5 text-[13.5px] transition " +
                (overviewActive
                  ? "border-[#3f3f94] bg-[#3f3f94] font-bold text-white shadow-[0_3px_10px_rgba(63,63,148,0.28)]"
                  : "border-[#dfe3ea] bg-white font-bold text-[#3f3f94] hover:-translate-y-0.5 hover:border-[#c9c9ea] hover:shadow-[0_6px_16px_rgba(63,63,148,0.10)]")
              }
            >
              <LayoutGrid className="h-[18px] w-[18px] shrink-0" />
              Overview
            </Link>
          </nav>

          {/* Categorized groups */}
          {GROUPS.map((group) => (
            <div key={group.label}>
              <span
                className="mt-6 mb-2 block px-2 text-[10.5px] font-bold tracking-[0.18em] text-[#a2a8b4]"
                style={{ fontFamily: MONO }}
              >
                {group.label}
              </span>
              <nav className="flex flex-col gap-2">
                {group.items.map((item) => {
                  const delay = `${stagger++ * 0.025}s`;
                  const base =
                    "adm-nav-item flex h-[42px] items-center gap-3 rounded-xl border px-3.5 text-[13.5px] transition";
                  if (!item.href) {
                    return (
                      <span
                        key={item.label}
                        title="Coming soon"
                        style={{ animationDelay: delay }}
                        className={`${base} cursor-default border-dashed border-[#e9ebf0] bg-white/40 font-semibold text-[#b3b8c2]`}
                      >
                        <item.Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        <span
                          className="text-[8.5px] font-bold tracking-[0.12em] text-[#c3c8d2]"
                          style={{ fontFamily: MONO }}
                        >
                          SOON
                        </span>
                      </span>
                    );
                  }
                  const active = isActive(item);
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      style={{ animationDelay: delay }}
                      className={
                        active
                          ? `${base} border-[#3f3f94] bg-[#3f3f94] font-bold text-white shadow-[0_2px_8px_rgba(63,63,148,0.25)]`
                          : `${base} border-[#e6e8ec] bg-white font-semibold text-[#3a4152] hover:border-[#c9c9ea] hover:bg-[#f4f4fd] hover:text-[#3f3f94]`
                      }
                    >
                      <item.Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}

          {/* Footer — Support + Sign out */}
          <div className="mt-6 flex flex-col gap-1 border-t border-[#eceef2] pt-3">
            <span
              title="Coming soon"
              className="flex h-[42px] cursor-default items-center gap-3 rounded-lg px-3.5 text-[13.5px] font-semibold text-[#9aa0ab]"
            >
              <LifeBuoy className="h-[18px] w-[18px]" />
              Support
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex h-[42px] items-center gap-3 rounded-lg px-3.5 text-left text-[13.5px] font-semibold text-[#6b7280] transition hover:bg-[#fbecec] hover:text-[#d32f2f]"
            >
              <LogOut className="h-[18px] w-[18px]" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 px-8 py-8 max-md:px-4 max-md:py-6">{children}</main>
      </div>
    </div>
  );
}
