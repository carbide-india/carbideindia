import { requireUser } from "@/lib/auth/current";
import { listNegotiationBoard } from "@/lib/queries/negotiation-board";
import { NegotiationBoard } from "@/components/negotiations/negotiation-board";
import { RegisterHeading } from "@/components/registers/register-heading";
import { EnquiryModuleShell } from "@/components/enquiries/enquiry-module-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";
import { countAgeing } from "@/lib/negotiations/ageing";
import { NEGOTIATION_AGEING_BUCKETS } from "@/db/enums";

export const dynamic = "force-dynamic";

/**
 * The Negotiation board — the same deals the register lists, arranged by where
 * the conversation stands, and drag-able between those states.
 *
 * The register answers "show me the rows". The board answers "what should I do
 * today", which is a different question and deserves a different shape.
 */
export default async function NegotiationBoardPage() {
  await requireUser();
  const cards = await listNegotiationBoard();

  // The ageing views, computed the same way the sidebar computes them — one
  // derivation, so the board and the sidebar cannot disagree about what is stale.
  const ageing = countAgeing(cards);
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
          {/* Ageing is a READING of the board, not a filter on it — a stale deal
              is still in whichever column it sits in. Stated as a line rather
              than as tabs so it never reads as a set of columns. */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {NEGOTIATION_AGEING_BUCKETS.map((b) => {
              const n = ageing[b.key];
              return (
                <span
                  key={b.key}
                  title={`Open deals untouched for ${b.days} days or more`}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-2.5 py-1 text-[11.5px] font-bold text-ink-soft"
                >
                  {b.label}
                  <span
                    className={
                      n > 0
                        ? "tabular-nums font-black text-[#b45309]"
                        : "tabular-nums font-black text-ink-subtle"
                    }
                  >
                    {n}
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        <NegotiationBoard cards={cards} />
      </div>
    </EnquiryModuleShell>
  );
}
