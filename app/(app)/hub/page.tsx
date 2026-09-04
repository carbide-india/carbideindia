import type { Metadata, Route } from "next";
import Link from "next/link";
import {
  Bell,
  Factory,
  FileText,
  Database,
  SlidersHorizontal,
  ArrowRight,
} from "lucide-react";
import { getCurrentEmployee } from "@/lib/auth/current";
import { getNavCounts } from "@/lib/queries/nav-counts";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { HubSearch } from "@/components/hub/hub-search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hub - Carbide India",
};

const MONO = "var(--font-mono-display)";

type ModuleDef = {
  key: string;
  title: string;
  desc: string;
  chip: string;
  href: Route;
  Icon: typeof Bell;
};

const MODULES: ModuleDef[] = [
  {
    key: "wms",
    title: "WMS",
    desc: "Work Management System - track active jobs, schedules and shop-floor routing.",
    chip: "ON FLOOR",
    href: "/" as Route,
    Icon: Factory,
  },
  {
    key: "enquiries",
    title: "Forms",
    desc: "KYC, enquiries, costing, quotations and the sales-order pipeline.",
    chip: "PIPELINE",
    href: "/enquiries" as Route,
    Icon: FileText,
  },
  {
    key: "masters",
    title: "Masters",
    desc: "Grades, tolerances, conditions, product types and the vendor directory.",
    chip: "CORE DATA",
    href: "/masters" as Route,
    Icon: Database,
  },
  {
    key: "admin",
    title: "Admin Panel",
    desc: "Users & roles, access control, status labels, audit logs and settings.",
    chip: "CONTROL",
    href: "/admin" as Route,
    Icon: SlidersHorizontal,
  },
];

export default async function HubPage() {
  const me = await getCurrentEmployee();
  const firstName = me?.name?.trim().split(/\s+/)[0] ?? "there";

  const { inboxUnread } = me
    ? await getNavCounts({ userId: me.id }).catch(() => ({ inboxUnread: 0 }))
    : { inboxUnread: 0 };

  // Real, IST-based date line for the greeting eyebrow.
  const dateLine = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="min-h-screen bg-[#f2f3f9]">
      {/* Scoped animations + mesh - entrance stagger, motion-safe. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes hubUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes hubStrip { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        .hub-in { animation: hubUp .55s cubic-bezier(.22,.61,.36,1) both; }
        .hub-strip { background-size: 200% 100%; animation: hubStrip 8s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .hub-in { animation: none; }
          .hub-strip { animation: none; }
        }
      `,
        }}
      />

      {/* Thin animated indigo accent strip across the very top */}
      <div className="hub-strip h-[4px] w-full bg-[linear-gradient(90deg,#3f3f94_0%,#5b57c9_50%,#3f3f94_100%)]" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-[#e4e5ef] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] w-full max-w-[1280px] items-center gap-5 px-8 max-md:px-5">
          <Link href={"/hub" as Route} className="flex shrink-0 items-center" aria-label="Carbide India Hub">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.png"
              alt="Carbide India"
              className="h-9 w-auto max-w-[132px] object-contain"
              style={{ display: "block" }}
            />
          </Link>
          <span className="h-[30px] w-px shrink-0 bg-[#d6d8e6] max-md:hidden" />
          <span
            className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a8da6] max-lg:hidden"
            style={{ fontFamily: MONO }}
          >
            Workspace&nbsp;·&nbsp;<span className="text-[#3f3f94]">Home</span>
          </span>

          <HubSearch />

          <div className="flex shrink-0 items-center gap-3">
            <Link
              href={"/inbox" as Route}
              className="relative grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl text-[#4e5170] transition-colors hover:bg-[#ececf8] hover:text-[#3f3f94]"
              aria-label={`Notifications${inboxUnread ? ` (${inboxUnread} unread)` : ""}`}
            >
              <Bell className="h-[21px] w-[21px]" />
              {inboxUnread > 0 && (
                <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#d32f2f] px-1 text-[11px] font-bold text-white ring-2 ring-white">
                  {inboxUnread > 99 ? "99+" : inboxUnread}
                </span>
              )}
            </Link>
            <UserMenuServer />
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-[1280px] px-8 py-[46px] max-md:px-5 max-md:py-8">
        {/* Greeting */}
        <section className="hub-in" style={{ animationDelay: ".02s" }}>
          <span
            className="inline-flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a8da6]"
            style={{ fontFamily: MONO }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] shadow-[0_0_0_4px_rgba(34,197,94,0.22)]" />
            {dateLine}
          </span>
          <h1 className="mt-3.5 max-w-[20ch] text-[clamp(30px,4.6vw,46px)] font-extrabold leading-[1.05] tracking-tight text-[#16172b] text-balance">
            Welcome back, <span className="text-[#3f3f94]">{firstName}</span>.
          </h1>
          <p className="mt-3.5 max-w-[60ch] text-[15.5px] font-medium leading-[1.5] text-[#4e5170]">
            Your workspaces for Carbide India - tungsten carbide &amp; tungsten copper.
            Pick where you&apos;re headed.
          </p>
        </section>

        {/* Section label */}
        <div
          className="hub-in mt-10 mb-[18px] flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-[#8a8da6] after:h-px after:flex-1 after:bg-[#e4e5ef] after:content-['']"
          style={{ fontFamily: MONO, animationDelay: ".08s" }}
        >
          Workspaces
        </div>

        {/* Module cards */}
        <div className="grid grid-cols-4 gap-5 max-[1080px]:grid-cols-2 max-[560px]:grid-cols-1">
          {MODULES.map((m, i) => (
            <Link
              key={m.key}
              href={m.href}
              className="hub-in group relative flex flex-col overflow-hidden rounded-[20px] border border-[#e4e5ef] bg-white p-[22px] shadow-[0_1px_2px_rgba(31,31,74,0.05)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#e3e3f5] hover:shadow-[0_26px_60px_-22px_rgba(31,31,74,0.34)]"
              style={{ animationDelay: `${0.12 + i * 0.07}s` }}
            >
              {/* Top accent bar that draws in on hover */}
              <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-[linear-gradient(90deg,#3f3f94,#5b57c9)] transition-transform duration-300 group-hover:scale-x-100" />

              <div className="flex items-start justify-between">
                <span className="grid h-[54px] w-[54px] place-items-center rounded-[15px] border border-[#e3e3f5] bg-[#ececf8] text-[#3f3f94] transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105">
                  <m.Icon className="h-[27px] w-[27px]" strokeWidth={1.9} />
                </span>
                <span
                  className="inline-flex items-center rounded-full border border-[#e3e3f5] bg-[#ececf8] px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.06em] text-[#3f3f94]"
                  style={{ fontFamily: MONO }}
                >
                  {m.chip}
                </span>
              </div>

              <h3 className="mt-5 text-[21px] font-extrabold tracking-tight text-[#16172b]">
                {m.title}
              </h3>
              <p className="mt-2 min-h-[60px] text-[13.5px] font-medium leading-[1.5] text-[#4e5170]">
                {m.desc}
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-[#eceef4] pt-4">
                <span
                  className="text-[11.5px] font-semibold tracking-[0.12em] text-[#3f3f94]"
                  style={{ fontFamily: MONO }}
                >
                  OPEN
                </span>
                <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#ececf8] text-[#3f3f94] transition-all duration-200 group-hover:translate-x-0.5 group-hover:bg-[linear-gradient(135deg,#5b57c9,#2b2b6b)] group-hover:text-white group-hover:shadow-[0_10px_24px_-10px_rgba(63,63,148,0.7)]">
                  <ArrowRight className="h-[18px] w-[18px]" />
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Tagline footer */}
        <div className="hub-in mt-11 border-t border-[#e4e5ef] pt-5 text-[12.5px] tracking-[0.04em] text-[#8a8da6]" style={{ fontFamily: MONO, animationDelay: ".4s" }}>
          Your Tungsten Carbide &amp; Tungsten Copper Partners
        </div>
      </main>
    </div>
  );
}
