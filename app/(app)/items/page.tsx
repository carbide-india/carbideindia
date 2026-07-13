import Link from "next/link";
import type { Route } from "next";
import { Plus, Download, Upload } from "lucide-react";
import { ItemTable, NEW_ITEM_ROUTE } from "@/components/items/item-table";
import { requireUser } from "@/lib/auth/current";
import { listItems } from "@/lib/queries/items";
import { listSavedViews } from "@/lib/views/saved-views";
import { SavedViewsBar } from "@/components/erp/saved-views-bar";
import { MastersModuleShell } from "@/components/masters/masters-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

/**
 * Product Master (the internal Item Master), now rendered inside the Masters
 * module shell (Carbide sidebar + indigo header) rather than the legacy WMS
 * chrome — it's the first entry in the Masters sidebar.
 */
export default async function ItemsPage() {
  const me = await requireUser();

  const [rows, savedViews] = await Promise.all([
    listItems(),
    listSavedViews("items", me.id),
  ]);

  return (
    <MastersModuleShell userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-6 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Product Master
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-subtle tabular-nums">
              {rows.length} {rows.length === 1 ? "product" : "products"} — one
              internal code per unique shape, grade &amp; size combination.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={"/items/import" as Route}
              className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface-card px-4 py-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-ink-subtle hover:text-ink-strong"
            >
              <Upload size={15} strokeWidth={2.2} />
              Bulk upload
            </Link>
            <a
              href="/items/export.xlsx"
              className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface-card px-4 py-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-ink-subtle hover:text-ink-strong"
            >
              <Download size={15} strokeWidth={2.2} />
              Export to Excel
            </a>
            <Link
              href={NEW_ITEM_ROUTE}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-bold text-white transition-transform hover:-translate-y-px"
              style={{
                background:
                  "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
                boxShadow: "0 6px 16px rgba(63, 63, 148, 0.32)",
              }}
            >
              <Plus size={16} strokeWidth={2.4} />
              New Product
            </Link>
          </div>
        </header>
        <div className="mb-5">
          <SavedViewsBar module="items" views={savedViews} />
        </div>
        <ItemTable rows={rows} isAdmin={me.isAdmin} />
      </div>
    </MastersModuleShell>
  );
}
