import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getJobCardWorkspace } from "@/lib/queries/job-cards";
import { getAuditLog } from "@/lib/queries/audit";
import { JobCardWorkspace } from "@/components/erp/job-card-workspace";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Job Card - Carbide India" };
  const data = await getJobCardWorkspace(id);
  return {
    title: data ? `${data.card.jobCardNo} - Carbide India` : "Job Card - Carbide India",
  };
}

export default async function JobCardWorkspacePage({ params }: PageProps) {
  const me = await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const data = await getJobCardWorkspace(id);
  if (!data) notFound();

  const auditEntries = await getAuditLog("job_card", id);

  return (
    <JobCardWorkspace
      data={data}
      auditEntries={auditEntries}
      isAdmin={me.isAdmin}
    />
  );
}
