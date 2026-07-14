"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { advanceStage } from "@/app/(app)/_actions/advance-stage";
import type { AdvanceEntity } from "@/app/(app)/_actions/advance-stage";

interface Props {
  /** The entity being advanced (maps to its feature-flag key). */
  entity: AdvanceEntity;
  /** The record's uuid. */
  id: string;
  /** CTA copy, e.g. "Send Quote" / "Mark Won" / "Confirm Order". */
  label: string;
}

/**
 * ERP Phase 8 - the flag-gated "Next step" CTA. Rendered ONLY when the entity's
 * enforced-workflow flag is ON (the server page decides). Routes the advance
 * through `advanceStage`, which enforces role + guards, freezes the legal
 * snapshot, and idempotently provisions the next-stage draft - replacing the
 * standalone New form for this hop while the flag is on. On success it surfaces
 * what was provisioned and refreshes; on a guard/role failure it shows the exact
 * unmet reasons.
 */
export function NextStepButton({ entity, id, label }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const res = await advanceStage({ entity, id });
      if (res.ok) {
        fireToast({
          message:
            res.provisioned === false
              ? `${label} - already advanced (no duplicate created).`
              : `${label} done. Next stage draft ready.`,
        });
        router.refresh();
      } else {
        const detail = res.unmet?.length ? ` ${res.unmet.join("; ")}` : "";
        fireToast({ message: `${res.error}${detail}`, type: "error" });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white transition-colors disabled:opacity-50"
      style={{ background: "var(--color-brand)" }}
    >
      {isPending ? (
        <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
      ) : (
        <ArrowRight size={14} strokeWidth={2.6} />
      )}
      {label}
    </button>
  );
}
