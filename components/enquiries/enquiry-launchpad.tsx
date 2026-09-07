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
    // Fixed to the viewport (below the 60px top bar + main padding) so the whole
    // launchpad shows on ONE screen with no scrolling; the grid fills the space.
    <div className="relative h-[calc(100vh-108px)] w-full px-6 max-md:px-4">
      {/* Carbide logo floated into the LEFT margin (wide screens); clicking it
          returns to the Hub. Hidden on narrower screens where there is no margin
          room — the top bar still carries the logo there. */}
      <Link
        href={"/hub" as Route}
        aria-label="Back to the Hub"
        title="Back to the Hub"
        className="group absolute left-4 top-2 z-10 hidden w-[180px] items-center justify-center 2xl:flex"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo.png"
          alt="Carbide India"
          className="h-[76px] w-auto transition-transform duration-200 group-hover:-translate-y-0.5"
          style={{ display: "block" }}
        />
      </Link>

      {/* Company name floated into the RIGHT margin. */}
      <div className="absolute right-4 top-3 z-10 hidden text-right 2xl:block">
        <div className="text-[20px] font-black leading-tight tracking-tight text-[#1e2340]">
          Yogeshwar Engineering
        </div>
        <div className="mt-0.5 text-[12px] font-bold uppercase tracking-[0.18em] text-[#9aa0b8]">
          Pvt. Ltd.
        </div>
      </div>

      {/* ── Card grid — centered, fills the height; rows share it equally
            (auto-rows-fr) so 12 cards land on one screen without scrolling. The
            01…11 stage numbers are the pipeline order, so they stay. ── */}
      <div className="mx-auto grid h-full max-w-[1000px] auto-rows-fr grid-cols-2 gap-5 overflow-hidden sm:grid-cols-3 lg:grid-cols-4">
        {forms.map((f, i) => {
          const n = String(i + 1).padStart(2, "0");
          const card = (
            <Link
              key={f.key}
              href={f.href}
              title={f.desc}
              className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#e6e8f2] bg-white p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[#c7cae6] hover:shadow-[0_15px_15px_-10px_#3f3f9480]"
            >
              {/* Indigo accent bar that wipes across the top on hover. */}
              <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-[linear-gradient(90deg,#4a4ab5,#7b6cf0)] transition-transform duration-300 group-hover:scale-x-100" />

              {/* Top row — icon + stage number. */}
              <div className="flex items-start justify-between">
                <div
                  className="grid size-12 place-items-center rounded-2xl text-white ring-1 ring-inset ring-white/20 transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-3"
                  style={{ background: CARD_GRAD, boxShadow: "0 10px 22px -8px rgba(63,63,148,0.55)" }}
                >
                  <f.Icon className="h-6 w-6" strokeWidth={1.9} />
                </div>
                <span
                  className="rounded-full bg-[#f1f2fb] px-2 py-0.5 text-[12px] font-black tabular-nums text-[#5b5bb0] transition-colors group-hover:bg-[#e7e8fb] group-hover:text-[#3f3f94]"
                  style={{ fontFamily: MONO }}
                >
                  {n}
                </span>
              </div>

              {/* Tag chip — the stage's family, adds context without a paragraph. */}
              <span className="mt-3 w-fit text-[11px] font-black uppercase tracking-[0.12em] text-[#9aa0b8]">
                {f.tag}
              </span>

              {/* min-h holds two-line names ("Secondary Feasibility") level with
                  the one-line ones, so every START sits on the same row. */}
              <h3 className="mt-1 flex items-start text-[16.5px] font-extrabold leading-snug tracking-tight text-[#1e2340]">
                {f.title}
              </h3>

              <span
                className="mt-auto inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#eef1fb] px-2 text-[12px] font-bold tracking-[0.06em] text-[#3f3f94] transition-all duration-200 group-hover:text-white group-hover:[background:linear-gradient(135deg,#4a4ab5,#2f2f6f)] group-hover:shadow-[0_10px_22px_-8px_rgba(63,63,148,0.55)]"
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
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#e6e8f2] bg-white p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[#c7cae6] hover:shadow-[0_15px_15px_-10px_#3f3f9480]"
                >
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-[linear-gradient(90deg,#4a4ab5,#7b6cf0)] transition-transform duration-300 group-hover:scale-x-100" />
                  <div className="flex items-start justify-between">
                    <div
                      className="grid size-12 place-items-center rounded-2xl text-white ring-1 ring-inset ring-white/20 transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-3"
                      style={{ background: CARD_GRAD, boxShadow: "0 10px 22px -8px rgba(63,63,148,0.55)" }}
                    >
                      <LayoutGrid className="h-6 w-6" strokeWidth={1.9} />
                    </div>
                  </div>
                  <span className="mt-3 w-fit text-[11px] font-black uppercase tracking-[0.12em] text-[#9aa0b8]">
                    Overview
                  </span>
                  <h3 className="mt-1 flex items-start text-[16.5px] font-extrabold leading-snug tracking-tight text-[#1e2340]">
                    Quick Status
                  </h3>
                  <span
                    className="mt-auto inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#eef1fb] px-2 text-[12px] font-bold tracking-[0.06em] text-[#3f3f94] transition-all duration-200 group-hover:text-white group-hover:[background:linear-gradient(135deg,#4a4ab5,#2f2f6f)] group-hover:shadow-[0_10px_22px_-8px_rgba(63,63,148,0.55)]"
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
