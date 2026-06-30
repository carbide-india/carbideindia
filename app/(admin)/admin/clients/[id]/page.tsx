import { redirect } from "next/navigation";

// Client records moved to `/clients/[id]` (out of the admin panel). Redirect
// stub so old bookmarks / links don't 404.
interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminClientRecordRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/clients/${id}`);
}
