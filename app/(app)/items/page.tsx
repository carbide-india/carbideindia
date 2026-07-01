import Link from "next/link";
import type { Route } from "next";
import { Plus, Download, Upload } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { ItemTable, NEW_ITEM_ROUTE } from "@/components/items/item-table";
import { requireUser } from "@/lib/auth/current";
import { listItems } from "@/lib/queries/items";
import { listSavedViews } from "@/lib/views/saved-views";
import { SavedViewsBar } from "@/components/erp/saved-views-bar";
import { BackLink } from "@/components/ui/back-link";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const me = await requireUser();

  const [rows, savedViews] = await Promise.all([
    listItems(),
    listSavedViews("items", me.id),
  ]);

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
              Production · Item Master
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
              Item Master
            </h1>
            <p className="text-body-lg text-ink-subtle mt-2 tabular-nums">
              {rows.length} {rows.length === 1 ? "item" : "items"} — one
              internal code per unique shape, grade &amp; size combination.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={"/items/import" as Route}
              className="inline-flex items-center gap-2 text-cta text-ink-muted border border-hairline bg-surface-card px-5 py-3 rounded-chip hover:text-ink-strong hover:border-ink-subtle transition-colors"
            >
              <Upload size={15} strokeWidth={2.2} />
              Bulk upload
            </Link>
            <a
              href="/items/export.xlsx"
              className="inline-flex items-center gap-2 text-cta text-ink-muted border border-hairline bg-surface-card px-5 py-3 rounded-chip hover:text-ink-strong hover:border-ink-subtle transition-colors"
            >
              <Download size={15} strokeWidth={2.2} />
              Export to Excel
            </a>
            <Link
              href={NEW_ITEM_ROUTE}
              className="inline-flex items-center gap-2 text-cta text-white px-6 py-3 rounded-chip transition-transform hover:-translate-y-px"
              style={{
                background:
                  "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
                boxShadow: "0 6px 16px rgba(63, 63, 148, 0.32)",
              }}
            >
              <Plus size={16} strokeWidth={2.4} />
              New Item
            </Link>
          </div>
        </header>
        {/* Saved-views bar (ERP Phase 3 primitive) — minimal non-disruptive
            demo. Full register wiring (apply config via nuqs) lands Phase 9. */}
        <div className="mb-5">
          <SavedViewsBar module="items" views={savedViews} />
        </div>
        <ItemTable rows={rows} isAdmin={me.isAdmin} />
      </main>
      <DashboardFooter />
    </>
  );
}
