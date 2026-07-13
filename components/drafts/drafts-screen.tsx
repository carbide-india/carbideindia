import { requireUser } from "@/lib/auth/current";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { listFormDrafts } from "@/lib/queries/form-drafts";
import { FormDraftsList } from "@/components/drafts/form-drafts-list";
import { FORM_DRAFT_META, type FormDraftKind } from "@/lib/drafts/form-drafts";

/**
 * A form's Drafts page, rendered inside the module shell. Each per-form route
 * (`/samples/drafts`, `/clients/drafts`, …) is a one-line wrapper over this.
 */
export async function DraftsScreen({ kind }: { kind: FormDraftKind }) {
  await requireUser();
  const items = await listFormDrafts(kind);
  const meta = FORM_DRAFT_META[kind];

  return (
    <EnquiryModuleShell title={`${meta.noun} Drafts`} userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
            {meta.noun} Drafts
          </h1>
          <span className="text-[13px] font-semibold text-ink-subtle tabular-nums">
            {items.length} {items.length === 1 ? "draft" : "drafts"}
          </span>
        </div>
        <FormDraftsList kind={kind} items={items} />
      </div>
    </EnquiryModuleShell>
  );
}
