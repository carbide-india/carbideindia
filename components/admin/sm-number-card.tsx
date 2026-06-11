"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Hash, Loader2 } from "lucide-react";
import { setSmNextNumber } from "@/app/(admin)/admin/settings/actions";
import { fireToast } from "@/lib/toast";

interface Props {
  /** The number the sequence will assign next (server-read). */
  nextNumber: number;
}

/**
 * Sales Module counter — shows the next SM number and lets an admin re-base
 * the sequence (e.g. to skip past numbers consumed in the old spreadsheet).
 */
export function SmNumberCard({ nextNumber }: Props) {
  const router = useRouter();
  const [value, setValue] = React.useState(String(nextNumber));
  const [pending, startTransition] = React.useTransition();
  React.useEffect(() => setValue(String(nextNumber)), [nextNumber]);

  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000_000;
  const changed = parsed !== nextNumber;

  function save() {
    if (!valid || !changed) return;
    startTransition(async () => {
      const res = await setSmNextNumber(parsed);
      if (res.ok) {
        fireToast({ message: `Next inquiry will be SM${parsed}.` });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  return (
    <section
      className="bg-surface-card rounded-section border border-hairline p-6"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <Hash size={15} strokeWidth={2.4} className="text-ink-subtle" />
        <h2 className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
          Sales Module Counter
        </h2>
      </div>
      <p className="text-[14px] text-ink-muted mb-4">
        Every inquiry is assigned the next SM number automatically. The next
        inquiry will be{" "}
        <span className="font-mono font-bold text-ink-strong">SM{nextNumber}</span>.
      </p>
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="sm-next"
            className="text-[13px] font-bold text-ink-strong"
          >
            Next number
          </label>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[14px] font-bold text-ink-subtle">SM</span>
            <input
              id="sm-next"
              type="number"
              min={1}
              max={10_000_000}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="nt-input w-36 font-mono tabular-nums"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending || !valid || !changed}
          className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
          style={{
            background:
              "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
          }}
        >
          {pending && (
            <Loader2 size={14} style={{ animation: "spinFast 0.8s linear infinite" }} />
          )}
          Update Counter
        </button>
      </div>
      {!valid && value !== "" && (
        <p className="mt-2 text-[13px] font-semibold" style={{ color: "#D32F2F" }}>
          Enter a whole number between 1 and 10,000,000.
        </p>
      )}
    </section>
  );
}
