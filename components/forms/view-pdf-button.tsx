"use client";

import * as React from "react";
import { FileText, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  EMPTY_VALUE,
  type FormSnapshot,
  type FormSnapshotRow,
  type FormSnapshotSection,
} from "@/lib/documents/form-snapshot";

/**
 * "View in PDF Format" — opens the form as a branded PDF.
 *
 * It reads the RENDERED form rather than a per-form field map. Every field in
 * the forms module goes through the same `Field` shell (a `.nt-field-label`
 * plus its control) inside a `SectionCard`, so one reader covers all ten forms
 * and any form added later — and it always shows exactly what is on screen,
 * including values typed a second ago and never saved.
 *
 * An unsaved form is stamped DRAFT; pass `draft={false}` on a saved record.
 */
export function ViewPdfButton({
  title,
  subtitle,
  draft = true,
  className,
}: {
  /** Document heading, e.g. "New Enquiry". */
  title: string;
  subtitle?: string;
  /** false on a saved record — drops the DRAFT stamp. */
  draft?: boolean;
  className?: string;
}) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const [pending, setPending] = React.useState(false);

  async function open() {
    const form = ref.current?.closest("form");
    if (!form) {
      fireToast({ type: "error", message: "Couldn't find the form to render." });
      return;
    }
    const sections = readSections(form);
    if (sections.length === 0) {
      fireToast({ type: "error", message: "Nothing filled in to show yet." });
      return;
    }

    setPending(true);
    // Opened synchronously: a popup blocker rejects window.open() that happens
    // after an await, so the tab is claimed on the click and filled once the
    // PDF comes back.
    const tab = window.open("", "_blank");
    try {
      const snapshot: FormSnapshot = { title, subtitle, draft, sections };
      const res = await fetch("/api/forms/preview.pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) {
        tab?.close();
        fireToast({ type: "error", message: "Could not build the PDF." });
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      if (tab) {
        tab.location.href = url;
      } else {
        // Popup blocked — fall back to the current tab rather than doing nothing.
        window.location.href = url;
      }
      // The tab has the blob by then; release it on the next tick.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
      fireToast({ type: "error", message: "Could not build the PDF." });
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => void open()}
      disabled={pending}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-chip border-[1.75px] border-[#c7cae6] bg-white px-5 py-3 text-[14px] font-extrabold text-[#3f3f94] transition-colors hover:border-[#3f3f94] hover:bg-[#f3f3fb] disabled:opacity-60"
      }
    >
      {pending ? (
        <Loader2 size={16} style={{ animation: "spinFast 0.8s linear infinite" }} />
      ) : (
        <FileText size={16} strokeWidth={2.4} />
      )}
      View in PDF Format
    </button>
  );
}

/* ── Reading the rendered form ─────────────────────────────────────────────── */

/** Section titles are the SectionCard heading; fields are the shells inside. */
function readSections(form: HTMLElement): FormSnapshotSection[] {
  const out: FormSnapshotSection[] = [];
  const claimed = new Set<Element>();

  for (const section of Array.from(form.querySelectorAll("section"))) {
    // Skip a section that only wraps other sections — the inner one owns the fields.
    if (section.querySelector("section")) continue;
    const rows = readRows(section, claimed);
    if (rows.length === 0) continue;
    out.push({
      title: section.querySelector("h2")?.textContent?.trim() ?? "",
      rows,
    });
  }

  // Fields outside any SectionCard still belong in the document.
  const loose = readRows(form, claimed);
  if (loose.length > 0) out.push({ title: "Other", rows: loose });

  return out;
}

function readRows(root: Element, claimed: Set<Element>): FormSnapshotRow[] {
  const rows: FormSnapshotRow[] = [];
  for (const shell of Array.from(root.querySelectorAll(".nt-field-shell"))) {
    if (claimed.has(shell)) continue;
    claimed.add(shell);
    const label = shell.querySelector(".nt-field-label")?.textContent?.trim();
    if (!label) continue;
    rows.push({
      // The label carries the required asterisk; the document does not need it.
      label: label.replace(/\s*\*$/, "").slice(0, 200),
      value: readValue(shell).slice(0, 4000),
    });
  }
  return rows;
}

/** The control's human-readable value, whatever kind of control it is. */
function readValue(shell: Element): string {
  const el = shell.querySelector<HTMLElement>(
    "input, textarea, select, [role='radiogroup'], button[aria-haspopup='listbox']",
  );
  if (!el) return EMPTY_VALUE;

  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return el.checked ? "Yes" : "No";
    return el.value.trim() || EMPTY_VALUE;
  }
  if (el instanceof HTMLTextAreaElement) return el.value.trim() || EMPTY_VALUE;
  if (el instanceof HTMLSelectElement) {
    return el.selectedOptions[0]?.text.trim() || EMPTY_VALUE;
  }
  if (el.getAttribute("role") === "radiogroup") {
    const picked = el.querySelector("[aria-checked='true']");
    return picked?.textContent?.trim() || EMPTY_VALUE;
  }
  // Popover Select: the trigger shows either the chosen label or the
  // placeholder. A placeholder is not a value, so it reads as empty.
  const shown = el.textContent?.trim() ?? "";
  const isPlaceholder = el.querySelector(".text-\\[\\#aab0bd\\]") != null;
  return !shown || isPlaceholder ? EMPTY_VALUE : shown;
}
