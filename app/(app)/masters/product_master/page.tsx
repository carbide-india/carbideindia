import { ItemTable } from "@/components/items/item-table";
import { requireUser } from "@/lib/auth/current";
import { listItems } from "@/lib/queries/items";

export const dynamic = "force-dynamic";
export const metadata = { title: "Product Master - Masters - Carbide India" };

/**
 * Product Master (the internal Item Master) list. Lives UNDER the Masters module
 * layout (`masters/layout.tsx` → MastersModuleShell) so switching to it from any
 * other master workbench is an instant client-side <main> swap - no full shell
 * remount / page reload. The page header, search and actions all live in
 * ItemTable. The legacy `/items` list URL redirects here (single canonical page);
 * item detail / new / edit stay at `/items/[id]`.
 */
export default async function ProductMasterPage() {
  const me = await requireUser();

  const rows = await listItems();

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <ItemTable rows={rows} isAdmin={me.isAdmin} />
    </div>
  );
}
