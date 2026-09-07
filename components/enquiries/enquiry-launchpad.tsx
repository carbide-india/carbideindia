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
    <div className="relative w-full px-6 max-md:px-4">
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

      {/* (Company wordmark moved into the header, centered — see the shell.) */}

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
              className="group relative flex h-full flex-col overflow-hidden rounded-md border border-[#e6e8f2] bg-white p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[#c7cae6] hover:shadow-[0_15px_15px_-10px_#3f3f9480]"
            >
              {/* Indigo accent bar down the LEFT edge — grows in on hover. A
                  vertical rule suits the squarer, rectangular card. */}
              <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] origin-top scale-y-0 bg-[linear-gradient(180deg,#4a4ab5,#7b6cf0)] transition-transform duration-300 group-hover:scale-y-100" />

              {/* Top row — icon + stage number. */}
              <div className="flex items-start justify-between">
                <div
                  className="grid size-12 place-items-center rounded-lg text-white ring-1 ring-inset ring-white/20 transition-transform duration-200 group-hover:scale-105"
                  style={{ background: CARD_GRAD, boxShadow: "0 10px 22px -8px rgba(63,63,148,0.55)" }}
                >
                  <f.Icon className="h-6 w-6" strokeWidth={1.9} />
                </div>
                <span
                  className="text-[15px] font-black tabular-nums text-[#c7cae6] transition-colors group-hover:text-[#3f3f94]"
                  style={{ fontFamily: MONO }}
                >
                  {n}
                </span>
              </div>

              {/* Title carries the card now that the family tag is gone. mt-auto
                  pushes START to the base so every button lines up across rows. */}
              <h3 className="mt-4 flex items-start text-[17px] font-extrabold leading-snug tracking-tight text-[#1e2340]">
                {f.title}
              </h3>

              <span
                className="mt-[10px] inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-[#eef1fb] px-2 text-[12px] font-bold tracking-[0.06em] text-[#3f3f94] transition-all duration-200 group-hover:text-white group-hover:[background:linear-gradient(135deg,#4a4ab5,#2f2f6f)] group-hover:shadow-[0_10px_22px_-8px_rgba(63,63,148,0.55)]"
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
                  className="group relative flex h-full flex-col overflow-hidden rounded-md border border-[#e6e8f2] bg-white p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[#c7cae6] hover:shadow-[0_15px_15px_-10px_#3f3f9480]"
                >
                  <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] origin-top scale-y-0 bg-[linear-gradient(180deg,#4a4ab5,#7b6cf0)] transition-transform duration-300 group-hover:scale-y-100" />
                  <div className="flex items-start justify-between">
                    <div
                      className="grid size-12 place-items-center rounded-lg text-white ring-1 ring-inset ring-white/20 transition-transform duration-200 group-hover:scale-105"
                      style={{ background: CARD_GRAD, boxShadow: "0 10px 22px -8px rgba(63,63,148,0.55)" }}
                    >
                      <LayoutGrid className="h-6 w-6" strokeWidth={1.9} />
                    </div>
                  </div>
                  <h3 className="mt-4 flex items-start text-[17px] font-extrabold leading-snug tracking-tight text-[#1e2340]">
                    Quick Status
                  </h3>
                  <span
                    className="mt-[10px] inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-[#eef1fb] px-2 text-[12px] font-bold tracking-[0.06em] text-[#3f3f94] transition-all duration-200 group-hover:text-white group-hover:[background:linear-gradient(135deg,#4a4ab5,#2f2f6f)] group-hover:shadow-[0_10px_22px_-8px_rgba(63,63,148,0.55)]"
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
