import type { Metadata, Route } from "next";
import Link from "next/link";
import { Bell, Factory, FileText, Database, SlidersHorizontal, ArrowRight } from "lucide-react";
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
  Icon: typeof Bell;
}[] = [
  {
    key: "wms",
    title: "WMS",
    desc: "Track active jobs, schedules and floor routing.",
    href: "/" as Route,
    Icon: Factory,
  },
  {
    key: "enquiries",
    title: "Forms",
    desc: "Requests, quotations and the sales pipeline.",
    href: "/enquiries" as Route,
    Icon: FileText,
  },
  {
    key: "masters",
    title: "Masters",
    desc: "Materials, parts libraries and vendor directories.",
    href: "/masters" as Route,
    Icon: Database,
  },
  {
    key: "admin",
    title: "Admin Panel",
    desc: "Users, roles, access control and audit logs.",
    href: "/admin" as Route,
    Icon: SlidersHorizontal,
  },
];

export default async function HubPage() {
  const me = await getCurrentEmployee();
  const firstName = me?.name?.trim().split(/\s+/)[0] ?? "there";

  const unread = me ? await getUnreadCount(me.id).catch(() => 0) : 0;

  return (
    // Fixed to one screen height — nothing scrolls.
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes hubUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .hub-in { animation: hubUp .5s cubic-bezier(.22,.61,.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .hub-in { animation: none; } }
      `,
        }}
      />

      {/* Solid blue accent line (flat, no gradient) */}
      <div className="h-[3px] w-full shrink-0 bg-[#3f3f94]" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-[#e5e7eb] bg-white">
        <div className="mx-auto flex h-[76px] w-full max-w-[1320px] items-center gap-6 px-8 max-md:px-5">
          <span className="shrink-0 text-[19px] font-bold tracking-tight text-[#9aa0ab] max-lg:hidden">
            Choose Your Workspace
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <HubSearch />
            <Link
              href={"/inbox" as Route}
              className="relative grid h-10 w-10 place-items-center rounded-xl text-[#4b5563] transition-colors hover:bg-[#eef1fb] hover:text-[#3f3f94]"
              aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
            >
              <Bell className="h-[22px] w-[22px]" />
              {unread > 0 && (
                <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#d32f2f] px-1 text-[11px] font-bold text-white ring-2 ring-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <UserMenuServer />
          </div>
        </div>
      </header>

      {/* ── Body: vertically centred so it all fits one screen ─────────── */}
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col justify-start px-8 pt-10 pb-6 max-md:px-5 max-md:pt-6">
        {/* Greeting - logo + "Carbide India Welcomes {name}." (bigger) */}
        <div className="hub-in flex flex-col items-center gap-5 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.png"
              alt="Carbide India"
              className="h-[92px] w-auto max-md:h-[68px] max-sm:h-[54px]"
              style={{ display: "block" }}
            />
            <h1 className="text-[46px] font-extrabold leading-[1.08] tracking-tight text-[#0f172a] max-md:text-[34px] max-sm:text-[26px]">
              <span className="text-[#3f3f94]">CARBIDE INDIA</span> Welcomes{" "}
              <span className="text-[#3f3f94]">{firstName.toUpperCase()}</span>.
            </h1>
          </div>
        </div>

        {/* Module cards - wide rectangles, one row, bigger fonts, no gradients. */}
        <div className="mx-auto mt-12 grid w-full max-w-[1200px] grid-cols-4 gap-6 max-lg:grid-cols-2 max-sm:grid-cols-1 max-md:mt-8">
          {MODULES.map((m, i) => (
            <Link
              key={m.key}
              href={m.href}
              className="hub-in group relative flex flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-[#3f3f94] hover:shadow-[0_18px_40px_-18px_rgba(63,63,148,0.35)]"
              style={{ animationDelay: `${0.08 + i * 0.06}s` }}
            >
              <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-[#3f3f94] transition-transform duration-300 group-hover:scale-x-100" />

              {/* Icon + title on one line (rectangle, not a tall square). */}
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#3f3f94] text-white transition-colors duration-200 group-hover:bg-[#33337a]">
                  <m.Icon className="h-7 w-7" strokeWidth={1.9} />
                </span>
                <h3 className="text-[24px] font-extrabold tracking-tight text-[#111827]">
                  {m.title}
                </h3>
              </div>

              <p className="mt-4 text-[15px] font-medium leading-[1.5] text-[#4b5563]">
                {m.desc}
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-[#eef0f4] pt-4">
                <span
                  className="text-[12.5px] font-bold tracking-[0.1em] text-[#3f3f94]"
                  style={{ fontFamily: MONO }}
                >
                  OPEN MODULE
                </span>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#eef1fb] text-[#3f3f94] transition-colors duration-200 group-hover:bg-[#3f3f94] group-hover:text-white">
                  <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
