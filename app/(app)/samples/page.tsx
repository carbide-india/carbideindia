import Link from "next/link";
import { Plus } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import {
  SampleTable,
  NEW_SAMPLE_ROUTE,
} from "@/components/samples/sample-table";
import { requireUser } from "@/lib/auth/current";
import { listSamples } from "@/lib/queries/samples";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { SAMPLE_STATUSES, type SampleStatus } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SamplesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  await requireUser();

  // ?status= — must be a known sample status; anything else is ignored.
  const rawStatus = firstString(sp.status);
  const status =
    rawStatus && (SAMPLE_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as SampleStatus)
      : undefined;
  // ?resp= — responsible-person employee id; only accept a UUID-shaped value.
  const rawResp = firstString(sp.resp)?.trim();
  const responsibleId = rawResp && UUID_RE.test(rawResp) ? rawResp : undefined;
  // ?q= — free-text sample-number / notes search (ilike-escaped in the query).
  const q = firstString(sp.q)?.trim() || undefined;

  const [rows, employees] = await Promise.all([
    listSamples({ status, q, responsibleId }),
    listEmployeeOptions(),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-10 pb-20">
        <header className="mb-8 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
              Sales · Sample Register
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
              Samples
            </h1>
            <p className="text-body-lg text-ink-subtle mt-2 tabular-nums">
              {rows.length} {rows.length === 1 ? "sample" : "samples"} —
              physical samples tracked through dimension, chemical, drawing and
              costing.
            </p>
          </div>
          <Link
            href={NEW_SAMPLE_ROUTE}
            className="inline-flex items-center gap-2 text-cta text-white px-6 py-3 rounded-chip transition-transform hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
              boxShadow: "0 6px 16px rgba(63, 63, 148, 0.32)",
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
            New Sample
          </Link>
        </header>
        <SampleTable
          rows={rows}
          employees={employees}
          activeFilters={{
            status: status ?? null,
            responsibleId: responsibleId ?? null,
            q: q ?? null,
          }}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
