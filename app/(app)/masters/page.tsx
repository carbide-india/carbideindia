import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireAdmin } from "@/lib/auth/current";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masters — Carbide India" };

/**
 * App-level Masters hub. Admin-only. The module is organised per master-kind
 * workbench; the index redirects to the first kind (Customer Type).
 */
export default async function MastersPage() {
  await requireAdmin();
  redirect("/masters/customer_type" as Route);
}
