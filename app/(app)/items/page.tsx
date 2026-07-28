import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

/**
 * Legacy Item Master list URL. The canonical Product Master list now lives at
 * `/masters/product_master` (inside the Masters module layout, so switching to it
 * is an instant client nav rather than a full shell remount). This route stays as
 * a redirect so every existing `/items` back-link / bookmark keeps working. Item
 * detail / new / edit still live at `/items/[id]`, `/items/new`, `/items/[id]/edit`.
 */
export default function ItemsIndexRedirect() {
  redirect("/masters/product_master" as Route);
}
