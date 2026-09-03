"use client";

import { Fragment } from "react";
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
      {/* ── Header — clean, light masthead: the brand logo sits up top (clicking
            it returns to the Hub), with the greeting and company name beside it.
            No coloured banner — the logo already carries the brand. ── */}
      <header className="relative overflow-hidden rounded-[24px] border border-[#e6e8f4] bg-white px-8 py-3 shadow-[0_18px_50px_-32px_rgba(63,63,148,0.4)] max-md:px-5 max-md:py-5">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#4a4ab5,#7b6cf0)]" />
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <Link
            href={"/hub" as Route}
            aria-label="Back to the Hub"
            title="Back to the Hub"
            className="group flex items-center gap-5 max-md:gap-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.png"
              alt="Carbide India"
              className="h-[74px] w-auto transition-transform duration-200 group-hover:-translate-y-0.5 max-md:h-[54px]"
              style={{ display: "block" }}
            />
            <span className="hidden h-16 w-px bg-[#e6e8f4] sm:block" />
            <div className="min-w-0">
              <h1 className="text-[27px] font-black leading-tight tracking-tight text-[#1e2340] max-md:text-[21px]">
                Select a Form to Proceed
              </h1>
              <p className="mt-0.5 text-[12.5px] font-medium text-[#7a7f95] max-md:hidden">
                Every step of the sales pipeline, in order — pick where you are.
              </p>
            </div>
          </Link>
          <div className="text-right max-md:hidden">
            <div className="text-[15px] font-black leading-tight tracking-tight text-[#1e2340]">
              Yogeshwar Engineering
            </div>
            <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#9aa0b8]">
              Pvt. Ltd.
            </div>
          </div>
        </div>
      </header>

      {/* ── Card grid — five across, so the eleven modules read as 5 · 5 · 1.
            The one-line description each card carries survives as its hover
            title (and now the tag chip), so the grid stays scannable while every
            card gains a little more polish. ── */}
      <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {forms.map((f, i) => {
          const n = String(i + 1).padStart(2, "0");
          const card = (
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
          // Quick Status (the pipeline tracker) sits right after Sales Order as
          // its own square card — same look as a form, but it's an overview, not
          // a step, so it carries a "Live" badge instead of a stage number.
          if (f.key === "sales-order") {
            return (
              <Fragment key={f.key}>
                {card}
                <Link
                  href={"/pipeline" as Route}
                  title="Quick Status — every enquiry and exactly where it sits"
                  className="group relative flex flex-col overflow-hidden rounded-[18px] border border-[#e6e8f2] bg-white p-3.5 transition-all duration-200 hover:-translate-y-1.5 hover:border-[#c7cae6] hover:shadow-[0_22px_44px_-20px_rgba(63,63,148,0.5)]"
                >
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-[linear-gradient(90deg,#4a4ab5,#7b6cf0)] transition-transform duration-300 group-hover:scale-x-100" />
                  <div className="flex items-start justify-between">
                    <div
                      className="grid size-12 place-items-center rounded-2xl text-white ring-1 ring-inset ring-white/20 transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-3"
                      style={{ background: CARD_GRAD, boxShadow: "0 10px 22px -8px rgba(63,63,148,0.55)" }}
                    >
                      <LayoutGrid className="h-[21px] w-[21px]" strokeWidth={1.9} />
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#eafaf0] px-2 py-0.5 text-[9.5px] font-black uppercase tracking-[0.1em] text-[#16a34a]">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
                      Live
                    </span>
                  </div>
                  <span className="mt-3 w-fit text-[9.5px] font-black uppercase tracking-[0.12em] text-[#9aa0b8]">
                    Overview
                  </span>
                  <h3 className="mt-0.5 flex min-h-[38px] items-start text-[14.5px] font-extrabold leading-tight tracking-tight text-[#1e2340]">
                    Quick Status
                  </h3>
                  <span
                    className="mt-2.5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#eef1fb] px-2 text-[10.5px] font-bold tracking-[0.06em] text-[#3f3f94] transition-all duration-200 group-hover:text-white group-hover:[background:linear-gradient(135deg,#4a4ab5,#2f2f6f)] group-hover:shadow-[0_10px_22px_-8px_rgba(63,63,148,0.55)]"
                    style={{ fontFamily: MONO }}
                  >
                    OPEN
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </Link>
              </Fragment>
            );
          }
          return card;
        })}
      </div>
    </div>
  );
}
