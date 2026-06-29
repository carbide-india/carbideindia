import { redirect } from "next/navigation";
import type { Route } from "next";

/**
 * Masters moved to the app-level header pill (/masters) in the forms/masters
 * redesign. Keep this route as a permanent redirect so old links/bookmarks and
 * the admin sidebar history don't 404.
 */
export default function AdminMastersRedirect() {
  redirect("/masters" as Route);
}
