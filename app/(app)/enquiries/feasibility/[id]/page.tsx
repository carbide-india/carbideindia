import { redirect } from "next/navigation";
import type { Route } from "next";

// Primary Feasibility moved to its own Hub module. Preserve old deep links.
export default async function LegacyFeasibilityDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/feasibility/${id}` as Route);
}
