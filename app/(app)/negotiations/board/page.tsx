import { requireUser } from "@/lib/auth/current";
import { listNegotiationBoard } from "@/lib/queries/negotiation-board";
import { NegotiationBoard } from "@/components/negotiations/negotiation-board";
import { RegisterHeading } from "@/components/registers/register-heading";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export const dynamic = "force-dynamic";

/**
 * The Negotiation board — the same deals the register lists, arranged by where
 * the conversation stands, and drag-able between those states.
 *
 * The register answers "show me the rows". The board answers "what should I do
 * today", which is a different question and deserves a different shape.
 *
 * Follow-up is now a set of explicit statuses (Follow up after 15 days / 1 month
 * / 45 days / 2 months), so those are their own columns here — the old computed
 * "untouched for N days" chips were removed to avoid two things sharing a name.
 */
export default async function NegotiationBoardPage() {
  await requireUser();
  const cards = await listNegotiationBoard();
  const total = cards.reduce((n, c) => n + c.quotedValue, 0);

  return (
    <EnquiryModuleShell title="Negotiation Kanban" userMenu={<UserMenuServer />}>
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <RegisterHeading
            title="Negotiation Kanban"
            count={cards.length}
            unit="deal"
            filterLabel={
              total > 0
                ? `₹${total >= 1e7 ? `${(total / 1e7).toFixed(2)} Cr` : total >= 1e5 ? `${(total / 1e5).toFixed(2)} L` : Math.round(total).toLocaleString("en-IN")} on the table`
                : null
            }
          />
        </div>

        <NegotiationBoard cards={cards} />
      </div>
    </EnquiryModuleShell>
  );
}
