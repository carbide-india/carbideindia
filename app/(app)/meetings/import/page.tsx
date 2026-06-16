import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { meetingImportSpec } from "@/lib/import/specs/meeting";
import { ImportWorkbench } from "@/components/import/import-workbench";
import { commitMeetingImport } from "./actions";

export const dynamic = "force-dynamic";

export default async function MeetingImportPage() {
  await requireAdmin();
  const lookups = await loadLookups(specRefKinds(meetingImportSpec.fields));
  return (
    <main className="mx-auto max-w-[1100px] px-8 max-md:px-4 pt-8 pb-16">
      <Link href={"/meetings/new" as Route} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-subtle hover:text-ink-strong">
        <ArrowLeft size={14} /> Back
      </Link>
      <h1 className="text-display-lg text-ink-strong mt-3">Bulk import — Meetings</h1>
      <p className="text-body-lg text-ink-subtle mt-1 mb-6">
        Download the template, fill it, upload, fix any flagged cells inline, then import.
      </p>
      <ImportWorkbench spec={meetingImportSpec} lookups={lookups} isAdmin commit={commitMeetingImport} />
    </main>
  );
}
