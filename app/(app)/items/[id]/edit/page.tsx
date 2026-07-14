import { notFound } from "next/navigation";
import type { Metadata, Route } from "next";
import { ItemForm } from "@/components/items/item-form";
import { MastersModuleShell } from "@/components/masters/masters-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { requireUser } from "@/lib/auth/current";
import { listMasterOptionsWithCode, getShapeProfiles } from "@/lib/queries/masters";
import { getItemById, getItemForEdit } from "@/lib/queries/items";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Edit Product — Carbide India" };
  const item = await getItemById(id);
  return {
    title: item ? `Edit ${item.itemCode} — Carbide India` : "Edit Product — Carbide India",
  };
}

export default async function EditItemPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [item, initialValues, shapes, grades, tolerances, conditions, sizes, shapeProfiles] =
    await Promise.all([
      getItemById(id),
      getItemForEdit(id),
      listMasterOptionsWithCode("shape"),
      listMasterOptionsWithCode("internal_grade"),
      listMasterOptionsWithCode("tolerance"),
      listMasterOptionsWithCode("condition"),
      listMasterOptionsWithCode("size"),
      getShapeProfiles(),
    ]);

  if (!item || !initialValues) notFound();

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
          editItemId={id}
          initialValues={initialValues}
          title="Edit Product"
          backHref={`/items/${id}` as Route}
          backLabel="Product"
        />
      </div>
    </MastersModuleShell>
  );
}
