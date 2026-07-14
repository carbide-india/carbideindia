import type { Route } from "next";
import { ItemForm } from "@/components/items/item-form";
import { MastersModuleShell } from "@/components/masters/masters-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { requireUser } from "@/lib/auth/current";
import { listMasterOptionsWithCode, getShapeProfiles } from "@/lib/queries/masters";

export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  await requireUser();

  const [shapes, grades, tolerances, conditions, sizes, shapeProfiles] =
    await Promise.all([
      listMasterOptionsWithCode("shape"),
      listMasterOptionsWithCode("internal_grade"),
      listMasterOptionsWithCode("tolerance"),
      listMasterOptionsWithCode("condition"),
      listMasterOptionsWithCode("size"),
      getShapeProfiles(),
    ]);

  return (
    <MastersModuleShell userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1360px]">
        <ItemForm
          shapes={shapes}
          grades={grades}
          tolerances={tolerances}
          conditions={conditions}
          sizes={sizes}
          shapeProfiles={shapeProfiles.byId}
          title="New Product"
          backHref={"/items" as Route}
          backLabel="Product Master"
        />
      </div>
    </MastersModuleShell>
  );
}
