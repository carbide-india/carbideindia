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

// Shared card chrome - matches the Hub launchpad language (calm indigo-tint
// tile, hover accent bar, arrow-fill CTA) so the two launchpads read as one
// product.
const CARD_CLASS =
  "group relative flex flex-col overflow-hidden rounded-[18px] border border-[#e4e5ef] bg-white p-4 shadow-[0_1px_2px_rgba(31,31,74,0.05)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#e3e3f5] hover:shadow-[0_22px_50px_-22px_rgba(31,31,74,0.34)]";
const TILE_CLASS =
  "grid size-12 place-items-center rounded-[14px] border border-[#e3e3f5] bg-[#ececf8] text-[#3f3f94] transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105";
const CTA_CLASS =
  "mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#ececf8] px-2 text-[10.5px] font-bold tracking-[0.08em] text-[#3f3f94] transition-all duration-200 group-hover:text-white group-hover:[background:linear-gradient(135deg,#5b57c9,#2b2b6b)] group-hover:shadow-[0_10px_24px_-10px_rgba(63,63,148,0.7)]";

export function EnquiryLaunchpad({ isAdmin = false }: { isAdmin?: boolean }) {
  // Admin-only forms (both Feasibility modules) are hidden rather than shown
  // and then refused — the routes fail closed server-side either way.
  const forms = FORMS.filter((f) => !f.adminOnly || isAdmin);
  return (
    <div className="mx-auto w-full max-w-[1180px]">
      {/* ── Header — clean white masthead: logo (back to Hub) + title, company
            name on the right. Matches the Hub's calm palette. ── */}
      <header className="relative overflow-hidden rounded-[22px] border border-[#e4e5ef] bg-white px-8 py-5 shadow-[0_1px_2px_rgba(31,31,74,0.05)] max-md:px-5">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#3f3f94,#5b57c9)]" />
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
              className="h-[68px] w-auto transition-transform duration-200 group-hover:-translate-y-0.5 max-md:h-[50px]"
              style={{ display: "block" }}
            />
            <span className="hidden h-14 w-px bg-[#e4e5ef] sm:block" />
            <div className="min-w-0">
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a8da6]"
                style={{ fontFamily: MONO }}
              >
                Forms
              </span>
              <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight text-[#16172b] max-md:text-[20px]">
                Select a Form to Proceed
              </h1>
              <p className="mt-1 text-[12.5px] font-medium text-[#8a8da6] max-md:hidden">
                Every step of the sales pipeline, in order — pick where you are.
              </p>
            </div>
          </Link>
          <div className="text-right max-md:hidden">
            <div className="text-[15px] font-extrabold leading-tight tracking-tight text-[#16172b]">
              Yogeshwar Engineering
            </div>
            <div
              className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#8a8da6]"
              style={{ fontFamily: MONO }}
            >
              Pvt. Ltd.
            </div>
          </div>
        </div>
      </header>

      {/* ── Card grid — five across, so the modules read as 5 · 5 · … The
            one-line description each card carries survives as its hover title
            (and the tag chip), so the grid stays scannable. The 01…11 stage
            numbers are meaningful here: these forms ARE the pipeline in order. ── */}
      <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {forms.map((f, i) => {
          const n = String(i + 1).padStart(2, "0");
          const card = (
            <Link key={f.key} href={f.href} title={f.desc} className={CARD_CLASS}>
              {/* Indigo accent bar that wipes across the top on hover. */}
              <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-[linear-gradient(90deg,#3f3f94,#5b57c9)] transition-transform duration-300 group-hover:scale-x-100" />

              {/* Top row — icon + stage number. */}
              <div className="flex items-start justify-between">
                <div className={TILE_CLASS}>
                  <f.Icon className="h-[21px] w-[21px]" strokeWidth={1.9} />
                </div>
                <span
                  className="rounded-full border border-[#e3e3f5] bg-[#ececf8] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[#3f3f94]"
                  style={{ fontFamily: MONO }}
                >
                  {n}
                </span>
              </div>

              {/* Tag chip — the stage's family, adds context without a paragraph. */}
              <span
                className="mt-3 w-fit text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#8a8da6]"
                style={{ fontFamily: MONO }}
              >
                {f.tag}
              </span>

              {/* min-h holds two-line names ("Secondary Feasibility") level with
                  the one-line ones, so every START sits on the same row. */}
              <h3 className="mt-0.5 flex min-h-[38px] items-start text-[14.5px] font-extrabold leading-tight tracking-tight text-[#16172b]">
                {f.title}
              </h3>

              <span className={CTA_CLASS} style={{ fontFamily: MONO }}>
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
                  className={CARD_CLASS}
                >
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-[linear-gradient(90deg,#3f3f94,#5b57c9)] transition-transform duration-300 group-hover:scale-x-100" />
                  <div className="flex items-start justify-between">
                    <div className={TILE_CLASS}>
                      <LayoutGrid className="h-[21px] w-[21px]" strokeWidth={1.9} />
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#eafaf0] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#16a34a]">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
                      Live
                    </span>
                  </div>
                  <span
                    className="mt-3 w-fit text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#8a8da6]"
                    style={{ fontFamily: MONO }}
                  >
                    Overview
                  </span>
                  <h3 className="mt-0.5 flex min-h-[38px] items-start text-[14.5px] font-extrabold leading-tight tracking-tight text-[#16172b]">
                    Quick Status
                  </h3>
                  <span className={CTA_CLASS} style={{ fontFamily: MONO }}>
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
