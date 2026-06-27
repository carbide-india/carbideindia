"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";
import { deactivateItem, reactivateItem } from "@/app/(app)/items/actions";
import { fireToast } from "@/lib/toast";

/**
 * Admin-only deactivate/reactivate control for an item (ERP Phase 4 — items are
 * never hard-deleted, only deactivated). Rendered on the item detail header.
 */
export function ItemStatusControl({
  itemId,
  itemCode,
  isActive,
}: {
  itemId: string;
  itemCode: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function toggle(): Promise<void> {
    if (isActive && !window.confirm(`Deactivate ${itemCode}? It stays on past transactions but drops off the active list.`)) {
      return;
    }
    setPending(true);
    try {
      const res = isActive ? await deactivateItem(itemId) : await reactivateItem(itemId);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: isActive ? "Item deactivated." : "Item reactivated." });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
        isActive
          ? "border-hairline text-red-600 hover:border-red-300 hover:bg-red-50"
          : "border-hairline text-ink-soft hover:border-brand hover:text-brand"
      }`}
    >
      <Power size={15} strokeWidth={2.2} />
      {pending ? "Saving…" : isActive ? "Deactivate" : "Reactivate"}
    </button>
  );
}
