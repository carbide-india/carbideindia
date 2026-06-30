import { redirect } from "next/navigation";

// Client Master moved out of the admin panel to its own top-level route
// (`/clients`), reached via the Client Master nav pill. This stub keeps old
// bookmarks / links from 404-ing.
export default function AdminClientsRedirect() {
  redirect("/clients");
}
