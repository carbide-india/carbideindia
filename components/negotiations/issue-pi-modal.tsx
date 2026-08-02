"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, FileText } from "lucide-react";
import type { NegotiationLineWithSpec } from "@/lib/queries/negotiations";
import { issueProformaInvoice } from "@/app/(app)/negotiations/actions";
import { fireToast } from "@/lib/toast";
import { formatInr } from "@/lib/format";
import { Field, MiniField } from "@/components/inquiries/form-field";
import { MoneyInput } from "@/components/ui/money-input";
import { useKeyboardForm } from "@/components/forms/use-keyboard-form";

const BORDER = "#b7bcd2";
const INDIGO = "#3f3f94";

/** Focusable elements for the modal's focus trap (mirrors lib/focus-next). */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** numeric-string | number → number | undefined (no NaN; 0 is valid). */
function num(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** The best default revised unit price for a line: last negotiated → quoted → cost. */
function seedPrice(line: NegotiationLineWithSpec): string {
  const v = line.negotiation ?? line.quotePrice ?? line.finalCost;
  return v != null && v !== "" ? String(Number(v)) : "";
}

function productName(line: NegotiationLineWithSpec, i: number): string {
  return (
    line.ask.custProductName ||
    line.spec.gradeNameForCust ||
    line.spec.itemCode ||
    `Line ${i + 1}`
  );
}

/** Editable per-line state for the PI. */
interface PiLineDraft {
  negotiationItemId: string;
  label: string;
  partNo: string | null;
  qty: string;
  revisedUnitPrice: string;
  notes: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  negotiationId: string;
  lines: NegotiationLineWithSpec[];
  defaultTerms: {
    developmentTime: string | null;
    deliveryTime: string | null;
    validity: string | null;
  };
}

/**
 * Issue Proforma Invoice modal — lists the negotiation's product lines with an
 * editable Revised Unit Price (₹) + qty + per-line notes, plus the commercial
 * terms (validity / delivery / development) and a document note. Submitting
 * calls `issueProformaInvoice`, then opens the generated PI PDF inline and
 * refreshes the page. Client-facing wording is always "Proforma Invoice (PI)",
 * never "Revised Quote". Keyboard-first (Enter advances, Ctrl/Cmd+Enter issues,
 * Esc closes) with a focus trap.
 */
export function IssuePiModal({ open, onClose, negotiationId, lines, defaultTerms }: Props) {
  const router = useRouter();
  const rootRef = React.useRef<HTMLFormElement>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [rows, setRows] = React.useState<PiLineDraft[]>([]);
  const [developmentTime, setDevelopmentTime] = React.useState("");
  const [deliveryTime, setDeliveryTime] = React.useState("");
  const [validity, setValidity] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Rebuild the draft from the live lines each time the modal opens (it stays
  // mounted while `open` toggles, so a mount-once init wouldn't refresh).
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setRows(
      lines.map((l, i) => ({
        negotiationItemId: l.id,
        label: productName(l, i),
        partNo: l.spec.partNo ?? null,
        qty: l.qty != null && l.qty !== "" ? String(Number(l.qty)) : "",
        revisedUnitPrice: seedPrice(l),
        notes: "",
      })),
    );
    setDevelopmentTime(defaultTerms.developmentTime ?? "");
    setDeliveryTime(defaultTerms.deliveryTime ?? "");
    setValidity(defaultTerms.validity ?? "");
    setNotes("");
    const first = rootRef.current?.querySelector<HTMLInputElement>("input");
    first?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Return focus to the trigger on close.
  React.useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    return () => trigger?.focus?.({ preventScroll: true });
  }, [open]);

  const patchRow = (i: number, patch: Partial<PiLineDraft>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const revisedTotal = rows.reduce((sum, r) => {
    const unit = num(r.revisedUnitPrice) ?? 0;
    const qty = num(r.qty) ?? 0;
    return sum + unit * qty;
  }, 0);

  async function submit(): Promise<void> {
    if (pending) return;
    setError(null);
    const items = rows
      .map((r) => ({
        negotiationItemId: r.negotiationItemId,
        qty: num(r.qty) ?? 0,
        revisedUnitPrice: num(r.revisedUnitPrice) ?? 0,
        notes: r.notes.trim() || undefined,
      }))
      .filter((it) => it.qty > 0 || it.revisedUnitPrice > 0);
    if (items.length === 0) {
      setError("Enter a quantity and revised unit price for at least one line.");
      return;
    }
    setPending(true);
    try {
      const res = await issueProformaInvoice({
        negotiationId,
        items,
        developmentTime: developmentTime.trim() || undefined,
        deliveryTime: deliveryTime.trim() || undefined,
        validity: validity.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Proforma Invoice issued." });
      // Open the generated PI PDF inline in a new tab.
      window.open(`/proforma-invoices/${res.id}/pi.pdf?view=1`, "_blank", "noopener");
      onClose();
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not issue the proforma invoice.";
      setError(msg);
      fireToast({ message: msg, type: "error" });
    } finally {
      setPending(false);
    }
  }

  const { formProps } = useKeyboardForm({ onSubmit: () => void submit() });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const root = rootRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(
      (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0,
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !root.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Issue proforma invoice"
    >
      <form
        ref={rootRef}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        {...formProps}
        noValidate
        className="w-full max-w-[760px] rounded-[16px] bg-white shadow-[0_24px_60px_-12px_rgba(15,23,42,0.4)]"
        style={{ border: `2px solid ${BORDER}` }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between rounded-t-[14px] px-6 py-4"
          style={{ borderBottom: `2px solid ${BORDER}` }}
        >
          <div className="flex flex-col">
            <h2 className="text-[17px] font-extrabold tracking-tight" style={{ color: INDIGO }}>
              Issue Proforma Invoice (PI)
            </h2>
            <p className="text-[12.5px] text-[#6b7280]">
              A PI number (SM-PI##) is assigned automatically. The PDF opens once issued.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#6b7280] transition hover:bg-[#efeffb] hover:text-[#3f3f94] active:scale-90"
          >
            <X className="h-[19px] w-[19px]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex max-h-[calc(100vh-260px)] flex-col gap-5 overflow-y-auto px-6 py-5">
          {/* Product lines */}
          <div className="flex flex-col gap-3">
            <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
              Product Lines
            </span>
            {rows.length === 0 ? (
              <p className="text-[13.5px] text-ink-muted">
                This negotiation has no product lines to price.
              </p>
            ) : (
              rows.map((r, i) => {
                const unit = num(r.revisedUnitPrice) ?? 0;
                const qty = num(r.qty) ?? 0;
                const lineTotal = unit * qty;
                return (
                  <div
                    key={r.negotiationItemId}
                    className="rounded-xl border border-hairline bg-surface-soft px-4 py-3.5"
                  >
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <span className="text-[13.5px] font-bold text-ink-strong">
                        {r.label}
                        {r.partNo && (
                          <span className="ml-2 font-mono text-[11.5px] font-semibold text-ink-subtle">
                            {r.partNo}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums text-[13.5px] font-bold text-ink-strong">
                        {formatInr(lineTotal)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
                      <MiniField label="Qty">
                        <span className="block w-[110px]">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step="any"
                            aria-label={`Quantity for ${r.label}`}
                            className="nt-input tabular-nums"
                            value={r.qty}
                            onChange={(e) => patchRow(i, { qty: e.target.value })}
                          />
                        </span>
                      </MiniField>
                      <MiniField label="Revised Unit Price">
                        <span className="block w-[170px]">
                          <MoneyInput
                            aria-label={`Revised unit price for ${r.label}`}
                            value={r.revisedUnitPrice}
                            onChange={(e) => patchRow(i, { revisedUnitPrice: e.target.value })}
                          />
                        </span>
                      </MiniField>
                      <MiniField label="Line Note" className="min-w-[200px] flex-1">
                        <input
                          type="text"
                          aria-label={`Note for ${r.label}`}
                          className="nt-input"
                          placeholder="Optional"
                          value={r.notes}
                          onChange={(e) => patchRow(i, { notes: e.target.value })}
                        />
                      </MiniField>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Revised total */}
          <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface-card px-4 py-3">
            <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
              Revised Total
            </span>
            <span className="tabular-nums text-[20px] font-extrabold text-brand">
              {formatInr(revisedTotal)}
            </span>
          </div>

          {/* Commercial terms */}
          <div className="flex flex-col gap-3">
            <span className="text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
              Commercial Terms
            </span>
            <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
              <Field id="pi-dev" label="Development Time">
                <input
                  id="pi-dev"
                  type="text"
                  className="nt-input"
                  placeholder="e.g. 3 weeks"
                  value={developmentTime}
                  onChange={(e) => setDevelopmentTime(e.target.value)}
                />
              </Field>
              <Field id="pi-del" label="Delivery Time">
                <input
                  id="pi-del"
                  type="text"
                  className="nt-input"
                  placeholder="e.g. 4-6 weeks"
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                />
              </Field>
              <Field id="pi-val" label="Validity">
                <input
                  id="pi-val"
                  type="text"
                  className="nt-input"
                  placeholder="e.g. 30 days"
                  value={validity}
                  onChange={(e) => setValidity(e.target.value)}
                />
              </Field>
            </div>
            <Field id="pi-notes" label="PI Notes">
              <textarea
                id="pi-notes"
                rows={3}
                className="nt-input resize-y"
                placeholder="Any terms or remarks to print on the proforma invoice"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>

          {error && (
            <p className="font-semibold" style={{ fontSize: 13.5, color: "#D32F2F" }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 rounded-b-[14px] px-6 py-4"
          style={{ borderTop: `2px solid ${BORDER}` }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-chip px-5 py-3 text-[14px] font-bold text-[#3a4152] transition hover:bg-[#eef0f5] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-chip px-7 py-3 text-white transition-transform disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, rgb(63, 63, 148), rgb(47, 47, 111))",
              boxShadow: "0 6px 16px rgba(63, 63, 148, 0.34)",
              fontWeight: 800,
              fontSize: 15,
            }}
          >
            <FileText className="h-[17px] w-[17px]" />
            {pending ? "Issuing…" : "Issue PI"}
          </button>
        </div>
      </form>
    </div>
  );
}
