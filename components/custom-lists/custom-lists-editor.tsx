"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Loader2,
  ChevronUp,
  ChevronDown,
  Search,
  ListPlus,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  addCustomOption,
  addCustomOptionsBulk,
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
 * The per-form "Custom Dropdown Master" editor. Lists are grouped by category
 * and laid out as cards. Each card supports inline rename (edit), reorder,
 * remove, add-one, add-many (bulk paste), a one-click import of the registry
 * defaults, and clear.
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
    <div className="flex flex-col gap-9">
      {ordered.map((cat) => {
        const items = byCat.get(cat);
        if (!items?.length) return null;
        return (
          <section key={cat}>
            <h2 className="mb-4 flex items-center gap-3 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#3f3f94]">
              {cat}
              <span className="h-px flex-1 bg-[#eceef4]" />
              <span className="rounded-full bg-[#efeffb] px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-[#3f3f94]">
                {items.length} {items.length === 1 ? "list" : "lists"}
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
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
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkText, setBulkText] = React.useState("");

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

  function runBulk() {
    const lines = bulkText.split("\n");
    start(async () => {
      const res = await addCustomOptionsBulk(formKey, list.key, lines);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `Added ${res.added} option${res.added === 1 ? "" : "s"}.`, type: "success" });
      setBulkText("");
      setBulkOpen(false);
      router.refresh();
    });
  }

  const q = query.trim().toLowerCase();
  const shown = q ? list.options.filter((o) => o.label.toLowerCase().includes(q)) : list.options;
  const many = list.options.length > 8;
  const canReorder = list.seeded && !q; // order is meaningless while filtering
  const bulkCount = bulkText.split("\n").filter((s) => s.trim()).length;

  return (
    <section
      className="flex flex-col rounded-2xl border border-hairline bg-surface-card p-5 transition-shadow duration-200 hover:shadow-[0_10px_28px_-14px_rgba(63,63,148,0.3)]"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      {/* Header - title + count, and the card-level actions. */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-extrabold text-ink-strong">
          {list.label}
          <span className="rounded-full bg-[#efeffb] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#3f3f94]">
            {list.options.length}
          </span>
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setBulkOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card px-2.5 py-1.5 text-[12px] font-bold text-ink-soft transition hover:border-[#c9c9ea] hover:text-[#3f3f94]"
          >
            <ListPlus className="h-[14px] w-[14px]" />
            Bulk add
          </button>
          {list.seeded ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => clearCustomList(formKey, list.key))}
              title="Clear list (revert to defaults preview)"
              className="grid size-8 place-items-center rounded-lg border border-hairline text-ink-subtle transition hover:border-[#f0b4b4] hover:bg-[#fdf3f3] hover:text-[#d32f2f] disabled:opacity-50"
            >
              <Trash2 className="h-[15px] w-[15px]" />
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => seedCustomListDefaults(formKey, list.key))}
              title="Use default options"
              className="grid size-8 place-items-center rounded-lg border border-hairline text-[#3f3f94] transition hover:border-[#c9c9ea] hover:bg-[#efeffb] disabled:opacity-50"
            >
              <RotateCcw className="h-[15px] w-[15px]" />
            </button>
          )}
        </div>
      </div>

      {list.hint && <p className="mb-3 text-[12.5px] text-ink-subtle">{list.hint}</p>}

      {/* Bulk add panel. */}
      {bulkOpen && (
        <div className="mb-3 rounded-xl border border-[#e6e8ec] bg-[#fafbfc] p-3">
          <label className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#8a90a0]">
            Paste many - one per line
          </label>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={5}
            placeholder={"Value one\nValue two\nValue three"}
            className="w-full resize-y rounded-lg border border-hairline bg-white px-3 py-2 text-[13px] outline-none focus:border-[#3f3f94] focus:ring-2 focus:ring-[#3f3f94]/15"
          />
          <div className="mt-2.5 flex items-center gap-2.5">
            <button
              type="button"
              disabled={pending || bulkCount === 0}
              onClick={runBulk}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#3f3f94] px-3.5 text-[12.5px] font-bold text-white transition hover:bg-[#2f2f6f] disabled:opacity-50"
            >
              <ListPlus className="h-4 w-4" />
              Add all
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkText("");
                setBulkOpen(false);
              }}
              className="h-9 rounded-lg border border-hairline px-3.5 text-[12.5px] font-semibold text-ink-subtle transition hover:bg-surface-soft"
            >
              Cancel
            </button>
            <span className="text-[12px] font-medium text-ink-subtle tabular-nums">
              {bulkCount} value{bulkCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}

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
        <p className="mb-2 inline-flex items-center gap-1.5 text-[12px] text-ink-subtle">
          <Pencil className="h-[13px] w-[13px]" />
          Suggested defaults (not saved yet - use defaults or start your own):
        </p>
      )}

      <div className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto pr-0.5">
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
