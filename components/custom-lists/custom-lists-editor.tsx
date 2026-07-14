"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, ChevronUp, ChevronDown, Search } from "lucide-react";
import {
  addCustomOption,
  renameCustomOption,
  removeCustomOption,
  seedCustomListDefaults,
  moveCustomOption,
  clearCustomList,
} from "@/app/(app)/_actions/custom-lists";
import { fireToast } from "@/lib/toast";
import { CUSTOM_LIST_CATEGORIES } from "@/lib/custom-lists/registry";
import type { CustomListView } from "@/lib/queries/custom-lists";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * The per-form "Custom Dropdown Master" editor. Cards flow in a dense masonry
 * so short lists pack tight and never leave gaps. Each card: search (for long
 * lists), a scrollable option list, reorder up/down, rename, remove, add, and a
 * one-click import of the registry defaults for un-seeded lists.
 */
export function CustomListsEditor({
  formKey,
  lists,
}: {
  formKey: string;
  lists: CustomListView[];
}) {
  // Group into categories, in the registry's declared order (extras last).
  const declared = CUSTOM_LIST_CATEGORIES[formKey]?.order ?? [];
  const byCat = new Map<string, CustomListView[]>();
  for (const l of lists) {
    const arr = byCat.get(l.category) ?? [];
    arr.push(l);
    byCat.set(l.category, arr);
  }
  const ordered = [
    ...declared.filter((c) => byCat.has(c)),
    ...[...byCat.keys()].filter((c) => !declared.includes(c)),
  ];

  return (
    <div className="flex flex-col gap-8">
      {ordered.map((cat) => {
        const items = byCat.get(cat);
        if (!items?.length) return null;
        return (
          <section key={cat}>
            <h2 className="mb-3 flex items-center gap-3 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#3f3f94]">
              {cat}
              <span className="h-px flex-1 bg-[#eceef4]" />
              <span className="rounded-full bg-[#efeffb] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#3f3f94]">
                {items.length}
              </span>
            </h2>
            <div className="gap-5 [column-fill:_balance] columns-1 sm:columns-2 xl:columns-3">
              {items.map((l) => (
                <ListCard key={l.key} formKey={formKey} list={l} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ListCard({ formKey, list }: { formKey: string; list: CustomListView }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [draft, setDraft] = React.useState("");
  const [query, setQuery] = React.useState("");

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

  const q = query.trim().toLowerCase();
  const shown = q ? list.options.filter((o) => o.label.toLowerCase().includes(q)) : list.options;
  const many = list.options.length > 8;
  const canReorder = list.seeded && !q; // order is meaningless while filtering

  return (
    <section
      className="mb-5 inline-block w-full break-inside-avoid rounded-section border border-hairline bg-surface-card p-5 align-top"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[14px] font-extrabold text-ink-strong">
          {list.label}
          <span className="rounded-full bg-[#efeffb] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#3f3f94]">
            {list.options.length}
          </span>
        </h3>
        {list.seeded ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => clearCustomList(formKey, list.key))}
            className="shrink-0 text-[12px] font-bold text-ink-subtle transition hover:text-[#d32f2f] hover:underline disabled:opacity-50"
          >
            Clear list
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => seedCustomListDefaults(formKey, list.key))}
            className="shrink-0 text-[12px] font-bold text-[#3f3f94] transition hover:underline disabled:opacity-50"
          >
            Use default options
          </button>
        )}
      </div>

      {list.hint && <p className="mb-2 text-[12px] text-ink-subtle">{list.hint}</p>}

      {many && (
        <div className="mb-2 flex h-9 items-center gap-2 rounded-lg border border-hairline bg-surface-soft px-2.5">
          <Search className="h-[15px] w-[15px] shrink-0 text-ink-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${list.label.toLowerCase()}…`}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#aab0bd]"
            aria-label={`Search ${list.label}`}
          />
        </div>
      )}

      {!list.seeded && (
        <p className="mb-2 text-[12px] text-ink-subtle">
          Suggested defaults (not saved yet — import or start your own):
        </p>
      )}

      <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto pr-0.5">
        {shown.length === 0 ? (
          <p className="py-2 text-[13px] text-ink-subtle">No matches.</p>
        ) : (
          shown.map((o, i) =>
            list.seeded ? (
              <OptionRow
                key={o.id}
                label={o.label}
                canMoveUp={canReorder && i > 0}
                canMoveDown={canReorder && i < shown.length - 1}
                onMoveUp={() => run(() => moveCustomOption(formKey, list.key, o.id, "up"))}
                onMoveDown={() => run(() => moveCustomOption(formKey, list.key, o.id, "down"))}
                onRename={(label) => run(() => renameCustomOption(o.id, label, formKey))}
                onRemove={() => run(() => removeCustomOption(o.id, formKey))}
              />
            ) : (
              <div
                key={o.id}
                className="rounded-lg border border-dashed border-hairline px-3 py-1.5 text-[13px] text-ink-subtle"
              >
                {o.label}
              </div>
            ),
          )
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
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRename,
  onRemove,
}: {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const [val, setVal] = React.useState(label);
  React.useEffect(() => setVal(label), [label]);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label="Move up"
          className="grid h-[18px] w-6 place-items-center rounded text-ink-subtle transition hover:text-[#3f3f94] disabled:opacity-25"
        >
          <ChevronUp className="h-[14px] w-[14px]" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label="Move down"
          className="grid h-[18px] w-6 place-items-center rounded text-ink-subtle transition hover:text-[#3f3f94] disabled:opacity-25"
        >
          <ChevronDown className="h-[14px] w-[14px]" />
        </button>
      </div>
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
