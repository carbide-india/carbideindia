"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, Loader2, CornerDownLeft } from "lucide-react";
import { searchTasksAction } from "@/app/(app)/tasks/actions";
import type { TaskSearchResult } from "@/lib/queries/tasks";
import { STATUS_LABELS_FALLBACK, STATUS_TONES_FALLBACK } from "@/lib/format";

/**
 * App-wide task search (sir's changes #12). A persistent, MNC-style search box
 * in the header that opens a ⌘/Ctrl+K command palette: type to find tasks by
 * number, title, client, subject, or doer; ↑/↓ to move, Enter to open.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<TaskSearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);

  // ⌘K / Ctrl+K toggles the palette from anywhere.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Reset transient state each time the palette opens.
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActive(0);
    }
  }, [open]);

  // Debounced search. A stale response can't clobber a newer one (token guard).
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await searchTasksAction(q);
        if (!cancelled) {
          setResults(res);
          setActive(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  function go(r: TaskSearchResult) {
    setOpen(false);
    router.push(`/tasks/${r.id}` as Route);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[active];
      if (r) go(r);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Search tasks"
          className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-surface-soft px-3 h-10 text-ink-subtle transition-colors hover:bg-surface-card hover:border-hairline-strong max-md:h-9 max-md:px-2.5"
        >
          <Search size={16} strokeWidth={2.2} className="shrink-0" />
          <span className="text-[14px] font-medium max-lg:hidden">Search tasks…</span>
          <kbd
            className="ml-2 hidden lg:inline-flex items-center gap-0.5 rounded border border-hairline bg-surface-card px-1.5 py-0.5 text-[11px] font-bold text-ink-subtle"
            aria-hidden
          >
            ⌘K
          </kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(15,23,42,0.40)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-[100] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-section border border-hairline-strong bg-surface-card"
          style={{ boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40)" }}
          onOpenAutoFocus={(e) => {
            // Let our input grab focus rather than the first focusable node.
            e.preventDefault();
          }}
        >
          <Dialog.Title className="sr-only">Search tasks</Dialog.Title>
          <div className="flex items-center gap-2.5 border-b border-hairline px-4">
            <Search size={18} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search by #, task, client, subject, or doer…"
              className="h-14 w-full bg-transparent text-[16px] text-ink-strong outline-none placeholder:text-ink-subtle"
            />
            {loading && <Loader2 size={16} className="shrink-0 animate-spin text-ink-subtle" />}
          </div>

          <ul role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
            {query.trim().length < 2 ? (
              <li className="px-3 py-6 text-center text-[14px] text-ink-subtle">
                Type at least 2 characters to search.
              </li>
            ) : results.length === 0 && !loading ? (
              <li className="px-3 py-6 text-center text-[14px] text-ink-subtle">
                No tasks match “{query.trim()}”.
              </li>
            ) : (
              results.map((r, i) => {
                const tone = STATUS_TONES_FALLBACK[r.status] ?? "slate";
                const isActive = i === active;
                return (
                  <li key={r.id} role="option" aria-selected={isActive}>
                    <button
                      type="button"
                      onClick={() => go(r)}
                      onMouseEnter={() => setActive(i)}
                      className="flex w-full items-center gap-3 rounded-chip px-3 py-2.5 text-left transition-colors"
                      style={{ background: isActive ? "var(--color-surface-soft)" : "transparent" }}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: `var(--color-${tone})` }}
                        title={STATUS_LABELS_FALLBACK[r.status]}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          {r.taskNo != null && (
                            <span className="text-[12.5px] font-bold tabular-nums text-ink-subtle">
                              #{r.taskNo}
                            </span>
                          )}
                          <span className="truncate text-[15px] font-semibold text-ink-strong">
                            {r.title}
                          </span>
                          {r.archived && (
                            <span className="shrink-0 rounded-full bg-surface-soft px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
                              Archived
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-ink-subtle">
                          {r.subject && <span className="truncate">{r.subject}</span>}
                          {r.subject && r.doerName && <span>·</span>}
                          {r.doerName && <span className="truncate">{r.doerName}</span>}
                          <span>·</span>
                          <span>{STATUS_LABELS_FALLBACK[r.status]}</span>
                        </span>
                      </span>
                      {isActive && (
                        <CornerDownLeft size={15} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
