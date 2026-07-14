"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, CornerDownLeft } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { searchTasksAction } from "@/app/(app)/tasks/actions";
import { searchInquiriesAction } from "@/app/(app)/inquiries/actions";
import { ENQUIRY_STATUS_COLORS, ENQUIRY_STATUS_LABELS } from "@/db/enums";
import { STATUS_LABELS_FALLBACK, STATUS_TONES_FALLBACK } from "@/lib/format";

/**
 * App-wide task search (sir's changes #12). A persistent, MNC-style search box
 * in the header that opens a ⌘/Ctrl+K command palette built on cmdk (snappy
 * keyboard nav + highlighting) with TanStack-Query-cached, debounced results.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  // Defer the value that drives the query so fast typing doesn't fire a request
  // per keystroke; React batches to the latest. Combined with Query's cache +
  // staleTime, repeated/!prefix searches are instant.
  const deferred = React.useDeferredValue(query);
  const q = deferred.trim();

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["task-search", q],
    queryFn: () => searchTasksAction(q),
    enabled: open && q.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Inquiries group - SM number or company (sales module, Phase 2).
  const { data: inquiryResults = [], isFetching: isFetchingInquiries } = useQuery({
    queryKey: ["inquiry-search", q],
    queryFn: () => searchInquiriesAction(q),
    enabled: open && q.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // NOTE: the ⌘K / Ctrl+K binding moved to the app-wide CommandPalette (ERP
  // Phase 3) so there is a single keyboard owner. This header box stays a
  // mouse-first instant-search surface, opened by clicking its button.

  React.useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  function go(id: string) {
    setOpen(false);
    router.push(`/tasks/${id}` as Route);
  }

  function goInquiry(id: string) {
    setOpen(false);
    router.push(`/inquiries/${id}`);
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
          <span className="text-[14px] font-medium max-2xl:hidden">Search tasks</span>
          <kbd
            className="ml-2 hidden 2xl:inline-flex items-center gap-0.5 rounded border border-hairline bg-surface-card px-1.5 py-0.5 text-[11px] font-bold text-ink-subtle"
            aria-hidden
          >
            ⌘K
          </kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90] data-[state=open]:animate-in data-[state=open]:fade-in-0"
          style={{ background: "rgba(15,23,42,0.40)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-[100] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-section border border-hairline-strong bg-surface-card data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          style={{ boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40)" }}
        >
          <Dialog.Title className="sr-only">Search tasks</Dialog.Title>
          {/* shouldFilter=false: results come pre-filtered from the server; cmdk
              just handles keyboard nav + highlighting. Tab opens the highlighted
              result, same as Enter. */}
          <Command
            shouldFilter={false}
            loop
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const active = e.currentTarget.querySelector<HTMLElement>(
                '[cmdk-item][aria-selected="true"]',
              );
              if (!active) return;
              e.preventDefault();
              active.click();
            }}
          >
            <div className="flex items-center gap-2.5 px-4">
              <Search size={18} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
              <CommandInput
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Search by #, task, client, subject, or doer"
                className="h-14 !border-b-0 !px-0 text-[16px]"
              />
              {(isFetching || isFetchingInquiries) && (
                <Loader2 size={16} className="shrink-0 animate-spin text-ink-subtle" />
              )}
            </div>
            <CommandList className="max-h-[52vh] overflow-y-auto border-t border-hairline p-2">
              <CommandEmpty className="px-3 py-6 text-center text-[14px] text-ink-subtle">
                {q.length < 2 ? "Type at least 2 characters to search." : `Nothing matches “${q}”.`}
              </CommandEmpty>
              {inquiryResults.length > 0 && (
                <div
                  className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle"
                  aria-hidden
                >
                  Enquiries
                </div>
              )}
              {inquiryResults.map((r) => {
                const tone = ENQUIRY_STATUS_COLORS[r.enquiryStatus] ?? "slate";
                return (
                  <CommandItem
                    key={r.id}
                    value={r.id}
                    onSelect={() => goInquiry(r.id)}
                    className="flex items-center gap-3 !rounded-chip !py-2.5"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: `var(--color-${tone})` }}
                      title={ENQUIRY_STATUS_LABELS[r.enquiryStatus]}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[12.5px] font-bold text-ink-subtle">
                          {r.smNumber}
                        </span>
                        <span className="truncate text-[15px] font-semibold text-ink-strong">
                          {r.companyName}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-ink-subtle">
                        <span className="truncate">{r.productDescription}</span>
                        <span>·</span>
                        <span>{ENQUIRY_STATUS_LABELS[r.enquiryStatus]}</span>
                      </span>
                    </span>
                    <CornerDownLeft size={15} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
                  </CommandItem>
                );
              })}
              {inquiryResults.length > 0 && results.length > 0 && (
                <div
                  className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle"
                  aria-hidden
                >
                  Tasks
                </div>
              )}
              {results.map((r) => {
                const tone = STATUS_TONES_FALLBACK[r.status] ?? "slate";
                return (
                  <CommandItem
                    key={r.id}
                    value={r.id}
                    onSelect={() => go(r.id)}
                    className="flex items-center gap-3 !rounded-chip !py-2.5"
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
                    <CornerDownLeft size={15} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
