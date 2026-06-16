import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { negotiationImportSpec } from "@/lib/import/specs/negotiation";
import { ImportWorkbench } from "@/components/import/import-workbench";
import { commitNegotiationImport } from "./actions";

export const dynamic = "force-dynamic";

export default async function NegotiationImportPage() {
  await requireAdmin();
  const lookups = await loadLookups(specRefKinds(negotiationImportSpec.fields));
  return (
    <main className="mx-auto max-w-[1100px] px-8 max-md:px-4 pt-8 pb-16">
      <Link href={"/negotiations/new" as Route} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-subtle hover:text-ink-strong">
        <ArrowLeft size={14} /> Back
      </Link>
      <h1 className="text-display-lg text-ink-strong mt-3">Bulk import — Negotiations</h1>
      <p className="text-body-lg text-ink-subtle mt-1 mb-6">
        Download the template, fill it, upload, fix any flagged cells inline, then import.
      </p>
      <ImportWorkbench spec={negotiationImportSpec} lookups={lookups} isAdmin commit={commitNegotiationImport} />
    </main>
  );
}
