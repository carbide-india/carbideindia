import { ItemTable } from "@/components/items/item-table";
import { requireUser } from "@/lib/auth/current";
import { listItems } from "@/lib/queries/items";
import { MastersModuleShell } from "@/components/masters/masters-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

/**
 * Product Master (the internal Item Master), rendered inside the Masters module
 * shell (Carbide sidebar + indigo header). The page header, search and actions
 * all live in ItemTable so the search box sits beside the title.
 */
export default async function ItemsPage() {
  const me = await requireUser();

  const rows = await listItems();

  return (
    <MastersModuleShell userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1600px]">
        <ItemTable rows={rows} isAdmin={me.isAdmin} />
      </div>
    </MastersModuleShell>
  );
}
