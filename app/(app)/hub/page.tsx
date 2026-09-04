import type { Metadata, Route } from "next";
import Link from "next/link";
import { Bell, Bot, FileText, Database, Cog, ChevronRight } from "lucide-react";
import { getCurrentEmployee } from "@/lib/auth/current";
import { getUnreadCount } from "@/lib/queries/notifications";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { HubSearch } from "@/components/hub/hub-search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hub - Carbide India",
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
    title: "FORMS",
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
      {/* Scoped animations - entrance stagger + hover polish, motion-safe. */}
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
          <span className="shrink-0 text-[20px] font-bold tracking-tight text-[#9aa0ab] max-lg:hidden">
            Choose Your Workspace To Get Started
          </span>
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
      <main className="mx-auto w-full max-w-[1320px] px-8 py-8">
        {/* Centred greeting - big logo + "Carbide India Welcomes {name}." */}
        <div className="hub-in flex flex-col items-center gap-5 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.png"
              alt="Carbide India"
              className="h-[96px] w-auto max-md:h-[76px] max-sm:h-[60px]"
              style={{ display: "block" }}
            />
            <h1 className="text-[42px] font-extrabold leading-[1.1] tracking-tight text-[#0f172a] max-sm:text-[30px]">
              <span className="text-[#3f3f94]">CARBIDE INDIA</span> Welcomes{" "}
              <span className="text-[#3f3f94]">{firstName.toUpperCase()}</span>.
            </h1>
          </div>
        </div>

        {/* Module cards - a distinctive gradient-banner layout: an index in the
            banner, an icon badge overlapping its bottom edge, and a circular
            arrow CTA that fills on hover. */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m, i) => (
            <Link
              key={m.key}
              href={m.href}
              className="hub-in group relative flex flex-col overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#c7ccf5] hover:shadow-[0_20px_46px_rgba(30,47,102,0.18)]"
              style={{ animationDelay: `${0.12 + i * 0.07}s` }}
            >
              {/* Gradient banner + index. */}
              <div
                className="relative h-[88px] overflow-hidden"
                style={{ background: "linear-gradient(120deg,#3f3f94 0%,#5a4bd0 55%,#7b6cf0 100%)" }}
              >
                <span className="pointer-events-none absolute -right-6 -top-12 h-32 w-32 rounded-full bg-white/12 blur-xl" />
                <span className="pointer-events-none absolute -bottom-14 left-8 h-28 w-28 rounded-full bg-white/10 blur-xl" />
                <span
                  className="absolute right-5 top-4 text-[15px] font-black tabular-nums tracking-wider text-white/55"
                  style={{ fontFamily: MONO }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              {/* Icon badge overlapping the banner edge. */}
              <div className="relative -mt-9 px-6">
                <div className="grid h-[68px] w-[68px] place-items-center rounded-2xl border-4 border-white bg-[linear-gradient(135deg,#4a4ab5,#2f2f6f)] text-white shadow-[0_12px_24px_-8px_rgba(63,63,148,0.55)] transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3">
                  <m.Icon className="h-[32px] w-[32px]" strokeWidth={1.9} />
                </div>
              </div>

              {/* Body. */}
              <div className="flex flex-1 flex-col px-6 pb-6 pt-4">
                <h3 className="text-[22px] font-extrabold tracking-tight text-[#111827]">{m.title}</h3>
                <p className="mt-2 min-h-[70px] text-[14.5px] font-medium leading-[1.55] text-[#4b5563]">
                  {m.desc}
                </p>
                <div className="mt-auto flex items-center justify-between pt-4">
                  <span
                    className="text-[12.5px] font-bold tracking-[0.12em] text-[#3f3f94]"
                    style={{ fontFamily: MONO }}
                  >
                    OPEN MODULE
                  </span>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#eef1fb] text-[#3f3f94] transition-all duration-200 group-hover:text-white group-hover:[background:linear-gradient(135deg,#4a4ab5,#2f2f6f)] group-hover:shadow-[0_8px_18px_-6px_rgba(63,63,148,0.6)]">
                    <ChevronRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
