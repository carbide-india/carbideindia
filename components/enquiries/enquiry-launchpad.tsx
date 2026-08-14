"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  FilePlus2,
  UserCheck,
  FlaskConical,
  Calculator,
  FileText,
  Handshake,
  PackageCheck,
  CalendarCheck,
  ClipboardCheck,
  Layers,
  Truck,
} from "lucide-react";

const MONO = "var(--font-mono-display)";
const CARD_GRAD = "linear-gradient(135deg,#4a4ab5 0%,#2f2f6f 100%)";

// OUR forms - the real Carbide sales-pipeline forms. Each card deep-links to the
// live form route.
const FORMS: {
  key: string;
  title: string;
  desc: string;
  tag: string;
  href: Route;
  Icon: typeof FileText;
  /** Hidden from non-admins — the route itself is admin-gated server-side. */
  adminOnly?: boolean;
}[] = [
  {
    key: "kyc",
    title: "Client KYC",
    desc: "Onboard a new client: company profile, contacts, addresses, banking, and documents.",
    tag: "Onboarding",
    href: "/clients/new" as Route,
    Icon: UserCheck,
  },
  {
    key: "sample",
    title: "Sample Register",
    desc: "Log a physical sample - number, location, responsible person, photos, and status.",
    tag: "Sample",
    href: "/samples/new" as Route,
    Icon: FlaskConical,
  },
  {
    key: "enquiry",
    title: "New Enquiry",
    desc: "Start a sales enquiry - capture client, products, and specifications to generate an SM number.",
    tag: "Enquiry",
    href: "/enquiries/new" as Route,
    Icon: FilePlus2,
  },
  {
    key: "feasibility",
    title: "Primary Feasibility",
    desc: "Technical DFM review - verify each enquiry can be manufactured before it is costed.",
    tag: "Feasibility",
    href: "/feasibility" as Route,
    Icon: ClipboardCheck,
    adminOnly: true,
  },
  {
    key: "secondary-feasibility",
    title: "Secondary Feasibility",
    desc: "Detailed technical review per product line - confirmed dimensions, weights, grade, and verdict.",
    tag: "Feasibility",
    href: "/secondary-feasibility" as Route,
    Icon: Layers,
    adminOnly: true,
  },
  {
    key: "costing",
    title: "Costing Sheet",
    desc: "Build BU/BO and in-house costing to derive the final cost per piece.",
    tag: "Costing",
    href: "/costings/new" as Route,
    Icon: Calculator,
  },
  {
    key: "quotation",
    title: "Quotation",
    desc: "Generate a quotation from costed products for a sales enquiry.",
    tag: "Quotation",
    href: "/quotations/new" as Route,
    Icon: FileText,
  },
  {
    key: "negotiation",
    title: "Negotiation",
    desc: "Record price-negotiation rounds and outcomes against a quotation.",
    tag: "Negotiation",
    href: "/negotiations/new" as Route,
    Icon: Handshake,
  },
  {
    key: "sales-order",
    title: "Sales Order",
    desc: "Convert a won negotiation into a confirmed sales order (PO).",
    tag: "Sales Order",
    href: "/sales-orders/new" as Route,
    Icon: PackageCheck,
  },
  {
    key: "meeting",
    title: "Client Meeting",
    desc: "Log a client meeting with notes, attendees, date, and selfie.",
    tag: "Anytime",
    href: "/meetings/new" as Route,
    Icon: CalendarCheck,
  },
  {
    key: "vendors",
    title: "Vendors",
    desc: "Maintain vendor records — codes, contacts, credit terms, GST applicability.",
    tag: "Masters",
    href: "/vendors" as Route,
    Icon: Truck,
  },
];

export function EnquiryLaunchpad({ isAdmin = false }: { isAdmin?: boolean }) {
  // Admin-only forms (both Feasibility modules) are hidden rather than shown
  // and then refused — the routes fail closed server-side either way.
  const forms = FORMS.filter((f) => !f.adminOnly || isAdmin);
  return (
    <div>
      {/* ── Hero - a big logo card on the left, a gap, then a narrower purple
            banner. The whole group is centred on the page. ── */}
      <div className="mx-auto flex w-full max-w-[1120px] items-center gap-5 max-md:gap-3">
        {/* Floating big logo (on the page background, to the left of the bar).
            Clicking the brand IS the way back to the Hub — the separate "Hub"
            button was removed from every module header on 2026-08-13, so the
            name has to carry it. */}
        <Link
          href={"/hub" as Route}
          aria-label="Back to the Hub"
          title="Back to the Hub"
          className="relative z-10 hidden shrink-0 rounded-2xl border border-[#e3e5ec] bg-white px-5 py-3 shadow-[0_16px_34px_-10px_rgba(15,23,42,0.4)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3f3f94] hover:shadow-[0_20px_40px_-10px_rgba(63,63,148,0.45)] sm:block"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo.png"
            alt="Carbide India"
            className="h-[96px] w-auto max-md:h-[70px]"
            style={{ display: "block" }}
          />
        </Link>

        {/* Purple banner - shrunk; begins to the right of the logo, separated by a gap. */}
        <div
          className="relative flex min-w-0 flex-1 items-center overflow-hidden rounded-2xl px-8 py-4 text-white max-md:px-5"
          style={{
            background: "linear-gradient(120deg,#3f3f94 0%,#5148c4 52%,#7b6cf0 100%)",
            boxShadow: "0 18px 44px -14px rgba(63,63,148,0.55)",
          }}
        >
          {/* Decorative glows. */}
          <div className="pointer-events-none absolute -right-10 -top-20 h-60 w-60 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-white/10 blur-2xl" />

          {/* Title starts at the left · legal entity on the right. */}
          <div className="relative flex w-full items-center justify-between gap-6 max-md:gap-3">
            <div className="min-w-0 text-left">
              <div className="text-[11.5px] font-bold uppercase tracking-[0.2em] text-white/70">
                Carbide India · Sales Forms
              </div>
              <h1 className="mt-1 text-[30px] font-black leading-tight tracking-tight max-md:text-[24px]">
                Select a Form to Proceed!
              </h1>
            </div>
            <div className="hidden shrink-0 text-center md:block">
              <div className="text-[17px] font-black leading-tight tracking-tight text-white">
                Yogeshwar
              </div>
              <div className="text-[17px] font-black leading-tight tracking-tight text-white">
                Engineering
              </div>
              <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
                Pvt. Ltd.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Card grid - compact, centred, prominently outlined so all 8 fit. ── */}
      <div className="mx-auto mt-5 grid max-w-[1120px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {forms.map((f, i) => {
          const n = String(i + 1).padStart(2, "0");
          return (
            <Link
              key={f.key}
              href={f.href}
              className="group relative flex flex-col items-center overflow-hidden rounded-2xl border border-[#e3e5ec] bg-white p-4 text-center transition-all duration-200 hover:-translate-y-1 hover:border-[#3f3f94] hover:shadow-[0_18px_36px_-16px_rgba(63,63,148,0.4)]"
            >
              {/* Stage number - corner badge. */}
              <span
                className="absolute right-3 top-3 rounded-full bg-[#eef1fb] px-2 py-0.5 text-[10px] font-black tabular-nums text-[#3f3f94]"
                style={{ fontFamily: MONO }}
              >
                {n}
              </span>

              <div
                className="grid size-12 place-items-center rounded-xl text-white transition-transform duration-200 group-hover:scale-105"
                style={{ background: CARD_GRAD, boxShadow: "0 8px 18px -6px rgba(63,63,148,0.45)" }}
              >
                <f.Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
              </div>

              <h3 className="mt-2.5 text-[16px] font-extrabold tracking-tight text-[#1e2340]">
                {f.title}
              </h3>

              <p className="mt-1.5 min-h-[40px] flex-1 text-[12.5px] font-medium leading-snug text-[#5b6070]">
                {f.desc}
              </p>

              <span
                className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#eef1fb] px-3 text-[11.5px] font-bold tracking-[0.08em] text-[#3f3f94] transition-all duration-200 group-hover:bg-transparent group-hover:text-white group-hover:[background:linear-gradient(135deg,#4a4ab5,#2f2f6f)] group-hover:shadow-[0_8px_18px_-6px_rgba(63,63,148,0.5)]"
                style={{ fontFamily: MONO }}
              >
                START FORM
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
