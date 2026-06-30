"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { fireToast } from "@/lib/toast";

type SyncResult =
  | { ok: true; added: number }
  | { ok: false; error: string };

interface Props {
  /** How many enquiry products aren't yet on this record. */
  missingCount: number;
  /** The record's uuid — passed straight to the module's sync action. */
  recordId: string;
  /** Lower-case noun for the copy, e.g. "quotation" / "negotiation" / "sales order". */
  recordLabel: string;
  /** The module's server action: appends only the missing products. */
  syncAction: (recordId: string) => Promise<SyncResult>;
}

/** Subtle amber banner offering to append products added to the enquiry after
 *  this record was created. Renders nothing when nothing is missing. The action
 *  never touches existing lines and is only ever fired by this button. */
export function SyncProductsBanner({
  missingCount,
  recordId,
  recordLabel,
  syncAction,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (missingCount <= 0) return null;

  const noun = missingCount === 1 ? "product" : "products";

  const onClick = () => {
    startTransition(async () => {
      const res = await syncAction(recordId);
      if (res.ok) {
        fireToast({
          message:
            res.added > 0
              ? `Added ${res.added} ${res.added === 1 ? "product" : "products"}.`
              : "Already up to date.",
        });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  };

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-section border px-4 py-3.5"
      style={{
        background: "color-mix(in srgb, var(--color-amber) 9%, transparent)",
        borderColor: "color-mix(in srgb, var(--color-amber) 32%, transparent)",
      }}
    >
      <p className="text-[13.5px] font-semibold" style={{ color: "var(--color-amber-deep)" }}>
        {missingCount} {noun} from this enquiry {missingCount === 1 ? "isn't" : "aren't"} on this {recordLabel} yet.
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-4 py-2 text-[13px] font-bold text-ink-strong hover:border-hairline-strong hover:bg-surface-soft transition-colors disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
        ) : (
          <Plus size={14} strokeWidth={2.6} />
        )}
        Add {missingCount} {noun}
      </button>
    </div>
  );
}
