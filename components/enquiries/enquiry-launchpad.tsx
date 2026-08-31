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
  LayoutGrid,
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
    <div className="mx-auto w-full max-w-[1180px]">
      {/* ── Hero — one cohesive card: a white logo panel hinged to a deep-indigo
            banner, so the brand and the greeting read as a single masthead
            rather than two floating pieces. ── */}
      <div className="relative overflow-hidden rounded-[26px] border border-[#e6e8f4] bg-white shadow-[0_28px_60px_-30px_rgba(63,63,148,0.45)]">
        <div className="grid items-stretch md:grid-cols-[288px_1fr]">
          {/* Logo panel — clicking the brand IS the way back to the Hub (the
              separate "Hub" button was removed from every module header on
              2026-08-13, so the name has to carry it). */}
          <Link
            href={"/hub" as Route}
            aria-label="Back to the Hub"
            title="Back to the Hub"
            className="group flex items-center justify-center border-b border-[#eef0f8] bg-[radial-gradient(120%_120%_at_0%_0%,#fbfbfe_0%,#f4f5fb_100%)] px-6 py-7 transition-colors hover:bg-[#f7f7fd] md:border-b-0 md:border-r"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.png"
              alt="Carbide India"
              className="h-[92px] w-auto transition-transform duration-200 group-hover:-translate-y-0.5 max-md:h-[68px]"
              style={{ display: "block" }}
            />
          </Link>

          {/* Banner */}
          <div
            className="relative flex min-w-0 items-center overflow-hidden px-9 py-8 text-white max-md:px-6 max-md:py-7"
            style={{
              background:
                "linear-gradient(120deg,#33337f 0%,#3f3f94 40%,#5b52c9 74%,#7b6cf0 100%)",
            }}
          >
            {/* Decorative glows + a faint grid sheen for depth. */}
            <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/12 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 left-1/4 h-60 w-60 rounded-full bg-[#a99bff]/25 blur-3xl" />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.15]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)",
                backgroundSize: "34px 34px",
                maskImage: "radial-gradient(120% 100% at 100% 0%,#000 0%,transparent 70%)",
              }}
            />

            <div className="relative flex w-full items-center justify-between gap-6 max-md:gap-3">
              <div className="min-w-0 text-left">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/85 backdrop-blur-sm">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#8affc1]" />
                  Carbide India · Sales Forms
                </div>
                <h1 className="mt-3 text-[32px] font-black leading-[1.05] tracking-tight max-md:text-[24px]">
                  Select a Form to Proceed
                </h1>
                <p className="mt-1.5 text-[13px] font-medium text-white/70 max-md:hidden">
                  Every step of the sales pipeline, in order — pick where you are.
                </p>
              </div>
              <div className="hidden shrink-0 border-l border-white/20 pl-6 text-right lg:block">
                <div className="text-[17px] font-black leading-tight tracking-tight text-white">
                  Yogeshwar
                </div>
                <div className="text-[17px] font-black leading-tight tracking-tight text-white">
                  Engineering
                </div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/65">
                  Pvt. Ltd.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Admin Panel — a single, un-numbered entry (it is not a pipeline
            step, it is the map of them): one place to reach every form's create
            page, register, board, drafts and recycle bin. ── */}
      <Link
        href={"/pipeline" as Route}
        className="group mt-6 flex items-center gap-4 overflow-hidden rounded-[18px] border border-[#e6e8f2] bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#c7cae6] hover:shadow-[0_18px_40px_-22px_rgba(63,63,148,0.45)]"
      >
        <div
          className="grid size-12 shrink-0 place-items-center rounded-2xl text-white ring-1 ring-inset ring-white/20 transition-transform duration-200 group-hover:scale-105"
          style={{ background: CARD_GRAD, boxShadow: "0 10px 22px -8px rgba(63,63,148,0.55)" }}
        >
          <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={1.9} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[#9aa0b8]">
            Admin Panel
          </div>
          <h3 className="text-[15px] font-extrabold leading-tight tracking-tight text-[#1e2340]">
            Forms Admin Panel — Pipeline Tracker
          </h3>
          <p className="mt-0.5 text-[12px] font-medium text-[#7a7f95] max-md:hidden">
            Every inquiry and exactly where it sits in the process — KYC through Sales Order, done vs pending vs completed.
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-[#3f3f94] transition-transform duration-200 group-hover:translate-x-1" />
      </Link>

      {/* ── Card grid — five across, so the eleven modules read as 5 · 5 · 1.
            The one-line description each card carries survives as its hover
            title (and now the tag chip), so the grid stays scannable while every
            card gains a little more polish. ── */}
      <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {forms.map((f, i) => {
          const n = String(i + 1).padStart(2, "0");
          return (
            <Link
              key={f.key}
              href={f.href}
              title={f.desc}
              className="group relative flex flex-col overflow-hidden rounded-[18px] border border-[#e6e8f2] bg-white p-3.5 transition-all duration-200 hover:-translate-y-1.5 hover:border-[#c7cae6] hover:shadow-[0_22px_44px_-20px_rgba(63,63,148,0.5)]"
            >
              {/* Indigo accent bar that wipes across the top on hover. */}
              <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-[linear-gradient(90deg,#4a4ab5,#7b6cf0)] transition-transform duration-300 group-hover:scale-x-100" />

              {/* Top row — icon + stage number. */}
              <div className="flex items-start justify-between">
                <div
                  className="grid size-12 place-items-center rounded-2xl text-white ring-1 ring-inset ring-white/20 transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-3"
                  style={{ background: CARD_GRAD, boxShadow: "0 10px 22px -8px rgba(63,63,148,0.55)" }}
                >
                  <f.Icon className="h-[21px] w-[21px]" strokeWidth={1.9} />
                </div>
                <span
                  className="rounded-full bg-[#f1f2fb] px-2 py-0.5 text-[10px] font-black tabular-nums text-[#5b5bb0] transition-colors group-hover:bg-[#e7e8fb] group-hover:text-[#3f3f94]"
                  style={{ fontFamily: MONO }}
                >
                  {n}
                </span>
              </div>

              {/* Tag chip — the stage's family, adds context without a paragraph. */}
              <span className="mt-3 w-fit text-[9.5px] font-black uppercase tracking-[0.12em] text-[#9aa0b8]">
                {f.tag}
              </span>

              {/* min-h holds two-line names ("Secondary Feasibility") level with
                  the one-line ones, so every START sits on the same row. */}
              <h3 className="mt-0.5 flex min-h-[38px] items-start text-[14.5px] font-extrabold leading-tight tracking-tight text-[#1e2340]">
                {f.title}
              </h3>

              <span
                className="mt-2.5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#eef1fb] px-2 text-[10.5px] font-bold tracking-[0.06em] text-[#3f3f94] transition-all duration-200 group-hover:text-white group-hover:[background:linear-gradient(135deg,#4a4ab5,#2f2f6f)] group-hover:shadow-[0_10px_22px_-8px_rgba(63,63,148,0.55)]"
                style={{ fontFamily: MONO }}
              >
                START
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
