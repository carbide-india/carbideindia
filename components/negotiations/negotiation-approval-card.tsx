"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, HelpCircle, Loader2, Send } from "lucide-react";
import {
  NEGOTIATION_STATUS_LABELS,
  type NegotiationStatus,
} from "@/db/enums";
import { isNegotiationApprovedForSo } from "@/lib/negotiations/buckets";
import { setNegotiationStatus } from "@/app/(app)/negotiations/actions";
import { SectionCard } from "@/components/inquiries/form-field";
import { fireToast } from "@/lib/toast";

interface Props {
  negotiationId: string;
  status: NegotiationStatus;
}

/**
 * The negotiation's house-bucket rail + the decisive transitions.
 *
 * Shows where this negotiation sits in the SAME five buckets every other sales
 * stage uses (Not Started → Draft → Need Info → Pending Approval → Negotiation
 * Approved) and offers the two moves that matter — send for approval, approve.
 * An APPROVED negotiation is what enables Issue Sales Order, so the card states
 * that readiness explicitly rather than leaving the user to discover it at the
 * disabled convert button.
 *
 * A negotiation currently on the commercial-OUTCOME axis (Order Won, Follow up,
 * …) has no position on the bucket rail; the rail then reads "off-rail" and says
 * so instead of pretending the row is at Not Started.
 */
export function NegotiationApprovalCard({ negotiationId, status }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState<NegotiationStatus | null>(null);

  const soReady = isNegotiationApprovedForSo(status);

  async function move(next: NegotiationStatus): Promise<void> {
    setPending(next);
    try {
      const res = await setNegotiationStatus(negotiationId, next);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `Negotiation moved to ${NEGOTIATION_STATUS_LABELS[next]}.` });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <SectionCard title="Negotiation Approval">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] font-semibold" style={{ color: soReady ? "var(--color-green-deep)" : "var(--color-ink-muted)" }}>
          {soReady
            ? "Approved - a sales order can be issued from this negotiation."
            : "Not approved yet - Issue Sales Order stays blocked."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <BucketButton
            label="Need Info"
            Icon={HelpCircle}
            tone="amber"
            busy={pending === "need_info"}
            disabled={pending !== null || status === "need_info"}
            onClick={() => void move("need_info")}
          />
          <BucketButton
            label="Send for Approval"
            Icon={Send}
            tone="purple"
            busy={pending === "pending_approval"}
            disabled={pending !== null || status === "pending_approval"}
            onClick={() => void move("pending_approval")}
          />
          <BucketButton
            label="Approve Negotiation"
            Icon={CheckCircle2}
            tone="green"
            primary
            busy={pending === "negotiation_approved"}
            disabled={pending !== null || status === "negotiation_approved"}
            onClick={() => void move("negotiation_approved")}
          />
        </div>
      </div>
    </SectionCard>
  );
}

function BucketButton({
  label,
  Icon,
  tone,
  primary,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  tone: string;
  primary?: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-pill border px-4 py-2 text-[13.5px] font-bold transition-colors disabled:opacity-50"
      style={{
        background: primary
          ? `var(--color-${tone})`
          : `color-mix(in srgb, var(--color-${tone}) 10%, transparent)`,
        color: primary ? "#fff" : `var(--color-${tone}-deep)`,
        borderColor: `color-mix(in srgb, var(--color-${tone}) ${primary ? 100 : 32}%, transparent)`,
      }}
    >
      {busy ? (
        <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
      ) : (
        <Icon size={14} strokeWidth={2.4} />
      )}
      {label}
    </button>
  );
}
