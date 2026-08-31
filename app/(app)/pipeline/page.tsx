import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { listPipelineTracker } from "@/lib/queries/pipeline-tracker";
import { PipelineOverview } from "@/components/pipeline/pipeline-overview";

export const metadata: Metadata = {
  title: "Pipeline Tracker - Carbide India",
};

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireUser();
  const [rows, sp] = await Promise.all([listPipelineTracker(), searchParams]);
  return <PipelineOverview rows={rows} status={sp.status} />;
}
