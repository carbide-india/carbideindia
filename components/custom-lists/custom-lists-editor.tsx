"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import {
  addCustomOption,
  renameCustomOption,
  removeCustomOption,
  seedCustomListDefaults,
} from "@/app/(app)/_actions/custom-lists";
import { fireToast } from "@/lib/toast";
import type { CustomListView } from "@/lib/queries/custom-lists";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * The per-form "Custom" lists editor — one card per list. A list backed by DB
 * rows is fully editable (rename / remove / add); an un-seeded list shows the
 * registry defaults as read-only suggestions with a one-click import.
 */
export function CustomListsEditor({
  formKey,
  lists,
}: {
  formKey: string;
  lists: CustomListView[];
}) {
  return (
    <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
      {lists.map((l) => (
        <ListCard key={l.key} formKey={formKey} list={l} />
      ))}
    </div>
  );
}

function ListCard({ formKey, list }: { formKey: string; list: CustomListView }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [draft, setDraft] = React.useState("");

  function run(fn: () => Promise<ActionResult>) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-section border border-hairline bg-surface-card p-5" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-extrabold text-ink-strong">{list.label}</h3>
        {!list.seeded && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => seedCustomListDefaults(formKey, list.key))}
            className="text-[12px] font-bold text-[#3f3f94] transition hover:underline disabled:opacity-50"
          >
            Use default options
          </button>
        )}
      </div>

      {!list.seeded && (
        <p className="mb-2 text-[12px] text-ink-subtle">
          Suggested defaults (not saved yet — import or start your own):
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {list.options.map((o) =>
          list.seeded ? (
            <OptionRow
              key={o.id}
              label={o.label}
              onRename={(label) => run(() => renameCustomOption(o.id, label, formKey))}
              onRemove={() => run(() => removeCustomOption(o.id, formKey))}
            />
          ) : (
            <div
              key={o.id}
              className="flex items-center rounded-lg border border-dashed border-hairline px-3 py-1.5 text-[13px] text-ink-subtle"
            >
              {o.label}
            </div>
          ),
        )}
      </div>

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (!v) return;
          setDraft("");
          run(() => addCustomOption(formKey, list.key, v));
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add an option…"
          className="nt-input h-9 flex-1"
          aria-label={`Add a ${list.label} option`}
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          aria-label="Add option"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#3f3f94] text-white transition hover:bg-[#2f2f6f] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </form>
    </section>
  );
}

function OptionRow({
  label,
  onRename,
  onRemove,
}: {
  label: string;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const [val, setVal] = React.useState(label);
  React.useEffect(() => setVal(label), [label]);
  return (
    <div className="flex items-center gap-2">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          const next = val.trim();
          if (next && next !== label) onRename(next);
          else setVal(label);
        }}
        className="nt-input h-9 flex-1"
        aria-label={`Edit ${label}`}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-hairline text-ink-subtle transition hover:border-[#f0b4b4] hover:bg-[#fdf3f3] hover:text-[#d32f2f]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
