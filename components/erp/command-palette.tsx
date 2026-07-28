"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
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
  FileText,
  ArrowRight,
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
import { moduleForPath, getModule } from "@/components/layout/modules";

/**
 * CommandPalette (ERP redesign - Phase 3) - MODULE-SCOPED.
 *
 * The app-wide ⌘/Ctrl-K palette, scoped to the section the user is in. It jumps
 * only to the CURRENT module's pages (its nav items + home) and searches only
 * that module's records: Forms searches Enquiries + Clients, Masters searches
 * Items + Clients, WMS searches Tasks, Admin is navigation-only. Records come
 * back from `commandSearchAction` in a generic grouped shape and render the same
 * way for every module. Selecting a record navigates to its page.
 *
 * Mounted once in `(app)/layout.tsx`. Renders NOTHING when closed (a portal that
 * only mounts content on open) - so it never alters existing page output. Built
 * on Radix Dialog + cmdk (already in the repo); no new heavy deps.
 *
 * Keyboard: ⌘K / Ctrl-K opens, arrows navigate (cmdk), Enter selects, Esc closes.
 */

interface NavAction {
  id: string;
  label: string;
  Icon: LucideIcon;
  href: Route;
}

/** Icon for a record group, keyed by the group key returned from the server. */
const GROUP_ICON: Record<string, LucideIcon> = {
  enquiries: FileText,
  clients: Building2,
  items: Boxes,
  tasks: ClipboardList,
};

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const deferred = React.useDeferredValue(query);
  const q = deferred.trim();

  // Which module the current route belongs to - scopes both nav and records.
  const mod = React.useMemo(() => getModule(moduleForPath(pathname)), [pathname]);

  // Nav targets = the active module's items (+ its home when not already listed).
  const navActions = React.useMemo<NavAction[]>(() => {
    const fromItems = mod.items.map((it) => ({
      id: `nav-${it.href}`,
      label: it.label,
      Icon: it.Icon,
      href: it.href,
    }));
    if (mod.items.some((it) => it.href === mod.home)) return fromItems;
    return [
      { id: `nav-home`, label: mod.label, Icon: LayoutDashboard, href: mod.home },
      ...fromItems,
    ];
  }, [mod]);

  const { data: records = { groups: [] }, isFetching } = useQuery({
    queryKey: ["command-search", mod.key, q],
    queryFn: () => commandSearchAction(q, mod.key),
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
    if (!q) return navActions;
    const lc = q.toLowerCase();
    return navActions.filter((a) => a.label.toLowerCase().includes(lc));
  }, [q, navActions]);

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
                placeholder={`Search within ${mod.label}, or jump to a page`}
                className="h-14 !border-b-0 !px-0 text-[16px]"
              />
              {isFetching && (
                <Loader2 size={16} className="shrink-0 animate-spin text-ink-subtle" />
              )}
            </div>
            <CommandList className="max-h-[56vh] overflow-y-auto border-t border-hairline p-2">
              <CommandEmpty className="px-3 py-6 text-center text-[14px] text-ink-subtle">
                {q.length < 2
                  ? `Search within ${mod.label}, or jump to a page.`
                  : `Nothing matches "${q}".`}
              </CommandEmpty>

              {/* Records - module-scoped groups (generic render). */}
              {records.groups.map((group) => {
                const Icon = GROUP_ICON[group.key] ?? FileText;
                return (
                  <Group key={group.key} label={group.label}>
                    {group.hits.map((hit) => (
                      <CommandItem
                        key={`${group.key}-${hit.id}`}
                        value={`${group.key}-${hit.id}`}
                        onSelect={() => navigate(hit.href as Route)}
                        className="flex items-center gap-3 !rounded-chip !py-2.5"
                      >
                        <Icon size={16} strokeWidth={2.1} className="shrink-0 text-ink-subtle" />
                        <span className="min-w-0 flex-1">
                          <span className="truncate text-[14px] font-semibold text-ink-strong">
                            {hit.primary}
                          </span>
                          {hit.secondary && (
                            <span className="ml-2 font-mono text-[12px] text-ink-subtle">
                              {hit.secondary}
                            </span>
                          )}
                        </span>
                        <CornerDownLeft size={15} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
                      </CommandItem>
                    ))}
                  </Group>
                );
              })}

              {/* Navigation actions - scoped to the current module. */}
              {filteredNav.length > 0 && (
                <Group label={`Go to ${mod.label}`}>
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
                      <ArrowRight size={15} strokeWidth={2.1} className="shrink-0 text-ink-subtle" />
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
