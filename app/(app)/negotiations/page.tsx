import Link from "next/link";
import { Plus } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import {
  NegotiationTable,
  NEW_NEGOTIATION_ROUTE,
} from "@/components/negotiations/negotiation-table";
import { requireUser } from "@/lib/auth/current";
import { listNegotiations } from "@/lib/queries/negotiations";
import { NEGOTIATION_STATUSES, type NegotiationStatus } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function NegotiationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  await requireUser();

  // ?ns= — negotiation-status filter; anything unknown is ignored.
  const rawNs = firstString(sp.ns);
  const negotiationStatus =
    rawNs && (NEGOTIATION_STATUSES as readonly string[]).includes(rawNs)
      ? (rawNs as NegotiationStatus)
      : undefined;
  // ?q= — free-text negotiation-number / company search (ilike-escaped).
  const q = firstString(sp.q)?.trim() || undefined;

  const rows = await listNegotiations({ status: negotiationStatus, q });

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-10 pb-20">
        <header className="mb-8 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
              Sales · Negotiation
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
              Negotiations
            </h1>
            <p className="text-body-lg text-ink-subtle mt-2 tabular-nums">
              {rows.length} {rows.length === 1 ? "negotiation" : "negotiations"} —
              price negotiation tracked from a quote to won, lost or abandoned.
            </p>
          </div>
          <Link
            href={NEW_NEGOTIATION_ROUTE}
            className="inline-flex items-center gap-2 text-cta text-white px-6 py-3 rounded-chip transition-transform hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
              boxShadow: "0 6px 16px rgba(63, 63, 148, 0.32)",
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Negotiation
          </Link>
        </header>
        <NegotiationTable
          rows={rows}
          activeFilters={{
            negotiationStatus: negotiationStatus ?? null,
            q: q ?? null,
          }}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
