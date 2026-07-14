import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { getClientMeetingById } from "@/lib/queries/client-meetings";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { MeetingDetail } from "@/components/meetings/meeting-detail";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Meeting - Carbide India" };
  const meeting = await getClientMeetingById(id);
  return {
    title: meeting
      ? `${meeting.meetingNo} · Meeting - Carbide India`
      : "Meeting - Carbide India",
  };
}

export default async function MeetingDetailPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const meeting = await getClientMeetingById(id);
  if (!meeting) notFound();

  const employees = await listEmployeeOptions();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <MeetingDetail meeting={meeting} employees={employees} />
    </main>
  );
}
