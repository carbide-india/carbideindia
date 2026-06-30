import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { ItemForm } from "@/components/items/item-form";
import { BackLink } from "@/components/ui/back-link";
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
  if (!UUID_RE.test(id)) return { title: "Edit Item — Carbide India" };
  const item = await getItemById(id);
  return {
    title: item ? `Edit ${item.itemCode} — Carbide India` : "Edit Item — Carbide India",
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
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[980px] px-12 max-md:px-4 pt-8 pb-16">
        <div className="mb-4">
          <BackLink href={`/items/${id}`} label="Item" />
        </div>
        <header className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Production · Item Master
          </div>
          <h1
            className="mt-1 text-ink-strong"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 44,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            Edit Item
          </h1>
          <p className="mt-2 font-mono text-[15px] text-ink-subtle break-all">
            {item.itemCode}
          </p>
          <p className="text-body-lg text-ink-subtle mt-2">
            Update the classification, dimensions or part details. The internal
            item code is recomputed on save while the serial stays the same.
          </p>
        </header>
        <ItemForm
          shapes={shapes}
          grades={grades}
          tolerances={tolerances}
          conditions={conditions}
          sizes={sizes}
          shapeProfiles={shapeProfiles.byId}
          editItemId={id}
          initialValues={initialValues}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
