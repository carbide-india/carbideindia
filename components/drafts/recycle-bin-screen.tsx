import { requireUser } from "@/lib/auth/current";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { listRecycledDrafts } from "@/lib/queries/form-drafts";
import { RecycleBinList } from "@/components/drafts/recycle-bin-list";
import { FORM_DRAFT_META, type FormDraftKind } from "@/lib/drafts/form-drafts";

/**
 * A single form's Recycle Bin, rendered inside the module shell. Each per-form
 * route (`/clients/recycle-bin`, `/samples/recycle-bin`, …) is a one-line
 * wrapper over this - scoped to that form so the bins never mix.
 */
export async function RecycleBinScreen({ kind }: { kind: FormDraftKind }) {
  await requireUser();
  const items = await listRecycledDrafts(kind);
  const meta = FORM_DRAFT_META[kind];

  return (
    <EnquiryModuleShell title={`${meta.noun} Recycle Bin`} userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              {meta.noun} Recycle Bin
            </h1>
            <p className="mt-1.5 text-[14px] text-ink-subtle">
              Deleted &amp; overflow {meta.noun} drafts (max 10 active). Purged permanently 48
              hours after being recycled.
            </p>
          </div>
          <span className="shrink-0 text-[13px] font-semibold text-ink-subtle tabular-nums">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
        </div>
        <RecycleBinList items={items} />
      </div>
    </EnquiryModuleShell>
  );
}
