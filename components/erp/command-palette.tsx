"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Loader2,
  CornerDownLeft,
  Boxes,
  Building2,
  ClipboardList,
  Layers,
  FileText,
  Plus,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { commandSearchAction } from "@/app/(app)/_actions/command-search";

/**
 * CommandPalette (ERP redesign — Phase 3).
 *
 * The app-wide ⌘/Ctrl-K palette: jump to any core register/workspace (NAVIGATION
 * actions) + a stub federated record search (Items by code/name, Clients by
 * name/code — top 5 each) wired to `commandSearchAction`. Selecting a record
 * navigates to its page.
 *
 * Mounted once in `(app)/layout.tsx`. Renders NOTHING when closed (a portal that
 * only mounts content on open) — so it never alters existing page output. Built
 * on Radix Dialog + cmdk (already in the repo); no new heavy deps.
 *
 * Keyboard: ⌘K / Ctrl-K opens, arrows navigate (cmdk), Enter selects, Esc closes.
 */

interface NavAction {
  id: string;
  label: string;
  hint?: string;
  Icon: LucideIcon;
  href: Route;
}

const NAV_ACTIONS: ReadonlyArray<NavAction> = [
  { id: "nav-dashboard", label: "Dashboard", Icon: LayoutDashboard, href: "/" as Route },
  { id: "nav-items", label: "Item Master", hint: "g i", Icon: Boxes, href: "/items" as Route },
  { id: "nav-enquiries", label: "Enquiries / SM Repo", hint: "g e", Icon: FileText, href: "/inquiries" as Route },
  { id: "nav-clients", label: "Client Master", hint: "g c", Icon: Building2, href: "/clients" as Route },
  { id: "nav-jobcards", label: "Job Cards", hint: "g j", Icon: ClipboardList, href: "/job-cards" as Route },
  { id: "nav-masters", label: "Masters", Icon: Layers, href: "/masters" as Route },
  { id: "act-new-enquiry", label: "New Enquiry", hint: "c e", Icon: Plus, href: "/enquiries/new" as Route },
  { id: "act-new-item", label: "New Item", hint: "c i", Icon: Plus, href: "/items/new" as Route },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const deferred = React.useDeferredValue(query);
  const q = deferred.trim();

  const { data: records = { items: [], clients: [] }, isFetching } = useQuery({
    queryKey: ["command-search", q],
    queryFn: () => commandSearchAction(q),
    enabled: open && q.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

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

  React.useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  function navigate(href: Route) {
    setOpen(false);
    router.push(href);
  }

  const filteredNav = React.useMemo(() => {
    if (!q) return NAV_ACTIONS;
    const lc = q.toLowerCase();
    return NAV_ACTIONS.filter((a) => a.label.toLowerCase().includes(lc));
  }, [q]);

  const hasRecords = records.items.length > 0 || records.clients.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(15,23,42,0.40)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-[100] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-section border border-hairline-strong bg-surface-card"
          style={{ boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40)" }}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
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
                placeholder="Type to search records or jump to a page"
                className="h-14 !border-b-0 !px-0 text-[16px]"
              />
              {isFetching && (
                <Loader2 size={16} className="shrink-0 animate-spin text-ink-subtle" />
              )}
            </div>
            <CommandList className="max-h-[56vh] overflow-y-auto border-t border-hairline p-2">
              <CommandEmpty className="px-3 py-6 text-center text-[14px] text-ink-subtle">
                {q.length < 2
                  ? "Type to search Items and Clients, or jump to a page."
                  : `Nothing matches "${q}".`}
              </CommandEmpty>

              {/* Records — Items */}
              {records.items.length > 0 && (
                <Group label="Items">
                  {records.items.map((r) => (
                    <CommandItem
                      key={`item-${r.id}`}
                      value={`item-${r.id}`}
                      onSelect={() => navigate(`/items/${r.id}` as Route)}
                      className="flex items-center gap-3 !rounded-chip !py-2.5"
                    >
                      <Boxes size={16} strokeWidth={2.1} className="shrink-0 text-ink-subtle" />
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-[13px] font-bold text-ink-strong">
                          {r.code}
                        </span>
                        {r.label && (
                          <span className="ml-2 truncate text-[13px] text-ink-subtle">
                            {r.label}
                          </span>
                        )}
                      </span>
                      <CornerDownLeft size={15} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
                    </CommandItem>
                  ))}
                </Group>
              )}

              {/* Records — Clients */}
              {records.clients.length > 0 && (
                <Group label="Clients">
                  {records.clients.map((r) => (
                    <CommandItem
                      key={`client-${r.id}`}
                      value={`client-${r.id}`}
                      onSelect={() => navigate(`/clients/${r.id}` as Route)}
                      className="flex items-center gap-3 !rounded-chip !py-2.5"
                    >
                      <Building2 size={16} strokeWidth={2.1} className="shrink-0 text-ink-subtle" />
                      <span className="min-w-0 flex-1">
                        <span className="truncate text-[14px] font-semibold text-ink-strong">
                          {r.label}
                        </span>
                        {r.code && (
                          <span className="ml-2 font-mono text-[12px] text-ink-subtle">
                            {r.code}
                          </span>
                        )}
                      </span>
                      <CornerDownLeft size={15} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
                    </CommandItem>
                  ))}
                </Group>
              )}

              {/* Navigation actions */}
              {filteredNav.length > 0 && (
                <Group label={hasRecords ? "Go to" : "Navigation"}>
                  {filteredNav.map((a) => (
                    <CommandItem
                      key={a.id}
                      value={a.id}
                      onSelect={() => navigate(a.href)}
                      className="flex items-center gap-3 !rounded-chip !py-2.5"
                    >
                      <a.Icon size={16} strokeWidth={2.1} className="shrink-0 text-ink-subtle" />
                      <span className="flex-1 truncate text-[14px] font-semibold text-ink-strong">
                        {a.label}
                      </span>
                      {a.hint && (
                        <kbd className="shrink-0 rounded border border-hairline bg-surface-soft px-1.5 py-0.5 text-[11px] font-bold text-ink-subtle">
                          {a.hint}
                        </kbd>
                      )}
                    </CommandItem>
                  ))}
                </Group>
              )}
            </CommandList>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div
        className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle"
        aria-hidden
      >
        {label}
      </div>
      {children}
    </>
  );
}
