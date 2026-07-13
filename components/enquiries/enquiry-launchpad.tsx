"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Search,
  ArrowRight,
  FilePlus2,
  UserCheck,
  FlaskConical,
  Calculator,
  FileText,
  Handshake,
  PackageCheck,
  CalendarCheck,
} from "lucide-react";

const MONO = "var(--font-mono-display)";

// OUR forms — the real Carbide sales-pipeline forms (replacing the mockup's
// placeholder names). Each card deep-links to the live form route.
const FORMS: { key: string; title: string; desc: string; href: Route; Icon: typeof FileText }[] = [
  {
    key: "kyc",
    title: "Client KYC",
    desc: "Onboard a new client: company profile, contacts, addresses, banking, and documents.",
    href: "/clients/new" as Route,
    Icon: UserCheck,
  },
  {
    key: "enquiry",
    title: "New Enquiry",
    desc: "Start a sales enquiry — capture client, products, and specifications to generate an SM number.",
    href: "/enquiries/new" as Route,
    Icon: FilePlus2,
  },
  {
    key: "sample",
    title: "Sample Register",
    desc: "Log a physical sample — number, location, responsible person, photos, and status.",
    href: "/samples/new" as Route,
    Icon: FlaskConical,
  },
  {
    key: "costing",
    title: "Costing Sheet",
    desc: "Build BU/BO and in-house costing to derive the final cost per piece.",
    href: "/costings/new" as Route,
    Icon: Calculator,
  },
  {
    key: "quotation",
    title: "Quotation",
    desc: "Generate a quotation from costed products for a sales enquiry.",
    href: "/quotations/new" as Route,
    Icon: FileText,
  },
  {
    key: "negotiation",
    title: "Negotiation",
    desc: "Record price-negotiation rounds and outcomes against a quotation.",
    href: "/negotiations/new" as Route,
    Icon: Handshake,
  },
  {
    key: "sales-order",
    title: "Sales Order",
    desc: "Convert a won negotiation into a confirmed sales order (PO).",
    href: "/sales-orders/new" as Route,
    Icon: PackageCheck,
  },
  {
    key: "meeting",
    title: "Client Meeting",
    desc: "Log a client meeting with notes, attendees, date, and selfie.",
    href: "/meetings/new" as Route,
    Icon: CalendarCheck,
  },
];

export function EnquiryLaunchpad() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query
    ? FORMS.filter((f) => (f.title + " " + f.desc).toLowerCase().includes(query))
    : FORMS;

  return (
    <div>
      {/* Header + filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[34px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
          Select a Form to Proceed!
        </h1>
        <div className="flex h-[42px] w-full max-w-[300px] items-center gap-2 rounded-lg border border-[#dfe1e6] bg-white px-3 focus-within:border-[#2b46b5] focus-within:ring-2 focus-within:ring-[#2b46b5]/20">
          <Search className="h-4 w-4 shrink-0 text-[#9aa0ab]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter form types..."
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[#374151] outline-none placeholder:text-[#9aa0ab]"
          />
        </div>
      </div>

      {/* Card grid */}
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((f) => (
          <div
            key={f.key}
            className="group flex flex-col rounded-xl border border-[#e6e8ec] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#c7ccf5] hover:shadow-[0_10px_26px_rgba(30,47,102,0.10)]"
          >
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-[#eef1fb] transition group-hover:bg-[#e2e8fb]">
              <f.Icon className="h-[22px] w-[22px] text-[#2b46b5]" strokeWidth={1.9} />
            </div>
            <h3 className="mt-4 text-[17px] font-extrabold tracking-tight text-[#1e2f66]">{f.title}</h3>
            <p className="mt-1.5 min-h-[58px] flex-1 text-[13px] font-medium leading-[1.55] text-[#4b5563]">{f.desc}</p>
            <Link
              href={f.href}
              className="mt-3 inline-flex h-[34px] w-max items-center gap-2 rounded-md border border-[#d5d8de] px-3 text-[11px] tracking-[0.1em] text-[#1e2f66] transition hover:border-[#2b46b5] hover:bg-[#f5f7ff] hover:text-[#2b46b5]"
              style={{ fontFamily: MONO }}
            >
              START FORM
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-10 text-[14px] text-[#9aa0ab]">No forms match &ldquo;{q}&rdquo;.</p>
      )}
    </div>
  );
}
