import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { listPipelineTracker } from "@/lib/queries/pipeline-tracker";
import { PipelineDetail } from "@/components/pipeline/pipeline-detail";

export const metadata: Metadata = {
  title: "Pipeline Tracker - Carbide India",
};

export default async function PipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  const rows = await listPipelineTracker({ inquiryId: id });
  const row = rows[0];
  if (!row) notFound();
  return <PipelineDetail row={row} isApprover={me.isApprover} />;
}
