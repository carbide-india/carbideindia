import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { ItemForm } from "@/components/items/item-form";
import { BackLink } from "@/components/ui/back-link";
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
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[980px] px-12 max-md:px-4 pt-8 pb-16">
        <div className="mb-4">
          <BackLink href="/items" label="Item Master" />
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
            New Item
          </h1>
          <p className="text-body-lg text-ink-subtle mt-2">
            Register a unique shape, grade &amp; size combination — an internal
            item code is auto-generated on save.
          </p>
        </header>
        <ItemForm
          shapes={shapes}
          grades={grades}
          tolerances={tolerances}
          conditions={conditions}
          sizes={sizes}
          shapeProfiles={shapeProfiles.byId}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
