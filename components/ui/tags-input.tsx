"use client";

import * as React from "react";
import { X } from "lucide-react";

interface Props {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Max length per tag. */
  maxLen?: number;
}

/**
 * Free-form chip tag input - type a tag, press Enter or comma to commit;
 * Backspace on an empty field removes the last chip; blur commits a pending
 * draft. Self-contained (owns its draft state); the parent just holds the
 * `string[]`. Duplicates (case-insensitive) are ignored.
 */
export function TagsInput({ id = "tags-input", value, onChange, placeholder, maxLen = 40 }: Props) {
  const [draft, setDraft] = React.useState("");

  function commit() {
    const t = draft.trim().slice(0, maxLen);
    if (!t) return;
    if (!value.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setDraft("");
  }
  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div
      className="nt-input flex flex-wrap items-center gap-1.5"
      style={{ padding: "10px 12px", minHeight: 56 }}
      onClick={() => document.getElementById(id)?.focus()}
    >
      {value.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1"
          style={{ background: "var(--vp-cyan-tint)", color: "rgb(var(--vp-cyan-deep))", fontSize: 14, fontWeight: 700 }}
        >
          {t}
          <span
            role="button"
            aria-label={`Remove tag ${t}`}
            onClick={(e) => { e.stopPropagation(); removeAt(i); }}
            className="inline-flex cursor-pointer items-center justify-center"
            style={{ width: 18, height: 18, borderRadius: 999 }}
          >
            <X size={12} strokeWidth={2.6} />
          </span>
        </span>
      ))}
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
          else if (e.key === "Backspace" && draft === "" && value.length > 0) removeAt(value.length - 1);
        }}
        placeholder={placeholder ?? (value.length === 0 ? "Type a tag and press Enter or comma to add" : "Add another tag")}
        className="min-w-[180px] flex-1 bg-transparent outline-none"
        style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-strong)" }}
      />
    </div>
  );
}
