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
    <EnquiryModuleShell title={`Unfinished ${meta.noun} Forms`} userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight text-[#3f3f94]">
              Unfinished {meta.noun} Forms
            </h1>
            {/* Spelled out because this used to be called "Drafts", which
                collided with the DRAFT status bucket — a saved record. These
                are forms nobody ever saved. */}
            <p className="mt-1.5 text-[12.5px] font-semibold text-[#6b7280]">
              {meta.noun} forms that were started and never saved. Nothing here
              exists in the register yet — open one to finish it.
            </p>
          </div>
          <span className="shrink-0 text-[13px] font-semibold text-ink-subtle tabular-nums">
            {items.length} unfinished
          </span>
        </div>
        <FormDraftsList kind={kind} items={items} />
      </div>
    </EnquiryModuleShell>
  );
}
