import Link from "next/link";
import { Plus } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import {
  InquiryTable,
  NEW_INQUIRY_ROUTE,
} from "@/components/inquiries/inquiry-table";
import { requireUser } from "@/lib/auth/current";
import { listInquiries } from "@/lib/queries/inquiries";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { ENQUIRY_STATUSES, type EnquiryStatus } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InquiriesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  await requireUser();

  // ?status= — must be a known enquiry status; anything else is ignored.
  const rawStatus = firstString(sp.status);
  const status =
    rawStatus && (ENQUIRY_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as EnquiryStatus)
      : undefined;
  // ?sp= — sales-person employee id; only accept a UUID-shaped value.
  const rawSp = firstString(sp.sp)?.trim();
  const salesPersonId = rawSp && UUID_RE.test(rawSp) ? rawSp : undefined;
  // ?q= — free-text company / SM-number search (ilike-escaped in the query).
  const q = firstString(sp.q)?.trim() || undefined;

  const [rows, employees] = await Promise.all([
    listInquiries({ status, salesPersonId, q }),
    listEmployeeOptions(),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-10 pb-20">
        <header className="mb-8 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
              Sales · Enquiry Register
            </div>
            <h1
              className="mt-1 text-ink-strong"
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: 44,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              Enquiries
            </h1>
            <p className="text-body-lg text-ink-subtle mt-2 tabular-nums">
              {rows.length} {rows.length === 1 ? "inquiry" : "inquiries"} — one
              SM number per enquiry, from first contact to costing.
            </p>
          </div>
          <Link
            href={NEW_INQUIRY_ROUTE}
            className="inline-flex items-center gap-2 text-cta text-white px-6 py-3 rounded-chip transition-transform hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
              boxShadow: "0 6px 16px rgba(63, 63, 148, 0.32)",
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Enquiry
          </Link>
        </header>
        <InquiryTable
          rows={rows}
          employees={employees}
          activeFilters={{
            status: status ?? null,
            salesPersonId: salesPersonId ?? null,
            q: q ?? null,
          }}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
