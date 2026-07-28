import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { itemImportSpec } from "@/lib/import/specs/item";
import { ImportWorkbench } from "@/components/import/import-workbench";
import { commitItemImport } from "./actions";

export const dynamic = "force-dynamic";

export default async function ItemImportPage() {
  const me = await requireUser();
  const lookups = await loadLookups(specRefKinds(itemImportSpec.fields));
  return (
    <main className="mx-auto max-w-[1100px] px-8 max-md:px-4 pt-8 pb-16">
      <Link href={"/masters/product_master" as Route} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-subtle hover:text-ink-strong">
        <ArrowLeft size={14} /> Item Master
      </Link>
      <h1 className="text-display-lg text-ink-strong mt-3">Bulk import - Items</h1>
      <p className="text-body-lg text-ink-subtle mt-1 mb-6">
        Download the template, fill it, upload, fix any flagged cells inline, then import.
      </p>
      <ImportWorkbench spec={itemImportSpec} lookups={lookups} isAdmin={me.isAdmin} commit={commitItemImport} />
    </main>
  );
}
