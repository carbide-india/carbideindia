import type { Metadata, Route } from "next";
import Link from "next/link";
import { Bell, Bot, FileText, Database, Cog, Plus, Activity, ChevronRight } from "lucide-react";
import { getCurrentEmployee } from "@/lib/auth/current";
import { getUnreadCount } from "@/lib/queries/notifications";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { HubSearch } from "@/components/hub/hub-search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hub — Carbide India",
};

const MONO = "var(--font-mono-display)";

const MODULES: {
  key: string;
  title: string;
  desc: string;
  href: Route;
  Icon: typeof Bot;
}[] = [
  {
    key: "wms",
    title: "WMS",
    desc: "Work Management System. Track active jobs, schedules, and floor routing.",
    href: "/" as Route,
    Icon: Bot,
  },
  {
    key: "enquiries",
    title: "Forms",
    desc: "Manage incoming requests, client quotations, and sales pipeline tracking.",
    href: "/enquiries" as Route,
    Icon: FileText,
  },
  {
    key: "masters",
    title: "MASTERS",
    desc: "Core system data. Manage materials, parts libraries, and vendor directories.",
    href: "/masters" as Route,
    Icon: Database,
  },
  {
    key: "admin",
    title: "ADMIN PANEL",
    desc: "System configuration, user roles, access control, and audit logs.",
    href: "/admin" as Route,
    Icon: Cog,
  },
];

export default async function HubPage() {
  const me = await getCurrentEmployee();
  const firstName = me?.name?.trim().split(/\s+/)[0] ?? "there";

  const unread = me ? await getUnreadCount(me.id).catch(() => 0) : 0;

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      {/* Scoped animations — entrance stagger + hover polish, motion-safe. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes hubUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes hubStrip { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        .hub-in { animation: hubUp .6s cubic-bezier(.22,.61,.36,1) both; }
        .hub-strip { background-size: 200% 100%; animation: hubStrip 7s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .hub-in { animation: none; }
          .hub-strip { animation: none; }
        }
      `,
        }}
      />

      {/* Thin indigo accent strip across the very top */}
      <div className="hub-strip h-[4px] w-full bg-[linear-gradient(90deg,#4f3fd4_0%,#7d6cff_50%,#4f3fd4_100%)]" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="hub-in border-b border-[#e5e7eb] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[80px] w-full max-w-[1320px] items-center gap-6 px-8">
          <Link href={"/hub" as Route} className="flex shrink-0 items-center gap-3" aria-label="Carbide India hub">
            <img src="/brand/logo.png" alt="" className="h-11 w-auto" style={{ display: "block" }} />
            <span className="text-[21px] font-extrabold tracking-tight text-[#3f3f94]">CARBIDE INDIA</span>
          </Link>

          <HubSearch />

          <div className="flex shrink-0 items-center gap-4">
            <Link
              href={"/inbox" as Route}
              className="relative grid h-11 w-11 place-items-center rounded-full text-[#4b5563] transition-colors hover:bg-[#eef0f3] hover:text-[#1a2a5e]"
              aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
            >
              <Bell className="h-[22px] w-[22px]" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-[19px] min-w-[19px] place-items-center rounded-full bg-[#d32f2f] px-1 text-[11px] font-bold text-white ring-2 ring-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <UserMenuServer />
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-[1320px] px-8 py-16">
        <h1 className="hub-in text-[44px] font-extrabold leading-[1.1] tracking-tight text-[#0f172a]">
          Welcome back, {firstName}
        </h1>

        {/* Module cards */}
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m, i) => (
            <Link
              key={m.key}
              href={m.href}
              className="hub-in group relative flex flex-col overflow-hidden rounded-2xl border border-[#e8eaed] bg-white p-7 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#c7ccf5] hover:shadow-[0_18px_44px_rgba(30,47,102,0.16)]"
              style={{ animationDelay: `${0.1 + i * 0.06}s` }}
            >
              {/* top hover accent */}
              <span className="pointer-events-none absolute inset-x-0 top-0 h-[4px] origin-left scale-x-0 bg-[linear-gradient(90deg,#2b46b5,#6d5cf0)] transition-transform duration-300 group-hover:scale-x-100" />

              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#e8eefc] transition-all duration-300 group-hover:bg-[#dbe3fb] group-hover:shadow-[0_8px_20px_rgba(43,70,181,0.22)]">
                <m.Icon
                  className="h-[32px] w-[32px] text-[#2b46b5] transition-transform duration-300 group-hover:scale-110"
                  strokeWidth={1.9}
                />
              </div>

              <h3 className="mt-6 text-[23px] font-extrabold tracking-tight text-[#111827]">{m.title}</h3>
              <p className="mt-2.5 min-h-[76px] text-[15.5px] font-medium leading-[1.6] text-[#4b5563]">{m.desc}</p>
              <div
                className="mt-4 flex items-center gap-1.5 text-[13.5px] font-bold tracking-[0.1em] text-[#2b46b5]"
                style={{ fontFamily: MONO }}
              >
                OPEN MODULE
                <ChevronRight className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>

        {/* Quick Actions bar */}
        <div
          className="hub-in mt-8 flex flex-col gap-5 rounded-2xl border border-[#e8eaed] bg-white px-8 py-7 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:flex-row sm:items-center sm:justify-between"
          style={{ animationDelay: ".34s" }}
        >
          <div>
            <h4 className="text-[22px] font-extrabold tracking-tight text-[#111827]">Quick Actions</h4>
            <p className="mt-1.5 text-[16px] font-medium text-[#4b5563]">
              Rapid access to frequent tasks and system diagnostics.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href={"/enquiries/new" as Route}
              className="flex h-[50px] items-center gap-2.5 rounded-xl bg-[#1e2f66] px-6 text-[14px] font-semibold tracking-[0.06em] text-white shadow-[0_2px_8px_rgba(30,47,102,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#18274f] hover:shadow-[0_8px_20px_rgba(30,47,102,0.32)]"
              style={{ fontFamily: MONO }}
            >
              <Plus className="h-[18px] w-[18px]" />
              NEW ENQUIRY
            </Link>
            <Link
              href={"/admin" as Route}
              className="flex h-[50px] items-center gap-2.5 rounded-xl border border-[#d5d8de] bg-white px-6 text-[14px] font-semibold tracking-[0.06em] text-[#3a4152] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#b9c0f0] hover:text-[#1e2f66] hover:shadow-[0_4px_14px_rgba(16,24,40,0.10)]"
              style={{ fontFamily: MONO }}
            >
              <Activity className="h-[18px] w-[18px]" />
              SYSTEM STATUS
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
