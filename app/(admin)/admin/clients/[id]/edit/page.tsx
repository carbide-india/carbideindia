import { redirect } from "next/navigation";

// Client edit moved to `/clients/[id]/edit` (out of the admin panel). Redirect
// stub so old bookmarks / links don't 404.
interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminClientEditRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/clients/${id}/edit`);
}
