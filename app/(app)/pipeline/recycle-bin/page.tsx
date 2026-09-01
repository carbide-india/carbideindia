import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { listRecycledInquiries } from "@/lib/queries/inquiries";
import { RecordsRecycleBin } from "@/components/pipeline/records-recycle-bin";

export const metadata: Metadata = {
  title: "Recycle Bin - Carbide India",
};

export default async function RecycleBinPage() {
  await requireUser();
  const rows = await listRecycledInquiries();
  return <RecordsRecycleBin rows={rows} />;
}
