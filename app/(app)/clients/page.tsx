import Link from "next/link";
import type { Route } from "next";
import { Plus, Download, Upload } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireAdmin } from "@/lib/auth/current";
import { listClientsForRegister } from "@/lib/queries/clients";
import { ClientRegister } from "@/components/clients/client-register";
import { BackLink } from "@/components/ui/back-link";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const me = await requireAdmin();
  const rows = await listClientsForRegister();
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-10 pb-20">
        <div className="mb-4">
          <BackLink href="/" label="Dashboard" />
        </div>
        <header className="mb-8 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
              Sales · Client Master
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
              Client Master
            </h1>
            <p className="text-body-lg text-ink-subtle mt-2 tabular-nums">
              {rows.length} total &middot; {activeCount} active — KYC, credit,
              banking and compliance for every customer.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={"/clients/import" as Route}
              className="inline-flex items-center gap-2 text-cta text-ink-muted border border-hairline bg-surface-card px-5 py-3 rounded-chip hover:text-ink-strong hover:border-ink-subtle transition-colors"
            >
              <Upload size={15} strokeWidth={2.2} />
              Bulk upload
            </Link>
            <a
              href="/clients/export.xlsx"
              className="inline-flex items-center gap-2 text-cta text-ink-muted border border-hairline bg-surface-card px-5 py-3 rounded-chip hover:text-ink-strong hover:border-ink-subtle transition-colors"
            >
              <Download size={15} strokeWidth={2.2} />
              Export to Excel
            </a>
            <Link
              href={"/clients/new" as Route}
              className="inline-flex items-center gap-2 text-cta text-white px-6 py-3 rounded-chip transition-transform hover:-translate-y-px"
              style={{
                background:
                  "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
                boxShadow: "0 6px 16px rgba(63, 63, 148, 0.32)",
              }}
            >
              <Plus size={16} strokeWidth={2.4} />
              New client
            </Link>
          </div>
        </header>
        <ClientRegister rows={rows} isAdmin={me.isAdmin} />
      </main>
      <DashboardFooter />
    </>
  );
}
